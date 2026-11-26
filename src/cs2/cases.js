const RARITY_ORDER = [
  'Consumer Grade',
  'Industrial Grade',
  'Mil-Spec Grade',
  'Restricted',
  'Classified',
  'Covert',
  'Extraordinary',
  'Contraband',
]

const RARITY_RU = {
  'Consumer Grade': 'Ширпотреб',
  'Industrial Grade': 'Промышленное',
  'Mil-Spec Grade': 'Армейское',
  Restricted: 'Запрещённое',
  Classified: 'Засекреченное',
  Covert: 'Тайное',
  Extraordinary: 'Исключительное',
  Contraband: 'Контрабанда',
}

function buildCase(def, catalog) {
  const casePrice = Math.max(0, Number(def.priceCoins) || 0)
  const isFree = casePrice <= 0
  const minPrice = isFree ? 1 : Math.max(1, Math.round(casePrice * 0.05))
  const maxPrice = isFree
    ? Math.max(200, Number(def.maxFreeCoins) || 200)
    : Math.round(casePrice * 30)

  let matching = catalog.filter(
    (skin) =>
      def.filter(skin) &&
      skin.priceCoins >= minPrice &&
      skin.priceCoins <= maxPrice,
  )
  if (matching.length < 5) matching = catalog.filter(def.filter)

  const entries = matching.map((skin) => {
    const ratio = casePrice > 0 ? skin.priceCoins / casePrice : skin.priceCoins / 100
    const base = isFree
      ? 1 / Math.pow(1 + skin.priceCoins / 100, 1.15)
      : 1 / Math.pow(1 + ratio, 1.12)
    return {
      skin,
      base,
      profit: casePrice > 0 && skin.priceCoins > casePrice,
      ratio,
    }
  })

  /*
   * Экспоненциальный наклон весов: базовый профиль задаёт форму пула,
   * а lambda точно подгоняет средний дроп под targetRtp.
   * Такой подход работает даже когда весь пул состоит из дорогих скинов
   * (ножи, перчатки): дорогие позиции получают крошечный шанс, дешёвые —
   * основную массу, а RTP остаётся честным и предсказуемым.
   */
  let lambda = 0
  if (!isFree && def.targetRtp) {
    const targetValue = casePrice * def.targetRtp
    const logBase = entries.map((entry) => Math.log(entry.base))
    const expectedAt = (value) => {
      let maxLog = -Infinity
      const logWeights = entries.map((entry, index) => {
        const logWeight = logBase[index] - value * entry.skin.priceCoins / casePrice
        if (logWeight > maxLog) maxLog = logWeight
        return logWeight
      })
      let total = 0
      let sum = 0
      for (let index = 0; index < entries.length; index += 1) {
        const weight = Math.exp(logWeights[index] - maxLog)
        total += weight
        sum += weight * entries[index].skin.priceCoins
      }
      return total > 0 ? sum / total : 0
    }
    let lo = -24
    let hi = 24
    for (let index = 0; index < 80; index += 1) {
      const mid = (lo + hi) / 2
      if (expectedAt(mid) > targetValue) lo = mid
      else hi = mid
    }
    lambda = (lo + hi) / 2
  }

  const rawWeights = entries.map((entry) => {
    const tilt = casePrice > 0 ? (lambda * entry.skin.priceCoins) / casePrice : 0
    return Math.log(entry.base) - tilt
  })
  const maxRaw = Math.max(...rawWeights)
  const weighted = entries.map((entry, index) => ({
    skin: entry.skin,
    weight: Math.exp(rawWeights[index] - maxRaw),
  }))
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  const pool = weighted
    .map((entry) => ({
      skin: entry.skin,
      weight: entry.weight,
      chance: (entry.weight / totalWeight) * 100,
    }))
    .sort((a, b) => b.chance - a.chance)

  const rtp = isFree
    ? null
    : pool.reduce((sum, entry) => sum + (entry.skin.priceCoins * entry.chance) / 100, 0) /
      casePrice

  const rarityMap = new Map()
  for (const entry of pool) {
    const rarity = entry.skin.rarity || 'Consumer Grade'
    rarityMap.set(rarity, (rarityMap.get(rarity) || 0) + entry.chance)
  }
  const rarityBreakdown = [...rarityMap.entries()]
    .map(([rarity, chance]) => ({
      rarity,
      label: RARITY_RU[rarity] || rarity,
      chance,
      color: pool.find((entry) => entry.skin.rarity === rarity)?.skin.rarityColor || '#b0c3d9',
    }))
    .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))

  const featured = pool.reduce(
    (best, entry) => (!best || entry.skin.priceCoins > best.priceCoins ? entry.skin : best),
    null,
  )

  return {
    ...def,
    priceCoins: casePrice,
    free: isFree,
    pool,
    top: pool.slice(0, 12),
    totalItems: pool.length,
    rtp,
    rarityBreakdown,
    featured,
    image: featured?.image || '',
  }
}

const CASE_DEFS = [
  {
    id: 'farm-dust',
    name: 'Пыльный полигон',
    subtitle: 'Фарм-кейс · много дешёвых и средних скинов',
    category: 'farm',
    priceCoins: 100,
    targetRtp: 0.95,
    accent: '#d8a24a',
    filter: (skin) => !['Knives', 'Gloves'].includes(skin.category) && skin.priceCoins <= 400,
  },
  {
    id: 'farm-night',
    name: 'Ночная смена',
    subtitle: 'Фарм-кейс · повышенный средний дроп',
    category: 'farm',
    priceCoins: 250,
    targetRtp: 0.93,
    accent: '#7eb8ff',
    filter: (skin) => !['Knives', 'Gloves'].includes(skin.category) && skin.priceCoins <= 1200,
  },
  {
    id: 'farm-arsenal',
    name: 'Оружейный склад',
    subtitle: 'Фарм-кейс · больше средних и редких скинов',
    category: 'farm',
    priceCoins: 500,
    targetRtp: 0.9,
    accent: '#81e6b3',
    filter: (skin) => !['Knives', 'Gloves'].includes(skin.category) && skin.priceCoins <= 4000,
  },
  {
    id: 'knife-fang',
    name: 'Стальной клык',
    subtitle: 'Ножевой кейс · только ножи',
    category: 'knife',
    priceCoins: 5000,
    targetRtp: 0.8,
    accent: '#ff7a59',
    filter: (skin) => skin.category === 'Knives',
  },
  {
    id: 'knife-auction',
    name: 'Клинковый аукцион',
    subtitle: 'Ножевой кейс · дорогие ножи и редкие расцветки',
    category: 'knife',
    priceCoins: 9000,
    targetRtp: 0.75,
    accent: '#ffcf4d',
    filter: (skin) => skin.category === 'Knives' && skin.priceCoins >= 2500,
  },
  {
    id: 'glove-kit',
    name: 'Тактильный набор',
    subtitle: 'Перчаточный кейс · перчатки и обмотки',
    category: 'glove',
    priceCoins: 5000,
    targetRtp: 0.8,
    accent: '#c08bff',
    filter: (skin) => skin.category === 'Gloves',
  },
  {
    id: 'awp-only',
    name: 'Снайперский ящик',
    subtitle: 'Только AWP',
    category: 'weapon',
    priceCoins: 1200,
    targetRtp: 0.86,
    accent: '#5eead4',
    filter: (skin) => skin.weapon === 'AWP',
  },
  {
    id: 'ak-only',
    name: 'Калаш-сейф',
    subtitle: 'Только AK-47',
    category: 'weapon',
    priceCoins: 1000,
    targetRtp: 0.86,
    accent: '#f7a35c',
    filter: (skin) => skin.weapon === 'AK-47',
  },
  {
    id: 'm4-only',
    name: 'M4-контейнер',
    subtitle: 'Только M4A4 и M4A1-S',
    category: 'weapon',
    priceCoins: 900,
    targetRtp: 0.86,
    accent: '#8ab4ff',
    filter: (skin) => ['M4A4', 'M4A1-S'].includes(skin.weapon),
  },
  {
    id: 'covert',
    name: 'Тайный архив',
    subtitle: 'Только Covert',
    category: 'rarity',
    priceCoins: 4000,
    targetRtp: 0.84,
    accent: '#eb4b4b',
    filter: (skin) => skin.rarity === 'Covert',
  },
  {
    id: 'classified',
    name: 'Засекреченный пакет',
    subtitle: 'Только Classified',
    category: 'rarity',
    priceCoins: 1200,
    targetRtp: 0.84,
    accent: '#d32ce6',
    filter: (skin) => skin.rarity === 'Classified',
  },
  {
    id: 'restricted',
    name: 'Ограниченная партия',
    subtitle: 'Только Restricted',
    category: 'rarity',
    priceCoins: 600,
    targetRtp: 0.88,
    accent: '#8847ff',
    filter: (skin) => skin.rarity === 'Restricted',
  },
  {
    id: 'premium-50k',
    name: 'Тёмный аукцион',
    subtitle: 'Премиум · ножи и перчатки · бонус 7 500 КС',
    category: 'premium',
    priceCoins: 50000,
    targetRtp: 0.7,
    bonusCoins: 7500,
    accent: '#ff5c87',
    filter: (skin) =>
      ['Knives', 'Gloves'].includes(skin.category) && skin.priceCoins >= 8000,
  },
  {
    id: 'premium-100k',
    name: 'Королевский сейф',
    subtitle: 'Премиум · только топ-дроп · бонус 15 000 КС',
    category: 'premium',
    priceCoins: 100000,
    targetRtp: 0.7,
    bonusCoins: 15000,
    accent: '#ffcf4d',
    filter: (skin) =>
      ['Knives', 'Gloves'].includes(skin.category) && skin.priceCoins >= 20000,
  },
  {
    id: 'premium-200k',
    name: 'Бездна CS2',
    subtitle: 'Максимальный тир · бонус 40 000 КС',
    category: 'premium',
    priceCoins: 200000,
    targetRtp: 0.6,
    bonusCoins: 40000,
    accent: '#b58bff',
    filter: (skin) => skin.priceCoins >= 50000,
  },
  {
    id: 'daily-drop',
    name: 'Ежедневный дроп',
    subtitle: 'Бесплатно · раз в 24 часа',
    category: 'free',
    priceCoins: 0,
    targetRtp: null,
    maxFreeCoins: 220,
    accent: '#59d98d',
    free: true,
    filter: (skin) => !['Knives', 'Gloves'].includes(skin.category) && skin.priceCoins <= 220,
  },
]

export const CS2_CASE_CATEGORIES = [
  { id: 'all', label: 'Все кейсы' },
  { id: 'farm', label: 'Фарм' },
  { id: 'knife', label: 'Ножи' },
  { id: 'glove', label: 'Перчатки' },
  { id: 'weapon', label: 'Оружие' },
  { id: 'rarity', label: 'Редкости' },
  { id: 'premium', label: 'Премиум' },
  { id: 'free', label: 'Бесплатные' },
]

export function buildCs2Cases(catalog) {
  if (!catalog.length) return []
  return CASE_DEFS.map((def) => buildCase(def, catalog))
}

export function pickCaseSkin(caseData) {
  const pool = caseData?.pool || []
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0)
  let cursor = Math.random() * total
  for (const entry of pool) {
    if (cursor < entry.weight) return entry.skin
    cursor -= entry.weight
  }
  return pool[pool.length - 1]?.skin || null
}

export function rarityLabel(rarity) {
  return RARITY_RU[rarity] || rarity
}

export function rarityOrder(rarity) {
  return RARITY_ORDER.indexOf(rarity)
}

export { RARITY_ORDER, RARITY_RU }
