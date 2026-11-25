import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { STANDOFFCRAFT_META, STANDOFFCRAFT_SKINS } from './server-data/standoffcraft.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Локально читаем .env (на Render переменные приходят из Environment).
// Формат простой KEY=VALUE, без внешних зависимостей.
function loadDotEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8')
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
    /* .env отсутствует — это нормально */
  }
}

loadDotEnv()

const PORT = Number(process.env.PORT || 3001)
// На хостинге путь к данным задаётся через DATA_DIR (например, диск Render).
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data')
const DB_PATH = path.join(DATA_DIR, 'store.json')
const SECRET_PATH = path.join(DATA_DIR, 'session.secret')

// Необязательная внешняя БД. На бесплатном Render файловая система
// эфемерная, поэтому для сохранения данных между деплоями нужен Postgres
// (например, бесплатный Neon/Supabase). Без DATABASE_URL работает JSON-файл.
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim()
const dbPool = DATABASE_URL
  ? new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/i.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
      max: 4,
    })
  : null

// Папка данных может отсутствовать на чистом хостинге — создаём заранее.
fs.mkdirSync(DATA_DIR, { recursive: true })

// Пароли демо-аккаунтов можно переопределить переменными окружения.
const PLAYER_PASSWORD = process.env.PLAYER_PASSWORD || 'player'
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'owner12'
const OWNER_START_BALANCE = Number(process.env.OWNER_START_BALANCE || 500000)
// Скрытый admin удалён. Вернуть его можно флагом ENABLE_ADMIN_ACCOUNT=true.
const ENABLE_ADMIN_ACCOUNT = /^(1|true|yes)$/i.test(
  String(process.env.ENABLE_ADMIN_ACCOUNT || ''),
)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'rainy'
const ADMIN_START_BALANCE = Number(process.env.ADMIN_START_BALANCE || 100000)
// Регистрация: стартовый баланс и лимит аккаунтов на одного человека.
const REGISTER_START_BALANCE = Number(process.env.REGISTER_START_BALANCE || 100)
const MAX_ACCOUNTS_PER_PERSON = Number(process.env.MAX_ACCOUNTS_PER_PERSON || 2)
const DEVICE_COOKIE = 'sg_device'
const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60
const UPGRADE_EDGE = 0.9
const COMPENSATION_MIN = 0.05
const COMPENSATION_MAX = 0.1
const UPGRADE_MAX_ITEMS = 7
const PROMO_MAX_AMOUNT = 1000000
const PROMO_MAX_USES = 100000
const PROMO_MAX_PERCENT = 100
const DAILY_LIMIT = 15000
const MAX_DEPOSIT = 10000000
const FREE_CASE_COOLDOWN_MS = 24 * 60 * 60 * 1000
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PRESENCE_TTL_MS = 60 * 1000
const HISTORY_LIMIT = 80
const MAX_OPEN_COUNT = 10
const PITY_MAX_DRY = 100
const PITY_STEP = 0.01
const CRAFT_MIN_ITEMS = 3
const CRAFT_MAX_ITEMS = 10
const CRAFT_PROFIT_CHANCE = 1 / 3
const BATTLE_ROUND_OPTIONS = [1, 3, 5]
// Заявки: голда сверх дневного лимита и история заявок.
const MAX_GOLD_REQUEST = Math.max(1000, Number(process.env.MAX_GOLD_REQUEST) || 100000)
const APPLICATION_HISTORY_LIMIT = 500
// Anti-DDoS: корреляция действий аккаунта с нескольких IP и блокировка IP.
const SECURITY_WINDOW_MS =
  Math.max(1, Number(process.env.SECURITY_WINDOW_MINUTES) || 10) * 60 * 1000
const SECURITY_ACCOUNT_IP_LIMIT = Math.max(
  3,
  Number(process.env.SECURITY_ACCOUNT_IP_LIMIT) || 4,
)
const SECURITY_IP_VIOLATION_LIMIT = Math.max(
  10,
  Number(process.env.SECURITY_IP_VIOLATION_LIMIT) || 25,
)
const SECURITY_IP_BLOCK_MS =
  Math.max(1, Number(process.env.SECURITY_IP_BLOCK_MINUTES) || 30) * 60 * 1000
const SECURITY_VIOLATION_WINDOW_MS = 5 * 60 * 1000
const SECURITY_SENSITIVE_PATHS = new Set([
  '/api/open-case',
  '/api/upgrade',
  '/api/craft',
  '/api/case-battle',
  '/api/buy-skin',
  '/api/sell-skin',
  '/api/sell-many',
  '/api/deposit',
  '/api/promos',
  '/api/promos/activate',
  '/api/applications',
  '/api/account/password',
])
const RESERVED_USERNAMES = new Set(['player', 'admin', 'owner'])
// Демо-аккаунт player выключен по умолчанию. Включается только явно.
const ENABLE_PLAYER_DEMO = /^(1|true|yes)$/i.test(
  String(process.env.ENABLE_PLAYER_DEMO || ''),
)
// Rate limit: не больше N операций в минуту с одного IP.
const RATE_LIMIT_API_PER_MIN = Math.max(30, Number(process.env.RATE_LIMIT_API_PER_MIN) || 180)
const RATE_LIMIT_AUTH_PER_MIN = Math.max(3, Number(process.env.RATE_LIMIT_AUTH_PER_MIN) || 10)
const RATE_LIMIT_REGISTER_PER_MIN = Math.max(
  2,
  Number(process.env.RATE_LIMIT_REGISTER_PER_MIN) || 5,
)
const RATE_LIMIT_ACTION_PER_MIN = Math.max(
  10,
  Number(process.env.RATE_LIMIT_ACTION_PER_MIN) || 60,
)
const BATTLE_NAMES = [
  'xKira',
  'NoScope',
  'M9Dream',
  'Ghostik',
  'AWPulse',
  'Rusty',
  'S1mpleFan',
  'ToxicWave',
  'NekoAim',
  'Vortex',
  'LilBomzh',
  'Frosty',
]
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Arcane', 'Nameless']

fs.mkdirSync(DATA_DIR, { recursive: true })

/* ------------------------------------------------------------------ */
/*  Skin catalog                                                       */
/* ------------------------------------------------------------------ */

/*
 * Старый демо-каталог оставлен только для совместимости с уже выданными
 * предметами. В кейсах, магазине и апгрейде используется реальный каталог
 * StandoffCraft (см. server-data/standoffcraft.js).
 */
const LEGACY_SKINS = [
  // Common
  { id: 'g22-pixel-camo', name: 'G22 Pixel Camouflage', weapon: 'G22', rarity: 'Common', price: 0.2 },
  { id: 'p350-savannah', name: 'P350 Savannah', weapon: 'P350', rarity: 'Common', price: 0.3 },
  { id: 'ump45-pixel', name: 'UMP45 Pixel', weapon: 'UMP45', rarity: 'Common', price: 0.45 },
  { id: 'mp7-offroad', name: 'MP7 Offroad', weapon: 'MP7', rarity: 'Common', price: 0.7 },

  // Uncommon
  { id: 'famas-beagle', name: 'FAMAS Beagle', weapon: 'FAMAS', rarity: 'Uncommon', price: 1.5 },
  { id: 'usp-line', name: 'USP Line', weapon: 'USP', rarity: 'Uncommon', price: 3 },
  { id: 'akr-tiger', name: 'AKR Tiger', weapon: 'AKR', rarity: 'Uncommon', price: 3.8 },
  { id: 'm4-predator', name: 'M4 Predator', weapon: 'M4', rarity: 'Uncommon', price: 5 },
  {
    id: 'deagle-captain-morgan',
    name: 'Desert Eagle Captain Morgan',
    weapon: 'Desert Eagle',
    rarity: 'Uncommon',
    price: 6,
  },

  // Rare
  { id: 'p90-radiation', name: 'P90 Radiation', weapon: 'P90', rarity: 'Rare', price: 15 },
  { id: 'ump45-cyberpunk', name: 'UMP45 Cyberpunk', weapon: 'UMP45', rarity: 'Rare', price: 18 },
  { id: 'mp7-arcade', name: 'MP7 Arcade', weapon: 'MP7', rarity: 'Rare', price: 25 },
  { id: 'm4-pro', name: 'M4 Pro', weapon: 'M4', rarity: 'Rare', price: 40 },
  { id: 'awm-phoenix', name: 'AWM Phoenix', weapon: 'AWM', rarity: 'Rare', price: 55 },

  // Epic
  { id: 'usp-stone-cold', name: 'USP Stone Cold', weapon: 'USP', rarity: 'Epic', price: 70 },
  { id: 'akr12-railgun', name: 'AKR12 Railgun', weapon: 'AKR12', rarity: 'Epic', price: 95 },
  { id: 'm4a1-bubblegum', name: 'M4A1 Bubblegum', weapon: 'M4A1', rarity: 'Epic', price: 140 },
  { id: 'p90-ghoul', name: 'P90 Ghoul', weapon: 'P90', rarity: 'Epic', price: 210 },
  {
    id: 'deagle-dragon-glass',
    name: 'Desert Eagle Dragon Glass',
    weapon: 'Desert Eagle',
    rarity: 'Epic',
    price: 290,
  },
  { id: 'm4-grand-prix', name: 'M4 Grand Prix', weapon: 'M4', rarity: 'Epic', price: 350 },
  { id: 'g22-frost-wyrm', name: 'G22 Frost Wyrm', weapon: 'G22', rarity: 'Epic', price: 400 },

  // Legendary
  { id: 'akr-necromancer', name: 'AKR Necromancer', weapon: 'AKR', rarity: 'Legendary', price: 520 },
  { id: 'awm-sport', name: 'AWM Sport', weapon: 'AWM', rarity: 'Legendary', price: 750 },
  { id: 'm4-samurai', name: 'M4 Samurai', weapon: 'M4', rarity: 'Legendary', price: 1050 },
  { id: 'akr-carbon', name: 'AKR Carbon', weapon: 'AKR', rarity: 'Legendary', price: 1250 },
  { id: 'scorpion-starfall', name: 'Scorpion Starfall', weapon: 'Scorpion', rarity: 'Legendary', price: 1450 },
  { id: 'ump45-beast', name: 'UMP45 Beast', weapon: 'UMP45', rarity: 'Legendary', price: 1600 },
  { id: 'g22-nest', name: 'G22 Nest', weapon: 'G22', rarity: 'Legendary', price: 2000 },
  { id: 'flip-dragon-glass', name: 'Flip Dragon Glass', weapon: 'Flip', rarity: 'Legendary', price: 2000 },
  { id: 'kunai-poison', name: 'Kunai Poison', weapon: 'Kunai', rarity: 'Legendary', price: 2650 },
  { id: 'akr-dragon', name: 'AKR Dragon', weapon: 'AKR', rarity: 'Legendary', price: 2800 },
  { id: 'mantis-poison', name: 'Mantis Poison', weapon: 'Mantis', rarity: 'Legendary', price: 2850 },

  // Arcane
  { id: 'm4-necromancer', name: 'M4 Necromancer', weapon: 'M4', rarity: 'Arcane', price: 3400 },
  { id: 'gloves-mortal-vane', name: 'Gloves Mortal Vane', weapon: 'Gloves', rarity: 'Arcane', price: 3500 },
  { id: 'awm-genesis', name: 'AWM Genesis', weapon: 'AWM', rarity: 'Arcane', price: 4000 },
  { id: 'gloves-champion', name: 'Gloves Champion', weapon: 'Gloves', rarity: 'Arcane', price: 5000 },
  {
    id: 'butterfly-dragon-glass',
    name: 'Butterfly Dragon Glass',
    weapon: 'Butterfly Knife',
    rarity: 'Arcane',
    price: 6100,
  },
  {
    id: 'karambit-dragon-glass',
    name: 'Karambit Dragon Glass',
    weapon: 'Karambit',
    rarity: 'Arcane',
    price: 7800,
  },
  {
    id: 'm9-bayonet-dragon-glass',
    name: 'M9 Bayonet Dragon Glass',
    weapon: 'M9 Bayonet',
    rarity: 'Arcane',
    price: 9000,
  },
  {
    id: 'm9-bayonet-blue-blood',
    name: 'M9 Bayonet Blue Blood',
    weapon: 'M9 Bayonet',
    rarity: 'Arcane',
    price: 13500,
  },

  // Nameless
  {
    id: 'akr-treasure-hunter',
    name: 'AKR Treasure Hunter',
    weapon: 'AKR',
    rarity: 'Nameless',
    price: 21000,
  },
  {
    id: 'awm-treasure-hunter',
    name: 'AWM Treasure Hunter',
    weapon: 'AWM',
    rarity: 'Nameless',
    price: 112000,
  },
  {
    id: 'm4a1-year-of-the-tiger',
    name: 'M4A1 Year Of The Tiger StatTrack',
    weapon: 'M4A1',
    rarity: 'Nameless',
    price: 132000,
    statTrak: true,
  },
  { id: 'sting-mimicry', name: 'Sting Mimicry', weapon: 'Sting', rarity: 'Nameless', price: 132000 },
  { id: 'karambit-gold', name: 'Karambit Gold', weapon: 'Karambit', rarity: 'Nameless', price: 142000 },

  // Furious / Empire / Frosty Chaos и другие коллекции Standoff 2
  { id: 'g22-pattern', name: 'G22 Pattern', weapon: 'G22', rarity: 'Common', price: 0.25 },
  { id: 'p90-fissure', name: 'P90 Fissure', weapon: 'P90', rarity: 'Common', price: 0.4 },
  { id: 'deagle-winner', name: 'Desert Eagle Winner', weapon: 'Desert Eagle', rarity: 'Uncommon', price: 2.4 },
  { id: 'akr12-mechanic', name: 'AKR12 Mechanic', weapon: 'AKR12', rarity: 'Uncommon', price: 4.4 },
  { id: 'm16-facet', name: 'M16 Facet', weapon: 'M16', rarity: 'Uncommon', price: 5.8 },
  { id: 'ump45-shark', name: 'UMP45 Shark', weapon: 'UMP45', rarity: 'Rare', price: 22 },
  { id: 'deagle-red-dragon', name: 'Desert Eagle Red Dragon', weapon: 'Desert Eagle', rarity: 'Rare', price: 36 },
  { id: 'awm-scratch', name: 'AWM Scratch', weapon: 'AWM', rarity: 'Rare', price: 52 },
  { id: 'p350-oni', name: 'P350 Oni', weapon: 'P350', rarity: 'Rare', price: 28 },
  { id: 'm40-quake', name: 'M40 Quake', weapon: 'M40', rarity: 'Epic', price: 88 },
  { id: 'akr-sport', name: 'AKR Sport', weapon: 'AKR', rarity: 'Epic', price: 165 },
  { id: 'm4a1-kitsune', name: 'M4A1 Kitsune', weapon: 'M4A1', rarity: 'Epic', price: 320 },
  { id: 'usp-chameleon', name: 'USP Chameleon', weapon: 'USP', rarity: 'Epic', price: 390 },
  { id: 'ump45-winged', name: 'UMP45 Winged', weapon: 'UMP45', rarity: 'Legendary', price: 620 },
  { id: 'awm-gear', name: 'AWM Gear', weapon: 'AWM', rarity: 'Legendary', price: 940 },
  { id: 'sm1014-necromancer', name: 'SM1014 Necromancer', weapon: 'SM1014', rarity: 'Legendary', price: 1180 },
  { id: 'scorpion-holiday-frost', name: 'Scorpion Holiday Frost', weapon: 'Scorpion', rarity: 'Legendary', price: 1550 },
  { id: 'm60-steam-beast', name: 'M60 Steam Beast', weapon: 'M60', rarity: 'Legendary', price: 1750 },
  { id: 'deagle-orochi', name: 'Desert Eagle Orochi', weapon: 'Desert Eagle', rarity: 'Legendary', price: 2450 },
  { id: 'p350-forest-spirit', name: 'P350 Forest Spirit', weapon: 'P350', rarity: 'Arcane', price: 3300 },
  { id: 'famas-fury', name: 'FAMAS Fury', weapon: 'FAMAS', rarity: 'Arcane', price: 4400 },
  { id: 'awm-boom', name: 'AWM BOOM', weapon: 'AWM', rarity: 'Arcane', price: 5400 },
  { id: 'gloves-burning-fists', name: 'Gloves Burning Fists', weapon: 'Gloves', rarity: 'Arcane', price: 6600 },
  { id: 'gloves-punk', name: 'Gloves Punk', weapon: 'Gloves', rarity: 'Arcane', price: 8200 },
  { id: 'karambit-snow-camo', name: 'Karambit Snow Camo', weapon: 'Karambit', rarity: 'Arcane', price: 4300 },
  { id: 'dual-daggers-frost-nova', name: 'Dual Daggers Frost Nova', weapon: 'Dual Daggers', rarity: 'Arcane', price: 4800 },
  { id: 'm9-dark-shiver', name: 'M9 Bayonet Dark Shiver', weapon: 'M9 Bayonet', rarity: 'Arcane', price: 5600 },
  { id: 'butterfly-saphira', name: 'Butterfly Saphira', weapon: 'Butterfly Knife', rarity: 'Arcane', price: 7200 },
  { id: 'butterfly-twilight', name: 'Butterfly Twilight', weapon: 'Butterfly Knife', rarity: 'Nameless', price: 26000 },
  { id: 'dual-daggers-harmony', name: 'Dual Daggers Harmony', weapon: 'Dual Daggers', rarity: 'Nameless', price: 30000 },
  { id: 'm9-treasure-hunter', name: 'M9 Bayonet Treasure Hunter', weapon: 'M9 Bayonet', rarity: 'Nameless', price: 38000 },
]

const REAL_SKINS = STANDOFFCRAFT_SKINS
const SKINS = REAL_SKINS

function normalizeSkinName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()
}

const SKIN_BY_ID = new Map([...LEGACY_SKINS, ...REAL_SKINS].map((skin) => [skin.id, skin]))
const REAL_BY_NAME = new Map(REAL_SKINS.map((skin) => [normalizeSkinName(skin.name), skin]))

// Старые предметы с тем же названием автоматически становятся реальными
// скинами Standoff 2 (с актуальной ценой и иконкой).
const LEGACY_SKIN_MAP = new Map()
for (const legacy of LEGACY_SKINS) {
  const match = REAL_BY_NAME.get(normalizeSkinName(legacy.name))
  if (match) LEGACY_SKIN_MAP.set(legacy.id, match.id)
}

// Старые id из ранних версий демо — переносим инвентарь без потери предметов.
const LEGACY_ID_MAP = {
  'awm-sport-v2': 'awm-sport',
  'usp-genesis': 'usp-stone-cold',
  'deagle-morgan': 'deagle-captain-morgan',
  'akr-worm': 'akr-dragon',
  'p90-samurai': 'p90-ghoul',
  'p350-forest-spirit': 'p350-savannah',
  'fnfal-acid-carbon': 'famas-beagle',
  'm4-tiger': 'm4-predator',
  'g22-desert-camo': 'g22-pixel-camo',
  'p90-jungle': 'p90-radiation',
  'mp7-thorn': 'mp7-offroad',
  'butterfly-legacy': 'butterfly-dragon-glass',
  'gloves-punk': 'gloves-mortal-vane',
  'deagle-orochi': 'deagle-dragon-glass',
}

function resolveSkinId(skinId) {
  const direct = LEGACY_SKIN_MAP.get(skinId) || skinId
  if (SKIN_BY_ID.has(direct)) return direct
  const migrated = LEGACY_ID_MAP[skinId] || LEGACY_ID_MAP[direct]
  const mapped = migrated ? LEGACY_SKIN_MAP.get(migrated) || migrated : null
  return mapped && SKIN_BY_ID.has(mapped) ? mapped : null
}

console.log(
  `StandoffCraft catalog: ${STANDOFFCRAFT_META.catalogSize} items (${STANDOFFCRAFT_META.fetchedAt})`,
)

/* ------------------------------------------------------------------ */
/*  Case configuration & probabilities                                 */
/* ------------------------------------------------------------------ */

function makePool(weights, { maxPrice = Infinity } = {}) {
  const pool = []
  for (const rarity of RARITY_ORDER) {
    const tierWeight = Number(weights[rarity] || 0)
    if (tierWeight <= 0) continue
    const tierSkins = SKINS.filter((skin) => skin.rarity === rarity && skin.price <= maxPrice)
    if (!tierSkins.length) continue
    const factors = tierSkins.map((skin) => 1 / Math.sqrt(Math.max(0.1, skin.price)))
    const factorSum = factors.reduce((sum, value) => sum + value, 0)
    tierSkins.forEach((skin, index) => {
      const weight = Math.max(1, Math.round((tierWeight * factors[index]) / factorSum))
      pool.push([skin.id, weight])
    })
  }
  return pool
}

/* ------------------------------------------------------------------ */
/*  Cases                                                              */
/* ------------------------------------------------------------------ */

/*
 * Прежние тематические кейсы STAND GRADE. Цены кейсов и их названия остались
 * как были; содержимое строится из реального каталога StandoffCraft по
 * взвешенному распределению вокруг цены кейса.
 */
const RATIO_CENTER = 0.8
const RATIO_SIGMA_LOW = 0.24
const RATIO_SIGMA_HIGH = 0.2

// Рабочие кейсы используют более широкое распределение: в дроп попадает
// заметно больше разных скинов, а не только два предмета вокруг номинала.
const SPREAD_SIGMA_LOW = 0.5
const SPREAD_SIGMA_HIGH = 0.47
// Небольшая равномерная добавка даёт шанс даже далёким предметам каталога.
const SPREAD_FLAT = 0.15
const GOOD_DROP_RATE = 0.001
const GOOD_DROP_DECAY = 2
const MIN_RATIO = 1 / 12
/* Большая шкала нужна, чтобы «пылинки» веса у далёких скинов не превращались
 * в единицу: при грубой шкале десятки дорогих предметов получали вес 1 и
 * раздували RTP дешёвых кейсов выше 100 %. При 1e9 такие хвосты честно
 * округляются до нуля и в пул не попадают, а шансы остаются непрерывными. */
const WEIGHT_SCALE = 1e9

function ratioEntries(casePrice, { center, sigmaLow, sigmaHigh, flat = 0, round = false }) {
  const near = []
  const good = []
  let nearMass = 0
  let goodShape = 0

  for (const skin of SKINS) {
    const ratio = skin.price / casePrice
    if (!Number.isFinite(ratio) || ratio < MIN_RATIO) continue

    if (ratio >= 3) {
      // Форма хвоста: чем дороже предмет относительно кейса, тем реже он выпадает.
      const shape = 1 / Math.pow(ratio, GOOD_DROP_DECAY)
      good.push([skin, shape])
      goodShape += shape
      continue
    }

    const spread = Math.log(Math.max(ratio, 1e-6)) - Math.log(center)
    const sigma = spread < 0 ? sigmaLow : sigmaHigh
    const bell = Math.exp(-(spread * spread) / (2 * sigma * sigma))
    near.push([skin, bell])
    nearMass += bell
  }

  const averageBell = near.length ? nearMass / near.length : 0
  const entries = near.map(([skin, bell]) => [skin, bell + averageBell * flat])
  const nearTotal = entries.reduce((sum, [, weight]) => sum + weight, 0)

  // Нормируем хорошие дропы так, чтобы их суммарный шанс был одинаковым (~0.1 %) в любом кейсе.
  if (good.length > 0 && goodShape > 0 && nearTotal > 0) {
    const scale = (GOOD_DROP_RATE / (1 - GOOD_DROP_RATE)) * (nearTotal / goodShape)
    for (const [skin, shape] of good) entries.push([skin, shape * scale])
  }

  if (!round) return entries
  return entries
    .map(([skin, weight]) => [skin.id, Math.round(weight * WEIGHT_SCALE)])
    .filter(([, weight]) => weight >= 1)
}

function expectedRatio(casePrice, params) {
  const entries = ratioEntries(casePrice, params)
  let total = 0
  let value = 0
  for (const [skin, weight] of entries) {
    total += weight
    value += skin.price * weight
  }
  return total > 0 ? value / total / casePrice : 0
}

function tuneSpreadCenter(casePrice, target) {
  let lo = 0.2
  let hi = 2
  for (let index = 0; index < 48; index += 1) {
    const mid = (lo + hi) / 2
    const ratio = expectedRatio(casePrice, {
      center: mid,
      sigmaLow: SPREAD_SIGMA_LOW,
      sigmaHigh: SPREAD_SIGMA_HIGH,
      flat: SPREAD_FLAT,
    })
    if (ratio < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function makeRatioPool(casePrice) {
  // Сначала считаем прежний RTP кейса, затем подбираем центр широкого
  // распределения так, чтобы экономика кейса не изменилась.
  const target = expectedRatio(casePrice, {
    center: RATIO_CENTER,
    sigmaLow: RATIO_SIGMA_LOW,
    sigmaHigh: RATIO_SIGMA_HIGH,
  })
  const center = tuneSpreadCenter(casePrice, target)
  return ratioEntries(casePrice, {
    center,
    sigmaLow: SPREAD_SIGMA_LOW,
    sigmaHigh: SPREAD_SIGMA_HIGH,
    flat: SPREAD_FLAT,
    round: true,
  })
}

const CASE_DEFS = [
  {
    id: 'free',
    name: 'Бесплатный кейс',
    subtitle: 'Раз в 24 часа',
    kicker: 'FREE DAILY',
    price: 0,
    accent: '#71ff9f',
    featuredSkinId: 'm4a1-bubblegum',
    weights: { Common: 8200, Uncommon: 1400, Rare: 320, Epic: 75, Legendary: 5 },
  },
  {
    id: 'bomzh',
    name: 'Кейс Бомжа',
    subtitle: 'Стартовый бюджет',
    kicker: 'START DROP',
    price: 19,
    accent: '#e8ff7a',
    featuredSkinId: 'awm-phoenix',
    weights: { Common: 7000, Uncommon: 2000, Rare: 750, Epic: 220, Legendary: 30 },
  },
  {
    id: 'neonstart',
    name: 'Неоновый старт',
    subtitle: 'Разгон после бомжа',
    kicker: 'NEON START',
    price: 49,
    accent: '#9dff5e',
    featuredSkinId: 'm4-grand-prix',
    weights: { Common: 5900, Uncommon: 2300, Rare: 1300, Epic: 420, Legendary: 80 },
  },
  {
    id: 'pixel',
    name: 'Пиксельная Буря',
    subtitle: 'Новый пиксельный тир',
    kicker: 'PIXEL STORM',
    price: 99,
    accent: '#7de3ff',
    featuredSkinId: 'g22-frost-wyrm',
    weights: { Common: 5100, Uncommon: 2500, Rare: 1300, Epic: 900, Legendary: 200 },
  },
  {
    id: 'samurai',
    name: 'Путь Самурая',
    subtitle: 'Средний тир',
    kicker: 'SAMURAI PATH',
    price: 149,
    accent: '#43ffd0',
    featuredSkinId: 'm4-samurai',
    weights: { Common: 4300, Uncommon: 2600, Rare: 2100, Epic: 600, Legendary: 400 },
  },
  {
    id: 'arcade',
    name: 'Аркадный Рейд',
    subtitle: 'Неоновые автоматы',
    kicker: 'ARCADE RAID',
    price: 249,
    accent: '#ff8de1',
    featuredSkinId: 'mp7-arcade',
    weights: { Common: 3500, Uncommon: 2500, Rare: 2400, Epic: 1000, Legendary: 600 },
  },
  {
    id: 'cyber',
    name: 'Кибер Рейд',
    subtitle: 'Средний плюс',
    kicker: 'CYBER RAID',
    price: 299,
    accent: '#43ffd0',
    featuredSkinId: 'deagle-dragon-glass',
    weights: {
      Common: 2900,
      Uncommon: 2400,
      Rare: 2500,
      Epic: 1550,
      Legendary: 550,
      Arcane: 100,
    },
  },
  {
    id: 'dragon',
    name: 'Драконий Клинок',
    subtitle: 'Охота за M9',
    kicker: 'DRAGON BLADE',
    price: 599,
    accent: '#22ffc8',
    featuredSkinId: 'm9-bayonet-dragon-glass',
    weights: {
      Common: 2100,
      Uncommon: 2100,
      Rare: 2600,
      Epic: 2100,
      Legendary: 800,
      Arcane: 300,
    },
  },
  {
    id: 'crystal',
    name: 'Кристальный Дракон',
    subtitle: 'Синий кристалл',
    kicker: 'CRYSTAL DRAGON',
    price: 899,
    accent: '#85e9ff',
    featuredSkinId: 'm9-bayonet-blue-blood',
    weights: {
      Common: 1500,
      Uncommon: 1800,
      Rare: 2500,
      Epic: 2200,
      Legendary: 1500,
      Arcane: 500,
    },
  },
  {
    id: 'knife',
    name: 'Ножевой Куш',
    subtitle: 'Охота за ножами',
    kicker: 'KNIFE RUSH',
    price: 999,
    accent: '#35ff87',
    featuredSkinId: 'karambit-dragon-glass',
    weights: {
      Common: 1050,
      Uncommon: 1500,
      Rare: 2600,
      Epic: 2700,
      Legendary: 1900,
      Arcane: 240,
      Nameless: 10,
    },
  },
  {
    id: 'royal',
    name: 'Королевский Флеш',
    subtitle: 'Высокий тир',
    kicker: 'ROYAL FLUSH',
    price: 1499,
    accent: '#d4ff4d',
    featuredSkinId: 'butterfly-dragon-glass',
    weights: {
      Common: 600,
      Uncommon: 1000,
      Rare: 2100,
      Epic: 2840,
      Legendary: 2450,
      Arcane: 1000,
      Nameless: 10,
    },
  },
  {
    id: 'golden',
    name: 'Золотой Стандарт',
    subtitle: 'Золотая коллекция',
    kicker: 'GOLD STANDARD',
    price: 2499,
    accent: '#ffd76a',
    featuredSkinId: 'gloves-champion',
    weights: {
      Common: 250,
      Uncommon: 600,
      Rare: 1600,
      Epic: 2900,
      Legendary: 3200,
      Arcane: 1400,
      Nameless: 50,
    },
  },
  {
    id: 'crackers',
    name: 'Газява и хрумка',
    subtitle: 'Максимальный тир',
    kicker: 'MAX LOOT',
    price: 3000,
    accent: '#ccff33',
    featuredSkinId: 'karambit-gold',
    weights: {
      Common: 150,
      Uncommon: 420,
      Rare: 1450,
      Epic: 2680,
      Legendary: 3250,
      Arcane: 2000,
      Nameless: 50,
    },
  },
  {
    id: 'legend',
    name: 'Легенда STAND',
    subtitle: 'Топ-кейс арены',
    kicker: 'STAND LEGEND',
    price: 4999,
    accent: '#ccff33',
    featuredSkinId: 'akr-treasure-hunter',
    weights: {
      Common: 40,
      Uncommon: 200,
      Rare: 830,
      Epic: 2000,
      Legendary: 3450,
      Arcane: 3400,
      Nameless: 80,
    },
  },
  {
    id: 'nameless',
    name: 'Безликий',
    subtitle: 'Кейс Nameless-предметов',
    kicker: 'NAMELESS',
    price: 9999,
    accent: '#f3fff6',
    featuredSkinId: 'sting-mimicry',
    weights: {
      Uncommon: 60,
      Rare: 460,
      Epic: 1640,
      Legendary: 3000,
      Arcane: 5000,
      Nameless: 300,
    },
  },
]

const CASES = CASE_DEFS.map((definition) => {
  const { weights, ...rest } = definition
  const pool = rest.price > 0 ? makeRatioPool(rest.price) : makePool(weights, { maxPrice: 5000 })
  const mappedFeatured = LEGACY_SKIN_MAP.get(rest.featuredSkinId) || rest.featuredSkinId
  const featuredSkinId = pool.some(([skinId]) => skinId === mappedFeatured)
    ? mappedFeatured
    : [...pool].sort((a, b) => b[1] - a[1])[0]?.[0] || null
  return { ...rest, featuredSkinId, pool }
})
const CASE_BY_ID = new Map(CASES.map((item) => [item.id, item]))

const KNIFE_PATTERN = /(karambit|bayonet|butterfly|flip|kunai|sting|mantis|dual daggers)/i
function isRareSkin(skin) {
  if (!skin) return false
  return skin.rarity === 'Arcane' || skin.rarity === 'Nameless' || KNIFE_PATTERN.test(skin.weapon)
}

const rarePoolCache = new Map()
const normalPoolCache = new Map()

function getRarePool(config) {
  if (!rarePoolCache.has(config.id)) {
    rarePoolCache.set(
      config.id,
      config.pool.filter(([skinId]) => isRareSkin(SKIN_BY_ID.get(skinId))),
    )
  }
  return rarePoolCache.get(config.id)
}

function getNormalPool(config) {
  if (!normalPoolCache.has(config.id)) {
    normalPoolCache.set(
      config.id,
      config.pool.filter(([skinId]) => !isRareSkin(SKIN_BY_ID.get(skinId))),
    )
  }
  return normalPoolCache.get(config.id)
}

function buildCasePayload(config) {
  const totalWeight = config.pool.reduce((sum, [, weight]) => sum + weight, 0)
  const fullContents = config.pool
    .map(([skinId, weight]) => {
      const skin = SKIN_BY_ID.get(skinId)
      return {
        ...skin,
        weight,
        chance: (weight / totalWeight) * 100,
        rare: isRareSkin(skin),
      }
    })
    .sort((a, b) => b.price - a.price)

  /*
   * В расширенном каталоге пул кейса может содержать больше тысячи предметов.
   * Для интерфейса отправляем компактную витрину: самые частые предметы,
   * несколько самых дорогих и featured-скин. Сам пул на сервере не меняется,
   * поэтому реальные шансы и RTP остаются прежними.
   */
  const showcase = new Map()
  const byChance = [...fullContents].sort((a, b) => b.chance - a.chance)
  for (const item of byChance.slice(0, 60)) showcase.set(item.id, item)
  for (const item of fullContents.slice(0, 10)) showcase.set(item.id, item)
  if (config.featuredSkinId) {
    const featured = fullContents.find((item) => item.id === config.featuredSkinId)
    if (featured) showcase.set(featured.id, featured)
  }
  const contents = [...showcase.values()]
    .sort((a, b) => b.price - a.price)
    .slice(0, 80)

  const rarityBreakdown = RARITY_ORDER.map((rarity) => {
    const chance = fullContents
      .filter((item) => item.rarity === rarity)
      .reduce((sum, item) => sum + item.chance, 0)
    return { rarity, chance }
  }).filter((row) => row.chance > 0)

  const rareChance = fullContents
    .filter((item) => item.rare)
    .reduce((sum, item) => sum + item.chance, 0)

  return {
    ...config,
    pool: undefined,
    contents,
    totalItems: fullContents.length,
    rarityBreakdown,
    totalWeight,
    topPrize: fullContents[0],
    naturalRareChance: rareChance,
  }
}

const CASE_PAYLOADS = CASES.map(buildCasePayload)

function weightedPickFrom(pool) {
  const total = pool.reduce((sum, [, weight]) => sum + weight, 0)
  let cursor = crypto.randomInt(0, total)
  for (const [skinId, weight] of pool) {
    if (cursor < weight) return SKIN_BY_ID.get(skinId)
    cursor -= weight
  }
  return SKIN_BY_ID.get(pool[pool.length - 1][0])
}

function weightedPick(config) {
  return weightedPickFrom(config.pool)
}

/*
 * Лента кейса — только визуал: победитель уже выбран pickCaseSkinWithPity().
 * В ленту попадает весь каталог кейса (чтобы пролетало много разных скинов),
 * остальные слоты добиваются по весам кейса, поэтому визуальные шансы
 * остаются близкими к реальным. Последние слоты оставлены под победителя.
 */
const CASE_REEL_SINGLE = 120
const CASE_REEL_MULTI = 90

function buildCaseReel(config, winner, count) {
  const targetLength = count > 1 ? CASE_REEL_MULTI : CASE_REEL_SINGLE
  const fillerCount = targetLength - 1
  const deck = config.pool
    .map(([skinId]) => SKIN_BY_ID.get(skinId))
    .filter(Boolean)
    .slice(0, fillerCount)

  let lastId = deck.length ? deck[deck.length - 1].id : null
  while (deck.length < fillerCount) {
    let pick = weightedPick(config)
    let guard = 0
    while (pick.id === lastId && guard < 4) {
      pick = weightedPick(config)
      guard += 1
    }
    deck.push(pick)
    lastId = pick.id
  }

  // Перемешиваем, чтобы редкие скины не шли подряд.
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1)
    const swap = deck[i]
    deck[i] = deck[j]
    deck[j] = swap
  }

  const winnerIndex = Math.max(0, deck.length - 7)
  deck.splice(winnerIndex, 0, { ...winner, winner: true })
  return deck.map((skin) => ({ ...skin, reelId: crypto.randomUUID() }))
}

/*
 * «Гарант» (pity): каждый кейс помнит серию открытий без Arcane/ножа.
 * Шанс редкого дропа = естественный шанс + 1% за каждое «сухое» открытие,
 * то есть +30% к 30-му открытию и 100% на 100-м. Редкий дроп сбрасывает серию.
 */
function pickCaseSkinWithPity(user, config) {
  const rarePool = getRarePool(config)
  const normalPool = getNormalPool(config)
  if (config.price <= 0 || !rarePool.length || !normalPool.length) {
    return { skin: weightedPick(config), pity: null }
  }

  const dryBefore = Math.max(0, Math.trunc(Number(user.pity?.[config.id]) || 0))
  const totalWeight = config.pool.reduce((sum, [, weight]) => sum + weight, 0)
  const rareWeight = rarePool.reduce((sum, [, weight]) => sum + weight, 0)
  const naturalChance = totalWeight > 0 ? rareWeight / totalWeight : 0
  const pityBonus = Math.min(1, dryBefore * PITY_STEP)
  const chance = Math.min(1, naturalChance + pityBonus)
  const triggered = crypto.randomInt(0, 1000000) < Math.round(chance * 1000000)
  const skin = triggered ? weightedPickFrom(rarePool) : weightedPickFrom(normalPool)

  const dryAfter = triggered ? 0 : Math.min(PITY_MAX_DRY, dryBefore + 1)
  if (!user.pity || typeof user.pity !== 'object') user.pity = {}
  if (dryAfter > 0) user.pity[config.id] = dryAfter
  else delete user.pity[config.id]

  return {
    skin,
    pity: {
      dryBefore,
      dryAfter,
      chance: chance * 100,
      naturalChance: naturalChance * 100,
      triggered,
    },
  }
}

/* ------------------------------------------------------------------ */
/*  Persistence, users and sessions                                   */
/* ------------------------------------------------------------------ */

function roundGold(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

function emptyHistory() {
  return { cases: [], upgrades: [], crafts: [], battles: [] }
}

function makeSeedUser(username, password, role, balance) {
  const salt = crypto.randomBytes(16).toString('hex')
  return {
    id: username,
    username,
    role,
    tokenVersion: 0,
    salt,
    passwordHash: hashPassword(password, salt),
    balance,
    inventory: [],
    pity: {},
    lastFreeCaseAt: null,
    history: emptyHistory(),
    activatedPromos: [],
    promoSeenAt: null,
    depositBoost: null,
    createdAt: new Date().toISOString(),
  }
}

function makePromo(
  code,
  { amount = 0, percent = 0, maxUses, createdBy = 'system', type = 'gold' } = {},
) {
  const promoType = type === 'deposit_percent' ? 'deposit_percent' : 'gold'
  return {
    id: crypto.randomUUID(),
    code,
    type: promoType,
    amount: promoType === 'gold' ? roundGold(amount) : 0,
    percent: promoType === 'deposit_percent' ? Math.max(1, Math.min(100, Math.trunc(percent))) : 0,
    maxUses: Math.max(1, Math.trunc(maxUses)),
    usedBy: [],
    createdBy,
    createdAt: new Date().toISOString(),
  }
}

function defaultPromos() {
  return [makePromo('WINTER2026', { amount: 250, maxUses: 500, createdBy: 'winter-event' })]
}

function defaultState() {
  const users = {
    owner: makeSeedUser('owner', OWNER_PASSWORD, 'owner', OWNER_START_BALANCE),
  }
  if (ENABLE_PLAYER_DEMO) {
    users.player = makeSeedUser('player', PLAYER_PASSWORD, 'player', 100)
  }
  if (ENABLE_ADMIN_ACCOUNT) {
    users.admin = makeSeedUser('admin', ADMIN_PASSWORD, 'admin', ADMIN_START_BALANCE)
  }
  return {
    version: 3,
    dayKey: null,
    dailyDistributed: 0,
    users,
    promos: defaultPromos(),
    applications: [],
    registrationIps: {},
    registrationDevices: {},
  }
}

function migrateUser(user) {
  user.tokenVersion = Math.max(0, Math.trunc(Number(user.tokenVersion) || 0))
  if (!Array.isArray(user.inventory)) user.inventory = []
  user.inventory = user.inventory
    .map((entry) => {
      const skinId = resolveSkinId(entry.skinId)
      return skinId ? { ...entry, skinId } : null
    })
    .filter(Boolean)
  if (!user.history || typeof user.history !== 'object') user.history = emptyHistory()
  if (!Array.isArray(user.history.cases)) user.history.cases = []
  if (!Array.isArray(user.history.upgrades)) user.history.upgrades = []
  if (!Array.isArray(user.history.crafts)) user.history.crafts = []
  if (!Array.isArray(user.history.battles)) user.history.battles = []
  if (!user.pity || typeof user.pity !== 'object') user.pity = {}
  if (!user.lastFreeCaseAt) user.lastFreeCaseAt = null
  if (!Array.isArray(user.activatedPromos)) user.activatedPromos = []
  if (!user.promoSeenAt) user.promoSeenAt = null
  if (!user.depositBoost || typeof user.depositBoost !== 'object') user.depositBoost = null
  user.history.cases = user.history.cases.map((entry) => {
    const skinId = entry.skin?.id ? resolveSkinId(entry.skin.id) : null
    return skinId ? { ...entry, skin: SKIN_BY_ID.get(skinId) } : entry
  })
  return user
}

function normalizeState(parsed) {
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return defaultState()
    }
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.users) return defaultState()
  if (!parsed.users.player && ENABLE_PLAYER_DEMO) {
    parsed.users.player = makeSeedUser('player', PLAYER_PASSWORD, 'player', 100)
  }
  if (parsed.users.player) {
    if (ENABLE_PLAYER_DEMO) {
      parsed.users.player.disabled = false
      delete parsed.users.player.disabledReason
    } else {
      parsed.users.player.disabled = true
      parsed.users.player.disabledReason = 'Демо-доступ отключён'
    }
  }
  if (!parsed.users.owner) parsed.users.owner = makeSeedUser('owner', OWNER_PASSWORD, 'owner', OWNER_START_BALANCE)
  if (!parsed.users.admin && ENABLE_ADMIN_ACCOUNT) {
    parsed.users.admin = makeSeedUser('admin', ADMIN_PASSWORD, 'admin', ADMIN_START_BALANCE)
  }
  // Скрытый admin удалён: при выключенном флаге стираем аккаунт и из старой базы.
  if (!ENABLE_ADMIN_ACCOUNT) delete parsed.users.admin
  Object.values(parsed.users).forEach(migrateUser)
  if (!Array.isArray(parsed.promos)) parsed.promos = defaultPromos()
  if (!Array.isArray(parsed.applications)) parsed.applications = []
  parsed.applications = parsed.applications
    .filter((application) => application && typeof application === 'object' && application.id && application.type)
    .slice(0, APPLICATION_HISTORY_LIMIT)
  if (!parsed.registrationIps || typeof parsed.registrationIps !== 'object') parsed.registrationIps = {}
  if (!parsed.registrationDevices || typeof parsed.registrationDevices !== 'object') {
    parsed.registrationDevices = {}
  }
  parsed.dailyDistributed = Number(parsed.dailyDistributed) || 0
  parsed.version = 3
  return parsed
}

function loadState() {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')))
  } catch {
    return defaultState()
  }
}

const REMOTE_TABLE = 'stand_grade_state'

async function loadRemoteState() {
  if (!dbPool) return null
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS ${REMOTE_TABLE} (
      id SMALLINT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  const result = await dbPool.query(`SELECT data FROM ${REMOTE_TABLE} WHERE id = 1`)
  return result.rows[0]?.data || null
}

async function saveRemoteState(snapshot) {
  if (!dbPool) return
  await dbPool.query(
    `INSERT INTO ${REMOTE_TABLE} (id, data, updated_at)
     VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [snapshot],
  )
}

let state
if (dbPool) {
  const remote = await loadRemoteState()
  // Если БД пустая, берём локальный store.json (удобно для миграции),
  // иначе — данные из PostgreSQL.
  state = remote?.users ? normalizeState(remote) : loadState()
  if (!remote?.users) {
    await saveRemoteState(JSON.stringify(state))
  }
  console.log('Persistence: PostgreSQL (DATABASE_URL)')
} else {
  state = loadState()
  console.log('Persistence: local JSON (ephemeral on Render free plan)')
}

let saveTimer = null
let saveQueue = Promise.resolve()

function saveState() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2))
  } catch (error) {
    console.error('Local state save failed:', error.message)
  }

  if (!dbPool) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    const snapshot = JSON.stringify(state)
    saveQueue = saveQueue
      .then(() => saveRemoteState(snapshot))
      .catch((error) => console.error('PostgreSQL save failed:', error.message))
  }, 250)
}

async function flushState() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    const snapshot = JSON.stringify(state)
    saveQueue = saveQueue.then(() => saveRemoteState(snapshot))
  }
  await saveQueue.catch(() => {})
  if (dbPool) await dbPool.end().catch(() => {})
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    flushState().finally(() => process.exit(0))
  })
}

function loadSessionSecret() {
  try {
    const existing = fs.readFileSync(SECRET_PATH, 'utf8').trim()
    if (existing.length >= 32) return existing
  } catch {
    /* create below */
  }
  const secret = crypto.randomBytes(48).toString('hex')
  fs.writeFileSync(SECRET_PATH, secret)
  return secret
}

const SESSION_SECRET = process.env.SESSION_SECRET || loadSessionSecret()

function signToken(userId, version = 0) {
  const payload = Buffer.from(
    JSON.stringify({
      uid: userId,
      ver: Math.max(0, Math.trunc(Number(version) || 0)),
      exp: Date.now() + SESSION_TTL_MS,
    }),
  ).toString('base64url')
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url')
  return `${payload}.${signature}`
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [payload, signature] = token.split('.')
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url')
  const actualBuffer = Buffer.from(signature || '')
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return null
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!parsed?.uid || !parsed?.exp || parsed.exp < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Anti-DDoS / suspicious activity                                   */
/* ------------------------------------------------------------------ */

const accountIpActivity = new Map()
const ipViolations = new Map()
const blockedIps = new Map()

function maskIp(ip) {
  if (!ip) return 'unknown'
  if (ip.includes('.')) {
    const parts = ip.split('.')
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.x`
  }
  return `${String(ip).slice(0, 12)}…`
}

function recordIpViolation(req, reason = 'rate_limit') {
  const ip = rateLimitKey(req)
  if (!ip || ip === 'unknown') return
  const now = Date.now()
  let entry = ipViolations.get(ip)
  if (!entry || now - entry.firstAt > SECURITY_VIOLATION_WINDOW_MS) {
    entry = { count: 0, firstAt: now, lastAt: now, reasons: new Set() }
    ipViolations.set(ip, entry)
  }
  entry.count += 1
  entry.lastAt = now
  entry.reasons.add(reason)

  if (entry.count >= SECURITY_IP_VIOLATION_LIMIT) {
    blockedIps.set(ip, now + SECURITY_IP_BLOCK_MS)
    ipViolations.delete(ip)
    console.warn(
      `[security] IP blocked for ${Math.round(SECURITY_IP_BLOCK_MS / 60000)} min: ${maskIp(ip)}`,
    )
    if (blockedIps.size > 5000) {
      for (const [key, until] of blockedIps) {
        if (until <= now) blockedIps.delete(key)
      }
    }
  }

  if (ipViolations.size > 20000) {
    for (const [key, value] of ipViolations) {
      if (now - value.lastAt > SECURITY_VIOLATION_WINDOW_MS) ipViolations.delete(key)
    }
    while (ipViolations.size > 20000) {
      const oldest = ipViolations.keys().next().value
      if (oldest === undefined) break
      ipViolations.delete(oldest)
    }
  }
}

function isIpBlocked(ip) {
  const until = blockedIps.get(ip)
  if (!until) return 0
  if (until <= Date.now()) {
    blockedIps.delete(ip)
    return 0
  }
  return until
}

function clearIpViolations(req) {
  const ip = rateLimitKey(req)
  if (ip) ipViolations.delete(ip)
}

function banAccount(user, reason, ips = []) {
  if (!user || user.banned || user.role === 'owner') return
  user.banned = true
  user.bannedAt = new Date().toISOString()
  user.banReason = reason
  user.bannedIps = [...new Set(ips)].slice(0, 10)
  accountIpActivity.delete(user.id)
  saveState()
  console.warn(`[security] account banned: ${user.username} — ${reason}`)
}

function trackAccountAction(user, req) {
  if (!user || user.role === 'owner') return false
  if (user.banned) return true

  const pathOnly = String(req.originalUrl || '').split('?')[0]
  if (req.method !== 'POST' || !SECURITY_SENSITIVE_PATHS.has(pathOnly)) return false

  const ip = rateLimitKey(req)
  if (!ip) return false
  const now = Date.now()
  let activity = accountIpActivity.get(user.id)
  if (!activity) {
    activity = new Map()
    accountIpActivity.set(user.id, activity)
  }
  for (const [key, at] of activity) {
    if (now - at > SECURITY_WINDOW_MS) activity.delete(key)
  }
  activity.set(ip, now)

  if (activity.size >= SECURITY_ACCOUNT_IP_LIMIT) {
    banAccount(
      user,
      `Действия с ${activity.size} IP за ${Math.round(SECURITY_WINDOW_MS / 60000)} мин`,
      [...activity.keys()],
    )
    return true
  }
  return false
}

function publicSecurity() {
  const now = Date.now()
  const banned = Object.values(state.users)
    .filter((user) => user.banned)
    .slice(0, 100)
    .map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      bannedAt: user.bannedAt || null,
      banReason: user.banReason || '',
      bannedIps: (user.bannedIps || []).slice(0, 10),
    }))

  const activeBlocked = [...blockedIps.entries()].filter(([, until]) => until > now)
  const blockedIpsList = activeBlocked
    .slice(0, 20)
    .map(([ip, until]) => ({ ip, until: new Date(until).toISOString() }))

  return {
    banned,
    blockedCount: activeBlocked.length,
    blockedIps: blockedIpsList,
    limits: {
      accountIpLimit: SECURITY_ACCOUNT_IP_LIMIT,
      windowMinutes: Math.round(SECURITY_WINDOW_MS / 60000),
      ipViolationLimit: SECURITY_IP_VIOLATION_LIMIT,
      ipBlockMinutes: Math.round(SECURITY_IP_BLOCK_MS / 60000),
    },
  }
}

function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const payload = verifyToken(token)
  const user = payload ? state.users[payload.uid] : null
  if (!user) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Требуется авторизация' } })
  }
  if (Number(payload.ver || 0) !== (Number(user.tokenVersion) || 0)) {
    return res.status(401).json({
      error: {
        code: 'TOKEN_REVOKED',
        message: 'Сессия устарела после смены пароля. Войдите снова.',
      },
    })
  }
  if (user.disabled) {
    return res.status(403).json({
      error: {
        code: 'ACCOUNT_DISABLED',
        message: user.disabledReason || 'Аккаунт отключён',
      },
    })
  }
  if (user.banned) {
    return res.status(403).json({
      error: {
        code: 'ACCOUNT_BANNED',
        message: `Аккаунт заблокирован${user.banReason ? `: ${user.banReason}` : ''}`,
      },
    })
  }
  if (trackAccountAction(user, req)) {
    return res.status(403).json({
      error: {
        code: 'ACCOUNT_BANNED',
        message: 'Аккаунт заблокирован за подозрительную активность с нескольких IP',
      },
    })
  }
  req.user = user
  req.userId = user.id
  next()
}

function getDayInfo(now = new Date()) {
  const reset = new Date(now)
  reset.setHours(24, 0, 0, 0)
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
  return { key, resetsAt: reset.toISOString() }
}

function ensureDay() {
  const today = getDayInfo()
  let changed = false
  if (state.dayKey !== today.key) {
    state.dayKey = today.key
    state.dailyDistributed = 0
    changed = true
  }
  if (changed) saveState()
  return today
}

function winterEventInfo(now = new Date()) {
  const month = now.getMonth()
  const date = now.getDate()
  const active = month === 10 || month === 11 || (month === 0 && date <= 15)
  const endYear = month === 0 ? now.getFullYear() : now.getFullYear() + 1
  const endsAt = new Date(`${endYear}-01-15T23:59:59+03:00`).toISOString()
  return {
    id: 'winter-event',
    name: 'Зимний ивент',
    active,
    depositBonusPercent: active ? 10 : 0,
    endsAt,
    description: 'Снежная коллекция, +10% к пополнению и зимние промокоды.',
  }
}

function publicPromos(user) {
  const seenAt = user.promoSeenAt ? new Date(user.promoSeenAt).getTime() : 0
  const list = [...state.promos]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((promo) => {
      const usedCount = Array.isArray(promo.usedBy) ? promo.usedBy.length : 0
      const remaining = Math.max(0, promo.maxUses - usedCount)
      return {
        id: promo.id,
        code: promo.code,
        type: promo.type || 'gold',
        amount: promo.type === 'deposit_percent' ? 0 : promo.amount,
        percent: promo.type === 'deposit_percent' ? promo.percent : 0,
        maxUses: promo.maxUses,
        usedCount,
        remaining,
        createdBy: promo.createdBy,
        createdAt: promo.createdAt,
        activated: Array.isArray(user.activatedPromos) && user.activatedPromos.includes(promo.id),
        exhausted: remaining <= 0,
      }
    })
  return {
    list,
    unseenCount: list.filter((promo) => new Date(promo.createdAt).getTime() > seenAt).length,
    canCreate: user.role === 'owner',
    canRequest: user.role === 'admin',
    isOwner: user.role === 'owner',
  }
}

function publicApplication(application) {
  return {
    id: application.id,
    type: application.type,
    username: application.username,
    status: application.status,
    createdAt: application.createdAt,
    reviewedAt: application.reviewedAt || null,
    reviewedBy: application.reviewedBy || null,
    message: application.message || '',
    amount: application.amount || 0,
    promo: application.promo ? { ...application.promo } : null,
    result: application.result || null,
    reviewNote: application.reviewNote || '',
  }
}

function publicApplications(user) {
  const mine = state.applications
    .filter((application) => application.userId === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicApplication)

  const isOwner = user.role === 'owner'
  const pending = isOwner
    ? state.applications
        .filter((application) => application.status === 'pending')
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .map(publicApplication)
    : []
  const history = isOwner
    ? state.applications
        .filter((application) => application.status !== 'pending')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 100)
        .map(publicApplication)
    : []

  const hasPending = (type) =>
    mine.some((application) => application.type === type && application.status === 'pending')
  const daily = buildDaily()

  return {
    mine,
    pending,
    history,
    pendingCount: pending.length,
    dailyRemaining: daily.remaining,
    maxGoldRequest: MAX_GOLD_REQUEST,
    security: isOwner ? publicSecurity() : null,
    can: {
      admin: user.role === 'player' && !hasPending('admin'),
      gold: user.role === 'player' && daily.remaining <= 0 && !hasPending('gold'),
      promo: user.role === 'admin' && !hasPending('promo'),
    },
  }
}

function pushApplication(application) {
  state.applications.unshift(application)
  if (state.applications.length > APPLICATION_HISTORY_LIMIT) {
    state.applications.length = APPLICATION_HISTORY_LIMIT
  }
}

function parsePromoRequest(body = {}) {
  const type = body?.type === 'deposit_percent' ? 'deposit_percent' : 'gold'
  let amount = 0
  let percent = 0

  if (type === 'gold') {
    amount = Math.floor(Number(body?.amount))
    if (!Number.isFinite(amount) || amount <= 0 || amount > PROMO_MAX_AMOUNT) {
      return {
        ok: false,
        code: 'BAD_AMOUNT',
        message: `Награда должна быть от 1 до ${formatGold(PROMO_MAX_AMOUNT)}`,
      }
    }
  } else {
    percent = Math.trunc(Number(body?.percent))
    if (!Number.isFinite(percent) || percent < 1 || percent > PROMO_MAX_PERCENT) {
      return {
        ok: false,
        code: 'BAD_PERCENT',
        message: `Процент должен быть от 1 до ${PROMO_MAX_PERCENT}`,
      }
    }
  }

  const maxUses = Math.trunc(Number(body?.maxUses) || 100)
  if (maxUses < 1 || maxUses > PROMO_MAX_USES) {
    return {
      ok: false,
      code: 'BAD_USES',
      message: `Количество активаций: от 1 до ${PROMO_MAX_USES}`,
    }
  }

  const code = String(body?.code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24)

  return { ok: true, type, amount, percent, maxUses, code }
}

function createPromoFromRequest(input = {}, createdBy) {
  let code = input.code
  if (!code) {
    const prefix = input.type === 'deposit_percent' ? 'BOOST' : 'WINTER'
    code = `${prefix}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
  }
  if (state.promos.some((promo) => promo.code === code)) {
    return { ok: false, code: 'DUPLICATE_CODE', message: 'Такой промокод уже существует' }
  }

  const promo = makePromo(code, {
    type: input.type,
    amount: input.amount,
    percent: input.percent,
    maxUses: input.maxUses,
    createdBy,
  })
  state.promos.unshift(promo)
  return { ok: true, promo }
}

function hydrateInventoryItem(entry) {
  const skin = SKIN_BY_ID.get(entry.skinId)
  if (!skin) return null
  return {
    ...skin,
    instanceId: entry.instanceId,
    obtainedAt: entry.obtainedAt,
  }
}

function publicInventory(user) {
  return [...(user.inventory || [])]
    .map(hydrateInventoryItem)
    .filter(Boolean)
    .sort((a, b) => new Date(b.obtainedAt) - new Date(a.obtainedAt))
}

function publicPity(user) {
  const source = user.pity && typeof user.pity === 'object' ? user.pity : {}
  const result = {}
  for (const [caseId, value] of Object.entries(source)) {
    const dry = Math.max(0, Math.min(PITY_MAX_DRY, Math.trunc(Number(value) || 0)))
    if (!dry) continue
    result[caseId] = {
      dry,
      bonusChance: Math.min(100, dry * PITY_STEP * 100),
      guaranteedAt: PITY_MAX_DRY,
    }
  }
  return result
}

function publicUser(user) {
  const now = Date.now()
  const daily = ensureDay()
  const lastFreeCase = user.lastFreeCaseAt ? new Date(user.lastFreeCaseAt).getTime() : 0
  const isAdmin = user.role === 'admin'
  const freeCaseReady = isAdmin || !lastFreeCase || now - lastFreeCase >= FREE_CASE_COOLDOWN_MS
  const nextFreeCaseAt = lastFreeCase ? new Date(lastFreeCase + FREE_CASE_COOLDOWN_MS).toISOString() : null

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    balance: roundGold(user.balance),
    inventory: publicInventory(user),
    pity: publicPity(user),
    freeCaseReady,
    nextFreeCaseAt: isAdmin ? null : nextFreeCaseAt,
    unlimitedFreeCase: isAdmin,
    dailyLimit: daily,
    depositBoost: user.depositBoost || null,
    createdAt: user.createdAt,
    serverTime: new Date().toISOString(),
  }
}

function buildDaily() {
  ensureDay()
  const { key, resetsAt } = getDayInfo()
  const distributed = roundGold(Math.min(DAILY_LIMIT, Number(state.dailyDistributed || 0)))
  return {
    limit: DAILY_LIMIT,
    distributed,
    remaining: Math.max(0, roundGold(DAILY_LIMIT - distributed)),
    resetsAt,
    dayKey: key,
  }
}

function makeInventoryEntry(skin) {
  return {
    instanceId: crypto.randomUUID(),
    skinId: skin.id,
    obtainedAt: new Date().toISOString(),
  }
}

function pushCaseHistory(user, config, skin, instanceId) {
  user.history.cases.unshift({
    id: crypto.randomUUID(),
    caseId: config.id,
    caseName: config.name,
    skin: { ...skin },
    instanceId,
    at: new Date().toISOString(),
  })
  user.history.cases = user.history.cases.slice(0, HISTORY_LIMIT)
}

function pushUpgradeHistory(user, payload) {
  user.history.upgrades.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...payload,
  })
  user.history.upgrades = user.history.upgrades.slice(0, HISTORY_LIMIT)
}

function pushCraftHistory(user, payload) {
  user.history.crafts.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...payload,
  })
  user.history.crafts = user.history.crafts.slice(0, HISTORY_LIMIT)
}

function pushBattleHistory(user, payload) {
  user.history.battles.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...payload,
  })
  user.history.battles = user.history.battles.slice(0, HISTORY_LIMIT)
}

/* ------------------------------------------------------------------ */
/*  Contracts (craft 3–10 same-rarity skins into the next rarity)      */
/* ------------------------------------------------------------------ */

function nextRarityOf(rarity) {
  const index = RARITY_ORDER.indexOf(rarity)
  if (index < 0 || index + 1 >= RARITY_ORDER.length) return null
  return RARITY_ORDER[index + 1]
}

function buildCraftPlan(user, rawIds) {
  const ids = Array.isArray(rawIds) ? rawIds.map(String) : []
  const unique = [...new Set(ids)]
  if (unique.length !== ids.length) {
    return { ok: false, code: 'DUPLICATE_ITEMS', message: 'Один и тот же предмет выбран дважды' }
  }
  if (unique.length < CRAFT_MIN_ITEMS || unique.length > CRAFT_MAX_ITEMS) {
    return {
      ok: false,
      code: 'BAD_COUNT',
      message: `Для контракта нужно от ${CRAFT_MIN_ITEMS} до ${CRAFT_MAX_ITEMS} предметов`,
    }
  }

  const entries = unique.map((instanceId) => user.inventory.find((item) => item.instanceId === instanceId))
  if (entries.some((entry) => !entry)) {
    return { ok: false, code: 'ITEM_NOT_FOUND', message: 'Предметы не найдены в инвентаре' }
  }

  const skins = entries.map((entry) => SKIN_BY_ID.get(entry.skinId))
  if (skins.some((skin) => !skin)) {
    return { ok: false, code: 'SKIN_NOT_FOUND', message: 'Скин не найден в каталоге' }
  }

  const rarity = skins[0].rarity
  if (skins.some((skin) => skin.rarity !== rarity)) {
    return { ok: false, code: 'DIFFERENT_RARITY', message: 'Все предметы должны быть одной редкости' }
  }

  const outputRarity = nextRarityOf(rarity)
  if (!outputRarity) {
    return { ok: false, code: 'MAX_RARITY', message: 'Nameless — максимальная редкость, крафт выше невозможен' }
  }

  const candidates = SKINS.filter((skin) => skin.rarity === outputRarity)
  if (!candidates.length) {
    return { ok: false, code: 'NO_TARGETS', message: 'Для этой редкости нет целей крафта' }
  }

  const count = skins.length
  const totalValue = roundGold(skins.reduce((sum, skin) => sum + skin.price, 0))
  const stability = (count - CRAFT_MIN_ITEMS) / (CRAFT_MAX_ITEMS - CRAFT_MIN_ITEMS)

  // Контракт окупается примерно в одном случае из трёх. Исходы делим на две
  // группы: предметы следующей редкости дороже вложения (профит) и дешевле
  // (убыток). Профитной группе достаётся 1/3 вероятности, убыточной — 2/3.
  // Чем выше стабильность (больше предметов), тем уже окно значений.
  const winners = candidates.filter((skin) => skin.price >= totalValue)
  const losers = candidates.filter((skin) => skin.price < totalValue)

  const winShare = winners.length && losers.length ? CRAFT_PROFIT_CHANCE : winners.length ? 1 : 0
  const winCount = Math.max(1, Math.round(2 - stability))
  const loseCount = Math.max(2, Math.round(4 - stability * 2))

  const winTarget = totalValue * (1.12 - 0.05 * stability)
  const loseTarget = totalValue * (0.62 + 0.18 * stability)
  const sigma = Math.max(0.5, totalValue * (0.34 - 0.16 * stability))

  const nearest = (pool, target, size) =>
    [...pool]
      .sort((a, b) => Math.abs(a.price - target) - Math.abs(b.price - target))
      .slice(0, Math.max(1, Math.min(size, pool.length)))

  const weightFor = (skin, target) => {
    const distance = (skin.price - target) / sigma
    return 1 / (1 + distance * distance)
  }

  const winRows = nearest(winners, winTarget, winCount).map((skin) => ({
    skin,
    weight: weightFor(skin, winTarget),
  }))
  const loseRows = nearest(losers, loseTarget, loseCount).map((skin) => ({
    skin,
    weight: weightFor(skin, loseTarget),
  }))

  const possible = []
  if (winRows.length) {
    const sum = winRows.reduce((total, row) => total + row.weight, 0)
    for (const row of winRows) {
      possible.push({ skin: row.skin, chance: (row.weight / sum) * winShare * 100 })
    }
  }
  if (loseRows.length) {
    const sum = loseRows.reduce((total, row) => total + row.weight, 0)
    for (const row of loseRows) {
      possible.push({ skin: row.skin, chance: (row.weight / sum) * (1 - winShare) * 100 })
    }
  }
  possible.sort((a, b) => b.chance - a.chance)

  const averageValue = roundGold(
    possible.reduce((sum, row) => sum + row.skin.price * (row.chance / 100), 0),
  )
  const profitChance = roundGold(
    possible.reduce(
      (sum, row) => sum + (row.skin.price >= totalValue ? row.chance : 0),
      0,
    ),
  )

  return {
    ok: true,
    entries,
    skins,
    rarity,
    outputRarity,
    count,
    totalValue,
    stability: Math.round(stability * 100),
    target: roundGold(winTarget),
    minValue: Math.min(...possible.map((row) => row.skin.price)),
    maxValue: Math.max(...possible.map((row) => row.skin.price)),
    averageValue,
    profitChance,
    possible,
    selection: possible.map((row) => ({ skin: row.skin, weight: row.chance })),
  }
}

function publicCraftPlan(plan) {
  return {
    rarity: plan.rarity,
    nextRarity: plan.outputRarity,
    count: plan.count,
    totalValue: plan.totalValue,
    stability: plan.stability,
    target: plan.target,
    minValue: plan.minValue,
    maxValue: plan.maxValue,
    averageValue: plan.averageValue,
    profitChance: plan.profitChance,
    possible: plan.possible.slice(0, 6),
  }
}

function rollCraftOutcome(plan) {
  const roll = crypto.randomInt(0, 1000000) / 10000
  let cursor = 0
  for (const row of plan.possible) {
    cursor += row.chance
    if (roll <= cursor) return row.skin
  }
  return plan.possible[plan.possible.length - 1].skin
}

/* ------------------------------------------------------------------ */
/*  Case battles (1v1, winner takes both pots)                         */
/* ------------------------------------------------------------------ */

function makeBattleOpponent(type) {
  const name = BATTLE_NAMES[crypto.randomInt(0, BATTLE_NAMES.length)]
  return {
    name,
    type: type === 'player' ? 'player' : 'bot',
    label: type === 'player' ? 'Онлайн-игрок' : 'Бот',
  }
}

/* ------------------------------------------------------------------ */
/*  Presence & live drop feed                                          */
/* ------------------------------------------------------------------ */

const presence = new Map()

function touchPresence(key) {
  if (!key) return
  presence.set(key, Date.now())
}

function onlineCount() {
  const cutoff = Date.now() - PRESENCE_TTL_MS
  let count = 0
  for (const [key, seenAt] of presence) {
    if (seenAt >= cutoff) count += 1
    else presence.delete(key)
  }
  return count
}

let liveFeed = []

function pushLiveDrop(user, skin, source = 'case') {
  // Скрытые аккаунты (owner/admin) не светятся в публичной ленте дропов.
  if (user.role === 'owner' || user.role === 'admin') return
  liveFeed.unshift({
    id: crypto.randomUUID(),
    userName: user.username,
    mine: true,
    source,
    skin,
    at: new Date().toISOString(),
  })
  liveFeed = liveFeed.slice(0, 30)
}

/* ------------------------------------------------------------------ */
/*  Express app                                                        */
/* ------------------------------------------------------------------ */

const app = express()
// На Render перед приложением один прокси. trust proxy = 1 заставляет Express
// брать реальный IP из X-Forwarded-For, но не доверять подделанному левому значению.
const TRUST_PROXY = Number(process.env.TRUST_PROXY || 1)
app.set('trust proxy', Number.isFinite(TRUST_PROXY) ? TRUST_PROXY : 1)
app.use(express.json({ limit: '64kb' }))

app.use((req, res, next) => {
  touchPresence(req.ip || req.socket?.remoteAddress || 'unknown')
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

function sendError(res, status, code, message, extra = {}) {
  return res.status(status).json({ error: { code, message }, ...extra })
}

/* ------------------------------------------------------------------ */
/*  Rate limit (per IP, fixed one-minute window)                      */
/* ------------------------------------------------------------------ */

function rateLimitKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown'
}

function createRateLimiter({ name, windowMs = 60_000, max }) {
  const buckets = new Map()
  let lastSweep = Date.now()

  return function rateLimiter(req, res, next) {
    if (req.method === 'OPTIONS') return next()

    const now = Date.now()
    if (now - lastSweep >= windowMs) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key)
      }
      lastSweep = now
    }

    const key = `${name}:${rateLimitKey(req)}`
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
      // Не позволяем Map расти бесконечно при большом числе адресов.
      if (buckets.size > 20_000) {
        for (const [oldKey, oldBucket] of buckets) {
          if (oldBucket.resetAt <= now) buckets.delete(oldKey)
        }
        while (buckets.size > 20_000) {
          const oldestKey = buckets.keys().next().value
          if (oldestKey === undefined) break
          buckets.delete(oldestKey)
        }
      }
    }

    bucket.count += 1
    const remaining = Math.max(0, max - bucket.count)
    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(remaining))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > max) {
      recordIpViolation(req, `${name}_limit`)
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfter))
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Слишком много запросов. Попробуйте через ${retryAfter} сек.`,
        },
      })
    }

    return next()
  }
}

const apiRateLimiter = createRateLimiter({ name: 'api', max: RATE_LIMIT_API_PER_MIN })
const authRateLimiter = createRateLimiter({ name: 'auth', max: RATE_LIMIT_AUTH_PER_MIN })
const registerRateLimiter = createRateLimiter({
  name: 'register',
  max: RATE_LIMIT_REGISTER_PER_MIN,
})
const actionRateLimiter = createRateLimiter({ name: 'action', max: RATE_LIMIT_ACTION_PER_MIN })

// IP, который повторно нарушает лимиты или спамит, временно блокируется целиком.
app.use((req, res, next) => {
  const pathOnly = String(req.originalUrl || '').split('?')[0]
  if (pathOnly === '/api/health') return next()
  const ip = rateLimitKey(req)
  const until = isIpBlocked(ip)
  if (!until) return next()
  const retryAfter = Math.max(1, Math.ceil((until - Date.now()) / 1000))
  res.setHeader('Retry-After', String(retryAfter))
  return res.status(429).json({
    error: {
      code: 'IP_BLOCKED',
      message: `IP временно заблокирован. Попробуйте через ${retryAfter} сек.`,
    },
  })
})

// Общий лимит на все API-запросы, кроме health-check Render.
app.use('/api', (req, res, next) => {
  const pathOnly = String(req.originalUrl || '').split('?')[0]
  if (pathOnly === '/api/health') return next()
  return apiRateLimiter(req, res, next)
})

// Вход и регистрация — самые чувствительные к перебору.
app.use('/api/login', authRateLimiter)
app.use('/api/register', registerRateLimiter)

// Дорогие игровые операции.
app.use(
  [
    '/api/open-case',
    '/api/upgrade',
    '/api/craft',
    '/api/case-battle',
    '/api/buy-skin',
    '/api/sell-skin',
    '/api/sell-many',
    '/api/deposit',
    '/api/promos',
    '/api/applications',
    '/api/account/password',
  ],
  actionRateLimiter,
)

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'stand-grade-demo',
    persistence: dbPool ? 'postgres' : 'file',
    online: onlineCount(),
    time: new Date().toISOString(),
  })
})

app.get('/api/online', (_req, res) => {
  res.json({ ok: true, online: Math.max(1, onlineCount()), serverTime: new Date().toISOString() })
})

function sessionPayload(user) {
  return {
    ok: true,
    token: signToken(user.id, user.tokenVersion),
    user: publicUser(user),
    daily: buildDaily(),
    cases: CASE_PAYLOADS,
    catalog: [...SKINS].sort((a, b) => a.price - b.price),
    feed: liveFeed,
    online: Math.max(1, onlineCount()),
    promos: publicPromos(user),
    applications: publicApplications(user),
    event: winterEventInfo(),
  }
}

function parseCookies(req) {
  const result = {}
  const header = String(req.headers?.cookie || '')
  if (!header) return result
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const key = part.slice(0, index).trim()
    if (!key) continue
    try {
      result[key] = decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      result[key] = part.slice(index + 1).trim()
    }
  }
  return result
}

// IP храним только в виде хэша — для лимита аккаунтов этого достаточно.
function hashClientIp(ip) {
  return crypto.createHash('sha256').update(`${ip}|${SESSION_SECRET}`).digest('hex').slice(0, 32)
}

function registrationCount(map, key) {
  return key ? Math.max(0, Math.trunc(Number(map?.[key]) || 0)) : 0
}

app.post('/api/register', (req, res) => {
  const rawUsername = String(req.body?.username || '').trim()
  const username = rawUsername.toLowerCase()
  const password = String(req.body?.password || '')
  const accountLimit = Math.max(
    1,
    Math.trunc(Number(MAX_ACCOUNTS_PER_PERSON)) || 2,
  )

  if (!/^[a-z0-9_]{3,20}$/i.test(rawUsername)) {
    return sendError(
      res,
      400,
      'INVALID_USERNAME',
      'Логин: 3–20 символов, только латиница, цифры и _',
    )
  }
  if (password.length < 6) {
    return sendError(res, 400, 'WEAK_PASSWORD', 'Пароль должен быть не короче 6 символов')
  }
  if (password.length > 128) {
    return sendError(res, 400, 'WEAK_PASSWORD', 'Пароль слишком длинный (максимум 128 символов)')
  }
  if (RESERVED_USERNAMES.has(username) || state.users[username]) {
    return sendError(res, 409, 'USERNAME_TAKEN', 'Этот логин уже занят')
  }

  const cookies = parseCookies(req)
  let deviceId = String(cookies[DEVICE_COOKIE] || '').trim()
  if (!/^[a-f0-9-]{16,64}$/i.test(deviceId)) deviceId = crypto.randomUUID()
  const ipKey = hashClientIp(req.ip || req.socket?.remoteAddress || 'unknown')

  if (
    registrationCount(state.registrationIps, ipKey) >= accountLimit ||
    registrationCount(state.registrationDevices, deviceId) >= accountLimit
  ) {
    return sendError(
      res,
      429,
      'ACCOUNT_LIMIT',
      `На одного человека можно создать не более ${accountLimit} аккаунтов`,
    )
  }

  const user = makeSeedUser(username, password, 'player', REGISTER_START_BALANCE)
  state.users[username] = user
  state.registrationIps[ipKey] = registrationCount(state.registrationIps, ipKey) + 1
  state.registrationDevices[deviceId] = registrationCount(state.registrationDevices, deviceId) + 1
  clearIpViolations(req)
  saveState()

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${DEVICE_COOKIE}=${deviceId}; Path=/; Max-Age=${DEVICE_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`,
  )
  return res.status(201).json(sessionPayload(user))
})

app.post('/api/login', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!username || !password) {
    return sendError(res, 400, 'BAD_REQUEST', 'Введите логин и пароль')
  }

  const user = state.users[username]
  if (!user) {
    recordIpViolation(req, 'auth_fail')
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Неверный логин или пароль')
  }
  if (user.disabled) {
    return sendError(
      res,
      403,
      'ACCOUNT_DISABLED',
      user.disabledReason || 'Этот аккаунт отключён',
    )
  }
  if (user.banned) {
    return sendError(
      res,
      403,
      'ACCOUNT_BANNED',
      `Аккаунт заблокирован${user.banReason ? `: ${user.banReason}` : ''}`,
    )
  }

  const expected = Buffer.from(hashPassword(password, user.salt), 'hex')
  const actual = Buffer.from(user.passwordHash, 'hex')
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    recordIpViolation(req, 'auth_fail')
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Неверный логин или пароль')
  }

  clearIpViolations(req)
  res.json(sessionPayload(user))
})

app.post('/api/account/password', auth, (req, res) => {
  const user = req.user
  const currentPassword = String(req.body?.currentPassword || '')
  const newPassword = String(req.body?.newPassword || '')

  if (!currentPassword || !newPassword) {
    return sendError(res, 400, 'BAD_REQUEST', 'Укажите текущий и новый пароль')
  }
  if (newPassword.length < 8) {
    return sendError(res, 400, 'WEAK_PASSWORD', 'Новый пароль должен быть не короче 8 символов')
  }
  if (newPassword.length > 128) {
    return sendError(res, 400, 'WEAK_PASSWORD', 'Пароль слишком длинный (максимум 128 символов)')
  }
  if (newPassword === currentPassword) {
    return sendError(res, 400, 'SAME_PASSWORD', 'Новый пароль должен отличаться от текущего')
  }

  const expected = Buffer.from(hashPassword(currentPassword, user.salt), 'hex')
  const actual = Buffer.from(user.passwordHash, 'hex')
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    recordIpViolation(req, 'password_change_fail')
    return sendError(res, 401, 'INVALID_PASSWORD', 'Текущий пароль неверен')
  }

  const salt = crypto.randomBytes(16).toString('hex')
  user.salt = salt
  user.passwordHash = hashPassword(newPassword, salt)
  user.passwordChangedAt = new Date().toISOString()
  user.tokenVersion = Math.max(0, Math.trunc(Number(user.tokenVersion) || 0)) + 1
  clearIpViolations(req)
  saveState()

  return res.json({
    ok: true,
    token: signToken(user.id, user.tokenVersion),
    message: 'Пароль изменён. Остальные сессии завершены.',
  })
})

app.get('/api/status', auth, (req, res) => {
  ensureDay()
  res.json({
    ok: true,
    user: publicUser(req.user),
    daily: buildDaily(),
    cases: CASE_PAYLOADS,
    catalog: [...SKINS].sort((a, b) => a.price - b.price),
    feed: liveFeed,
    online: Math.max(1, onlineCount()),
    promos: publicPromos(req.user),
    applications: publicApplications(req.user),
    event: winterEventInfo(),
    serverTime: new Date().toISOString(),
  })
})

app.get('/api/history', auth, (req, res) => {
  res.json({
    ok: true,
    cases: req.user.history?.cases || [],
    upgrades: req.user.history?.upgrades || [],
    crafts: req.user.history?.crafts || [],
    battles: req.user.history?.battles || [],
  })
})

app.post('/api/open-case', auth, (req, res) => {
  const caseId = String(req.body?.caseId || '')
  const config = CASE_BY_ID.get(caseId)
  if (!config) return sendError(res, 404, 'CASE_NOT_FOUND', 'Кейс не найден')

  const user = req.user
  const requestedCount = Number(req.body?.count)
  const count = Math.max(
    1,
    Math.min(MAX_OPEN_COUNT, Number.isFinite(requestedCount) ? Math.trunc(requestedCount) : 1),
  )
  const isFree = config.price === 0

  if (isFree && count !== 1) {
    return sendError(res, 400, 'FREE_SINGLE_ONLY', 'Бесплатный кейс открывается только по одному')
  }

  if (isFree && user.role !== 'admin') {
    const lastFree = user.lastFreeCaseAt ? new Date(user.lastFreeCaseAt).getTime() : 0
    if (lastFree && Date.now() - lastFree < FREE_CASE_COOLDOWN_MS) {
      return sendError(res, 429, 'FREE_CASE_COOLDOWN', 'Бесплатный кейс уже открыт сегодня', {
        nextFreeCaseAt: new Date(lastFree + FREE_CASE_COOLDOWN_MS).toISOString(),
        user: publicUser(user),
        daily: buildDaily(),
      })
    }
  }

  const totalPrice = roundGold(config.price * count)
  if (user.balance + 1e-9 < totalPrice) {
    return sendError(res, 400, 'INSUFFICIENT_FUNDS', 'Недостаточно голды для открытия кейса', {
      user: publicUser(user),
      daily: buildDaily(),
    })
  }

  const openings = []
  for (let index = 0; index < count; index += 1) {
    const { skin: winner, pity } = pickCaseSkinWithPity(user, config)
    const reel = buildCaseReel(config, winner, count)
    const entry = makeInventoryEntry(winner)
    user.inventory.unshift(entry)
    const publicWinner = { ...winner, instanceId: entry.instanceId, obtainedAt: entry.obtainedAt }
    openings.push({ winner: publicWinner, reel, pity })
    pushCaseHistory(user, config, winner, entry.instanceId)
    pushLiveDrop(user, winner, 'case')
  }

  user.balance = roundGold(user.balance - totalPrice)
  if (isFree) user.lastFreeCaseAt = new Date().toISOString()
  saveState()

  const totalValue = roundGold(openings.reduce((sum, opening) => sum + opening.winner.price, 0))

  res.json({
    ok: true,
    caseId: config.id,
    count,
    openings,
    winner: openings[0].winner,
    reel: openings[0].reel,
    totalValue,
    user: publicUser(user),
    daily: buildDaily(),
    feedEntry: liveFeed[0],
    message:
      count > 1
        ? `Открыто ${count} кейсов на ${totalValue} G`
        : `Выпал ${openings[0].winner.name}`,
  })
})

app.post('/api/sell-skin', auth, (req, res) => {
  const instanceId = String(req.body?.instanceId || '')
  const user = req.user
  const index = user.inventory.findIndex((item) => item.instanceId === instanceId)
  if (index === -1) return sendError(res, 404, 'ITEM_NOT_FOUND', 'Скин не найден в инвентаре')

  const entry = user.inventory[index]
  const skin = SKIN_BY_ID.get(entry.skinId)
  if (!skin) return sendError(res, 404, 'SKIN_NOT_FOUND', 'Скин не найден в каталоге')

  user.inventory.splice(index, 1)
  user.balance = roundGold(user.balance + skin.price)
  saveState()

  res.json({
    ok: true,
    sold: skin,
    amount: skin.price,
    user: publicUser(user),
    daily: buildDaily(),
    message: `${skin.name} продан за ${skin.price} G`,
  })
})

app.post('/api/sell-many', auth, (req, res) => {
  const ids = Array.isArray(req.body?.instanceIds) ? req.body.instanceIds.map(String) : []
  if (!ids.length) return sendError(res, 400, 'BAD_REQUEST', 'Не выбраны предметы')
  const user = req.user
  const unique = [...new Set(ids)]
  const owned = user.inventory.filter((entry) => unique.includes(entry.instanceId))
  if (!owned.length) return sendError(res, 404, 'ITEM_NOT_FOUND', 'Предметы не найдены в инвентаре')

  const sold = []
  let amount = 0
  for (const entry of owned) {
    const skin = SKIN_BY_ID.get(entry.skinId)
    if (!skin) continue
    sold.push(skin)
    amount = roundGold(amount + skin.price)
  }
  const ownedIds = new Set(owned.map((entry) => entry.instanceId))
  user.inventory = user.inventory.filter((entry) => !ownedIds.has(entry.instanceId))
  user.balance = roundGold(user.balance + amount)
  saveState()

  res.json({
    ok: true,
    sold,
    amount,
    user: publicUser(user),
    daily: buildDaily(),
    message: `Продано ${sold.length} ${sold.length === 1 ? 'предмет' : 'предметов'} на ${amount} G`,
  })
})

/* ------------------------------------------------------------------ */
/*  Applications (admin / gold / promo requests)                      */
/* ------------------------------------------------------------------ */

app.get('/api/applications', auth, (req, res) => {
  res.json({ ok: true, applications: publicApplications(req.user) })
})

app.post('/api/applications', auth, (req, res) => {
  const user = req.user
  const type = String(req.body?.type || '')
  if (!['admin', 'gold', 'promo'].includes(type)) {
    return sendError(res, 400, 'BAD_TYPE', 'Неизвестный тип заявки')
  }

  const mine = state.applications.filter((application) => application.userId === user.id)
  const hasPending = (applicationType) =>
    mine.some(
      (application) =>
        application.type === applicationType && application.status === 'pending',
    )

  const base = {
    id: crypto.randomUUID(),
    type,
    userId: user.id,
    username: user.username,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }

  if (type === 'admin') {
    if (user.role !== 'player') {
      return sendError(res, 403, 'ALREADY_STAFF', 'Админка уже доступна или вы владелец')
    }
    if (hasPending('admin')) {
      return sendError(res, 409, 'APPLICATION_PENDING', 'У вас уже есть активная заявка на админку')
    }
    const message = String(req.body?.message || '').trim().slice(0, 300)
    pushApplication({ ...base, message })
    saveState()
    return res.status(201).json({
      ok: true,
      applications: publicApplications(user),
      message: 'Заявка на админку отправлена владельцу',
    })
  }

  if (type === 'gold') {
    if (user.role !== 'player') {
      return sendError(res, 403, 'ONLY_PLAYERS', 'Заявки на голду доступны только игрокам')
    }
    const daily = buildDaily()
    if (daily.remaining > 0) {
      return sendError(
        res,
        400,
        'DAILY_LIMIT_NOT_REACHED',
        `Дневной лимит ещё не исчерпан: осталось ${formatGold(daily.remaining)}`,
      )
    }
    if (hasPending('gold')) {
      return sendError(res, 409, 'APPLICATION_PENDING', 'У вас уже есть активная заявка на голду')
    }
    const amount = Math.floor(Number(req.body?.amount))
    if (!Number.isFinite(amount) || amount < 1 || amount > MAX_GOLD_REQUEST) {
      return sendError(
        res,
        400,
        'BAD_AMOUNT',
        `Сумма заявки: от 1 до ${formatGold(MAX_GOLD_REQUEST)}`,
      )
    }
    pushApplication({ ...base, amount })
    saveState()
    return res.status(201).json({
      ok: true,
      applications: publicApplications(user),
      message: `Заявка на ${formatGold(amount)} отправлена владельцу`,
    })
  }

  // promo
  if (user.role !== 'admin') {
    return sendError(res, 403, 'ONLY_ADMIN', 'Заявки на промокод доступны только администраторам')
  }
  if (hasPending('promo')) {
    return sendError(res, 409, 'APPLICATION_PENDING', 'У вас уже есть активная заявка на промокод')
  }

  const parsed = parsePromoRequest(req.body?.promo || req.body)
  if (!parsed.ok) return sendError(res, 400, parsed.code, parsed.message)
  if (parsed.code && state.promos.some((promo) => promo.code === parsed.code)) {
    return sendError(res, 409, 'DUPLICATE_CODE', 'Такой промокод уже существует')
  }

  pushApplication({
    ...base,
    promo: {
      type: parsed.type,
      amount: parsed.amount,
      percent: parsed.percent,
      maxUses: parsed.maxUses,
      code: parsed.code,
    },
  })
  saveState()
  return res.status(201).json({
    ok: true,
    applications: publicApplications(user),
    message: 'Заявка на создание промокода отправлена владельцу',
  })
})

app.post('/api/applications/:id/approve', auth, (req, res) => {
  if (req.user.role !== 'owner') {
    return sendError(res, 403, 'FORBIDDEN', 'Одобрять заявки может только владелец')
  }

  const application = state.applications.find((item) => item.id === req.params.id)
  if (!application) return sendError(res, 404, 'APPLICATION_NOT_FOUND', 'Заявка не найдена')
  if (application.status !== 'pending') {
    return sendError(res, 409, 'ALREADY_REVIEWED', 'Заявка уже обработана')
  }

  const target = state.users[application.userId]
  if (!target) return sendError(res, 404, 'USER_NOT_FOUND', 'Пользователь не найден')

  let message = ''

  if (application.type === 'admin') {
    if (target.role === 'owner') {
      return sendError(res, 400, 'BAD_TARGET', 'Нельзя менять роль владельца')
    }
    target.role = 'admin'
    application.result = { role: 'admin' }
    message = `Пользователь ${target.username} получил админку`
  } else if (application.type === 'gold') {
    const amount = roundGold(Math.max(0, Number(application.amount) || 0))
    target.balance = roundGold(target.balance + amount)
    application.result = { amount, balance: target.balance }
    message = `Выдано ${formatGold(amount)} игроку ${target.username}`
  } else if (application.type === 'promo') {
    if (!application.promo) {
      return sendError(res, 400, 'BAD_APPLICATION', 'В заявке нет данных промокода')
    }
    const created = createPromoFromRequest(application.promo, req.user.username)
    if (!created.ok) return sendError(res, 409, created.code, created.message)
    application.result = {
      promoId: created.promo.id,
      promoCode: created.promo.code,
    }
    message =
      created.promo.type === 'deposit_percent'
        ? `Промокод ${created.promo.code} создан: +${created.promo.percent}% к пополнению`
        : `Промокод ${created.promo.code} создан на ${formatGold(created.promo.amount)}`
  } else {
    return sendError(res, 400, 'BAD_TYPE', 'Неизвестный тип заявки')
  }

  application.status = 'approved'
  application.reviewedAt = new Date().toISOString()
  application.reviewedBy = req.user.username
  saveState()

  return res.json({
    ok: true,
    application: publicApplication(application),
    applications: publicApplications(req.user),
    promos: publicPromos(req.user),
    message,
  })
})

app.post('/api/applications/:id/reject', auth, (req, res) => {
  if (req.user.role !== 'owner') {
    return sendError(res, 403, 'FORBIDDEN', 'Отклонять заявки может только владелец')
  }

  const application = state.applications.find((item) => item.id === req.params.id)
  if (!application) return sendError(res, 404, 'APPLICATION_NOT_FOUND', 'Заявка не найдена')
  if (application.status !== 'pending') {
    return sendError(res, 409, 'ALREADY_REVIEWED', 'Заявка уже обработана')
  }

  application.status = 'rejected'
  application.reviewedAt = new Date().toISOString()
  application.reviewedBy = req.user.username
  application.reviewNote = String(req.body?.reason || '').trim().slice(0, 200)
  saveState()

  return res.json({
    ok: true,
    application: publicApplication(application),
    applications: publicApplications(req.user),
    message: 'Заявка отклонена',
  })
})

app.get('/api/admin/security', auth, (req, res) => {
  if (req.user.role !== 'owner') {
    return sendError(res, 403, 'FORBIDDEN', 'Доступно только владельцу')
  }
  res.json({ ok: true, security: publicSecurity() })
})

app.post('/api/admin/users/:id/unban', auth, (req, res) => {
  if (req.user.role !== 'owner') {
    return sendError(res, 403, 'FORBIDDEN', 'Разбанить может только владелец')
  }
  const target = state.users[req.params.id]
  if (!target) return sendError(res, 404, 'USER_NOT_FOUND', 'Пользователь не найден')
  if (!target.banned) {
    return sendError(res, 400, 'NOT_BANNED', 'Этот аккаунт не заблокирован')
  }

  target.banned = false
  delete target.bannedAt
  delete target.banReason
  delete target.bannedIps
  accountIpActivity.delete(target.id)
  saveState()

  return res.json({
    ok: true,
    applications: publicApplications(req.user),
    security: publicSecurity(),
    message: `Аккаунт ${target.username} разбанен`,
  })
})

/* ------------------------------------------------------------------ */
/*  Promo codes                                                       */
/* ------------------------------------------------------------------ */

app.get('/api/promos', auth, (req, res) => {
  res.json({ ok: true, promos: publicPromos(req.user) })
})

app.post('/api/promos/seen', auth, (req, res) => {
  req.user.promoSeenAt = new Date().toISOString()
  saveState()
  res.json({ ok: true, promos: publicPromos(req.user) })
})

app.post('/api/promos', auth, (req, res) => {
  const user = req.user
  if (user.role !== 'owner') {
    return sendError(
      res,
      403,
      'FORBIDDEN',
      'Создавать промокоды напрямую может только владелец. Админ может отправить заявку.',
    )
  }

  const parsed = parsePromoRequest(req.body)
  if (!parsed.ok) return sendError(res, 400, parsed.code, parsed.message)

  const created = createPromoFromRequest(parsed, user.username)
  if (!created.ok) return sendError(res, 400, created.code, created.message)

  user.promoSeenAt = new Date().toISOString()
  saveState()

  const { promo } = created
  res.json({
    ok: true,
    promo: {
      ...promo,
      usedCount: 0,
      remaining: promo.maxUses,
      activated: false,
      exhausted: false,
    },
    promos: publicPromos(user),
    message:
      promo.type === 'deposit_percent'
        ? `Промокод ${promo.code} создан: +${promo.percent}% к пополнению`
        : `Промокод ${promo.code} создан на ${formatGold(promo.amount)}`,
  })
})

app.post('/api/promos/activate', auth, (req, res) => {
  const user = req.user
  const code = String(req.body?.code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
  if (!code) return sendError(res, 400, 'BAD_CODE', 'Введите промокод')

  const promo = state.promos.find((item) => item.code === code)
  if (!promo) return sendError(res, 404, 'PROMO_NOT_FOUND', 'Промокод не найден')

  if (Array.isArray(user.activatedPromos) && user.activatedPromos.includes(promo.id)) {
    return sendError(res, 400, 'ALREADY_USED', 'Вы уже активировали этот промокод')
  }
  if (!Array.isArray(promo.usedBy)) promo.usedBy = []
  if (promo.usedBy.length >= promo.maxUses) {
    return sendError(res, 400, 'PROMO_EXHAUSTED', 'У промокода закончились активации')
  }

  const type = promo.type === 'deposit_percent' ? 'deposit_percent' : 'gold'
  let message = ''
  let appliedPercent = 0

  if (type === 'deposit_percent') {
    const percent = Math.max(1, Math.min(PROMO_MAX_PERCENT, Math.trunc(Number(promo.percent) || 0)))
    const currentPercent = Math.max(0, Number(user.depositBoost?.percent) || 0)
    // Один активный бонус к следующему пополнению: оставляем максимальный процент.
    if (percent > currentPercent) {
      user.depositBoost = {
        percent,
        promoId: promo.id,
        code: promo.code,
        activatedAt: new Date().toISOString(),
      }
    }
    appliedPercent = Math.max(currentPercent, percent)
    message =
      percent >= currentPercent
        ? `Промокод активирован: +${percent}% к следующему пополнению`
        : `Промокод активирован. Уже действует +${appliedPercent}% к пополнению`
  } else {
    user.balance = roundGold(user.balance + promo.amount)
    message = `Промокод активирован: +${formatGold(promo.amount)}`
  }

  promo.usedBy.push(user.id)
  user.activatedPromos.push(promo.id)
  user.promoSeenAt = new Date().toISOString()
  saveState()

  res.json({
    ok: true,
    amount: type === 'gold' ? promo.amount : 0,
    percent: type === 'deposit_percent' ? promo.percent : 0,
    appliedPercent,
    promo: { code: promo.code, type, amount: promo.amount, percent: promo.percent },
    user: publicUser(user),
    promos: publicPromos(user),
    message,
  })
})

app.post('/api/upgrade', auth, (req, res) => {
  const targetSkinId = String(req.body?.targetSkinId || '')
  const user = req.user
  const rawIds = Array.isArray(req.body?.instanceIds)
    ? req.body.instanceIds.map(String)
    : [String(req.body?.instanceId || '')].filter(Boolean)
  const instanceIds = [...new Set(rawIds)]

  if (!instanceIds.length) {
    return sendError(res, 400, 'ITEM_NOT_FOUND', 'Выберите хотя бы один скин из инвентаря')
  }
  if (instanceIds.length > UPGRADE_MAX_ITEMS) {
    return sendError(
      res,
      400,
      'TOO_MANY_ITEMS',
      `В одном апгрейде можно использовать до ${UPGRADE_MAX_ITEMS} предметов`,
    )
  }
  if (instanceIds.length !== rawIds.length) {
    return sendError(res, 400, 'DUPLICATE_ITEMS', 'Один и тот же предмет выбран дважды')
  }

  const entries = instanceIds.map((instanceId) =>
    user.inventory.find((item) => item.instanceId === instanceId),
  )
  if (entries.some((entry) => !entry)) {
    return sendError(res, 404, 'ITEM_NOT_FOUND', 'Выберите скин из инвентаря')
  }

  const baseSkins = entries.map((entry) => SKIN_BY_ID.get(entry.skinId))
  const targetSkin = SKIN_BY_ID.get(targetSkinId)
  if (baseSkins.some((skin) => !skin) || !targetSkin) {
    return sendError(res, 404, 'SKIN_NOT_FOUND', 'Скин не найден')
  }

  const baseTotal = roundGold(baseSkins.reduce((sum, skin) => sum + skin.price, 0))
  if (targetSkin.price <= baseTotal) {
    return sendError(res, 400, 'BAD_TARGET', 'Цель должна быть дороже выбранных предметов')
  }

  // Доплата из баланса повышает эффективную стоимость апгрейда.
  // Шанс = (сумма предметов + доплата) / цель × 90%, но не выше 90%.
  const maxUsefulBoost = Math.max(0, roundGold(targetSkin.price * UPGRADE_EDGE - baseTotal))
  const requestedBoost = Math.max(0, Number(req.body?.boost) || 0)
  const boost = roundGold(Math.min(requestedBoost, maxUsefulBoost))

  if (boost > user.balance + 1e-9) {
    return sendError(res, 400, 'INSUFFICIENT_FUNDS', 'Недостаточно голды для доплаты', {
      user: publicUser(user),
      daily: buildDaily(),
    })
  }

  const chance = Math.min(
    90,
    Math.max(1, Math.round(((baseTotal + boost) / targetSkin.price) * 90 * 100) / 100),
  )
  const roll = crypto.randomInt(0, 10000) / 100
  const won = roll < chance

  const consumed = new Set(instanceIds)
  user.inventory = user.inventory.filter((entry) => !consumed.has(entry.instanceId))
  if (boost > 0) user.balance = roundGold(user.balance - boost)

  let wonItem = null
  let compensation = 0
  if (won) {
    const entry = makeInventoryEntry(targetSkin)
    user.inventory.unshift(entry)
    wonItem = { ...targetSkin, instanceId: entry.instanceId, obtainedAt: entry.obtainedAt }
    pushLiveDrop(user, targetSkin, 'upgrade')
  } else {
    // Утешительная компенсация: 5–10% от суммы сгоревших предметов.
    const rate = COMPENSATION_MIN + crypto.randomInt(0, 501) / 10000
    compensation = roundGold(baseTotal * rate)
    user.balance = roundGold(user.balance + compensation)
  }

  pushUpgradeHistory(user, {
    won,
    chance,
    boost,
    compensation,
    baseSkin: { ...baseSkins[0] },
    baseSkins: baseSkins.map((skin) => ({ ...skin })),
    baseTotal,
    targetSkin: { ...targetSkin },
    profit: won
      ? roundGold(targetSkin.price - baseTotal - boost)
      : -roundGold(baseTotal + boost - compensation),
  })
  saveState()

  res.json({
    ok: true,
    won,
    chance,
    boost,
    compensation,
    roll,
    baseSkin: baseSkins[0],
    baseSkins,
    baseTotal,
    targetSkin,
    wonItem,
    user: publicUser(user),
    daily: buildDaily(),
    message: won
      ? `Апгрейд успешен: ${targetSkin.name}`
      : compensation > 0
        ? `Апгрейд не удался · компенсация +${formatGold(compensation)}`
        : 'Апгрейд не удался',
  })
})

app.post('/api/craft/preview', auth, (req, res) => {
  const plan = buildCraftPlan(req.user, req.body?.instanceIds)
  if (!plan.ok) return sendError(res, 400, plan.code, plan.message)
  res.json({ ok: true, plan: publicCraftPlan(plan) })
})

app.post('/api/craft', auth, (req, res) => {
  const user = req.user
  const plan = buildCraftPlan(user, req.body?.instanceIds)
  if (!plan.ok) return sendError(res, 400, plan.code, plan.message)

  const output = rollCraftOutcome(plan)
  const consumed = new Set(plan.entries.map((entry) => entry.instanceId))
  user.inventory = user.inventory.filter((entry) => !consumed.has(entry.instanceId))

  const entry = makeInventoryEntry(output)
  user.inventory.unshift(entry)
  const wonItem = { ...output, instanceId: entry.instanceId, obtainedAt: entry.obtainedAt }

  pushCraftHistory(user, {
    rarity: plan.rarity,
    nextRarity: plan.outputRarity,
    stability: plan.stability,
    totalValue: plan.totalValue,
    minValue: plan.minValue,
    maxValue: plan.maxValue,
    inputSkins: plan.skins.map((skin) => ({ ...skin })),
    output: { ...output },
  })
  pushLiveDrop(user, output, 'craft')
  saveState()

  res.json({
    ok: true,
    wonItem,
    plan: publicCraftPlan(plan),
    user: publicUser(user),
    daily: buildDaily(),
    message: `Контракт собран: ${output.name}`,
  })
})

app.post('/api/case-battle', auth, (req, res) => {
  const user = req.user
  const config = CASE_BY_ID.get(String(req.body?.caseId || ''))
  if (!config || config.price <= 0) {
    return sendError(res, 404, 'CASE_NOT_FOUND', 'Выберите платный кейс для битвы')
  }

  const requestedRounds = Math.trunc(Number(req.body?.rounds))
  const rounds = BATTLE_ROUND_OPTIONS.includes(requestedRounds) ? requestedRounds : 3
  const mode = req.body?.mode === 'underdog' ? 'underdog' : 'normal'
  const opponent = makeBattleOpponent(req.body?.opponent === 'player' ? 'player' : 'bot')
  const entry = roundGold(config.price * rounds)

  if (user.balance + 1e-9 < entry) {
    return sendError(res, 400, 'INSUFFICIENT_FUNDS', 'Недостаточно голды для битвы', {
      user: publicUser(user),
      daily: buildDaily(),
    })
  }

  const playerSkins = []
  const opponentSkins = []
  for (let index = 0; index < rounds; index += 1) {
    playerSkins.push(weightedPick(config))
    opponentSkins.push(weightedPick(config))
  }

  const playerTotal = roundGold(playerSkins.reduce((sum, skin) => sum + skin.price, 0))
  const opponentTotal = roundGold(opponentSkins.reduce((sum, skin) => sum + skin.price, 0))
  const won = mode === 'underdog' ? playerTotal <= opponentTotal : playerTotal >= opponentTotal

  user.balance = roundGold(user.balance - entry)
  let payout = 0
  let wonItems = []
  if (won) {
    payout = roundGold(playerTotal + opponentTotal)
    wonItems = [...playerSkins, ...opponentSkins].map((skin) => {
      const inventoryEntry = makeInventoryEntry(skin)
      user.inventory.unshift(inventoryEntry)
      return { ...skin, instanceId: inventoryEntry.instanceId, obtainedAt: inventoryEntry.obtainedAt }
    })
  }

  pushBattleHistory(user, {
    caseId: config.id,
    caseName: config.name,
    rounds,
    mode,
    opponent,
    won,
    entry,
    payout,
    playerTotal,
    opponentTotal,
    playerSkins: playerSkins.map((skin) => ({ ...skin })),
    opponentSkins: opponentSkins.map((skin) => ({ ...skin })),
  })
  saveState()

  res.json({
    ok: true,
    won,
    mode,
    rounds,
    opponent,
    entry,
    payout,
    net: roundGold(payout - entry),
    playerTotal,
    opponentTotal,
    playerSkins,
    opponentSkins,
    wonItems,
    user: publicUser(user),
    daily: buildDaily(),
    message: won
      ? `Победа! Забрано ${payout} G`
      : mode === 'underdog'
        ? 'Поражение: у соперника сумма дешевле'
        : 'Поражение: у соперника сумма дороже',
  })
})

app.post('/api/buy-skin', auth, (req, res) => {
  const skinId = String(req.body?.skinId || '')
  const skin = SKIN_BY_ID.get(skinId)
  const user = req.user
  if (!skin) return sendError(res, 404, 'SKIN_NOT_FOUND', 'Скин не найден')
  if (user.balance + 1e-9 < skin.price) {
    return sendError(res, 400, 'INSUFFICIENT_FUNDS', 'Недостаточно голды', { user: publicUser(user) })
  }

  user.balance = roundGold(user.balance - skin.price)
  const entry = makeInventoryEntry(skin)
  user.inventory.unshift(entry)
  saveState()

  res.json({
    ok: true,
    bought: { ...skin, instanceId: entry.instanceId, obtainedAt: entry.obtainedAt },
    user: publicUser(user),
    daily: buildDaily(),
    message: `${skin.name} добавлен в инвентарь`,
  })
})

app.post('/api/deposit', auth, (req, res) => {
  const amount = Math.floor(Number(req.body?.amount))
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_DEPOSIT) {
    return sendError(
      res,
      400,
      'BAD_AMOUNT',
      `Введите сумму от 1 до ${formatGold(MAX_DEPOSIT)}`,
    )
  }

  const user = req.user
  const daily = buildDaily()
  // Владелец и скрытый администратор пополняются без дневного лимита.
  const unlimited = user.role === 'admin' || user.role === 'owner'

  if (!unlimited && amount > daily.remaining + 1e-9) {
    return sendError(
      res,
      403,
      'DAILY_LIMIT',
      `Дневной лимит пополнения: осталось ${formatGold(daily.remaining)}. Уменьшите сумму или дождитесь сброса в 00:00.`,
      { daily, user: publicUser(user) },
    )
  }

  user.balance = roundGold(user.balance + amount)
  if (!unlimited) {
    state.dailyDistributed = roundGold(Number(state.dailyDistributed || 0) + amount)
  }

  const event = winterEventInfo()
  const eventPercent = user.role === 'player' && event.active ? event.depositBonusPercent : 0
  const promoPercent = Math.max(0, Number(user.depositBoost?.percent) || 0)
  const eventBonus = roundGold(amount * (eventPercent / 100))
  const promoBonus = roundGold(amount * (promoPercent / 100))
  const bonus = roundGold(eventBonus + promoBonus)
  if (bonus > 0) user.balance = roundGold(user.balance + bonus)
  if (promoPercent > 0) user.depositBoost = null
  saveState()

  const bonusParts = []
  if (eventBonus > 0) bonusParts.push(`зимний бонус +${eventBonus} G`)
  if (promoBonus > 0) bonusParts.push(`промокод +${promoBonus} G`)

  res.json({
    ok: true,
    amount,
    bonus,
    eventBonus,
    promoBonus,
    promoPercent,
    credited: roundGold(amount + bonus),
    unlimited,
    event,
    user: publicUser(user),
    daily: buildDaily(),
    message:
      bonus > 0
        ? `Демо-донат +${amount} G · ${bonusParts.join(' · ')}`
        : unlimited
          ? `Пополнение +${amount} G без лимита`
          : `Демо-донат +${amount} G`,
  })
})

app.post('/api/logout', auth, (_req, res) => {
  // Токены stateless; клиент удаляет его локально.
  res.json({ ok: true })
})

/* ------------------------------------------------------------------ */
/*  Static build (production)                                         */
/* ------------------------------------------------------------------ */

const distPath = path.join(__dirname, 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found' } })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Внутренняя ошибка сервера' } })
})

function formatGold(value) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value || 0)} G`
}

ensureDay()
saveState()

app.listen(PORT, () => {
  console.log(`STAND GRADE API: http://localhost:${PORT}`)
  if (process.env.NODE_ENV !== 'production') {
    const demoNote = ENABLE_PLAYER_DEMO ? ` · player/${PLAYER_PASSWORD}` : ''
    const adminNote = ENABLE_ADMIN_ACCOUNT ? ` · admin/${ADMIN_PASSWORD}` : ''
    console.log(`Local accounts:${demoNote}${adminNote}`)
  } else if (!process.env.SESSION_SECRET) {
    console.warn(
      'WARNING: задайте SESSION_SECRET в переменных окружения перед публичным деплоем',
    )
  }
})
