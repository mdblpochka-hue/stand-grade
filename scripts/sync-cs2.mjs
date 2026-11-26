import fs from 'node:fs'
import path from 'node:path'

/*
 * Собирает CS2-каталог из двух открытых источников:
 * - LisSkins market export (актуальные минимальные цены в USD);
 * - ByMykel CSGO-API (названия, редкость, изображения Steam CDN).
 *
 * Запуск: node scripts/sync-cs2.mjs
 */

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'public', 'cs2')
const OUT_FILE = path.join(OUT_DIR, 'catalog.json')

const LIS_URL = 'https://lis-skins.com/market_export_json/csgo.json'
const BYMYKEL_URL =
  'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json'

const wearPattern = /\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i
const wearLabels = {
  'Factory New': 'Factory New',
  'Minimal Wear': 'Minimal Wear',
  'Field-Tested': 'Field-Tested',
  'Well-Worn': 'Well-Worn',
  'Battle-Scarred': 'Battle-Scarred',
}

function normalizeName(value) {
  return String(value || '')
    .replace(wearPattern, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getWear(value) {
  const match = String(value || '').match(wearPattern)
  return match ? wearLabels[match[1]] || match[1] : ''
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

const categoryAllowed = new Set(['Rifles', 'Pistols', 'SMGs', 'Heavy', 'Knives', 'Gloves'])

console.log('Загрузка LisSkins...')
const lis = await fetch(LIS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => {
  if (!r.ok) throw new Error(`LisSkins: ${r.status}`)
  return r.json()
})
console.log(`LisSkins: ${lis.length} лотов`)

console.log('Загрузка ByMykel CS2 API...')
const by = await fetch(BYMYKEL_URL).then((r) => {
  if (!r.ok) throw new Error(`ByMykel: ${r.status}`)
  return r.json()
})
console.log(`ByMykel: ${by.length} записей`)

const priceByExact = new Map()
const priceByBase = new Map()
for (const item of lis) {
  if (!item?.name || !Number.isFinite(Number(item.price)) || Number(item.price) <= 0) continue
  const exact = item.name
  const base = normalizeName(exact)
  const currentExact = priceByExact.get(exact)
  if (!currentExact || item.price < currentExact.price) priceByExact.set(exact, item)
  const currentBase = priceByBase.get(base)
  if (!currentBase || item.price < currentBase.price) priceByBase.set(base, item)
}

const groups = new Map()
for (const entry of by) {
  const category = entry.category?.name
  if (!categoryAllowed.has(category)) continue
  const baseName = normalizeName(entry.name)
  const match = priceByExact.get(entry.name) || priceByBase.get(baseName)
  if (!match) continue
  const key = `${entry.stattrak ? 'st|' : ''}${entry.souvenir ? 'sv|' : ''}${baseName}`
  const current = groups.get(key)
  if (!current || match.price < current.priceUsd) {
    groups.set(key, {
      name: baseName,
      image: entry.image,
      rarity: entry.rarity?.name || 'Consumer Grade',
      rarityColor: entry.rarity?.color || '#b0c3d9',
      weapon: entry.weapon?.name || '',
      category,
      stattrak: Boolean(entry.stattrak),
      souvenir: Boolean(entry.souvenir),
      wear: getWear(entry.name) || 'Field-Tested',
      priceUsd: Math.round(Number(match.price) * 100) / 100,
    })
  }
}

const items = [...groups.values()]
  .map((item, index) => ({
    id: `cs2-${item.stattrak ? 'st-' : ''}${item.souvenir ? 'sv-' : ''}${slugify(item.name) || 'skin'}-${index}`,
    ...item,
    priceCoins: Math.max(1, Math.round(item.priceUsd * 100)),
  }))
  .sort((a, b) => a.priceCoins - b.priceCoins)

const byCategory = {}
const byRarity = {}
for (const item of items) {
  byCategory[item.category] = (byCategory[item.category] || 0) + 1
  byRarity[item.rarity] = (byRarity[item.rarity] || 0) + 1
}

fs.mkdirSync(OUT_DIR, { recursive: true })
const payload = {
  updatedAt: new Date().toISOString(),
  source: LIS_URL,
  imageSource: BYMYKEL_URL,
  coinRate: 100,
  items,
}
fs.writeFileSync(OUT_FILE, JSON.stringify(payload), 'utf8')

console.log(`\nГотово: ${items.length} скинов -> ${path.relative(ROOT, OUT_FILE)}`)
console.log('По категориям:', byCategory)
console.log('По редкостям:', byRarity)
