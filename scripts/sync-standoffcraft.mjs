/*
 * Синхронизация каталога и кейсов со StandoffCraft.
 *
 * Публичные данные: https://standoffcraft.com/api/skins и /api/cases.
 * Скрипт сохраняет снимок в server-data/standoffcraft.js, чтобы приложение
 * не зависело от сети во время работы. Запуск: npm run sync:standoffcraft
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API = 'https://standoffcraft.com'
const PAGE_SIZE = 200
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'server-data')
const OUT_FILE = path.join(OUT_DIR, 'standoffcraft.js')

const SELECTED_CASES = [
  'sidearm',
  'silencer',
  'deagle',
  'chameleon',
  'valor',
  'origin',
  'assault',
  'claws',
  'barbed-wire',
  'camo',
  'sniper',
  'monster',
  'frostfire',
  'gloves',
  'blade',
  'obsidian',
  'millionaire',
  'ruby',
  'emerald',
  'brilliant',
  'nameless',
  'all-in',
]

const ACCENTS = [
  '#71ff9f',
  '#9dff5e',
  '#4da3ff',
  '#b777ff',
  '#ffc857',
  '#ff5d8f',
  '#35ffc9',
  '#e8ff7a',
  '#ff8a3d',
  '#7dffea',
  '#ff6cbd',
  '#c3ff5e',
  '#ffd54a',
  '#8b5cf6',
  '#f6fffb',
]

const NON_WEAPON = new Set([
  '',
  'Sticker',
  'Charm',
  'Agent',
  'Agent T',
  'Agent CT',
  'Case',
  'Graffiti',
])

const WEAPON_TYPES = new Set([
  'AWM', 'AKR', 'AKR12', 'M4', 'M4A1', 'G22', 'USP', 'Desert Eagle', 'P90', 'P350',
  'UMP45', 'MP7', 'MP5', 'MAC10', 'TEC-9', 'M16', 'M40', 'M60', 'M110', 'FAMAS',
  'FN FAL', 'SM1014', 'SPAS', 'Berettas', 'Akimbo Uzi', 'VAL', 'Mallard', 'Karambit',
  'M9 Bayonet', 'Butterfly', 'Flip', 'Kunai', 'Mantis', 'Sting', 'Dual Daggers',
  'Kukri', 'Tanto', 'Fang', 'Stiletto', 'Gloves', 'F/S', 'Flash', 'Molotov', 'Smoke',
  'HE', 'Thermite',
])

// В API встречаются перевёрнутые поля (weapon:"Twilight", name:"Butterfly").
function orientSkin(skin) {
  const weapon = String(skin.weapon || '').trim()
  const name = String(skin.name || '').trim()
  const swapped = WEAPON_TYPES.has(name) && !WEAPON_TYPES.has(weapon)
  const resultWeapon = swapped ? name : weapon
  return {
    weapon: resultWeapon === 'M9' ? 'M9 Bayonet' : resultWeapon,
    name: swapped ? weapon : name,
  }
}

function isValidItem(skin) {
  if (!skin || !skin.name) return false
  if (!Number.isFinite(Number(skin.price)) || Number(skin.price) <= 0) return false
  return Boolean(skin.image || skin.imageUrlWebp)
}

function isWeaponItem(skin) {
  if (!isValidItem(skin)) return false
  if (!skin.weapon || NON_WEAPON.has(skin.weapon)) return false
  if (/^(Case|Sticker|Charm|Gift|Fragment|Agent|Graffiti|Pack)\b/i.test(skin.name || '')) {
    return false
  }
  return true
}

function displayName(skin) {
  const oriented = orientSkin(skin)
  const base =
    oriented.name.toLowerCase().startsWith(oriented.weapon.toLowerCase() + ' ')
      ? oriented.name
      : `${oriented.weapon} ${oriented.name}`
  return `${base}${skin.isStatTrak ? ' (StatTrack)' : ''}`.replace(/\s+/g, ' ').trim()
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'STAND-GRADE catalog sync (demo prototype)',
    },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return response.json()
}

async function fetchAllSkins() {
  const skins = []
  let page = 1
  let totalPages = 1
  do {
    const url = `${API}/api/skins?page=${page}&limit=${PAGE_SIZE}&search=&sortBy=price-desc`
    const data = await fetchJson(url)
    skins.push(...(data.skins || []))
    totalPages = Number(data.totalPages) || 1
    console.log(`  skins page ${page}/${totalPages}: ${skins.length}`)
    page += 1
    if (page <= totalPages) await new Promise((resolve) => setTimeout(resolve, 120))
  } while (page <= totalPages)
  return skins
}

async function main() {
  console.log('Fetching StandoffCraft catalog...')
  const rawSkins = await fetchAllSkins()
  const rawById = new Map(rawSkins.map((skin) => [skin.id, skin]))

  console.log('Fetching StandoffCraft cases...')
  const casesData = await fetchJson(`${API}/api/cases`)
  const allCases = new Map((casesData.cases || []).map((box) => [box.slug, box]))

  const selected = []
  for (const slug of SELECTED_CASES) {
    const box = allCases.get(slug)
    if (!box) {
      console.warn(`  ! case ${slug} not found`)
      continue
    }

    const items = (box.items || [])
      .filter((item) => Number(item.chance) > 0 && isValidItem(item.skin))
      .map((item) => ({
        skinId: item.skinId,
        chance: Number(item.chance),
        skin: item.skin,
      }))

    const chanceSum = items.reduce((sum, item) => sum + item.chance, 0)
    if (items.length < 2 || chanceSum <= 0) {
      console.warn(`  ! case ${slug} skipped: too few items`)
      continue
    }

    const normalized = items.map((item) => ({
      skinId: item.skinId,
      chance: Math.round((item.chance / chanceSum) * 1000000) / 10000,
    }))

    selected.push({
      id: box.slug,
      slug: box.slug,
      name: box.name,
      nameEn: box.nameEn || '',
      price: Number(box.price) || 0,
      previewImage: box.previewPath || '',
      items: normalized,
    })
    console.log(`  + ${slug}: ${normalized.length} items, ${chanceSum.toFixed(1)}% kept`)
  }

  const caseItemIds = new Set()
  for (const box of selected) {
    for (const item of box.items) caseItemIds.add(item.skinId)
  }

  // Каталог: все оружейные скины, все предметы из выбранных кейсов,
  // а также дорогие стикеры/брелоки/агенты/кейсы и прочие коллекционные вещи.
  const catalog = rawSkins
    .filter((skin) => {
      if (!isValidItem(skin)) return false
      if (caseItemIds.has(skin.id)) return true
      if (isWeaponItem(skin)) return true
      return Number(skin.price) >= 1000
    })
    .map((skin) => {
      const oriented = orientSkin(skin)
      return {
        id: skin.id,
        name: displayName(skin),
        baseName: oriented.name,
        weapon: oriented.weapon,
        rarity: skin.rarity,
        price: Number(skin.price),
        image: skin.imageUrlWebp || skin.image,
        imagePng: skin.image,
        isStatTrak: Boolean(skin.isStatTrak),
        isSouvenir: Boolean(skin.isSouvenir),
        collection: 'Standoff 2',
      }
    })
    .sort((a, b) => a.price - b.price)

  const catalogById = new Map(catalog.map((skin) => [skin.id, skin]))
  const cases = selected
    .map((box, index) => {
      const items = box.items.filter((item) => catalogById.has(item.skinId))
      const top = items
        .map((item) => catalogById.get(item.skinId))
        .sort((a, b) => b.price - a.price)[0]
      return {
        ...box,
        items,
        featuredSkinId: top?.id || items[0]?.skinId || null,
        accent: ACCENTS[index % ACCENTS.length],
        kicker: String(box.name || box.slug).toUpperCase(),
        subtitle: 'Standoff 2 · реальные шансы',
        source: 'standoffcraft',
      }
    })
    .filter((box) => box.items.length >= 2)

  const missing = []
  for (const box of cases) {
    for (const item of box.items) {
      if (!catalogById.has(item.skinId)) missing.push(item.skinId)
    }
  }
  if (missing.length) {
    console.warn(`  ! ${new Set(missing).size} case item ids missing from catalog`)
  }

  const payload = {
    meta: {
      source: 'https://standoffcraft.com',
      fetchedAt: new Date().toISOString(),
      catalogSize: catalog.length,
      caseCount: cases.length,
      selectedCases: cases.map((box) => box.slug),
    },
    skins: catalog,
    cases,
  }

  await fs.mkdir(OUT_DIR, { recursive: true })
  const banner = `/* AUTO-GENERATED by scripts/sync-standoffcraft.mjs on ${payload.meta.fetchedAt}. Do not edit manually. */\n`
  const body = `export const STANDOFFCRAFT_META = ${JSON.stringify(payload.meta, null, 2)}\n\nexport const STANDOFFCRAFT_SKINS = ${JSON.stringify(catalog, null, 2)}\n\nexport const STANDOFFCRAFT_CASES = ${JSON.stringify(cases, null, 2)}\n`
  await fs.writeFile(OUT_FILE, banner + body, 'utf8')
  console.log(`\nSaved ${catalog.length} skins and ${cases.length} cases -> ${OUT_FILE}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
