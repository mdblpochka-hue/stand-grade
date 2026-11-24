/*
 * Перенос состояния STAND GRADE из одного PostgreSQL в другой.
 * Удобно для переезда Render Postgres → Supabase без потери аккаунтов.
 *
 * Использование (PowerShell):
 *   $env:SOURCE_DATABASE_URL="postgresql://...render..."
 *   $env:TARGET_DATABASE_URL="postgresql://...supabase..."
 *   npm run db:copy
 *
 * Либо создайте .env в корне проекта:
 *   SOURCE_DATABASE_URL=postgresql://...
 *   TARGET_DATABASE_URL=postgresql://...
 */
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

function loadDotEnv() {
  try {
    const raw = fs.readFileSync(path.resolve('.env'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      if (!key || key in process.env) continue
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch {
    /* .env отсутствует */
  }
}

loadDotEnv()

const sourceUrl = String(process.env.SOURCE_DATABASE_URL || '').trim()
const targetUrl = String(process.env.TARGET_DATABASE_URL || '').trim()

if (!sourceUrl || !targetUrl) {
  console.error('Нужны SOURCE_DATABASE_URL и TARGET_DATABASE_URL.')
  process.exit(1)
}
if (sourceUrl === targetUrl) {
  console.error('SOURCE_DATABASE_URL и TARGET_DATABASE_URL совпадают — нечего переносить.')
  process.exit(1)
}

const makePool = (connectionString) =>
  new pg.Pool({
    connectionString,
    ssl: /localhost|127\.0\.0\.1/i.test(connectionString)
      ? false
      : { rejectUnauthorized: false },
    max: 2,
  })

const source = makePool(sourceUrl)
const target = makePool(targetUrl)

try {
  const result = await source.query('SELECT data, updated_at FROM stand_grade_state WHERE id = 1')
  if (!result.rows.length) {
    console.error('В исходной базе нет записи stand_grade_state (id = 1).')
    process.exit(1)
  }

  const snapshot = result.rows[0].data
  if (!snapshot?.users) {
    console.error('В исходном состоянии нет users — перенос отменён.')
    process.exit(1)
  }

  await target.query(`
    CREATE TABLE IF NOT EXISTS stand_grade_state (
      id SMALLINT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await target.query(
    `INSERT INTO stand_grade_state (id, data, updated_at)
     VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(snapshot)],
  )

  console.log(`Перенесено пользователей: ${Object.keys(snapshot.users).length}`)
  if (Array.isArray(snapshot.promos)) {
    console.log(`Перенесено промокодов: ${snapshot.promos.length}`)
  }
  console.log(`Исходная запись обновлена: ${result.rows[0].updated_at?.toISOString?.() || 'неизвестно'}`)
  console.log('Готово: целевая база содержит актуальное состояние.')
} catch (error) {
  console.error('Ошибка переноса:', error.message)
  process.exitCode = 1
} finally {
  await Promise.allSettled([source.end(), target.end()])
}
