const STORAGE_PREFIX = 'stand_grade_cs2_v1'
const START_BALANCE = 10000
const HISTORY_LIMIT = 120

function storageKey(username) {
  return `${STORAGE_PREFIX}:${String(username || 'guest').toLowerCase()}`
}

export function defaultCs2State() {
  return {
    version: 1,
    balanceCoins: START_BALANCE,
    inventory: [],
    history: [],
    currency: 'coins',
    lastFreeAt: null,
  }
}

export function createInstanceId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `cs2-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeItem(item) {
  if (!item || !item.id) return null
  return {
    ...item,
    instanceId: item.instanceId || createInstanceId(),
    priceCoins: Math.max(1, Math.round(Number(item.priceCoins) || 0)),
    obtainedAt: item.obtainedAt || new Date().toISOString(),
  }
}

export function normalizeCs2State(raw) {
  const base = defaultCs2State()
  if (!raw || typeof raw !== 'object') return base
  return {
    ...base,
    balanceCoins: Math.max(0, Math.round(Number(raw.balanceCoins) || 0)),
    inventory: Array.isArray(raw.inventory)
      ? raw.inventory.map(normalizeItem).filter(Boolean)
      : [],
    history: Array.isArray(raw.history) ? raw.history.slice(0, HISTORY_LIMIT) : [],
    currency: ['coins', 'usd', 'byn', 'rub'].includes(raw.currency)
      ? raw.currency
      : 'coins',
    lastFreeAt: raw.lastFreeAt || null,
  }
}

export function loadCs2State(username) {
  if (typeof localStorage === 'undefined') return defaultCs2State()
  try {
    const raw = localStorage.getItem(storageKey(username))
    return raw ? normalizeCs2State(JSON.parse(raw)) : defaultCs2State()
  } catch {
    return defaultCs2State()
  }
}

export function saveCs2State(username, state) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(storageKey(username), JSON.stringify(state))
  } catch {
    /* localStorage may be unavailable */
  }
}

export function pushCs2History(state, event) {
  return [
    {
      id: event.id || createInstanceId(),
      at: event.at || new Date().toISOString(),
      type: event.type || 'case',
      title: event.title || '',
      detail: event.detail || '',
      priceCoins: Math.round(Number(event.priceCoins) || 0),
      image: event.image || '',
      rarityColor: event.rarityColor || '#b0c3d9',
    },
    ...(Array.isArray(state.history) ? state.history : []),
  ].slice(0, HISTORY_LIMIT)
}

export { START_BALANCE }
