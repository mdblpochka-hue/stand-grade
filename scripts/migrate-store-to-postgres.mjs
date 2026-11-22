/*
 * Разовая миграция локального data/store.json в PostgreSQL.
 *
 * Использование:
 *   DATABASE_URL=postgresql://... npm run db:import
 *
 * После импорта сервер при старте будет читать состояние из БД.
 */
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const databaseUrl = String(process.env.DATABASE_URL || '').trim()
if (!databaseUrl) {
  console.error('DATABASE_URL не задан.')
  process.exit(1)
}

const storePath = path.resolve('data', 'store.json')
if (!fs.existsSync(storePath)) {
  console.error(`Файл не найден: ${storePath}`)
  process.exit(1)
}

const raw = fs.readFileSync(storePath, 'utf8')
const parsed = JSON.parse(raw)
if (!parsed?.users) {
  console.error('В store.json нет users.')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: /localhost|127\.0\.0\.1/i.test(databaseUrl) ? false : { rejectUnauthorized: false },
})

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stand_grade_state (
      id SMALLINT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await pool.query(
    `INSERT INTO stand_grade_state (id, data, updated_at)
     VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(parsed)],
  )
  console.log(`Импортировано пользователей: ${Object.keys(parsed.users).length}`)
} finally {
  await pool.end()
}
