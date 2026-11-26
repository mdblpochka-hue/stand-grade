import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  createPortal,
} from 'react-dom'
import {
  isSoundEnabled,
  playCaseResult,
  playCoin,
  playUpgradeResult,
  setSoundEnabled,
  startSpinSound,
  unlockAudio,
} from './sound'

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'stand_grade_token'
const FAST_KEY = 'stand_grade_fast_anim'

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Arcane', 'Nameless']

const RARITY = {
  Common: { label: 'Common', ru: 'Обычный', color: '#a7b5aa', glow: 'rgba(167,181,170,.14)' },
  Uncommon: { label: 'Uncommon', ru: 'Необычный', color: '#5cff9d', glow: 'rgba(92,255,157,.14)' },
  Rare: { label: 'Rare', ru: 'Редкий', color: '#4da3ff', glow: 'rgba(77,163,255,.15)' },
  Epic: { label: 'Epic', ru: 'Эпический', color: '#b777ff', glow: 'rgba(183,119,255,.16)' },
  Legendary: { label: 'Legendary', ru: 'Легендарный', color: '#ffc857', glow: 'rgba(255,200,87,.16)' },
  Arcane: { label: 'Arcane', ru: 'Аркан', color: '#ff5d8f', glow: 'rgba(255,93,143,.16)' },
  Nameless: { label: 'Nameless', ru: 'Безымянный', color: '#f6fffb', glow: 'rgba(246,255,251,.2)' },
}

const ANIM_MS_NORMAL = 3500
const ANIM_MS_FAST = 500
const UPGRADE_EDGE = 0.9
const UPGRADE_MAX_ITEMS = 7
const REEL_EASING = 'cubic-bezier(.52,.02,.08,1)'
const WINNER_INDEX = 34
const OPEN_COUNTS = [1, 2, 3, 4, 5, 10]

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

function formatGold(value, decimals = true) {
  const number = Number(value) || 0
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(number)} G`
}

function formatPrice(value) {
  const number = Number(value) || 0
  return `${new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
  }).format(number)} G`
}

function formatChance(value) {
  const chance = Number(value) || 0
  if (chance >= 10) return `${chance.toFixed(1)}%`
  if (chance >= 1) return `${chance.toFixed(2)}%`
  if (chance >= 0.01) return `${chance.toFixed(3)}%`
  return `${chance.toFixed(4)}%`
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

function plural(count, forms) {
  const value = Math.abs(Number(count) || 0)
  const tail = value % 100
  const digit = tail % 10
  if (tail > 10 && tail < 20) return forms[2]
  if (digit > 1 && digit < 5) return forms[1]
  if (digit === 1) return forms[0]
  return forms[2]
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function saveToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

async function apiRequest(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Не удалось выполнить запрос')
    error.status = response.status
    error.code = data?.error?.code
    error.data = data
    throw error
  }

  return data
}

function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(timer)
  }, [interval])
  return now
}

function useBodyLock(locked) {
  useEffect(() => {
    if (!locked) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [locked])
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

const ICONS = {
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 1 1 4.5-2.5L12 8m4.5 0A2.5 2.5 0 1 0 12 5.5L12 8" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 8.7c-.6-.5-1.5-.8-2.8-.8-1.7 0-2.8.8-2.8 2 0 2.9 6.2 1.4 6.2 4.4 0 1.3-1.3 2.2-3.4 2.2-1.3 0-2.5-.4-3.2-1" />
      <path d="M12 6v12" />
    </>
  ),
  bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  arrowUpRight: <path d="M7 17 17 7M7 7h10v10" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 21c.6-4 3-6 7-6s6.4 2 7 6" />
    </>
  ),
  logout: (
    <>
      <path d="M10 17l5-5-5-5M15 12H3" />
      <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 20 6v5c0 5-3.5 8.3-8 10-4.5-1.7-8-5-8-10V6l8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 1 0-2.1 5" />
    </>
  ),
  box: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M9 13h6" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.4 4.1L17.5 9l-4.1 1.4L12 14.5l-1.4-4.1L6.5 9l4.1-1.9L12 3Z" />
      <path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19v16H6.5A2.5 2.5 0 0 1 4 17.5v-11Z" />
      <path d="M4 7h15M15 12h5v4h-5a2 2 0 0 1 0-4Z" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="m3 3 18 18" />
      <path d="M10.6 6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.4 3.1M6.2 6.2A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.3 2.8 17.4A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.6L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  tag: (
    <>
      <path d="M20 13 13 20a2 2 0 0 1-2.8 0L3 12.8V4h8.8L20 12a2 2 0 0 1 0 1Z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-4-4 4 4 4-4" />
      <path d="M5 19h14" />
    </>
  ),
  crown: (
    <>
      <path d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7Z" />
      <path d="M5 21h14" />
    </>
  ),
  flame: <path d="M12 22c4 0 7-2.8 7-6.6 0-2.8-1.7-5.1-3.5-6.8-.5 1.7-1.4 2.8-2.5 3.4.2-3.8-1.4-6.8-3-8-0 4-5 6.3-5 11.4C5 19.2 8 22 12 22Z" />,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  play: <path d="m7 4 13 8-13 8V4Z" />,
  trending: (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  volume: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 8.5a5 5 0 0 1 0 7M18.8 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="m16 9 5 6M21 9l-5 6" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5M12 8v4l3 2" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6Z" />
      <path d="M14 5v14" strokeDasharray="2 3" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 4h16l2 9v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5l2-9Z" />
      <path d="M2 13h5l2 3h6l2-3h5" />
    </>
  ),
  cards: (
    <>
      <rect x="7" y="3" width="12" height="17" rx="2" />
      <path d="M4 6v13a2 2 0 0 0 2 2h9" />
      <path d="m13 7 1.1 2.7L17 11l-2.9 1.1L13 15l-1.1-2.9L9 11l2.9-1.3L13 7Z" />
    </>
  ),
  snowflake: (
    <>
      <path d="M12 2v20M4.2 6.5l15.6 11M19.8 6.5 4.2 17.5" />
      <path d="m9.2 4.6 2.8 2.4 2.8-2.4M9.2 19.4l2.8-2.4 2.8 2.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09A1.7 1.7 0 0 0 20.96 10H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </>
  ),
}

function Icon({ name, size = 18, className = '', strokeWidth = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONS[name] || ICONS.sparkles}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Skin palettes & vector weapon art                                  */
/* ------------------------------------------------------------------ */

const SKIN_PALETTES = {
  'karambit-gold': ['#fff8cc', '#ffd54a', '#6b4300'],
  'm9-bayonet-dragon-glass': ['#dcfff5', '#39ffc4', '#07453d'],
  'awm-treasure-hunter': ['#f7e5bb', '#c58a39', '#2f1b08'],
  'butterfly-dragon-glass': ['#dcfff5', '#39ffc4', '#07453d'],
  'kunai-poison': ['#dcff84', '#5cff2e', '#113b06'],
  'akr-necromancer': ['#ddc2ff', '#8b5cf6', '#170f2d'],
  'deagle-dragon-glass': ['#ddfff7', '#31f0c8', '#043a32'],
  'm4-samurai': ['#ffe8b8', '#f7a51a', '#341a02'],
  'awm-sport': ['#c5ffe3', '#35ff87', '#033f26'],
  'm4a1-bubblegum': ['#ffd7f0', '#ff6cbd', '#3b0729'],
  'akr-carbon': ['#e2e7e9', '#758690', '#11171a'],
  'awm-phoenix': ['#ffe4b1', '#ff7d19', '#3b1402'],
  'g22-nest': ['#cbffdc', '#28c963', '#052e16'],
  'ump45-pixel': ['#d8e6ff', '#7195d8', '#142038'],
  'g22-pixel-camo': ['#dfe8ff', '#7d94ff', '#141c38'],
  'p350-savannah': ['#f2e6c8', '#c9a25c', '#302310'],
  'famas-beagle': ['#f0e2cf', '#b98d59', '#2f2113'],
  'usp-line': ['#d8f7ff', '#39c4ff', '#062c3a'],
  'akr-tiger': ['#ffe2b8', '#ff9c1a', '#3a1b02'],
  'm4-predator': ['#d9ffe3', '#39d06a', '#052f18'],
  'deagle-captain-morgan': ['#ffe4b5', '#d99b35', '#33200a'],
  'p90-radiation': ['#e6ffb8', '#9aff18', '#1d3002'],
  'ump45-cyberpunk': ['#ffe0fb', '#ff48d8', '#35072c'],
  'mp7-arcade': ['#e1f0ff', '#4a9dff', '#081f3d'],
  'm4-pro': ['#e7ecf1', '#8797a8', '#151d25'],
  'usp-stone-cold': ['#e8f6ff', '#6bb7cf', '#0b2a33'],
  'p90-ghoul': ['#e3ffef', '#39d98a', '#062f1d'],
  'm4-grand-prix': ['#ffd9d0', '#ff5a3c', '#3a0d05'],
  'g22-frost-wyrm': ['#d9f6ff', '#56c9ff', '#052b3f'],
  'scorpion-starfall': ['#e8dcff', '#a06bff', '#1d0a3d'],
  'ump45-beast': ['#ffd9c2', '#ff7a2e', '#3a1002'],
  'flip-dragon-glass': ['#dcfff5', '#39ffc4', '#07453d'],
  'akr-dragon': ['#ffd6d6', '#ff4d4d', '#3d0505'],
  'mantis-poison': ['#e2ffb8', '#7dff1a', '#1f3002'],
  'm4-necromancer': ['#ddc2ff', '#8b5cf6', '#170f2d'],
  'gloves-mortal-vane': ['#ffd7e2', '#ff4d7d', '#3a0716'],
  'awm-genesis': ['#dcf9ff', '#42c9ff', '#072b3d'],
  'gloves-champion': ['#fff2c4', '#ffce45', '#3a2802'],
  'karambit-dragon-glass': ['#d8fff2', '#2affb0', '#033b2b'],
  'm9-bayonet-blue-blood': ['#d8e6ff', '#3d6bff', '#06143d'],
  'akr-treasure-hunter': ['#f7e5bb', '#c58a39', '#2f1b08'],
  'm4a1-year-of-the-tiger': ['#ffe0b0', '#ff9d13', '#3d1c00'],
  'sting-mimicry': ['#dfffe8', '#26f06a', '#03301a'],
  'karambit-snow-camo': ['#eef9ff', '#8fd8ff', '#0a2f47'],
  'm9-dark-shiver': ['#e3f2ff', '#5f9dff', '#081d3d'],
  'butterfly-saphira': ['#e6e2ff', '#8a6bff', '#170a3d'],
  'dual-daggers-frost-nova': ['#e9fbff', '#78d8ff', '#062f45'],
  'gloves-burning-fists': ['#ffe3c9', '#ff7a2e', '#3d1202'],
  'gloves-punk': ['#ffd9ec', '#ff3d9a', '#3a0620'],
  'm4a1-kitsune': ['#ffe4d1', '#ff8a3d', '#3d1503'],
  'awm-boom': ['#ffe0d6', '#ff5a3c', '#3a0d05'],
  'deagle-orochi': ['#e8ddff', '#a06bff', '#1d0a3d'],
  'p350-forest-spirit': ['#dcffe8', '#39d98a', '#062f1d'],
  'famas-fury': ['#ffdcdc', '#ff4d4d', '#3d0505'],
  'm60-steam-beast': ['#e7d9c9', '#a8794a', '#2b1a08'],
  'usp-chameleon': ['#dcffe9', '#3dffb0', '#063d2b'],
  'akr-sport': ['#e1f0ff', '#4a9dff', '#081f3d'],
}

const FALLBACK_PALETTES = {
  Common: ['#eef4ef', '#9eaca1', '#313b34'],
  Uncommon: ['#dbffe8', '#58e98a', '#0d3a21'],
  Rare: ['#dbeaff', '#4d9eff', '#0c2850'],
  Epic: ['#eeddff', '#ad6bff', '#2b1047'],
  Legendary: ['#fff0c9', '#ffc24d', '#452b00'],
  Arcane: ['#ffdce6', '#ff5c87', '#430d1c'],
  Nameless: ['#ffffff', '#b6ffcf', '#27613d'],
}

const WEAPON_KIND = {
  Karambit: 'karambit',
  'M9 Bayonet': 'bayonet',
  'Butterfly Knife': 'butterfly',
  Kunai: 'kunai',
  Gloves: 'gloves',
  AWM: 'sniper',
  M40: 'sniper',
  M16: 'rifle',
  AKR: 'rifle',
  AKR12: 'rifle',
  M4: 'rifle',
  M4A1: 'rifle',
  FNFAL: 'rifle',
  FAMAS: 'rifle',
  'Desert Eagle': 'pistol',
  USP: 'pistol',
  G22: 'pistol',
  P350: 'pistol',
  P90: 'smg',
  MP7: 'smg',
  UMP45: 'smg',
  Scorpion: 'smg',
  Flip: 'bayonet',
  Mantis: 'karambit',
  Sting: 'karambit',
  'Dual Daggers': 'kunai',
  SM1014: 'rifle',
  M60: 'rifle',
  MP5: 'smg',
  MAC10: 'smg',
  'TEC-9': 'pistol',
  M110: 'sniper',
  VAL: 'rifle',
  Mallard: 'shotgun',
  Berettas: 'pistol',
  'Akimbo Uzi': 'smg',
  SPAS: 'shotgun',
  'FN FAL': 'rifle',
  'F/S': 'smg',
  Flash: 'pistol',
  Molotov: 'pistol',
  M9: 'bayonet',
  Butterfly: 'butterfly',
}

function getPalette(skin) {
  return SKIN_PALETTES[skin.id] || FALLBACK_PALETTES[skin.rarity] || FALLBACK_PALETTES.Common
}

function getWeaponKind(weapon) {
  return WEAPON_KIND[weapon] || 'rifle'
}

function WeaponShape({ kind, grad, shine, c1, c2, c3 }) {
  const stroke = 'rgba(255,255,255,.24)'
  const fill = `url(#${grad})`
  const gloss = `url(#${shine})`

  if (kind === 'sniper') {
    return (
      <g>
        <path
          d="M20 65 49 55 100 54 136 45 166 46 172 39 193 39 198 47 235 48 250 53 250 58 207 61 180 64 174 73 151 75 143 65 102 67 84 82 50 82 38 72Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
        <rect x="109" y="25" width="58" height="13" rx="6" fill={c3} stroke={stroke} />
        <rect x="119" y="38" width="6" height="9" fill={c3} />
        <rect x="154" y="38" width="6" height="9" fill={c3} />
        <path d="M110 30h57" stroke={gloss} strokeWidth="2.2" opacity=".9" />
        <path d="M87 66 104 65 115 92 93 96Z" fill={c3} />
        <path d="M50 81 69 78 78 98 58 101Z" fill={c3} />
        <path d="M230 54h18" stroke={c1} strokeWidth="2" opacity=".7" />
        <path d="M111 51h22" stroke={gloss} strokeWidth="3" opacity=".5" />
      </g>
    )
  }

  if (kind === 'pistol') {
    return (
      <g>
        <path
          d="M83 43H196L216 51 211 64H144L130 74 113 109 80 109 96 73 83 64Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
        <path d="M90 47h104l8 5H94Z" fill={gloss} opacity=".85" />
        <path d="M131 64h22l-9 20h-21Z" fill={c3} opacity=".9" />
        <path d="M157 64h21l-7 20h-21Z" fill="#050806" opacity=".65" />
        <path d="M198 52h13l-4 10h-11Z" fill={c1} opacity=".35" />
        <circle cx="185" cy="58" r="2.5" fill={c1} opacity=".55" />
        <path d="M92 69h26" stroke={c1} strokeWidth="1.5" opacity=".3" />
      </g>
    )
  }

  if (kind === 'smg') {
    return (
      <g>
        <path
          d="M49 58 72 49H120L132 40H166L172 49H201L224 54 224 62H179L171 75H144L135 64H115L111 90H86L83 64H62L48 75Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
        <path d="M88 64h23l5 27H92Z" fill={c3} />
        <path d="M134 64h26l-7 22h-24Z" fill={c3} />
        <path d="M56 56 94 52v4L56 61Z" fill={gloss} opacity=".8" />
        <rect x="185" y="55" width="33" height="3" rx="1.5" fill={c1} opacity=".5" />
        <path d="M124 53h34" stroke={gloss} strokeWidth="2.5" opacity=".4" />
      </g>
    )
  }

  if (kind === 'karambit') {
    return (
      <g transform="rotate(-4 130 60)">
        <path
          d="M85 62C103 28 160 22 207 39 176 49 151 62 140 84 126 111 84 109 70 92 58 78 68 65 85 62Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
        <path
          d="M87 64C107 36 156 29 196 41 168 52 148 65 136 86 123 105 91 103 79 90 72 82 76 69 87 64Z"
          fill={gloss}
          opacity=".38"
        />
        <path
          d="M65 86C51 82 47 98 58 106 68 113 81 105 80 94 80 88 73 84 65 86Z"
          fill={c3}
          stroke={stroke}
        />
        <circle cx="65" cy="95" r="9" fill="#0a0f0b" stroke={c1} opacity=".7" />
        <path d="M110 55C131 42 155 37 179 40" fill="none" stroke="#fff" strokeWidth="1.1" opacity=".32" />
      </g>
    )
  }

  if (kind === 'bayonet') {
    return (
      <g transform="rotate(-7 130 60)">
        <path
          d="M38 76 73 56 121 55 203 33 241 38 196 53 155 68 114 81 73 91Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
        <path d="M38 76 73 56 91 65 58 88Z" fill={c3} />
        <path d="M103 57 194 39" stroke={gloss} strokeWidth="3" opacity=".55" />
        <path d="M201 34 239 38 238 42 199 38Z" fill={gloss} opacity=".8" />
        <path d="M84 70 114 61" stroke="#fff" opacity=".24" />
        <path d="M126 63 142 59M130 69 146 65M134 75 150 71" stroke="#fff" strokeWidth="1" opacity=".3" />
      </g>
    )
  }

  if (kind === 'butterfly') {
    return (
      <g transform="rotate(-5 130 60)">
        <path
          d="M41 87 91 64 150 61 214 35 247 42 171 69 155 82 90 91Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
        <path d="M89 64 46 88 57 102 100 80Z" fill={c3} stroke={stroke} />
        <path d="M101 77 157 69 173 89 112 102Z" fill={c3} stroke={stroke} />
        <path d="M148 60 215 35" stroke={gloss} strokeWidth="3.2" opacity=".55" />
        <circle cx="92" cy="66" r="4" fill={c1} opacity=".65" />
        <circle cx="102" cy="79" r="4" fill={c1} opacity=".65" />
        <path d="M64 90 88 80" stroke="#fff" strokeWidth="1" opacity=".3" />
      </g>
    )
  }

  if (kind === 'kunai') {
    return (
      <g transform="rotate(-9 130 60)">
        <path
          d="M134 20 197 52 151 75 126 57Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
        <path d="M130 58 79 77 64 68 112 49Z" fill={c3} stroke={stroke} />
        <circle cx="48" cy="72" r="13" fill="none" stroke={c1} strokeWidth="4" opacity=".75" />
        <path d="M133 25 188 51" stroke={gloss} strokeWidth="2" opacity=".65" />
        <path d="M136 58 154 51" stroke="#fff" strokeWidth="1" opacity=".3" />
      </g>
    )
  }

  if (kind === 'gloves') {
    return (
      <g transform="rotate(-4 130 62)">
        <path
          d="M82 102C72 88 66 73 70 64 73 57 81 59 84 67L90 80 78 42C76 33 87 30 91 39L101 71 94 31C93 22 105 21 108 31L115 69 112 35C112 26 124 27 126 36L133 75 136 52C137 42 149 44 149 53L149 77 156 62C160 54 171 59 168 68L158 93C152 110 137 117 119 117L101 117C90 117 86 111 82 102Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
        <path d="M89 99 151 92" stroke={c3} strokeWidth="5" opacity=".45" />
        <circle cx="101" cy="76" r="2.5" fill={c1} opacity=".55" />
        <circle cx="113" cy="73" r="2.5" fill={c1} opacity=".55" />
        <circle cx="126" cy="72" r="2.5" fill={c1} opacity=".55" />
        <path d="M103 48C111 44 120 45 124 52" stroke="#fff" strokeWidth="1.2" opacity=".28" />
      </g>
    )
  }

  return (
    <g>
      <path
        d="M20 58 44 49 87 50 101 38 151 36 161 45 211 46 240 51 240 58 205 61 180 63 172 77 151 79 143 65 101 67 85 79 60 81 54 64 35 67Z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.2"
      />
      <path d="M86 65h18l13 27H94Z" fill={c3} />
      <path d="M57 80 77 76 86 99 65 102Z" fill={c3} />
      <path d="M111 40h40l2 4h-42Z" fill={gloss} opacity=".9" />
      <path d="M167 49h38v3h-38Z" fill="#fff" opacity=".34" />
      <path d="M180 56h29v2h-29Z" fill={c3} opacity=".65" />
      <circle cx="91" cy="57" r="2" fill="#fff" opacity=".4" />
      <circle cx="136" cy="54" r="2" fill="#fff" opacity=".35" />
    </g>
  )
}

function WeaponArt({ skin, className = '' }) {
  const rawId = useId()
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, '')
  const [c1, c2, c3] = getPalette(skin)
  const grad = `wg-${uid}`
  const shine = `ws-${uid}`
  const glow = `wgl-${uid}`

  return (
    <svg viewBox="0 0 260 120" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={grad} x1="20" y1="15" x2="240" y2="105" gradientUnits="userSpaceOnUse">
          <stop stopColor={c1} />
          <stop offset=".45" stopColor={c2} />
          <stop offset="1" stopColor={c3} />
        </linearGradient>
        <linearGradient id={shine} x1="60" y1="20" x2="200" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity=".96" />
          <stop offset=".45" stopColor={c1} stopOpacity=".5" />
          <stop offset="1" stopColor={c2} stopOpacity=".08" />
        </linearGradient>
        <filter id={glow} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <ellipse cx="132" cy="104" rx="92" ry="9" fill={c2} opacity=".2" filter={`url(#${glow})`} />
      <g style={{ filter: 'drop-shadow(0 9px 14px rgba(0,0,0,.55))' }}>
        <WeaponShape
          kind={getWeaponKind(skin.weapon)}
          grad={grad}
          shine={shine}
          c1={c1}
          c2={c2}
          c3={c3}
        />
      </g>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Small shared UI                                                    */
/* ------------------------------------------------------------------ */

function LogoMark({ size = 38, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`lm-${size}`} x1="8" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ccff33" />
          <stop offset=".52" stopColor="#35ff87" />
          <stop offset="1" stopColor="#0d8a4a" />
        </linearGradient>
      </defs>
      <path
        d="M24 2.5 42.5 13v22L24 45.5 5.5 35V13L24 2.5Z"
        fill="#0a120c"
        stroke={`url(#lm-${size})`}
        strokeWidth="2"
      />
      <path
        d="M16 16h16L23 24l9 8H16"
        fill="none"
        stroke={`url(#lm-${size})`}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Logo({ compact = false, className = '' }) {
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <div className="relative shrink-0">
        <div className="absolute inset-0 rounded-xl bg-acid/20 blur-lg" />
        <LogoMark size={compact ? 33 : 38} className="relative" />
      </div>
      <div className="leading-none">
        <div className="font-display text-[13px] font-extrabold tracking-[-0.03em] text-white sm:text-[15px]">
          STAND <span className="text-acid">GRADE</span>
        </div>
        {!compact && (
          <div className="mt-1.5 text-[7px] font-bold uppercase tracking-[0.3em] text-white/30 sm:text-[8px]">
            Standoff 2 case arena
          </div>
        )}
      </div>
    </div>
  )
}

function RarityBadge({ rarity, className = '', showDot = true }) {
  const meta = RARITY[rarity] || RARITY.Common
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em]',
        className,
      )}
      style={{
        color: meta.color,
        borderColor: `${meta.color}33`,
        backgroundColor: `${meta.color}10`,
      }}
    >
      {showDot && (
        <span className="h-1 w-1 rounded-full" style={{ backgroundColor: meta.color }} />
      )}
      {meta.label}
    </span>
  )
}

function SkinVisual({ skin, className = '', artClassName = '', showRarity = true }) {
  const meta = RARITY[skin?.rarity] || RARITY.Common
  const [imageFailed, setImageFailed] = useState(false)
  const image = skin?.image

  useEffect(() => {
    setImageFailed(false)
  }, [image])

  return (
    <div
      className={cx('relative overflow-hidden', className)}
      style={{
        '--rarity-border': `${meta.color}30`,
        '--rarity-shadow': meta.glow,
        background: `radial-gradient(ellipse at 50% 0%, ${meta.color}24 0%, transparent 58%), linear-gradient(145deg, #18221b 0%, #0a100c 100%)`,
      }}
    >
      <div className="absolute inset-0 bg-grid-faint opacity-20" />
      <div
        className="absolute left-1/2 top-1/2 h-28 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-3xl"
        style={{ backgroundColor: meta.color }}
      />
      {image && !imageFailed ? (
        <img
          src={image}
          alt={skin.name}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className={cx(
            'absolute left-1/2 top-1/2 max-h-[86%] max-w-[94%] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_12px_20px_rgba(0,0,0,.55)]',
            artClassName,
          )}
        />
      ) : (
        <WeaponArt
          skin={skin}
          className={cx('absolute left-1/2 top-1/2 w-[94%] -translate-x-1/2 -translate-y-1/2', artClassName)}
        />
      )}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#070b08]/60 to-transparent" />
      {showRarity && (
        <div className="absolute left-2 top-2">
          <RarityBadge rarity={skin.rarity} />
        </div>
      )}
    </div>
  )
}

function GoldBalance({ value, size = 'md', className = '' }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-extrabold tabular-nums', className)}>
      <span
        className={cx(
          'inline-flex items-center justify-center rounded-full bg-acid/10 text-acid ring-1 ring-acid/20',
          size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
        )}
      >
        <Icon name="coin" size={size === 'sm' ? 10 : 12} strokeWidth={2.4} />
      </span>
      <span>{formatGold(value)}</span>
    </span>
  )
}

function CaseCrate({ accent = '#35ff87', skin, className = '' }) {
  const rawId = useId()
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, '')
  const top = `ct-${uid}`
  const front = `cf-${uid}`
  const side = `cs-${uid}`
  const glow = `cg-${uid}`

  return (
    <div className={cx('relative flex items-center justify-center', className)}>
      {skin &&
        (skin.image ? (
          <img
            src={skin.image}
            alt={skin.name}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
            className="absolute -right-3 top-2 w-24 rotate-[8deg] object-contain opacity-25 blur-[0.2px] transition duration-500 group-hover:-translate-y-1 group-hover:opacity-45 sm:w-28"
          />
        ) : (
          <WeaponArt
            skin={skin}
            className="absolute -right-3 top-2 w-24 rotate-[8deg] opacity-25 blur-[0.2px] transition duration-500 group-hover:-translate-y-1 group-hover:opacity-45 sm:w-28"
          />
        ))}
      <div
        className="absolute left-1/2 top-1/2 h-36 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-35 blur-3xl"
        style={{ backgroundColor: accent }}
      />
      <svg viewBox="0 0 260 180" className="relative z-[1] w-[74%] max-w-[240px] drop-shadow-[0_26px_30px_rgba(0,0,0,.5)]">
        <defs>
          <linearGradient id={top} x1="70" y1="35" x2="190" y2="110" gradientUnits="userSpaceOnUse">
            <stop stopColor={accent} stopOpacity=".38" />
            <stop offset=".45" stopColor={accent} stopOpacity=".11" />
            <stop offset="1" stopColor="#08100a" />
          </linearGradient>
          <linearGradient id={front} x1="45" y1="70" x2="135" y2="165" gradientUnits="userSpaceOnUse">
            <stop stopColor="#121b14" />
            <stop offset=".55" stopColor="#0b120d" />
            <stop offset="1" stopColor="#070c08" />
          </linearGradient>
          <linearGradient id={side} x1="135" y1="100" x2="225" y2="150" gradientUnits="userSpaceOnUse">
            <stop stopColor="#17231a" />
            <stop offset="1" stopColor="#080d09" />
          </linearGradient>
          <filter id={glow} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>
        <ellipse cx="132" cy="157" rx="88" ry="13" fill={accent} opacity=".16" filter={`url(#${glow})`} />
        <g stroke={accent} strokeOpacity=".46" strokeLinejoin="round">
          <path d="M42 69 129 34 222 70 135 107Z" fill={`url(#${top})`} strokeWidth="1.2" />
          <path d="M42 69 135 107 135 163 42 126Z" fill={`url(#${front})`} strokeWidth="1.1" />
          <path d="M135 107 222 70 222 127 135 163Z" fill={`url(#${side})`} strokeWidth="1.1" />
          <path d="M42 69 135 107 222 70" fill="none" strokeWidth="1.4" />
          <path d="M135 107V163" fill="none" strokeWidth="1.4" />
          <path d="M58 74 129 45 208 75" fill="none" opacity=".38" />
          <path d="M54 79 54 122 124 156" fill="none" opacity=".18" />
          <path d="M145 114 210 88" fill="none" opacity=".2" />
          <path d="M145 124 210 98" fill="none" opacity=".14" />
          <path d="M145 134 210 108" fill="none" opacity=".1" />
          <path d="M90 94 116 104 116 137 90 127Z" fill="#07100a" strokeWidth="1.25" />
          <circle cx="103" cy="113" r="4.5" fill={accent} opacity=".85" />
          <path d="M103 117v9" stroke={accent} strokeWidth="2" opacity=".75" />
          <path d="M57 75 57 82M71 69 71 76M208 76 208 84" strokeWidth="1.4" opacity=".55" />
          <path d="M148 114 166 107 166 133 148 140Z" fill="#08110b" strokeWidth="1" />
        </g>
        <text
          x="157"
          y="127"
          textAnchor="middle"
          fontFamily="Unbounded, sans-serif"
          fontSize="12"
          fontWeight="800"
          fill={accent}
          opacity=".82"
        >
          SG
        </text>
        <path d="M86 46 129 28 182 50" fill="none" stroke="#fff" strokeOpacity=".13" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Live feed & header                                                 */
/* ------------------------------------------------------------------ */

function LiveBar({ feed = [], online = 0, username = '' }) {
  const items = feed.filter((drop) => drop?.skin).slice(0, 18)
  const onlineLabel = new Intl.NumberFormat('ru-RU').format(Math.max(0, online))

  const renderGroup = (hidden) => (
    <div className="flex shrink-0 items-center gap-2 pr-2" aria-hidden={hidden || undefined}>
      {items.map((drop) => {
        const meta = RARITY[drop.skin.rarity] || RARITY.Common
        return (
          <div
            key={`${drop.id}-${hidden ? 'b' : 'a'}`}
            className="flex h-8 shrink-0 items-center gap-2 rounded-full border px-3"
            style={{
              borderColor: `${meta.color}28`,
              backgroundColor: `${meta.color}09`,
              boxShadow: `inset 0 0 20px ${meta.color}06`,
            }}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: meta.color, boxShadow: `0 0 8px ${meta.color}` }}
            />
            <span className="max-w-[80px] truncate text-[10px] font-semibold text-white/38">
              {drop.userName === username ? 'вы' : drop.userName}
            </span>
            <span className="text-[10px] font-extrabold" style={{ color: meta.color }}>
              {drop.skin.name}
            </span>
            <span className="hidden text-[9px] font-bold tabular-nums text-white/28 sm:inline">
              {formatPrice(drop.skin.price)}
            </span>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="relative z-30 border-b border-white/[0.055] bg-[#060a07]">
      <div className="mx-auto flex h-11 max-w-[1540px] items-stretch px-3 sm:px-6 xl:px-8">
        <div className="flex shrink-0 items-center gap-2 border-r border-white/[0.07] pr-3 sm:pr-4">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-acid" />
          <span className="hidden text-[9px] font-extrabold uppercase tracking-[0.18em] text-acid sm:inline">
            Live drops
          </span>
          <span className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-acid sm:hidden">
            Live
          </span>
        </div>
        <div className="marquee-wrap relative min-w-0 flex-1 overflow-hidden">
          {items.length ? (
            <div className="marquee-track flex h-full items-center">
              {renderGroup(false)}
              {renderGroup(true)}
            </div>
          ) : (
            <div className="flex h-full items-center px-4 text-[10px] text-white/30">
              Реальные дропы появятся здесь — открой первый кейс...
            </div>
          )}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#060a07] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#060a07] to-transparent" />
        </div>
        <div className="flex shrink-0 items-center gap-2 border-l border-white/[0.07] pl-3 sm:pl-4">
          <span className="h-1.5 w-1.5 rounded-full bg-acid/60" />
          <span className="hidden text-[10px] font-bold text-white/35 sm:inline">Онлайн</span>
          <span className="text-[10px] font-extrabold tabular-nums text-white/65">{onlineLabel}</span>
        </div>
      </div>
    </div>
  )
}

const NAV_ITEMS = [
  { id: 'upgrade', label: 'Апгрейд', icon: 'refresh' },
  { id: 'cases', label: 'Кейсы', icon: 'box' },
  { id: 'glyphs', label: 'Глифы', icon: 'cards' },
  { id: 'craft', label: 'Крафт', icon: 'sparkles' },
  { id: 'battle', label: 'Битва', icon: 'flame' },
  { id: 'promos', label: 'Промокоды', icon: 'ticket' },
  { id: 'requests', label: 'Заявки', icon: 'inbox' },
  { id: 'inventory', label: 'Инвентарь', icon: 'archive' },
]

const SECTION_IDS = ['cases', 'glyphs', 'craft', 'battle', 'upgrade', 'promos', 'requests', 'inventory', 'settings']

function readSectionFromHash() {
  if (typeof window === 'undefined') return 'cases'
  const hash = window.location.hash.replace('#', '')
  return SECTION_IDS.includes(hash) ? hash : 'cases'
}

function Header({
  user,
  online,
  soundOn,
  promoBadge = 0,
  requestBadge = 0,
  activeSection = 'cases',
  onNavigate,
  onStore,
  onDonate,
  onHistory,
  onSettings,
  onToggleSound,
  onLogout,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return undefined
    const close = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#070b08]/86 backdrop-blur-xl">
      <div className="mx-auto flex h-[66px] max-w-[1540px] items-center justify-between gap-2 px-3 sm:px-6 xl:px-8">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="shrink-0 text-left"
          aria-label="STAND GRADE — наверх"
        >
          <div className="hidden sm:block">
            <Logo />
          </div>
          <div className="sm:hidden">
            <Logo compact />
          </div>
        </button>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Основная навигация">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-label={item.label}
              className={cx(
                'group relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-bold transition',
                activeSection === item.id
                  ? 'bg-acid/[0.09] text-white'
                  : 'text-white/48 hover:bg-white/[0.04] hover:text-white',
              )}
            >
              <Icon
                name={item.icon}
                size={13}
                className={cx(
                  'nav-icon',
                  activeSection === item.id ? 'text-acid' : 'text-white/28 group-hover:text-acid/70',
                )}
              />
              {item.id === 'promos' && promoBadge > 0 && (
                <span className="promo-badge flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ffcf4d] px-1 text-[9px] font-black text-[#241a00]">
                  !
                </span>
              )}
              {item.id === 'requests' && requestBadge > 0 && (
                <span className="promo-badge flex h-4 min-w-4 items-center justify-center rounded-full bg-[#7bdcff] px-1 text-[9px] font-black text-[#041007]">
                  {requestBadge > 9 ? '9+' : requestBadge}
                </span>
              )}
              <span className="nav-tip" aria-hidden="true">
                <span className="nav-tip-text">{item.label}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={onHistory}
            aria-label="История"
            className="group relative flex items-center rounded-lg px-2.5 py-2 font-bold text-white/48 transition hover:bg-white/[0.04] hover:text-white"
          >
            <Icon name="history" size={13} className="nav-icon text-white/28 group-hover:text-acid/70" />
            <span className="nav-tip" aria-hidden="true">
              <span className="nav-tip-text">История</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onStore}
            aria-label="Магазин"
            className="group relative flex items-center rounded-lg px-2.5 py-2 font-bold text-white/48 transition hover:bg-white/[0.04] hover:text-white"
          >
            <Icon name="bag" size={13} className="nav-icon text-white/28 group-hover:text-acid/70" />
            <span className="nav-tip" aria-hidden="true">
              <span className="nav-tip-text">Магазин</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onSettings}
            aria-label="Настройки"
            className={cx(
              'group relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-bold transition',
              activeSection === 'settings'
                ? 'bg-acid/[0.09] text-white'
                : 'text-white/48 hover:bg-white/[0.04] hover:text-white',
            )}
          >
            <Icon
              name="settings"
              size={13}
              className={cx(
                'nav-icon',
                activeSection === 'settings' ? 'text-acid' : 'text-white/28 group-hover:text-acid/70',
              )}
            />
            <span className="nav-tip" aria-hidden="true">
              <span className="nav-tip-text">Настройки</span>
            </span>
          </button>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-2 2xl:flex">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-acid" />
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/32">Онлайн</span>
            <span className="text-[10px] font-extrabold tabular-nums text-white/70">{online}</span>
          </div>
          <button
            type="button"
            onClick={onSettings}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.035] text-white/45 transition hover:border-acid/30 hover:text-acid lg:hidden"
            aria-label="Настройки"
            title="Настройки"
          >
            <Icon name="settings" size={16} />
          </button>
          <button
            type="button"
            onClick={onToggleSound}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.035] text-white/45 transition hover:border-acid/30 hover:text-acid"
            aria-label={soundOn ? 'Выключить звук' : 'Включить звук'}
            title={soundOn ? 'Звук включён' : 'Звук выключен'}
          >
            <Icon name={soundOn ? 'volume' : 'volumeOff'} size={16} />
          </button>
          <div className="flex h-10 items-center gap-2 rounded-xl border border-acid/15 bg-acid/[0.055] px-2.5 sm:px-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-acid/12 text-acid ring-1 ring-acid/20">
              <Icon name="coin" size={12} strokeWidth={2.5} />
            </span>
            <div className="leading-none">
              <div className="hidden text-[7px] font-bold uppercase tracking-[0.16em] text-white/30 sm:block">
                Баланс
              </div>
              <span
                key={user.balance}
                className="ticker-flash block text-[11px] font-extrabold tabular-nums text-white sm:text-[12px]"
              >
                {formatGold(user.balance)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onDonate}
            className="btn-acid h-10 min-w-10 px-2.5 text-[10px] uppercase tracking-[0.1em] sm:px-4 sm:text-[11px]"
          >
            <Icon name="plus" size={15} strokeWidth={2.6} />
            <span className="hidden sm:inline">Донат</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.04] text-xs font-extrabold uppercase text-acid transition hover:border-acid/30 hover:bg-acid/[0.07]"
              aria-label="Профиль"
              aria-expanded={menuOpen}
            >
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(53,255,135,.2),transparent_70%)]" />
              <span className="relative">{user.username.slice(0, 1)}</span>
              {user.role === 'admin' && (
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-tl-md bg-lime shadow-[0_0_10px_rgba(204,255,51,.7)]" />
              )}
            </button>

            {menuOpen && (
              <div className="pop-in absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#101711] p-2 shadow-panel">
                <div className="rounded-xl bg-white/[0.035] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-white">{user.username}</div>
                      <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">
                        {user.role === 'owner'
                          ? 'Владелец проекта'
                          : user.role === 'admin'
                            ? 'Скрытый администратор'
                            : 'Player account'}
                      </div>
                    </div>
                    {(user.role === 'admin' || user.role === 'owner') && (
                      <span className="rounded-md border border-lime/25 bg-lime/10 px-1.5 py-1 text-[8px] font-black tracking-[0.12em] text-lime">
                        {user.role === 'owner' ? 'OWNER' : 'ADMIN'}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-white/[0.06] bg-black/15 p-2">
                      <div className="text-[8px] uppercase tracking-[0.14em] text-white/28">Баланс</div>
                      <div className="mt-1 text-[11px] font-extrabold tabular-nums text-acid">
                        {formatGold(user.balance)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-black/15 p-2">
                      <div className="text-[8px] uppercase tracking-[0.14em] text-white/28">Скины</div>
                      <div className="mt-1 text-[11px] font-extrabold tabular-nums text-white/75">
                        {user.inventory.length}
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onNavigate('glyphs')
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12px] font-bold text-white/60 transition hover:bg-white/[0.05] hover:text-white"
                >
                  <Icon name="cards" size={14} />
                  Глифы
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onNavigate('requests')
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12px] font-bold text-white/60 transition hover:bg-white/[0.05] hover:text-white"
                >
                  <Icon name="inbox" size={14} />
                  Заявки
                  {requestBadge > 0 && (
                    <span className="ml-auto rounded-full bg-[#7bdcff] px-1.5 py-0.5 text-[8px] font-black text-[#041007]">
                      {requestBadge > 9 ? '9+' : requestBadge}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onStore()
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12px] font-bold text-white/60 transition hover:bg-white/[0.05] hover:text-white"
                >
                  <Icon name="bag" size={14} />
                  Магазин скинов
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onSettings()
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12px] font-bold text-white/60 transition hover:bg-white/[0.05] hover:text-white"
                >
                  <Icon name="settings" size={14} />
                  Настройки
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onLogout()
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12px] font-bold text-[#ff8b9e] transition hover:bg-[#ff5d7a]/[0.08]"
                >
                  <Icon name="logout" size={14} />
                  Выйти из аккаунта
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function MobileDock({
  onNavigate,
  onStore,
  onHistory,
  inventoryCount,
  promoBadge = 0,
  activeSection = 'cases',
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#080d09]/95 backdrop-blur-xl lg:hidden">
      <div className="safe-bottom grid grid-cols-8 px-1 pb-1 pt-1.5">
        {[
          { id: 'cases', label: 'Кейсы', icon: 'box' },
          { id: 'glyphs', label: 'Глифы', icon: 'cards' },
          { id: 'craft', label: 'Крафт', icon: 'sparkles' },
          { id: 'battle', label: 'Битва', icon: 'flame' },
          { id: 'upgrade', label: 'Апгрейд', icon: 'refresh' },
          { id: 'promos', label: 'Промо', icon: 'ticket' },
          { id: 'history', label: 'История', icon: 'history' },
          { id: 'inventory', label: 'Инвентарь', icon: 'archive' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === 'store') onStore()
              else if (item.id === 'history') onHistory()
              else onNavigate(item.id)
            }}
            className={cx(
              'relative flex flex-col items-center gap-1 rounded-xl py-2 text-[7.5px] font-extrabold uppercase tracking-[0.06em] transition active:bg-white/[0.04]',
              activeSection === item.id ? 'bg-acid/[0.08] text-acid' : 'text-white/36',
            )}
          >
            <span className="relative">
              <Icon name={item.icon} size={17} />
              {item.id === 'inventory' && inventoryCount > 0 && (
                <span className="absolute -right-2.5 -top-2 min-w-4 rounded-full bg-acid px-1 text-center text-[7px] font-black leading-4 text-[#041007]">
                  {inventoryCount > 99 ? '99' : inventoryCount}
                </span>
              )}
              {item.id === 'promos' && promoBadge > 0 && (
                <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ffcf4d] px-1 text-[8px] font-black leading-4 text-[#241a00]">
                  !
                </span>
              )}
            </span>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

/* ------------------------------------------------------------------ */
/*  Cases                                                              */
/* ------------------------------------------------------------------ */

function CaseCard({ caseData, onOpen, index, user, now }) {
  const accent = caseData.accent || '#35ff87'
  const topPrize = caseData.topPrize || caseData.contents[0]
  const featured =
    caseData.contents.find((item) => item.id === caseData.featuredSkinId) || topPrize
  const meta = RARITY[featured.rarity] || RARITY.Common
  const freeCooldownIn =
    caseData.price === 0 && user?.nextFreeCaseAt
      ? Math.max(0, new Date(user.nextFreeCaseAt).getTime() - now)
      : 0
  const freeLocked = freeCooldownIn > 0 && !user?.unlimitedFreeCase
  const pityDry = Math.max(0, Number(user?.pity?.[caseData.id]?.dry) || 0)

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(caseData)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(caseData)
        }
      }}
      className="group relative cursor-pointer overflow-hidden rounded-[22px] border border-white/[0.075] bg-panel transition duration-300 hover:-translate-y-1 hover:border-white/[0.15] hover:shadow-[0_24px_70px_rgba(0,0,0,.38)] fade-up"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div
        className="relative h-[204px] overflow-hidden border-b border-white/[0.06] sm:h-[218px]"
        style={{
          background: `radial-gradient(ellipse at 50% 55%, ${accent}22 0%, transparent 55%), linear-gradient(170deg,#141f17 0%,#0a110c 100%)`,
        }}
      >
        <div className="absolute inset-0 bg-grid-faint opacity-35" />
        <div className="absolute left-4 top-4 z-10 flex flex-col gap-1.5">
          <span
            className="w-fit rounded-md border px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em]"
            style={{
              color: accent,
              borderColor: `${accent}2e`,
              backgroundColor: `${accent}0d`,
            }}
          >
            {caseData.kicker}
          </span>
          {caseData.price === 0 && (
            <span className="w-fit rounded-md border border-lime/25 bg-lime/10 px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-lime">
              {freeLocked ? `Через ${formatCountdown(freeCooldownIn)}` : 'Free · доступен'}
            </span>
          )}
        </div>
        <div className="absolute right-4 top-4 z-10 rounded-lg border border-white/[0.09] bg-black/25 px-2.5 py-1.5 text-right backdrop-blur">
          <div className="text-[7px] font-bold uppercase tracking-[0.14em] text-white/28">Цена</div>
          <div className="mt-0.5 text-[13px] font-extrabold tabular-nums text-white">
            {caseData.price === 0 ? '0 G' : formatPrice(caseData.price)}
          </div>
        </div>

        <CaseCrate accent={accent} skin={featured} className="h-full pt-5" />

        <div className="absolute inset-x-4 bottom-3 z-10 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/25 px-2.5 py-2 backdrop-blur-sm">
          <span className="text-[7px] font-black uppercase tracking-[0.16em] text-white/28">Featured</span>
          <span className="min-w-0 flex-1 truncate text-[10px] font-extrabold" style={{ color: meta.color }}>
            {featured.name}
          </span>
          <span className="text-[9px] font-extrabold tabular-nums text-white/42">
            {formatPrice(featured.price)}
          </span>
        </div>
      </div>

      <div className="p-4">
        <h3 className="font-display text-[16px] font-extrabold leading-tight tracking-[-0.03em] text-white">
          {caseData.name}
        </h3>
        <p className="mt-1.5 text-[10px] font-medium text-white/30">{caseData.subtitle}</p>

        <div className="mt-3.5 flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-white/[0.04]">
          {caseData.rarityBreakdown.map((row) => (
            <div
              key={row.rarity}
              title={`${row.rarity}: ${formatChance(row.chance)}`}
              className="h-full rounded-full"
              style={{
                width: `${row.chance}%`,
                minWidth: row.chance > 0 ? '2px' : 0,
                backgroundColor: (RARITY[row.rarity] || RARITY.Common).color,
                opacity: 0.8,
              }}
            />
          ))}
        </div>

        {caseData.price > 0 && (
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[7.5px] font-black uppercase tracking-[0.1em] text-white/30">
                <Icon name="shield" size={10} className="text-acid/55" />
                Гарант
              </span>
              <span className="text-[8px] font-extrabold tabular-nums text-acid/85">
                {pityDry}/100 · +{Math.round(pityDry)}%
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-acid/40 to-acid transition-all duration-500"
                style={{ width: `${Math.min(100, pityDry)}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[9px] font-semibold text-white/26">
            {caseData.totalItems || caseData.contents.length}{' '}
            {plural(caseData.totalItems || caseData.contents.length, ['предмет', 'предмета', 'предметов'])}
          </span>
          <span className="flex items-center gap-1.5 text-[9px] font-bold text-white/36">
            <Icon name="shield" size={11} className="text-acid/50" />
            честные шансы
          </span>
        </div>

        <div
          className={cx(
            'mt-4 flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] transition duration-200 group-hover:bg-acid group-hover:text-[#041007]',
            freeLocked && 'opacity-55',
          )}
          style={{
            borderColor: `${accent}26`,
            backgroundColor: `${accent}09`,
            color: accent,
          }}
        >
          <span>
            {freeLocked
              ? `Через ${formatCountdown(freeCooldownIn)}`
              : caseData.price === 0
                ? 'Открыть бесплатно'
                : 'Открыть кейс'}
          </span>
          <Icon name={freeLocked ? 'lock' : 'arrowRight'} size={15} strokeWidth={2.5} />
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-x-10 -bottom-10 h-16 rounded-full opacity-0 blur-2xl transition duration-500 group-hover:opacity-40"
        style={{ backgroundColor: accent }}
      />
    </article>
  )
}

function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="h-px w-6 bg-acid/60" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-acid/70">{eyebrow}</span>
        </div>
        <h2 className="mt-2 font-display text-[23px] font-black tracking-[-0.045em] text-white sm:text-[30px]">
          {title}
        </h2>
        {description && <p className="mt-1.5 max-w-2xl text-[11px] leading-relaxed text-white/34">{description}</p>}
      </div>
      {action}
    </div>
  )
}

function PriceSortControls({
  sort,
  onSortChange,
  minPrice,
  maxPrice,
  onMinPriceChange,
  onMaxPriceChange,
  className = '',
}) {
  const updateNumber = (value, setter) => {
    setter(String(value || '').replace(/[^0-9]/g, '').slice(0, 8))
  }

  return (
    <div className={cx('flex flex-wrap items-center gap-1.5', className)}>
      <div className="flex h-9 items-center rounded-lg border border-white/[0.08] bg-white/[0.025] p-0.5">
        <button
          type="button"
          onClick={() => onSortChange('asc')}
          aria-pressed={sort === 'asc'}
          title="Сначала дешёвые"
          className={cx(
            'h-8 rounded-md px-2.5 text-[9px] font-extrabold transition',
            sort === 'asc' ? 'bg-acid text-[#041007]' : 'text-white/35 hover:text-white/70',
          )}
        >
          ↑ Дешёвые
        </button>
        <button
          type="button"
          onClick={() => onSortChange('desc')}
          aria-pressed={sort === 'desc'}
          title="Сначала дорогие"
          className={cx(
            'h-8 rounded-md px-2.5 text-[9px] font-extrabold transition',
            sort === 'desc' ? 'bg-acid text-[#041007]' : 'text-white/35 hover:text-white/70',
          )}
        >
          ↓ Дорогие
        </button>
      </div>

      <div className="flex h-9 items-center gap-1 rounded-lg border border-white/[0.08] bg-black/20 px-2">
        <input
          value={minPrice}
          onChange={(event) => updateNumber(event.target.value, onMinPriceChange)}
          inputMode="numeric"
          placeholder="От"
          aria-label="Минимальная цена"
          className="h-full w-11 bg-transparent text-[9px] font-bold tabular-nums text-white placeholder:text-white/22 focus:outline-none"
        />
        <span className="text-[9px] text-white/18">—</span>
        <input
          value={maxPrice}
          onChange={(event) => updateNumber(event.target.value, onMaxPriceChange)}
          inputMode="numeric"
          placeholder="До"
          aria-label="Максимальная цена"
          className="h-full w-11 bg-transparent text-[9px] font-bold tabular-nums text-white placeholder:text-white/22 focus:outline-none"
        />
        <span className="text-[8px] font-bold text-white/24">G</span>
      </div>

      {(minPrice || maxPrice) && (
        <button
          type="button"
          onClick={() => {
            onMinPriceChange('')
            onMaxPriceChange('')
          }}
          className="h-9 rounded-lg border border-white/[0.08] px-2.5 text-[8px] font-black uppercase tracking-[0.06em] text-white/35 transition hover:border-white/20 hover:text-white/70"
        >
          Сброс
        </button>
      )}
    </div>
  )
}

function UpgradeShop({ catalog, balance, token, onUpdate, onToast, onBought, onClose }) {
  const [query, setQuery] = useState('')
  const [rarity, setRarity] = useState('all')
  const [sort, setSort] = useState('asc')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [visibleCount, setVisibleCount] = useState(24)
  const [buying, setBuying] = useState(null)

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const min = minPrice ? Number(minPrice) : 0
    const max = maxPrice ? Number(maxPrice) : Infinity
    return catalog
      .filter((skin) => skin.price >= min && skin.price <= max)
      .filter((skin) => rarity === 'all' || skin.rarity === rarity)
      .filter(
        (skin) =>
          !normalized ||
          skin.name.toLowerCase().includes(normalized) ||
          String(skin.weapon || '').toLowerCase().includes(normalized),
      )
      .sort((a, b) => (sort === 'asc' ? a.price - b.price : b.price - a.price))
  }, [catalog, query, rarity, sort, minPrice, maxPrice])

  useEffect(() => {
    setVisibleCount(24)
  }, [query, rarity, sort, minPrice, maxPrice])

  async function buy(skin) {
    if (buying) return
    setBuying(skin.id)
    try {
      const data = await apiRequest('/api/buy-skin', {
        method: 'POST',
        token,
        body: { skinId: skin.id },
      })
      onUpdate(data)
      onToast(data.message, 'success')
      if (data.bought) onBought?.(data.bought)
    } catch (requestError) {
      onToast(requestError.message, 'error')
      if (requestError.data?.user) onUpdate(requestError.data)
    } finally {
      setBuying(null)
    }
  }

  const visible = items.slice(0, visibleCount)

  return (
    <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-acid/20 bg-acid/[0.07] text-acid">
            <Icon name="bag" size={15} />
          </span>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/70">
              Магазин для апгрейда
            </div>
            <div className="text-[8px] font-semibold text-white/28">
              Купленный предмет сразу добавится в инвентарь и в выбор
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-8 items-center gap-1.5 rounded-lg border border-acid/15 bg-acid/[0.05] px-2.5 text-[10px] font-extrabold tabular-nums text-acid">
            <Icon name="coin" size={11} />
            {formatGold(balance)}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.09] px-2.5 text-[8px] font-black uppercase tracking-[0.06em] text-white/40 transition hover:text-white"
          >
            <Icon name="x" size={12} />
            Скрыть
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Icon
            name="search"
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/24"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти скин или оружие..."
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-black/25 pl-8 pr-3 text-[9px] font-semibold text-white placeholder:text-white/20 focus:border-acid/40 focus:outline-none"
          />
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setRarity('all')}
            className={cx(
              'shrink-0 rounded-lg border px-2.5 py-1.5 text-[8px] font-extrabold transition',
              rarity === 'all'
                ? 'border-acid/30 bg-acid/10 text-acid'
                : 'border-white/[0.07] bg-white/[0.02] text-white/32 hover:text-white/60',
            )}
          >
            Все
          </button>
          {RARITY_ORDER.map((value) => {
            const meta = RARITY[value]
            return (
              <button
                key={value}
                type="button"
                onClick={() => setRarity(value)}
                className={cx(
                  'shrink-0 rounded-lg border px-2.5 py-1.5 text-[8px] font-extrabold transition',
                  rarity === value
                    ? 'bg-white/[0.06] text-white'
                    : 'border-white/[0.07] bg-white/[0.02] text-white/32 hover:text-white/60',
                )}
                style={
                  rarity === value
                    ? { borderColor: `${meta.color}45`, color: meta.color }
                    : undefined
                }
              >
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>

      <PriceSortControls
        sort={sort}
        onSortChange={setSort}
        minPrice={minPrice}
        maxPrice={maxPrice}
        onMinPriceChange={setMinPrice}
        onMaxPriceChange={setMaxPrice}
        className="mt-2"
      />

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {visible.map((skin) => {
          const meta = RARITY[skin.rarity] || RARITY.Common
          const affordable = balance + 1e-9 >= skin.price
          const isBuying = buying === skin.id
          return (
            <article
              key={skin.id}
              className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]"
            >
              <SkinVisual skin={skin} className="h-20 w-full" showRarity={false} />
              <div className="p-2">
                <div className="truncate text-[9px] font-extrabold text-white/85">{skin.name}</div>
                <div className="mt-0.5 truncate text-[8px] font-semibold text-white/25">{skin.weapon}</div>
                <div className="mt-2 flex items-center justify-between gap-1">
                  <span className="text-[9px] font-extrabold tabular-nums" style={{ color: meta.color }}>
                    {formatPrice(skin.price)}
                  </span>
                  <button
                    type="button"
                    onClick={() => buy(skin)}
                    disabled={!affordable || Boolean(buying)}
                    className={cx(
                      'flex items-center gap-1 rounded-md border px-1.5 py-1 text-[8px] font-extrabold transition',
                      affordable
                        ? 'border-acid/25 bg-acid/[0.08] text-acid hover:bg-acid hover:text-[#041007]'
                        : 'cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-white/20',
                      buying && !isBuying && 'opacity-30',
                    )}
                  >
                    {isBuying ? (
                      <span className="spin-ring h-3 w-3 rounded-full border-2 border-current/30 border-t-current" />
                    ) : (
                      <Icon name={affordable ? 'plus' : 'lock'} size={10} />
                    )}
                    {affordable ? 'Купить' : 'Мало G'}
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {!items.length && (
        <div className="mt-3 rounded-xl border border-dashed border-white/[0.08] px-4 py-8 text-center text-[9px] font-semibold text-white/30">
          Ничего не найдено. Измените запрос или фильтр.
        </div>
      )}

      {items.length > visibleCount && (
        <div className="mt-3 flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => setVisibleCount((value) => value + 24)}
            className="rounded-lg border border-acid/25 bg-acid/[0.07] px-4 py-2 text-[8px] font-black uppercase tracking-[0.06em] text-acid transition hover:bg-acid/[0.14]"
          >
            Показать ещё 24
          </button>
          <span className="text-[8px] font-semibold text-white/22">
            Показано {Math.min(visibleCount, items.length)} из {items.length}
          </span>
        </div>
      )}
    </div>
  )
}

function CasesSection({ cases, onOpen, user, now }) {
  return (
    <section id="cases" className="pt-10 sm:pt-14">
      <SectionHeading
        eyebrow="Case opening"
        title="Выбери свой кейс"
        description="Чем дороже кейс — тем выше шанс на крупный дроп. У каждого кейса работает «Гарант»: серия без Arcane или ножа постепенно повышает шанс редкого дропа до 100%."
        action={
          <div className="flex items-center gap-2">
            <span className="chip !border-acid/15 !text-acid/65">
              <span className="h-1 w-1 rounded-full bg-acid" />
              {cases.length} {plural(cases.length, ['кейс', 'кейса', 'кейсов'])}
            </span>
            <span className="hidden chip sm:inline-flex">120 предметов в ленте</span>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {cases.map((caseData, index) => (
          <CaseCard
            key={caseData.id}
            caseData={caseData}
            onOpen={onOpen}
            index={index}
            user={user}
            now={now}
          />
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Glyph decks (card packs)                                          */
/* ------------------------------------------------------------------ */

function GlyphCardBack({ deck, className = '' }) {
  const accent = deck?.accent || '#8dff6a'
  return (
    <div
      className={cx('relative overflow-hidden rounded-2xl border', className)}
      style={{
        borderColor: `${accent}45`,
        background: `radial-gradient(ellipse at 50% 35%, ${accent}24 0%, transparent 60%), linear-gradient(160deg,#111a13,#070b08)`,
      }}
    >
      <div className="absolute inset-0 bg-grid-faint opacity-35" />
      <div className="absolute inset-2 rounded-xl border border-white/[0.08]" />
      <div className="absolute inset-3 rounded-lg border border-dashed" style={{ borderColor: `${accent}22` }} />
      <div className="relative flex h-full flex-col items-center justify-center text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-2xl border"
          style={{ borderColor: `${accent}40`, backgroundColor: `${accent}12`, color: accent }}
        >
          <Icon name="cards" size={28} />
        </span>
        <div
          className="mt-3 font-display text-[18px] font-black uppercase tracking-[0.14em]"
          style={{ color: accent }}
        >
          {deck?.kicker || 'GLYPH'}
        </div>
        <div className="mt-1 text-[7px] font-black uppercase tracking-[0.24em] text-white/25">
          Stand Grade · Glyph Card
        </div>
        <div className="mt-4 flex items-center gap-1.5">
          {[0, 1, 2, 3, 4].map((dot) => (
            <span
              key={dot}
              className="h-1 w-1 rounded-full"
              style={{ backgroundColor: dot < 3 ? accent : 'rgba(255,255,255,.15)' }}
            />
          ))}
        </div>
      </div>
      <span className="absolute left-3 top-3 font-mono text-[7px] font-black tracking-[0.18em] text-white/25">
        SG
      </span>
      <span className="absolute bottom-3 right-3 font-mono text-[7px] font-black tracking-[0.18em] text-white/20">
        18+
      </span>
    </div>
  )
}

function GlyphSection({ glyphs = [], user, token, fast, onUpdate, onToast }) {
  const session = user.glyphDrop || null
  const [activeDeckId, setActiveDeckId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [deckPreview, setDeckPreview] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [openCount, setOpenCount] = useState(1)
  const [selectedDropIds, setSelectedDropIds] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [upgradeMultiplier, setUpgradeMultiplier] = useState(2)
  const [upgradePhase, setUpgradePhase] = useState(null)
  const [upgradeResults, setUpgradeResults] = useState([])
  const [upgradeError, setUpgradeError] = useState('')
  const actionRef = useRef(false)
  const stopSoundRef = useRef(null)
  const pendingUpgradeRef = useRef(null)
  const cardsAreaRef = useRef(null)
  const [cardsSpace, setCardsSpace] = useState({ width: 0, height: 0 })
  const upgradeDuration = fast ? ANIM_MS_FAST : ANIM_MS_NORMAL

  const activeDeck =
    glyphs.find((deck) => deck.id === (session?.deckId || activeDeckId)) || null
  const drops = session?.drops || []
  const selectableDrops = drops.filter((drop) => !drop.failed)
  const selectedDrops = selectableDrops.filter((drop) => selectedDropIds.includes(drop.id))
  const hasFailed = drops.some((drop) => drop.failed)
  const canReroll = Boolean(session && session.attemptsLeft > 0 && !hasFailed)
  const resultLosses = upgradeResults.filter((result) => !result.won).length
  const selectedValue = selectedDrops.reduce(
    (sum, drop) => sum + drop.currentDrop.price,
    0,
  )
  const upgradeChance = Math.round((90 / (upgradeMultiplier || 2)) * 10) / 10
  const resultsByDrop = new Map(
    upgradeResults.map((result) => [result.dropId, result]),
  )
  const allSelected =
    selectableDrops.length > 0 && selectedDrops.length === selectableDrops.length
  const cardCols = Math.min(
    Math.max(drops.length, 1),
    cardsSpace.width < 560 ? 2 : cardsSpace.width < 760 ? 3 : 5,
  )
  const cardRows = Math.max(1, Math.ceil(Math.max(drops.length, 1) / cardCols))
  const cardGap = 12
  const cardsAvailableWidth = Math.max(0, cardsSpace.width - 24)
  const cardsAvailableHeight = Math.max(0, cardsSpace.height - 36)
  const cardWidthFromGrid =
    (cardsAvailableWidth - (cardCols - 1) * cardGap) / cardCols
  const cardWidthFromHeight =
    cardsAvailableHeight > 0
      ? ((cardsAvailableHeight - (cardRows - 1) * cardGap) / cardRows) * 0.7
      : cardWidthFromGrid
  const cardWidth = Math.max(
    96,
    Math.min(320, cardWidthFromGrid, cardWidthFromHeight),
  )

  useEffect(() => {
    setSelectedDropIds((previous) => {
      const next = previous.filter((id) =>
        drops.some((drop) => drop.id === id && !drop.failed),
      )
      return next.length === previous.length ? previous : next
    })
  }, [session?.id, drops.map((drop) => `${drop.id}:${drop.failed ? 1 : 0}`).join('|')])

  useLayoutEffect(() => {
    const node = cardsAreaRef.current
    if (!node) return undefined
    const update = () => {
      const width = node.clientWidth
      const height = node.clientHeight
      setCardsSpace((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [modalOpen, deckPreview, drops.length])

  useEffect(() => {
    if (upgradePhase !== 'spinning' || !upgradeResults.length) return undefined
    const stopSound = startSpinSound(upgradeDuration, 'upgrade')
    stopSoundRef.current = stopSound
    const wins = upgradeResults.filter((result) => result.won).length
    const losses = upgradeResults.length - wins
    const compensationTotal = upgradeResults.reduce(
      (sum, result) => sum + (Number(result.compensation) || 0),
      0,
    )
    const timer = setTimeout(() => {
      stopSound()
      if (stopSoundRef.current === stopSound) stopSoundRef.current = null
      const pending = pendingUpgradeRef.current
      if (pending) {
        onUpdate(pending)
        setSelectedDropIds([])
        pendingUpgradeRef.current = null
      }
      setUpgradePhase('result')
      playUpgradeResult(wins > 0)
      onToast(
        `x${upgradeMultiplier}: успешно ${wins} из ${upgradeResults.length}${compensationTotal > 0 ? ` · компенсация +${formatPrice(compensationTotal)}` : ''}${losses > 0 ? ' · замены сгорели' : ''}`,
        wins > 0 ? 'success' : 'error',
      )
    }, upgradeDuration + 120)
    return () => {
      clearTimeout(timer)
      stopSound()
      if (stopSoundRef.current === stopSound) stopSoundRef.current = null
    }
  }, [upgradePhase, upgradeResults, upgradeDuration, upgradeMultiplier, onUpdate, onToast])

  function resetUpgrade() {
    setUpgradePhase(null)
    setUpgradeResults([])
    setUpgradeError('')
    pendingUpgradeRef.current = null
  }

  function closeModal() {
    if (upgradePhase === 'spinning') return
    setModalOpen(false)
    setDeckPreview(false)
    setReopening(false)
    resetUpgrade()
  }

  function finishBatch() {
    const deckId = session?.deckId || activeDeckId || null
    if (!deckId) {
      closeModal()
      return
    }
    setActiveDeckId(deckId)
    setModalOpen(true)
    setDeckPreview(true)
    setReopening(true)
    setOpenCount(1)
    resetUpgrade()
  }

  useEscape(closeModal, modalOpen)

  async function startDeck(deck) {
    if (!deck || actionRef.current || busy) return
    const totalPrice = deck.price * openCount
    if (user.balance + 1e-9 < totalPrice) {
      const message = `Недостаточно G: нужно ${formatPrice(totalPrice)}`
      setError(message)
      onToast(message, 'error')
      return
    }
    actionRef.current = true
    setBusy('open')
    setError('')
    unlockAudio()
    try {
      const data = await apiRequest('/api/open-glyph', {
        method: 'POST',
        token,
        body: { deckId: deck.id, count: openCount },
      })
      onUpdate(data)
      setActiveDeckId(deck.id)
      setModalOpen(true)
      setDeckPreview(false)
      setReopening(false)
      setSelectedDropIds([])
      resetUpgrade()
      setUpgradeMultiplier(2)
    } catch (requestError) {
      setError(requestError.message)
      onToast(requestError.message, 'error')
      if (requestError.data?.user) onUpdate(requestError.data)
    } finally {
      setBusy('')
      actionRef.current = false
    }
  }

  function openDeck(deck) {
    if (session) {
      setActiveDeckId(session.deckId)
      setModalOpen(true)
      setDeckPreview(false)
      setReopening(false)
      resetUpgrade()
      return
    }
    setActiveDeckId(deck.id)
    setOpenCount(1)
    setDeckPreview(true)
    setReopening(false)
    setModalOpen(true)
    resetUpgrade()
    setUpgradeMultiplier(2)
    setError('')
  }

  function continueDrop() {
    if (!session) return
    setActiveDeckId(session.deckId)
    setModalOpen(true)
    setDeckPreview(false)
    setReopening(false)
    setSelectedDropIds([])
    resetUpgrade()
  }

  async function rerollDrop() {
    if (!session || !canReroll || actionRef.current || busy) return
    actionRef.current = true
    setBusy('reroll')
    setError('')
    unlockAudio()
    try {
      const data = await apiRequest('/api/glyph/reroll', {
        method: 'POST',
        token,
      })
      onUpdate(data)
      setSelectedDropIds([])
      resetUpgrade()
    } catch (requestError) {
      setError(requestError.message)
      onToast(requestError.message, 'error')
      if (requestError.data?.user) onUpdate(requestError.data)
    } finally {
      setBusy('')
      actionRef.current = false
    }
  }

  async function collectDrop() {
    if (!session || actionRef.current || busy) return
    if (!selectedDropIds.length && !hasFailed) return
    actionRef.current = true
    setBusy('collect')
    setError('')
    try {
      const data = await apiRequest('/api/glyph/collect', {
        method: 'POST',
        token,
        body: { dropIds: selectedDropIds },
      })
      onUpdate(data)
      playCoin()
      onToast(data.message, 'success', 'Дроп забран')
      if (data.glyphDrop) {
        resetUpgrade()
      } else {
        finishBatch()
      }
    } catch (requestError) {
      setError(requestError.message)
      onToast(requestError.message, 'error')
      if (requestError.data?.user) onUpdate(requestError.data)
    } finally {
      setBusy('')
      actionRef.current = false
    }
  }

  async function sellDrop() {
    if (!session || actionRef.current || busy) return
    if (!selectedDropIds.length && !hasFailed) return
    actionRef.current = true
    setBusy('sell')
    setError('')
    try {
      const data = await apiRequest('/api/glyph/sell', {
        method: 'POST',
        token,
        body: { dropIds: selectedDropIds },
      })
      onUpdate(data)
      playCoin()
      onToast(data.message, 'success', 'Дроп продан')
      if (data.glyphDrop) {
        resetUpgrade()
      } else {
        finishBatch()
      }
    } catch (requestError) {
      setError(requestError.message)
      onToast(requestError.message, 'error')
      if (requestError.data?.user) onUpdate(requestError.data)
    } finally {
      setBusy('')
      actionRef.current = false
    }
  }

  function chooseMultiplier(multiplier) {
    if (upgradePhase === 'spinning') return
    setUpgradeMultiplier(multiplier)
    setUpgradeError('')
    if (upgradePhase === 'result') resetUpgrade()
  }

  function enterUpgradeConfirm() {
    if (!session || !selectedDrops.length || upgradePhase === 'spinning') return
    setUpgradePhase('confirm')
    setUpgradeResults([])
    setUpgradeError('')
  }

  function cancelUpgrade() {
    if (upgradePhase === 'spinning') return
    resetUpgrade()
  }

  async function runUpgrade() {
    if (
      !session ||
      !selectedDrops.length ||
      upgradePhase === 'spinning' ||
      actionRef.current
    ) {
      return
    }
    actionRef.current = true
    setUpgradePhase('spinning')
    setUpgradeError('')
    unlockAudio()
    try {
      const data = await apiRequest('/api/glyph/upgrade', {
        method: 'POST',
        token,
        body: { multiplier: upgradeMultiplier, dropIds: selectedDropIds },
      })
      pendingUpgradeRef.current = data
      setUpgradeResults(data.results || [])
    } catch (requestError) {
      setUpgradePhase('confirm')
      setUpgradeError(requestError.message)
      onToast(requestError.message, 'error')
      if (requestError.data?.user) onUpdate(requestError.data)
    } finally {
      actionRef.current = false
    }
  }

  function toggleDrop(dropId) {
    if (upgradePhase === 'spinning') return
    if (upgradePhase) resetUpgrade()
    setSelectedDropIds((previous) =>
      previous.includes(dropId)
        ? previous.filter((id) => id !== dropId)
        : [...previous, dropId],
    )
  }

  function toggleSelectAll() {
    if (upgradePhase === 'spinning') return
    if (upgradePhase) resetUpgrade()
    setSelectedDropIds((previous) =>
      previous.length === selectableDrops.length
        ? []
        : selectableDrops.map((drop) => drop.id),
    )
  }

  return (
    <section id="glyphs" className="pt-10 sm:pt-14">
      <SectionHeading
        eyebrow="Glyph cards"
        title="Глифы"
        description="Открой печать, перекручивай всю пачку до пяти раз, выбирай нужные скины и забирай, продавай или отправляй в апгрейд x2 / x3 / x5 / x10."
        action={
          <span className="chip !border-[#b58bff]/20 !text-[#d7c4ff]/75">
            <Icon name="cards" size={11} />
            {glyphs.length} печатей
          </span>
        }
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#ff7189]/20 bg-[#ff7189]/[0.06] p-3 text-[9px] leading-relaxed text-[#ff9aac]">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {session && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-acid/20 bg-acid/[0.05] px-4 py-3">
          <div>
            <div className="text-[8px] font-black uppercase tracking-[0.16em] text-acid/65">
              Активный дроп · {session.deckName}
            </div>
            <div className="mt-1 text-[11px] font-bold text-white/75">
              Карт: {session.remaining} из {session.count} · перекрутов пачки {session.attemptsLeft}/{session.attemptsTotal || 5}
            </div>
          </div>
          <button
            type="button"
            onClick={continueDrop}
            className="rounded-lg border border-acid/30 bg-acid/[0.09] px-3 py-2 text-[8px] font-black uppercase tracking-[0.08em] text-acid transition hover:bg-acid/[0.16]"
          >
            Продолжить
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {glyphs.map((deck, index) => {
          const top = deck.featuredSkin || deck.topPrize || deck.contents?.[0]
          const meta = top ? RARITY[top.rarity] || RARITY.Common : RARITY.Common
          const displayPrice = deck.price
          return (
            <article
              key={deck.id}
              role="button"
              tabIndex={0}
              onClick={() => openDeck(deck)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openDeck(deck)
                }
              }}
              className={cx(
                'group relative cursor-pointer overflow-hidden rounded-[22px] border border-white/[0.075] bg-panel transition duration-300 hover:-translate-y-1 hover:border-white/[0.15] hover:shadow-[0_24px_70px_rgba(0,0,0,.38)] fade-up',
                session && session.deckId !== deck.id && 'opacity-60',
              )}
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <div className="relative h-[196px] overflow-hidden border-b border-white/[0.06] p-4">
                <div className="absolute left-4 top-4 z-10 rounded-md border border-white/[0.09] bg-black/30 px-2 py-1 text-[7px] font-black uppercase tracking-[0.14em] text-white/45">
                  {deck.kicker}
                </div>
                <div className="absolute right-4 top-4 z-10 text-right">
                  <div className="text-[7px] font-bold uppercase tracking-[0.14em] text-white/25">
                    Печать
                  </div>
                  <div className="mt-0.5 text-[13px] font-extrabold tabular-nums text-white">
                    {formatPrice(displayPrice)}
                  </div>
                </div>
                <GlyphCardBack
                  deck={deck}
                  className="absolute inset-x-10 bottom-3 top-12 transition duration-300 group-hover:scale-[1.03]"
                />
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-[16px] font-extrabold leading-tight tracking-[-0.03em] text-white">
                    {deck.name}
                  </h3>
                  <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.06em] text-white/35">
                    5 перекрутов пачки
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] font-medium text-white/30">{deck.subtitle}</p>

                <div className="mt-3.5 flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-white/[0.04]">
                  {(deck.rarityBreakdown || []).map((row) => (
                    <div
                      key={row.rarity}
                      title={`${row.rarity}: ${formatChance(row.chance)}`}
                      className="h-full rounded-full"
                      style={{
                        width: `${row.chance}%`,
                        minWidth: row.chance > 0 ? '2px' : 0,
                        backgroundColor: (RARITY[row.rarity] || RARITY.Common).color,
                      }}
                    />
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2">
                  <span className="text-[7px] font-black uppercase tracking-[0.14em] text-white/25">Топ</span>
                  <span className="min-w-0 flex-1 truncate text-[9px] font-extrabold" style={{ color: meta.color }}>
                    {top?.name || '—'}
                  </span>
                  <span className="text-[8px] font-extrabold tabular-nums text-white/38">
                    {top ? formatPrice(top.price) : '—'}
                  </span>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {modalOpen &&
        activeDeck &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#030604]/88 p-3 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={`Глиф · ${activeDeck.name}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal()
          }}
        >
          <div
            className={cx(
              'pop-in relative flex w-full flex-col overflow-hidden rounded-[26px] border border-white/[0.1] bg-[#0b120d] shadow-panel',
              session && !deckPreview ? 'h-[92vh]' : 'max-h-[92vh]',
              deckPreview ? 'max-w-[470px]' : 'max-w-[1400px]',
            )}
          >
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full blur-[70px]"
              style={{ backgroundColor: `${activeDeck.accent}22` }}
            />
            <div className="relative flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3">
              <div className="min-w-0">
                <div className="text-[7px] font-black uppercase tracking-[0.18em]" style={{ color: activeDeck.accent }}>
                  {activeDeck.kicker}
                </div>
                <div className="mt-0.5 truncate font-display text-[16px] font-black text-white">
                  {activeDeck.name}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {session && (
                  <span className="hidden rounded-lg border border-acid/20 bg-acid/[0.06] px-2 py-1 text-[7px] font-black uppercase tracking-[0.06em] text-acid/80 sm:inline">
                    Карт {session.remaining}/{session.count}
                  </span>
                )}
                <span className="rounded-lg border border-white/[0.08] bg-black/25 px-2.5 py-1.5 text-[10px] font-extrabold tabular-nums text-white/70">
                  {formatPrice(activeDeck.price)}
                </span>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={upgradePhase === 'spinning'}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.09] text-white/45 transition hover:border-white/20 hover:text-white disabled:opacity-30"
                  aria-label="Закрыть"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              {deckPreview ? (
                (() => {
                  const top = activeDeck.featuredSkin || activeDeck.topPrize || activeDeck.contents?.[0]
                  const meta = top ? RARITY[top.rarity] || RARITY.Common : RARITY.Common
                  const total = activeDeck.price * openCount
                  return (
                    <div className="flex-1 overflow-y-auto p-4">
                      <div className="mx-auto w-full max-w-[440px]">
                      {reopening && (
                        <div className="mb-3 rounded-xl border border-acid/25 bg-acid/[0.07] px-3 py-2.5 text-center">
                          <div className="text-[8px] font-black uppercase tracking-[0.14em] text-acid/80">
                            Пачка закончилась
                          </div>
                          <div className="mt-0.5 text-[8px] font-semibold text-white/35">
                            Все карты разобраны или сгорели — можно открыть снова
                          </div>
                        </div>
                      )}
                      <div className="flex justify-center">
                        <GlyphCardBack deck={activeDeck} className="h-[220px] w-[165px]" />
                      </div>

                      <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-[8px] font-black uppercase tracking-[0.14em] text-white/30">
                              5 перекрутов на всю пачку
                            </div>
                            <div className="mt-0.5 text-[8px] font-semibold text-white/28">
                              Сначала дроп, потом собери, продай или отправь в апгрейд
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[7px] font-black uppercase tracking-[0.1em] text-white/25">Топ</div>
                            <div className="mt-0.5 max-w-[150px] truncate text-[9px] font-extrabold" style={{ color: meta.color }}>
                              {top?.name || '—'}
                            </div>
                            <div className="text-[8px] font-extrabold tabular-nums text-white/38">
                              {top ? formatPrice(top.price) : '—'}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-white/[0.04]">
                          {(activeDeck.rarityBreakdown || []).map((row) => (
                            <div
                              key={row.rarity}
                              title={`${row.rarity}: ${formatChance(row.chance)}`}
                              className="h-full rounded-full"
                              style={{
                                width: `${row.chance}%`,
                                minWidth: row.chance > 0 ? '2px' : 0,
                                backgroundColor: (RARITY[row.rarity] || RARITY.Common).color,
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/35">
                            Сколько открыть
                          </span>
                          <span className="text-[9px] font-extrabold tabular-nums text-acid">
                            Итого {formatPrice(total)}
                          </span>
                        </div>
                        <div className="mt-1.5 grid grid-cols-5 gap-1.5">
                          {[1, 2, 3, 5, 10].map((count) => (
                            <button
                              key={count}
                              type="button"
                              onClick={() => setOpenCount(count)}
                              disabled={busy === 'open'}
                              className={cx(
                                'h-9 rounded-lg border text-[10px] font-black tabular-nums transition disabled:opacity-35',
                                openCount === count
                                  ? 'border-acid/40 bg-acid/[0.1] text-acid'
                                  : 'border-white/[0.08] bg-white/[0.02] text-white/40 hover:border-acid/25 hover:text-acid',
                              )}
                            >
                              {count}
                            </button>
                          ))}
                        </div>
                      </div>

                      {error && (
                        <div className="mt-2 rounded-lg border border-[#ff7189]/20 bg-[#ff7189]/[0.06] px-2.5 py-2 text-[8px] font-semibold text-[#ff9aac]">
                          {error}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => startDeck(activeDeck)}
                        disabled={busy === 'open'}
                        className="btn-acid mt-3 w-full !py-3.5 !text-[11px] uppercase tracking-[0.08em] disabled:opacity-40"
                      >
                        {busy === 'open' ? (
                          <>
                            <span className="spin-ring h-4 w-4 rounded-full border-2 border-[#041007]/30 border-t-[#041007]" />
                            Открываем...
                          </>
                        ) : (
                          <>
                            <Icon name="cards" size={14} />
                            {reopening ? 'Открыть снова' : 'Открыть'} за {formatPrice(total)}
                          </>
                        )}
                      </button>
                      <div className="mt-2 text-center text-[7px] font-semibold leading-relaxed text-white/22">
                        {reopening
                          ? 'Та же печать · новый дроп'
                          : openCount > 1
                            ? `${openCount} ${openCount < 5 ? 'карты' : 'карт'} в пачке · перекрут заменяет всю пачку сразу`
                            : 'перекрут заменяет всю пачку сразу'}
                      </div>
                      </div>
                    </div>
                  )
                })()
              ) : session && drops.length ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div ref={cardsAreaRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
                    <div className="flex min-h-full items-center justify-center">
                    <div
                      className="grid"
                      style={{
                        gap: `${cardGap}px`,
                        gridTemplateColumns: `repeat(${cardCols}, minmax(0, ${cardWidth}px))`,
                        justifyContent: 'center',
                      }}
                    >
                      {drops.map((dropItem) => {
                        const skin = dropItem.currentDrop
                        const meta = RARITY[skin.rarity] || RARITY.Common
                        const selected = selectedDropIds.includes(dropItem.id)
                        const result = resultsByDrop.get(dropItem.id)
                        const chance = result?.chance ?? upgradeChance
                        const showWheel =
                          !dropItem.failed &&
                          ((upgradePhase === 'confirm' && selected) ||
                            (upgradePhase === 'spinning' && Boolean(result)))
                        const showSuccess = upgradePhase === 'result' && Boolean(result?.won)
                        return (
                          <button
                            key={dropItem.id}
                            type="button"
                            onClick={() => toggleDrop(dropItem.id)}
                            disabled={
                              dropItem.failed ||
                              upgradePhase === 'confirm' ||
                              upgradePhase === 'spinning'
                            }
                            className={cx(
                              'group relative aspect-[7/10] w-full overflow-hidden rounded-[18px] border text-left transition duration-200 disabled:cursor-default',
                              selected && !dropItem.failed
                                ? 'border-acid/65 shadow-[0_0_34px_rgba(53,255,135,.18)]'
                                : 'border-white/[0.1]',
                              !dropItem.failed && !upgradePhase && 'hover:-translate-y-0.5 hover:border-white/25',
                            )}
                          >
                            <div className="absolute inset-0">
                              <SkinVisual skin={skin} className="h-full w-full" showRarity={false} />
                            </div>
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#040905]/90 via-[#040905]/5 to-[#040905]/50" />
                            <div className="relative flex h-full flex-col p-2 sm:p-2.5">
                              <div className="flex justify-center">
                                <span className="rounded-md border border-white/[0.12] bg-black/45 px-2 py-0.5 text-[10px] font-black tabular-nums text-white/85 backdrop-blur-sm">
                                  {formatPrice(skin.price)}
                                </span>
                              </div>
                              <div className="mt-auto text-center">
                                <div className="text-[7px] font-black uppercase tracking-[0.18em] text-white/45">
                                  {skin.weapon || meta.label}
                                </div>
                                <div className="mt-0.5 truncate text-[11px] font-extrabold leading-tight text-white">
                                  {skin.baseName || skin.name}
                                </div>
                              </div>
                            </div>

                            {selected && !dropItem.failed && !upgradePhase && (
                              <span className="absolute right-2 top-2 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-acid text-[10px] font-black text-[#041007] shadow-[0_0_14px_rgba(53,255,135,.55)]">
                                ✓
                              </span>
                            )}

                            {showWheel && (
                              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-[#030805]/60 backdrop-blur-[2px]">
                                <ProbabilityWheel
                                  chance={chance}
                                  roll={
                                    upgradePhase === 'spinning'
                                      ? result?.roll ?? null
                                      : null
                                  }
                                  size={Math.max(96, Math.min(170, Math.round(cardWidth * 0.72)))}
                                  duration={upgradeDuration}
                                  spinKey={
                                    result
                                      ? dropItem.id + '-' + String(result.roll)
                                      : dropItem.id + '-idle'
                                  }
                                >
                                  <span className="text-[6px] font-black uppercase tracking-[0.14em] text-white/40">
                                    Шанс успеха
                                  </span>
                                  <span className="mt-0.5 font-display text-[16px] font-black leading-none text-white">
                                    {Number(chance).toFixed(2)}%
                                  </span>
                                  <span className="mt-1 rounded border border-white/[0.14] bg-black/40 px-1.5 py-0.5 text-[7px] font-bold text-white/65">
                                    x{upgradeMultiplier}.00
                                  </span>
                                </ProbabilityWheel>
                              </div>
                            )}

                            {showSuccess && (
                              <span className="absolute left-2 top-2 z-20 rounded-md bg-acid px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.06em] text-[#041007]">
                                успех x{upgradeMultiplier}
                              </span>
                            )}

                            {dropItem.failed && (
                              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#030805]/65 px-2 text-center backdrop-blur-md">
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ff4d6d] text-[18px] font-black leading-none text-white shadow-[0_0_18px_rgba(255,77,109,.45)]">
                                  ×
                                </span>
                                <div className="mt-2 text-[9px] font-extrabold text-white">
                                  Апгрейд не прошёл
                                </div>
                                {Number(dropItem.compensation) > 0 && (
                                  <div className="mt-0.5 text-[8px] font-bold text-[#ffb3c1]">
                                    +{formatPrice(dropItem.compensation)}
                                  </div>
                                )}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    </div>
                  </div>

                  <div className="relative shrink-0 border-t border-white/[0.08] bg-[#080f0a]/95 px-3 py-2.5 backdrop-blur sm:px-5 sm:py-3">
                    <div className="mb-2 flex items-center justify-center gap-2">
                      <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/35">
                        Перекруты {session.attemptsLeft}/{session.attemptsTotal || 5}
                      </span>
                      <span className="flex items-center gap-0.5 text-[13px] leading-none">
                        {Array.from({ length: session.attemptsTotal || 5 }).map((_, index) => (
                          <span
                            key={index}
                            className={cx(
                              index < session.attemptsLeft
                                ? 'text-acid drop-shadow-[0_0_6px_rgba(53,255,135,.55)]'
                                : 'text-white/10',
                            )}
                          >
                            ⚡
                          </span>
                        ))}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex shrink-0 gap-1.5">
                        {[2, 3, 5, 10].map((multiplier) => (
                          <button
                            key={multiplier}
                            type="button"
                            onClick={() => chooseMultiplier(multiplier)}
                            disabled={upgradePhase === 'spinning'}
                            className={cx(
                              'h-9 w-11 rounded-lg border text-[10px] font-black tabular-nums transition disabled:opacity-40',
                              upgradeMultiplier === multiplier
                                ? 'border-acid/60 bg-acid/[0.12] text-acid'
                                : 'border-white/[0.1] bg-white/[0.03] text-white/45 hover:border-white/25 hover:text-white',
                            )}
                          >
                            x{multiplier}
                          </button>
                        ))}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                        {upgradePhase === 'confirm' || upgradePhase === 'spinning' ? (
                          <>
                            <button
                              type="button"
                              onClick={cancelUpgrade}
                              disabled={upgradePhase === 'spinning'}
                              className="h-9 rounded-lg border border-white/[0.12] bg-white/[0.04] px-4 text-[9px] font-black uppercase tracking-[0.08em] text-white/70 transition hover:bg-white/[0.08] disabled:opacity-40"
                            >
                              Отмена
                            </button>
                            <button
                              type="button"
                              onClick={runUpgrade}
                              disabled={upgradePhase === 'spinning'}
                              className="h-9 rounded-lg border border-acid/60 bg-acid px-7 text-[9px] font-black uppercase tracking-[0.1em] text-[#041007] shadow-[0_0_24px_rgba(53,255,135,.28)] transition hover:bg-[#5cffa0] disabled:opacity-50"
                            >
                              Апгрейд
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={collectDrop}
                              disabled={Boolean(busy) || (!selectedDrops.length && !hasFailed)}
                              className={cx(
                                'h-9 rounded-lg border px-4 text-[9px] font-black uppercase tracking-[0.08em] transition disabled:opacity-35',
                                !selectableDrops.length && hasFailed
                                  ? 'border-acid/60 bg-acid text-[#041007] shadow-[0_0_24px_rgba(53,255,135,.28)] hover:bg-[#5cffa0]'
                                  : 'border-white/[0.12] bg-white/[0.04] text-white/75 hover:bg-white/[0.08]',
                              )}
                            >
                              {!selectableDrops.length && hasFailed ? 'Открыть снова' : 'Забрать'}
                            </button>
                            <button
                              type="button"
                              onClick={rerollDrop}
                              disabled={Boolean(busy) || !canReroll}
                              className="h-9 rounded-lg border border-acid/25 bg-acid/[0.06] px-4 text-[9px] font-black uppercase tracking-[0.08em] text-acid transition hover:bg-acid/[0.12] disabled:opacity-35"
                            >
                              {busy === 'reroll' ? 'Меняем...' : 'Поменять все'}
                            </button>
                            <button
                              type="button"
                              onClick={enterUpgradeConfirm}
                              disabled={Boolean(busy) || !selectedDrops.length}
                              className="h-9 rounded-lg border border-acid/60 bg-acid px-6 text-[9px] font-black uppercase tracking-[0.1em] text-[#041007] shadow-[0_0_24px_rgba(53,255,135,.28)] transition hover:bg-[#5cffa0] disabled:opacity-40"
                            >
                              Апгрейд
                            </button>
                            {selectedDrops.length > 0 && (
                              <button
                                type="button"
                                onClick={sellDrop}
                                disabled={Boolean(busy)}
                                className="h-9 rounded-lg border border-[#ffcf4d]/25 bg-[#ffcf4d]/[0.06] px-4 text-[9px] font-black uppercase tracking-[0.08em] text-[#ffe6a3] transition hover:bg-[#ffcf4d]/[0.12] disabled:opacity-35"
                              >
                                Продать {formatPrice(selectedValue)}
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        disabled={upgradePhase === 'confirm' || upgradePhase === 'spinning'}
                        className="hidden h-9 shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 text-[8px] font-black uppercase tracking-[0.06em] text-white/45 transition hover:border-white/25 hover:text-white disabled:opacity-30 sm:block"
                      >
                        {allSelected ? 'Снять выбор' : 'Выбрать все'}
                      </button>
                    </div>

                    {upgradeError && (
                      <div className="mt-2 text-center text-[8px] font-semibold text-[#ff9aac]">
                        {upgradeError}
                      </div>
                    )}
                    <div className="mt-1.5 text-center text-[7px] font-semibold text-white/22">
                      {upgradePhase === 'confirm'
                        ? 'Проверь шанс и запускай апгрейд'
                        : upgradePhase === 'result'
                          ? resultLosses > 0
                            ? selectableDrops.length
                              ? 'Апгрейд не прошёл — все оставшиеся замены сгорели'
                              : 'Все карты сгорели — можно открыть снова'
                            : 'Выбери карты для следующего действия'
                          : !selectableDrops.length && hasFailed
                            ? 'Все карты сгорели — открой печать снова'
                            : hasFailed && session.attemptsLeft <= 0
                              ? 'Замены сгорели после неудачного апгрейда'
                              : 'Клик по карте выбирает её · апгрейд идёт по выбранным'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center p-4">
                  <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
                    <Icon name="cards" size={28} className="text-white/20" />
                    <div className="mt-2 text-[10px] font-bold text-white/35">Дроп закрыт</div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="mt-3 rounded-lg border border-white/[0.09] px-3 py-2 text-[8px] font-black uppercase tracking-[0.08em] text-white/45 hover:text-white"
                    >
                      Закрыть
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>,
          document.body,
        )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Probability wheel for glyph upgrades                              */
/* ------------------------------------------------------------------ */

function ProbabilityWheel({ chance = 35, roll = null, size = 230, duration = 1100, spinKey, children }) {
  const needleRef = useRef(null)

  useEffect(() => {
    const node = needleRef.current
    if (!node || roll === null || roll === undefined) return undefined
    node.style.transition = 'none'
    node.style.transform = 'rotate(0deg)'
    void node.offsetWidth
    const spins = duration <= 600 ? 2 : 6
    const frame = requestAnimationFrame(() => {
      node.style.transition = `transform ${duration}ms ${REEL_EASING}`
      node.style.transform = `rotate(${360 * spins + Number(roll) * 3.6}deg)`
    })
    return () => cancelAnimationFrame(frame)
  }, [roll, duration, spinKey])

  const green = Math.max(0, Math.min(100, Number(chance) || 0))
  const innerInset = Math.max(18, Math.round(size * 0.18))
  const tickTop = Math.max(4, Math.round(size * 0.043))

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="pointer-events-none absolute -inset-4 rounded-full bg-acid/[0.06] blur-2xl" />
      <div className="absolute inset-0 rounded-full border border-white/[0.08] bg-[#060b07] shadow-[inset_0_0_60px_rgba(0,0,0,.85)]" />
      <div
        className="absolute rounded-full transition-[background] duration-300"
        style={{
          inset: 8,
          background: `conic-gradient(#35ff87 0deg ${green * 3.6}deg, rgba(255,93,122,.3) ${green * 3.6}deg 360deg)`,
          filter: green ? 'drop-shadow(0 0 16px rgba(53,255,135,.16))' : 'none',
        }}
      />
      <div
        className="absolute rounded-full border border-white/[0.08] bg-[#080f0a] shadow-[inset_0_0_42px_rgba(0,0,0,.8)]"
        style={{ inset: innerInset }}
      />
      {Array.from({ length: 40 }).map((_, tick) => (
        <div
          key={tick}
          className="pointer-events-none absolute inset-0"
          style={{ transform: `rotate(${tick * 9}deg)` }}
        >
          <span
            className="absolute left-1/2 h-2 w-px -translate-x-1/2 bg-[#041007]/45"
            style={{ top: tickTop }}
          />
        </div>
      ))}
      <div
        ref={needleRef}
        className="pointer-events-none absolute inset-0 z-20"
        style={{ transform: 'rotate(0deg)', willChange: 'transform' }}
      >
        <div className="absolute left-1/2 top-[4px] flex -translate-x-1/2 flex-col items-center">
          <span className="h-0 w-0 border-x-[8px] border-t-[15px] border-x-transparent border-t-[#f6fffb] drop-shadow-[0_0_10px_rgba(255,255,255,.7)]" />
          <span className="h-2 w-[2px] rounded-full bg-[#f6fffb]/70" />
        </div>
      </div>
      <div
        className="absolute z-10 flex flex-col items-center justify-center overflow-hidden rounded-full text-center"
        style={{ inset: innerInset }}
      >
        <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-20" />
        {children || (
          <>
            <span className="relative text-[7px] font-black uppercase tracking-[0.18em] text-white/28">
              шанс
            </span>
            <span className="relative mt-1 font-display text-[34px] font-black leading-none tracking-[-0.07em] text-white">
              {Math.round(chance)}%
            </span>
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Contracts / craft                                                  */
/* ------------------------------------------------------------------ */

const CRAFT_MIN = 3
const CRAFT_MAX = 10

function CraftSection({ user, token, onUpdate, onToast }) {
  const inventory = user.inventory
  const [rarity, setRarity] = useState(null)
  const [selected, setSelected] = useState([])
  const [plan, setPlan] = useState(null)
  const [planError, setPlanError] = useState('')
  const [loading, setLoading] = useState(false)
  const [crafting, setCrafting] = useState(false)
  const [result, setResult] = useState(null)

  const groups = useMemo(() => {
    const map = {}
    for (const item of inventory) {
      if (item.rarity === 'Nameless') continue
      if (!map[item.rarity]) map[item.rarity] = []
      map[item.rarity].push(item)
    }
    return map
  }, [inventory])

  const rarities = useMemo(
    () => RARITY_ORDER.filter((name) => name !== 'Nameless' && (groups[name]?.length || 0) >= CRAFT_MIN),
    [groups],
  )
  const rarityKey = rarities.join('|')

  useEffect(() => {
    if (!rarities.length) {
      if (rarity) setRarity(null)
      return
    }
    if (!rarity || !rarities.includes(rarity)) setRarity(rarities.includes('Rare') ? 'Rare' : rarities[0])
  }, [rarityKey, rarity, rarities])

  const items = useMemo(
    () =>
      [...(groups[rarity] || [])].sort((a, b) => a.price - b.price),
    [groups, rarity],
  )

  useEffect(() => {
    setSelected([])
    setPlan(null)
    setPlanError('')
  }, [rarity])

  useEffect(() => {
    setSelected((previous) => {
      const next = previous.filter((id) => inventory.some((item) => item.instanceId === id))
      return next.length === previous.length ? previous : next
    })
  }, [inventory])

  const selectedItems = useMemo(
    () => selected.map((id) => inventory.find((item) => item.instanceId === id)).filter(Boolean),
    [selected, inventory],
  )
  const selectedValue = selectedItems.reduce((sum, item) => sum + item.price, 0)

  useEffect(() => {
    if (selected.length < CRAFT_MIN) {
      setPlan(null)
      setPlanError('')
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      apiRequest('/api/craft/preview', {
        method: 'POST',
        token,
        body: { instanceIds: selected },
      })
        .then((data) => {
          if (cancelled) return
          setPlan(data.plan)
          setPlanError('')
        })
        .catch((error) => {
          if (cancelled) return
          setPlan(null)
          setPlanError(error.message)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 240)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [selected, token])

  function toggleItem(item) {
    if (crafting) return
    setResult(null)
    setSelected((previous) => {
      if (previous.includes(item.instanceId)) {
        return previous.filter((id) => id !== item.instanceId)
      }
      if (previous.length >= CRAFT_MAX) {
        onToast(`Максимум ${CRAFT_MAX} предметов в контракте`, 'info')
        return previous
      }
      return [...previous, item.instanceId]
    })
  }

  async function craft() {
    if (crafting || loading || !plan || selected.length < CRAFT_MIN) return
    unlockAudio()
    setCrafting(true)
    try {
      const data = await apiRequest('/api/craft', {
        method: 'POST',
        token,
        body: { instanceIds: selected },
      })
      onUpdate(data)
      setResult(data.wonItem)
      setSelected([])
      setPlan(null)
      playCaseResult(data.wonItem.rarity)
      onToast(data.message, 'success')
    } catch (error) {
      onToast(error.message, 'error')
    } finally {
      setCrafting(false)
    }
  }

  const resultMeta = result ? RARITY[result.rarity] || RARITY.Common : null
  const ready = selected.length >= CRAFT_MIN && Boolean(plan)
  const returnRate = plan && plan.totalValue > 0 ? (plan.averageValue / plan.totalValue) * 100 : 0
  const nextRarity = plan?.nextRarity || (rarity ? RARITY_ORDER[RARITY_ORDER.indexOf(rarity) + 1] : null)

  return (
    <section id="craft" className="pt-10 sm:pt-14">
      <SectionHeading
        eyebrow="Contracts & crafting"
        title="Контракты и крафт"
        description="Объедини от 3 до 10 ненужных скинов одной редкости и получи предмет уровнем выше. Контракт окупается примерно в одном случае из трёх — чем выше стабильность, тем меньше разброс и потерь."
        action={
          <span className="chip !border-acid/15 !text-acid/65">
            <Icon name="sparkles" size={11} />
            {rareCountLabel(inventory)}
          </span>
        }
      />

      <div className="overflow-hidden rounded-[22px] border border-white/[0.075] bg-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          {rarities.length === 0 && (
            <span className="text-[10px] font-semibold text-white/32">
              Нужно хотя бы {CRAFT_MIN} скина одной редкости — открой кейсы или докупи в магазине.
            </span>
          )}
          {rarities.map((name) => {
            const meta = RARITY[name] || RARITY.Common
            const count = groups[name]?.length || 0
            const active = rarity === name
            return (
              <button
                key={name}
                type="button"
                onClick={() => setRarity(name)}
                className={cx(
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.06em] transition',
                  active ? 'text-[#041007]' : 'text-white/42 hover:text-white/80',
                )}
                style={{
                  borderColor: active ? meta.color : `${meta.color}24`,
                  backgroundColor: active ? meta.color : `${meta.color}08`,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: active ? '#041007' : meta.color }}
                />
                {name}
                <span className={cx('tabular-nums', active ? 'text-[#041007]/60' : 'text-white/28')}>{count}</span>
              </button>
            )
          })}
        </div>

        <div className="grid gap-0 lg:grid-cols-[1.15fr_1fr]">
          <div className="border-b border-white/[0.06] p-4 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30">
                Выбрано {selected.length} / {CRAFT_MAX}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold tabular-nums text-white/38">
                  {formatPrice(selectedValue)}
                </span>
                {selected.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelected([])
                      setResult(null)
                    }}
                    className="rounded-md border border-white/[0.08] px-1.5 py-1 text-[8px] font-bold text-white/38 transition hover:text-white"
                  >
                    Сброс
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full bg-acid/70 transition-all duration-300"
                style={{ width: `${Math.min(100, (selected.length / CRAFT_MAX) * 100)}%` }}
              />
            </div>

            {items.length === 0 ? (
              <div className="mt-4 flex min-h-[180px] flex-col items-center justify-center text-center">
                <Icon name="sparkles" size={26} className="text-white/12" />
                <div className="mt-2 text-[11px] font-bold text-white/38">Нет предметов этой редкости</div>
                <div className="mt-1 text-[9px] text-white/22">Выбери другую вкладку или открой кейс.</div>
              </div>
            ) : (
              <div className="no-scrollbar mt-3 grid max-h-[330px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 xl:grid-cols-5">
                {items.map((item) => {
                  const meta = RARITY[item.rarity] || RARITY.Common
                  const active = selected.includes(item.instanceId)
                  const blocked = !active && selected.length >= CRAFT_MAX
                  return (
                    <button
                      key={item.instanceId}
                      type="button"
                      onClick={() => toggleItem(item)}
                      disabled={blocked}
                      className={cx(
                        'group relative overflow-hidden rounded-xl border bg-black/25 text-left transition',
                        active ? 'ring-2 ring-acid/70' : 'hover:border-white/20',
                        blocked && 'opacity-35',
                      )}
                      style={{ borderColor: active ? '#35ff87' : `${meta.color}22` }}
                    >
                      <div className="relative h-[62px] w-full">
                        <SkinVisual skin={item} className="h-full w-full" showRarity={false} />
                        {active && (
                          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-acid text-[#041007]">
                            <Icon name="check" size={10} strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className="px-1.5 pb-1.5 pt-1">
                        <div className="truncate text-[7.5px] font-extrabold text-white/72">{item.name}</div>
                        <div
                          className="mt-0.5 text-[7px] font-black uppercase tracking-[0.06em] tabular-nums"
                          style={{ color: meta.color }}
                        >
                          {formatPrice(item.price)}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="relative p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30">
                Прогноз контракта
              </div>
              {nextRarity && (
                <span
                  className="rounded-md border px-2 py-1 text-[7.5px] font-black uppercase tracking-[0.08em]"
                  style={{
                    color: (RARITY[nextRarity] || RARITY.Common).color,
                    borderColor: `${(RARITY[nextRarity] || RARITY.Common).color}2e`,
                    backgroundColor: `${(RARITY[nextRarity] || RARITY.Common).color}0d`,
                  }}
                >
                  → {nextRarity}
                </span>
              )}
            </div>

            {selected.length < CRAFT_MIN && !result && (
              <div className="mt-4 flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] text-center">
                <Icon name="grid" size={26} className="text-white/12" />
                <div className="mt-2 text-[11px] font-bold text-white/38">Выбери минимум 3 предмета</div>
                <div className="mt-1 max-w-[220px] text-[9px] leading-relaxed text-white/22">
                  Шкала стабильности покажет возможный разброс стоимости будущего предмета.
                </div>
              </div>
            )}

            {selected.length >= CRAFT_MIN && !result && (
              <div className="mt-3 space-y-3">
                {planError && (
                  <div className="flex items-start gap-2 rounded-lg border border-[#ff7189]/20 bg-[#ff7189]/[0.05] px-2.5 py-2 text-[9px] font-semibold text-[#ff9aac]">
                    <Icon name="alert" size={11} className="mt-0.5 shrink-0" />
                    {planError}
                  </div>
                )}

                {loading && !plan && (
                  <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-white/28">
                    <span className="spin-ring h-6 w-6 rounded-full border-2 border-acid/20 border-t-acid" />
                    <span className="text-[9px] font-bold">Считаем контракт...</span>
                  </div>
                )}

                {plan && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
                        <div className="text-[7px] font-black uppercase tracking-[0.12em] text-white/24">Вложено</div>
                        <div className="mt-0.5 text-[12px] font-extrabold tabular-nums text-white/80">
                          {formatPrice(plan.totalValue)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
                        <div className="text-[7px] font-black uppercase tracking-[0.12em] text-white/24">
                          Средний возврат
                        </div>
                        <div className="mt-0.5 flex items-baseline gap-1.5">
                          <span className="text-[12px] font-extrabold tabular-nums text-white/80">
                            {formatPrice(plan.averageValue)}
                          </span>
                          <span
                            className={cx(
                              'text-[8px] font-bold tabular-nums',
                              returnRate >= 100
                                ? 'text-acid'
                                : returnRate >= 95
                                  ? 'text-[#ffd166]'
                                  : 'text-[#ff8ba0]',
                            )}
                          >
                            {returnRate > 0 ? `${Math.floor(returnRate * 10) / 10}%` : '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {plan.profitChance >= 99.5 && (
                      <div className="flex items-start gap-2 rounded-lg border border-acid/20 bg-acid/[0.05] px-2.5 py-2 text-[8px] font-semibold leading-relaxed text-acid/80">
                        <Icon name="info" size={11} className="mt-0.5 shrink-0" />
                        Вся следующая редкость дороже вложения — такой контракт окупается гарантированно.
                      </div>
                    )}

                    {plan.profitChance <= 0.5 && (
                      <div className="flex items-start gap-2 rounded-lg border border-[#ff7189]/20 bg-[#ff7189]/[0.05] px-2.5 py-2 text-[8px] font-semibold leading-relaxed text-[#ff9aac]">
                        <Icon name="alert" size={11} className="mt-0.5 shrink-0" />
                        Набор дороже всей следующей редкости — контракт не окупится. Лучше добавить предметы подешевле.
                      </div>
                    )}

                    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[7.5px] font-black uppercase tracking-[0.12em] text-white/28">
                          Стабильность
                        </span>
                        <span className="text-[10px] font-extrabold tabular-nums text-white/80">
                          {plan.stability}%
                        </span>
                      </div>
                      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-gradient-to-r from-[#ff7189]/30 via-[#ffd166]/25 to-acid/30">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#ff7189]/70 via-[#ffd166]/80 to-acid transition-all duration-500"
                          style={{ width: `${Math.max(4, plan.stability)}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[7px] font-bold text-white/22">
                        <span>риск</span>
                        <span>стабильно</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-black/25 px-2 py-1.5">
                        <span className="text-[7.5px] font-bold uppercase tracking-[0.08em] text-white/26">
                          Разброс
                        </span>
                        <span className="text-[9px] font-extrabold tabular-nums text-white/72">
                          {formatPrice(plan.minValue)} — {formatPrice(plan.maxValue)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 rounded-lg bg-black/25 px-2 py-1.5">
                        <span className="text-[7.5px] font-bold uppercase tracking-[0.08em] text-white/26">
                          Окупаемость
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cx(
                              'text-[9px] font-extrabold tabular-nums',
                              plan.profitChance > 0 ? 'text-acid' : 'text-[#ff8ba0]',
                            )}
                          >
                            {plan.profitChance.toFixed(0)}%
                          </span>
                          <span className="text-[7px] font-bold text-white/24">
                            {plan.profitChance > 0
                              ? `≈ 1 из ${Math.max(2, Math.round(100 / Math.max(plan.profitChance, 1)))}`
                              : 'только минус'}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-[7.5px] font-black uppercase tracking-[0.12em] text-white/26">
                          Возможные исходы
                        </span>
                        <span
                          className={cx(
                            'rounded-md border px-1.5 py-0.5 text-[6.5px] font-black uppercase tracking-[0.06em]',
                            plan.profitChance > 0
                              ? 'border-acid/25 bg-acid/[0.08] text-acid'
                              : 'border-[#ff7189]/25 bg-[#ff7189]/[0.06] text-[#ff9aac]',
                          )}
                        >
                          окуп {plan.profitChance.toFixed(0)}% · минус {(100 - plan.profitChance).toFixed(0)}%
                        </span>
                      </div>
                      <div className="space-y-1">
                        {plan.possible.map((row) => {
                          const meta = RARITY[row.skin.rarity] || RARITY.Common
                          const delta = Math.round((row.skin.price - plan.totalValue) * 100) / 100
                          const profit = delta >= 0
                          return (
                            <div
                              key={row.skin.id}
                              className={cx(
                                'flex items-center gap-2 rounded-lg border px-1.5 py-1',
                                profit
                                  ? 'border-acid/20 bg-acid/[0.03]'
                                  : 'border-white/[0.05] bg-white/[0.015]',
                              )}
                            >
                              <div className="h-7 w-11 shrink-0 overflow-hidden rounded border border-white/[0.06] bg-black/30">
                                <SkinVisual skin={row.skin} className="h-full w-full" showRarity={false} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[8px] font-bold text-white/68">{row.skin.name}</div>
                                <div className="flex items-center gap-1.5 text-[7px] font-bold tabular-nums">
                                  <span style={{ color: meta.color }}>{formatPrice(row.skin.price)}</span>
                                  <span className={profit ? 'text-acid' : 'text-[#ff8ba0]'}>
                                    {profit ? '+' : '−'}
                                    {formatPrice(Math.abs(delta))}
                                  </span>
                                </div>
                              </div>
                              <div className="w-10 shrink-0 text-right">
                                <div className="text-[8px] font-extrabold tabular-nums text-white/62">
                                  {row.chance.toFixed(1)}%
                                </div>
                                <div className="mt-0.5 h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${row.chance}%`, backgroundColor: meta.color }}
                                  />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={craft}
                      disabled={!ready || crafting}
                      className={cx(
                        'btn-acid h-10 w-full text-[10px] uppercase tracking-[0.1em]',
                        (!ready || crafting) && 'opacity-45',
                      )}
                    >
                      {crafting ? (
                        <>
                          <span className="spin-ring h-3.5 w-3.5 rounded-full border-2 border-[#041007]/25 border-t-[#041007]" />
                          Собираем...
                        </>
                      ) : (
                        <>
                          <Icon name="sparkles" size={14} />
                          Собрать контракт
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}

            {result && (
              <div
                className="pop-in mt-3 overflow-hidden rounded-2xl border bg-black/25"
                style={{ borderColor: `${resultMeta.color}35`, backgroundColor: `${resultMeta.color}08` }}
              >
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
                  <Icon name="check" size={12} className="text-acid" />
                  <span className="text-[8px] font-black uppercase tracking-[0.14em] text-acid/70">
                    Контракт выполнен
                  </span>
                </div>
                <div className="p-3">
                  <div className="relative h-[120px] w-full overflow-hidden rounded-xl border border-white/[0.06]">
                    <SkinVisual skin={result} className="h-full w-full" />
                  </div>
                  <div className="mt-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-extrabold text-white">{result.name}</div>
                      <div
                        className="mt-0.5 text-[8px] font-black uppercase tracking-[0.08em]"
                        style={{ color: resultMeta.color }}
                      >
                        {resultMeta.label} · {result.weapon}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[12px] font-extrabold tabular-nums text-acid">
                      {formatPrice(result.price)}
                    </div>
                  </div>
                  <div className="mt-2 text-[8px] font-semibold text-white/28">
                    Предмет уже в инвентаре — его можно продать или использовать в апгрейде.
                  </div>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="mt-2.5 w-full rounded-lg border border-white/[0.09] py-2 text-[9px] font-extrabold uppercase tracking-[0.08em] text-white/55 transition hover:border-acid/30 hover:text-acid"
                  >
                    Собрать ещё
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function rareCountLabel(inventory) {
  const total = inventory.filter((item) => item.rarity !== 'Nameless').length
  return `${total} ${plural(total, ['предмет', 'предмета', 'предметов'])} для крафта`
}

/* ------------------------------------------------------------------ */
/*  Case battle                                                        */
/* ------------------------------------------------------------------ */

const BATTLE_MODES = [
  { id: 'normal', label: 'Обычный', hint: 'Побеждает тот, у кого сумма скинов дороже.' },
  { id: 'underdog', label: 'Андердог', hint: 'Побеждает тот, у кого сумма скинов дешевле.' },
]

const BATTLE_REEL_LENGTH = 36
const BATTLE_WINNER_INDEX = 26

function makeBattleReel(caseData, winner, side, round) {
  const contents = caseData?.contents || []
  if (!contents.length) return []
  const reel = Array.from({ length: BATTLE_REEL_LENGTH }, (_, index) => {
    const skin = contents[(index * 7 + round * 5 + (side === 'opponent' ? 3 : 0)) % contents.length]
    return { ...skin, reelId: `battle-${side}-${round}-${index}` }
  })
  reel[BATTLE_WINNER_INDEX] = {
    ...(winner || contents[0]),
    reelId: `battle-${side}-${round}-winner`,
    winner: true,
  }
  return reel
}

function BattleSection({ cases, user, token, fast, onUpdate, onToast }) {
  const paidCases = useMemo(() => cases.filter((item) => item.price > 0), [cases])
  const [caseId, setCaseId] = useState(null)
  const [rounds, setRounds] = useState(3)
  const [mode, setMode] = useState('normal')
  const [opponentType, setOpponentType] = useState('player')
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [roundIndex, setRoundIndex] = useState(0)
  const [revealedRounds, setRevealedRounds] = useState(0)
  const [roundReels, setRoundReels] = useState(null)
  const [spinningRound, setSpinningRound] = useState(false)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')
  const playerViewportRef = useRef(null)
  const opponentViewportRef = useRef(null)
  const playerTrackRef = useRef(null)
  const opponentTrackRef = useRef(null)
  const stopSoundRef = useRef(null)
  const duration = fast ? 600 : 1550

  useEffect(() => {
    if (!paidCases.length) return
    if (!caseId || !paidCases.some((item) => item.id === caseId)) {
      const preferred = paidCases.find((item) => item.price === 19) || paidCases[0]
      setCaseId(preferred.id)
    }
  }, [paidCases, caseId])

  const caseData = paidCases.find((item) => item.id === caseId) || paidCases[0] || null
  const entry = caseData ? caseData.price * rounds : 0
  const canAfford = user.balance + 1e-9 >= entry
  const activeMode = BATTLE_MODES.find((item) => item.id === mode) || BATTLE_MODES[0]
  const duelLocked = running || Boolean(result && !finished)
  const playerDrops = (result?.playerSkins || []).slice(0, revealedRounds)
  const opponentDrops = (result?.opponentSkins || []).slice(0, revealedRounds)

  useLayoutEffect(() => {
    if (!spinningRound || !roundReels || !result) return undefined

    const tracks = []
    const sides = [
      { key: 'player', track: playerTrackRef.current, viewport: playerViewportRef.current },
      { key: 'opponent', track: opponentTrackRef.current, viewport: opponentViewportRef.current },
    ]

    for (const side of sides) {
      const { track, viewport } = side
      if (!track || !viewport) continue
      const reel = roundReels[side.key] || []
      const flaggedIndex = reel.findIndex((item) => item.winner)
      const target = track.children[flaggedIndex >= 0 ? flaggedIndex : BATTLE_WINNER_INDEX]
      if (!target) continue

      track.style.transition = 'none'
      track.style.transform = 'translate3d(0,0,0)'
      void track.offsetWidth

      const jitter = (Math.random() * 0.35 - 0.175) * target.offsetWidth
      const offset = Math.max(
        0,
        target.offsetLeft + target.offsetWidth / 2 + jitter - viewport.clientWidth / 2,
      )
      tracks.push({ track, offset })
    }

    const stopSound = startSpinSound(duration, 'case')
    stopSoundRef.current = stopSound

    const frame = requestAnimationFrame(() => {
      tracks.forEach(({ track, offset }) => {
        track.style.transition = `transform ${duration}ms ${REEL_EASING}`
        track.style.transform = `translate3d(${-offset}px,0,0)`
      })
    })

    const timer = setTimeout(() => {
      stopSound()
      if (stopSoundRef.current === stopSound) stopSoundRef.current = null
      setSpinningRound(false)
      const nextRevealed = roundIndex + 1
      setRevealedRounds(nextRevealed)
      const playerSkin = result.playerSkins[roundIndex]
      if (playerSkin) playCaseResult(playerSkin.rarity)
      if (nextRevealed >= result.rounds) {
        setFinished(true)
        playCaseResult(result.won ? 'Arcane' : 'Common')
        if (result.message) onToast(result.message, result.won ? 'success' : 'error')
      }
    }, duration + 120)

    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      stopSound()
      if (stopSoundRef.current === stopSound) stopSoundRef.current = null
    }
  }, [spinningRound, roundReels, result, roundIndex, duration, onToast])

  useEffect(() => {
    if (!result || finished || spinningRound) return undefined
    if (revealedRounds >= result.rounds) return undefined
    const timer = setTimeout(() => {
      const nextIndex = revealedRounds
      setRoundIndex(nextIndex)
      setRoundReels({
        player: makeBattleReel(caseData, result.playerSkins[nextIndex], 'player', nextIndex),
        opponent: makeBattleReel(caseData, result.opponentSkins[nextIndex], 'opponent', nextIndex),
      })
      setSpinningRound(true)
    }, 430)
    return () => clearTimeout(timer)
  }, [result, finished, spinningRound, revealedRounds, caseData])

  useEffect(
    () => () => {
      if (stopSoundRef.current) stopSoundRef.current()
    },
    [],
  )

  function changeCase(nextId) {
    if (duelLocked) return
    setCaseId(nextId)
    setResult(null)
    setFinished(false)
    setRoundReels(null)
    setRevealedRounds(0)
    setRoundIndex(0)
    setError('')
  }

  async function fight() {
    if (!caseData || duelLocked) return
    if (!canAfford) {
      onToast('Недостаточно голды для входа в битву', 'error')
      return
    }
    unlockAudio()
    setRunning(true)
    setError('')
    setResult(null)
    setFinished(false)
    setRoundReels(null)
    setRevealedRounds(0)
    setRoundIndex(0)
    setSpinningRound(false)
    try {
      const data = await apiRequest('/api/case-battle', {
        method: 'POST',
        token,
        body: { caseId: caseData.id, rounds, mode, opponent: opponentType },
      })
      onUpdate(data)
      setResult(data)
      setRoundReels({
        player: makeBattleReel(caseData, data.playerSkins?.[0], 'player', 0),
        opponent: makeBattleReel(caseData, data.opponentSkins?.[0], 'opponent', 0),
      })
      setSpinningRound(true)
    } catch (requestError) {
      setError(requestError.message)
      onToast(requestError.message, 'error')
      if (requestError.data?.user) onUpdate(requestError.data)
    } finally {
      setRunning(false)
    }
  }

  function resetBattle() {
    setResult(null)
    setFinished(false)
    setRoundReels(null)
    setRevealedRounds(0)
    setRoundIndex(0)
    setSpinningRound(false)
    setError('')
  }


  return (
    <section id="battle" className="pt-10 sm:pt-14">
      <SectionHeading
        eyebrow="Case battle"
        title="Битва кейсов"
        description="Дуэль 1 на 1: каждый раунд вскрывает по кейсу с обеих сторон. Победитель забирает весь дроп — свой и чужой. В режиме «Андердог» побеждает тот, у кого сумма дешевле."
        action={
          <span className="chip !border-[#ffd166]/20 !text-[#ffd166]/75">
            <Icon name="flame" size={11} />
            winner takes all
          </span>
        }
      />

      <div className="overflow-hidden rounded-[22px] border border-white/[0.075] bg-panel">
        <div className="grid gap-0 lg:grid-cols-[1fr_1.35fr]">
          <div className="border-b border-white/[0.06] p-4 lg:border-b-0 lg:border-r">
            <div className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30">Настройка дуэли</div>

            <div className="mt-3">
              <div className="mb-1.5 text-[7.5px] font-black uppercase tracking-[0.12em] text-white/24">Кейс</div>
              <div className="no-scrollbar grid max-h-[150px] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                {paidCases.map((item) => {
                  const active = item.id === caseData?.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={duelLocked}
                      onClick={() => changeCase(item.id)}
                      className={cx(
                        'rounded-lg border px-2 py-1.5 text-left transition disabled:opacity-50',
                        active ? 'border-acid/45 bg-acid/[0.08]' : 'border-white/[0.07] hover:border-white/[0.16]',
                      )}
                    >
                      <div className={cx('truncate text-[8.5px] font-extrabold', active ? 'text-acid' : 'text-white/65')}>
                        {item.name}
                      </div>
                      <div className="mt-0.5 text-[7.5px] font-bold tabular-nums text-white/28">
                        {formatPrice(item.price)}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1.5 text-[7.5px] font-black uppercase tracking-[0.12em] text-white/24">Раунды</div>
                <div className="flex gap-1.5">
                  {[1, 3, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={duelLocked}
                      onClick={() => {
                        setRounds(value)
                        setResult(null)
                      }}
                      className={cx(
                        'h-8 flex-1 rounded-lg border text-[10px] font-extrabold tabular-nums transition disabled:opacity-50',
                        rounds === value
                          ? 'border-acid/40 bg-acid/[0.1] text-acid'
                          : 'border-white/[0.07] text-white/42 hover:text-white',
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[7.5px] font-black uppercase tracking-[0.12em] text-white/24">Соперник</div>
                <div className="flex gap-1.5">
                  {[
                    { id: 'player', label: 'Игрок' },
                    { id: 'bot', label: 'Бот' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={duelLocked}
                      onClick={() => {
                        setOpponentType(option.id)
                        setResult(null)
                      }}
                      className={cx(
                        'h-8 flex-1 rounded-lg border text-[9px] font-extrabold transition disabled:opacity-50',
                        opponentType === option.id
                          ? 'border-acid/40 bg-acid/[0.1] text-acid'
                          : 'border-white/[0.07] text-white/42 hover:text-white',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1.5 text-[7.5px] font-black uppercase tracking-[0.12em] text-white/24">Режим</div>
              <div className="grid grid-cols-2 gap-1.5">
                {BATTLE_MODES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={duelLocked}
                    onClick={() => {
                      setMode(option.id)
                      setResult(null)
                    }}
                    className={cx(
                      'flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[9px] font-extrabold transition disabled:opacity-50',
                      mode === option.id
                        ? 'border-[#ffd166]/40 bg-[#ffd166]/[0.09] text-[#ffd166]'
                        : 'border-white/[0.07] text-white/42 hover:text-white',
                    )}
                  >
                    <Icon name={option.id === 'underdog' ? 'trending' : 'flame'} size={11} />
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 text-[8px] font-semibold text-white/26">{activeMode.hint}</div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.07] bg-black/25 px-3 py-2">
              <div>
                <div className="text-[7px] font-black uppercase tracking-[0.12em] text-white/24">Вход</div>
                <div className="mt-0.5 text-[12px] font-extrabold tabular-nums text-white/85">
                  {formatPrice(entry)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[7px] font-black uppercase tracking-[0.12em] text-white/24">Банк</div>
                <div className="mt-0.5 text-[12px] font-extrabold tabular-nums text-acid">
                  {formatPrice(entry * 2)}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={fight}
              disabled={duelLocked || !caseData || !canAfford}
              className={cx(
                'btn-acid mt-2.5 h-10 w-full text-[10px] uppercase tracking-[0.1em]',
                (duelLocked || !canAfford) && 'opacity-45',
              )}
            >
              {running ? (
                <>
                  <span className="spin-ring h-3.5 w-3.5 rounded-full border-2 border-[#041007]/25 border-t-[#041007]" />
                  Ищем соперника...
                </>
              ) : result && !finished ? (
                <>
                  <span className="spin-ring h-3.5 w-3.5 rounded-full border-2 border-[#041007]/25 border-t-[#041007]" />
                  Идёт битва...
                </>
              ) : (
                <>
                  <Icon name="play" size={13} />
                  {canAfford ? 'В бой' : 'Недостаточно голды'}
                </>
              )}
            </button>

            {error && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-[#ff7189]/20 bg-[#ff7189]/[0.05] px-2.5 py-2 text-[9px] font-semibold text-[#ff9aac]">
                <Icon name="alert" size={11} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
          </div>

          <div className="relative p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30">Арена</div>
              {result && (
                <span className="rounded-md border border-white/[0.08] px-2 py-1 text-[7px] font-black uppercase tracking-[0.1em] text-white/40">
                  {result.mode === 'underdog' ? 'Андердог' : 'Обычный'} · {result.rounds}{' '}
                  {plural(result.rounds, ['раунд', 'раунда', 'раундов'])}
                </span>
              )}
            </div>

            {!result && (
              <div className="mt-4 flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#ffd166]/20 bg-[#ffd166]/[0.06] text-[#ffd166]">
                  <Icon name="flame" size={22} />
                </span>
                <div className="mt-3 text-[11px] font-bold text-white/42">Дуэль ещё не началась</div>
                <div className="mt-1 max-w-[250px] text-[9px] leading-relaxed text-white/24">
                  Выбери кейс и режим, затем нажми «В бой». Победитель забирает весь дроп обеих сторон.
                </div>
              </div>
            )}

            {result && (
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      key: 'player',
                      name: user.username,
                      tag: 'Ты',
                      tone: '#35ff87',
                      reel: roundReels?.player || [],
                      drops: playerDrops,
                      total: result.playerTotal,
                      viewportRef: playerViewportRef,
                      trackRef: playerTrackRef,
                    },
                    {
                      key: 'opponent',
                      name: result.opponent.name,
                      tag: result.opponent.label,
                      tone: '#8adfff',
                      reel: roundReels?.opponent || [],
                      drops: opponentDrops,
                      total: result.opponentTotal,
                      viewportRef: opponentViewportRef,
                      trackRef: opponentTrackRef,
                    },
                  ].map((side) => (
                    <div
                      key={side.key}
                      className="min-w-0 rounded-xl border border-white/[0.07] bg-black/20 p-2"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-[9px] font-extrabold" style={{ color: side.tone }}>
                          {side.name}
                        </span>
                        <span className="shrink-0 rounded bg-white/[0.05] px-1 py-0.5 text-[6.5px] font-black uppercase tracking-[0.06em] text-white/35">
                          {side.tag}
                        </span>
                      </div>

                      <div
                        className="relative mt-2 h-[92px] overflow-hidden rounded-lg border border-white/[0.06] bg-[#060c08]"
                        ref={side.viewportRef}
                      >
                        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2 bg-acid/70 shadow-[0_0_10px_rgba(53,255,135,.65)]" />
                        <div className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-acid" />
                        <div className="pointer-events-none absolute bottom-0 left-1/2 z-30 -translate-x-1/2 border-x-[5px] border-b-[6px] border-x-transparent border-b-acid" />
                        <div className="roulette-mask h-full">
                          <div
                            ref={side.trackRef}
                            className={cx(
                              'flex h-full items-center gap-1.5 px-2',
                              spinningRound && 'will-change-transform',
                            )}
                          >
                            {side.reel.map((skin) => {
                              const meta = RARITY[skin.rarity] || RARITY.Common
                              const showWinner = skin.winner && !spinningRound
                              return (
                                <div
                                  key={skin.reelId}
                                  className={cx(
                                    'relative h-[76px] w-[62px] shrink-0 overflow-hidden rounded-lg border bg-[#0b120d]',
                                    showWinner
                                      ? 'result-glow border-acid/60'
                                      : 'border-white/[0.07]',
                                  )}
                                  style={!showWinner ? { borderColor: `${meta.color}20` } : undefined}
                                >
                                  <SkinVisual
                                    skin={skin}
                                    className="h-full w-full"
                                    showRarity={false}
                                    artClassName="w-[124%]"
                                  />
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#050906] via-[#050906]/85 to-transparent px-1 pb-0.5 pt-3 text-center text-[6.5px] font-extrabold tabular-nums text-acid">
                                    {formatPrice(skin.price)}
                                  </div>
                                  {showWinner && (
                                    <span className="absolute inset-x-0 top-0 bg-acid py-0.5 text-center text-[6px] font-black uppercase tracking-[0.08em] text-[#041007]">
                                      дроп
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                            {!side.reel.length && (
                              <div className="flex h-full w-full items-center justify-center text-[8px] font-semibold text-white/20">
                                Ожидание раунда…
                              </div>
                            )}
                          </div>
                        </div>
                        {spinningRound && (
                          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(53,255,135,.05),transparent)]" />
                        )}
                      </div>

                      <div className="mt-2 space-y-1">
                        {side.drops.map((skin, index) => {
                          const meta = RARITY[skin.rarity] || RARITY.Common
                          return (
                            <div
                              key={`${side.key}-drop-${skin.id}-${index}`}
                              className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5"
                            >
                              <SkinVisual
                                skin={skin}
                                className="h-9 w-12 shrink-0 rounded-md"
                                showRarity={false}
                                artClassName="w-[124%]"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[7.5px] font-bold text-white/70">
                                  {skin.name}
                                </div>
                                <div
                                  className="text-[6.5px] font-black uppercase tracking-[0.08em]"
                                  style={{ color: meta.color }}
                                >
                                  {meta.label}
                                </div>
                              </div>
                              <span className="shrink-0 text-[7.5px] font-extrabold tabular-nums text-acid">
                                {formatPrice(skin.price)}
                              </span>
                            </div>
                          )
                        })}
                        {!side.drops.length && (
                          <div className="rounded-lg border border-dashed border-white/[0.06] px-2 py-2 text-center text-[7px] font-semibold text-white/20">
                            Дроп появится после первого раунда
                          </div>
                        )}
                      </div>

                      <div className="mt-1.5 flex items-center justify-between border-t border-white/[0.06] pt-1.5">
                        <span className="text-[6.5px] font-black uppercase tracking-[0.08em] text-white/24">
                          Сумма
                        </span>
                        <span
                          className="text-[10px] font-extrabold tabular-nums"
                          style={{ color: side.tone }}
                        >
                          {finished
                            ? formatPrice(side.total)
                            : `${formatPrice(
                                side.drops.reduce((sum, skin) => sum + skin.price, 0),
                              )}…`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className="mt-2.5 rounded-xl border px-3 py-2.5"
                  style={{
                    borderColor: finished
                      ? result.won
                        ? 'rgba(53,255,135,.28)'
                        : 'rgba(255,113,137,.22)'
                      : 'rgba(255,255,255,.07)',
                    backgroundColor: finished
                      ? result.won
                        ? 'rgba(53,255,135,.055)'
                        : 'rgba(255,113,137,.045)'
                      : 'rgba(255,255,255,.02)',
                  }}
                >
                  {finished ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div
                          className={cx(
                            'font-display text-[15px] font-black tracking-[-0.02em]',
                            result.won ? 'text-acid' : 'text-[#ff9aac]',
                          )}
                        >
                          {result.won ? 'Победа — дроп твой' : 'Поражение'}
                        </div>
                        <div className="mt-0.5 text-[8px] font-semibold text-white/32">
                          {result.won
                            ? result.mode === 'underdog'
                              ? 'Твоя сумма оказалась дешевле — андердог сработал.'
                              : 'Твоя сумма оказалась дороже.'
                            : result.mode === 'underdog'
                              ? 'У соперника сумма дешевле — дроп уходит ему.'
                              : 'У соперника сумма дороже — дроп уходит ему.'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[7px] font-black uppercase tracking-[0.12em] text-white/24">Выплата</div>
                        <div
                          className={cx(
                            'text-[13px] font-extrabold tabular-nums',
                            result.won ? 'text-acid' : 'text-white/45',
                          )}
                        >
                          {formatPrice(result.payout)}
                        </div>
                        <div className="text-[7.5px] font-bold tabular-nums text-white/28">
                          вход {formatPrice(result.entry)} · {result.net >= 0 ? '+' : ''}
                          {formatPrice(result.net)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[9px] font-bold text-white/42">
                        <span className="spin-ring h-3.5 w-3.5 rounded-full border-2 border-acid/20 border-t-acid" />
                        {spinningRound
                          ? `Крутим раунд ${roundIndex + 1} из ${result.rounds}`
                          : `Раунд ${Math.min(revealedRounds + 1, result.rounds)} из ${result.rounds}`}
                      </div>
                      <span className="text-[8px] font-bold tabular-nums text-white/26">
                        {formatPrice(result.payout)} в банке
                      </span>
                    </div>
                  )}
                </div>

                {finished && (
                  <button
                    type="button"
                    onClick={resetBattle}
                    className="mt-2 w-full rounded-lg border border-white/[0.09] py-2 text-[9px] font-extrabold uppercase tracking-[0.08em] text-white/55 transition hover:border-acid/30 hover:text-acid"
                  >
                    Ещё дуэль
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Upgrade                                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Winter event & promo codes                                        */
/* ------------------------------------------------------------------ */

function WinterSnow() {
  const flakes = useMemo(
    () =>
      Array.from({ length: 46 }, (_, index) => ({
        id: index,
        left: (index * 37 + 11) % 100,
        size: 2 + ((index * 7) % 5),
        delay: -((index * 0.83) % 14),
        duration: 9 + (index % 7) * 2.1,
        opacity: 0.2 + (index % 5) * 0.13,
        drift: index % 2 === 0 ? 28 : -24,
      })),
    [],
  )

  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden" aria-hidden="true">
      {flakes.map((flake) => (
        <span
          key={flake.id}
          className="snowflake"
          style={{
            left: `${flake.left}%`,
            width: `${flake.size}px`,
            height: `${flake.size}px`,
            opacity: flake.opacity,
            animationDelay: `${flake.delay}s`,
            animationDuration: `${flake.duration}s`,
            '--snow-drift': `${flake.drift}px`,
          }}
        />
      ))}
    </div>
  )
}

function isWinterSeason(date = new Date()) {
  const month = date.getMonth()
  const day = date.getDate()
  return month === 10 || month === 11 || (month === 0 && day <= 15)
}

function WinterEventBar({ event, onNavigate }) {
  if (!event?.active) return null
  const endsAt = new Date(event.endsAt)
  return (
    <div className="winter-bar relative z-30 border-b border-[#9fdcff]/20">
      <div className="mx-auto flex max-w-[1540px] flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6 xl:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[#bfe9ff]/30 bg-[#bfe9ff]/10 text-[#d8f4ff]">
            <Icon name="snowflake" size={13} />
          </span>
          <span className="truncate text-[9px] font-black uppercase tracking-[0.16em] text-[#e4f7ff]">
            {event.name}
          </span>
          <span className="hidden truncate text-[9px] font-semibold text-[#bfe9ff]/65 sm:inline">
            +{event.depositBonusPercent}% к пополнению · снежная коллекция в кейсах
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#bfe9ff]/55">
            до {endsAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
          </span>
          <button
            type="button"
            onClick={() => onNavigate('promos')}
            className="rounded-lg border border-[#bfe9ff]/25 bg-[#bfe9ff]/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-[#e4f7ff] transition hover:bg-[#bfe9ff]/20"
          >
            Зимние промо
          </button>
        </div>
      </div>
    </div>
  )
}

function PromoSection({ promos, user, token, event, onUpdate, onToast, onNavigate }) {
  const [code, setCode] = useState('')
  const [activating, setActivating] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [promoType, setPromoType] = useState('gold')
  const [amount, setAmount] = useState('250')
  const [percent, setPercent] = useState('10')
  const [maxUses, setMaxUses] = useState('100')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const list = promos?.list || []
  const unseen = Number(promos?.unseenCount) || 0

  async function activate(event_) {
    event_?.preventDefault?.()
    if (activating) return
    const value = code.trim()
    if (!value) return
    setActivating(true)
    setError('')
    try {
      const data = await apiRequest('/api/promos/activate', {
        method: 'POST',
        token,
        body: { code: value },
      })
      onUpdate(data)
      onUpdate({ promos: data.promos })
      onToast(data.message, 'success', 'Промокод активирован')
      playCoin()
      setCode('')
    } catch (requestError) {
      setError(requestError.message)
      onToast(requestError.message, 'error')
      if (requestError.data?.user) onUpdate(requestError.data)
    } finally {
      setActivating(false)
    }
  }

  async function createPromo(event_) {
    event_?.preventDefault?.()
    if (creating) return
    setCreating(true)
    setError('')
    try {
      const data = await apiRequest('/api/promos', {
        method: 'POST',
        token,
        body: {
          code: newCode.trim() || undefined,
          type: promoType,
          amount: Number(amount) || 0,
          percent: Number(percent) || 0,
          maxUses: Number(maxUses) || 0,
        },
      })
      onUpdate({ promos: data.promos })
      onToast(data.message, 'success', 'Промокод создан')
      setNewCode('')
    } catch (requestError) {
      setError(requestError.message)
      onToast(requestError.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  async function copyCode(value) {
    try {
      await navigator.clipboard.writeText(value)
      onToast(`Промокод ${value} скопирован`, 'info', 'Скопировано')
    } catch {
      onToast(value, 'info', 'Промокод')
    }
  }

  return (
    <section id="promos" className="pt-10 sm:pt-14">
      <SectionHeading
        eyebrow="PROMO CODES"
        title="Промокоды и зимний ивент"
        description="Активируй промокод и забери голду или процент к следующему пополнению. Когда владелец добавляет новый код, у вкладки «Промокоды» загорается восклицательный знак."
      />

      {unseen > 0 && (
        <div className="fade-up mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ffcf4d]/30 bg-[#ffcf4d]/[0.08] px-3 py-2.5">
          <span className="flex items-center gap-2 text-[10px] font-bold text-[#ffe6a3]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ffcf4d] text-[11px] font-black text-[#241a00]">
              !
            </span>
            Новые промокоды: {unseen}. Проверь список ниже.
          </span>
          <button
            type="button"
            onClick={() => onUpdate({ promos: { ...promos, unseenCount: 0 } })}
            className="rounded-lg border border-[#ffcf4d]/30 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-[#ffe6a3] transition hover:bg-[#ffcf4d]/15"
          >
            Понятно
          </button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.05fr_.95fr]">
        <div className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(155deg,#0e1714,#090d0b)] p-4 sm:p-5">
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#7bdcff]/10 blur-3xl" />
          <div className="relative flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-acid/20 bg-acid/[0.08] text-acid">
              <Icon name="ticket" size={15} />
            </span>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70">Активация</div>
              <div className="text-[8px] font-semibold text-white/30">
                Один промокод — один раз на аккаунт · голда или % к пополнению
              </div>
            </div>
          </div>

          <form onSubmit={activate} className="relative mt-3 flex gap-2">
            <input
              value={code}
              onChange={(event_) => setCode(event_.target.value.toUpperCase())}
              placeholder="WINTER2026"
              maxLength={24}
              className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.09] bg-black/30 px-3 text-[12px] font-bold uppercase tracking-[0.08em] text-white placeholder:text-white/22 focus:border-acid/45 focus:outline-none"
            />
            <button
              type="submit"
              disabled={activating || !code.trim()}
              className="btn-acid h-11 shrink-0 px-4 text-[10px] uppercase tracking-[0.08em] disabled:opacity-40"
            >
              {activating ? <span className="spin-ring h-4 w-4 rounded-full border-2 border-[#041007]/30 border-t-[#041007]" /> : 'Активировать'}
            </button>
          </form>

          {error && <div className="mt-2 text-[9px] font-semibold text-[#ff8b9e]">{error}</div>}

          {event?.active && (
            <div className="relative mt-4 flex items-center gap-3 rounded-xl border border-[#9fdcff]/20 bg-[#9fdcff]/[0.06] p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#bfe9ff]/12 text-[#d8f4ff]">
                <Icon name="snowflake" size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-[9px] font-black uppercase tracking-[0.12em] text-[#e4f7ff]">
                  {event.name} · +{event.depositBonusPercent}% к пополнению
                </div>
                <div className="mt-0.5 text-[8px] font-semibold text-[#bfe9ff]/55">
                  Бонус начисляется автоматически при донате. До{' '}
                  {new Date(event.endsAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.
                </div>
              </div>
            </div>
          )}

          {Number(user?.depositBoost?.percent) > 0 && (
            <div className="relative mt-3 flex items-center gap-3 rounded-xl border border-[#ffcf4d]/25 bg-[#ffcf4d]/[0.07] p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ffcf4d]/12 text-[#ffe6a3]">
                <Icon name="ticket" size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-[9px] font-black uppercase tracking-[0.12em] text-[#ffe6a3]">
                  Активен +{user.depositBoost.percent}% к следующему пополнению
                </div>
                <div className="mt-0.5 text-[8px] font-semibold text-[#ffcf4d]/55">
                  Промокод {user.depositBoost.code} · сгорит после первого пополнения
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(155deg,#14110b,#0a0d09)] p-4 sm:p-5">
          <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-[#ffcf4d]/10 blur-3xl" />
          <div className="relative flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70">
                {promos?.canCreate
                  ? 'Создание промокода'
                  : promos?.canRequest
                    ? 'Промокод через заявку'
                    : 'Активные промокоды'}
              </div>
              <div className="text-[8px] font-semibold text-white/30">
                {promos?.canCreate
                  ? 'Доступно только владельцу проекта'
                  : promos?.canRequest
                    ? 'Админ отправляет заявку, владелец одобряет'
                    : 'Коды можно активировать в поле слева'}
              </div>
            </div>
            <Icon name="crown" size={18} className="text-[#ffcf4d]/60" />
          </div>

          {promos?.canCreate && (
            <form onSubmit={createPromo} className="relative mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-1">
                {[
                  ['gold', 'Голда'],
                  ['deposit_percent', '% к пополнению'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPromoType(value)}
                    className={cx(
                      'rounded-lg px-2 py-1.5 text-[8px] font-black uppercase tracking-[0.08em] transition',
                      promoType === value
                        ? 'bg-[#ffcf4d] text-[#241a00]'
                        : 'text-white/35 hover:bg-white/[0.05] hover:text-white/65',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[7px] font-black uppercase tracking-[0.12em] text-white/28">Код (пусто = авто)</span>
                  <input
                    value={newCode}
                    onChange={(event_) => setNewCode(event_.target.value.toUpperCase())}
                    placeholder={promoType === 'deposit_percent' ? 'BOOST10' : 'WINTER2026'}
                    maxLength={24}
                    className="h-9 w-full rounded-lg border border-white/[0.09] bg-black/30 px-2.5 text-[10px] font-bold uppercase tracking-[0.06em] text-white placeholder:text-white/20 focus:border-[#ffcf4d]/40 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[7px] font-black uppercase tracking-[0.12em] text-white/28">
                    {promoType === 'deposit_percent' ? 'Процент, %' : 'Награда, G'}
                  </span>
                  <input
                    value={promoType === 'deposit_percent' ? percent : amount}
                    onChange={(event_) => {
                      const value = event_.target.value.replace(/[^0-9]/g, '').slice(0, promoType === 'deposit_percent' ? 3 : 7)
                      if (promoType === 'deposit_percent') setPercent(value)
                      else setAmount(value)
                    }}
                    inputMode="numeric"
                    placeholder={promoType === 'deposit_percent' ? '10' : '250'}
                    className="h-9 w-full rounded-lg border border-white/[0.09] bg-black/30 px-2.5 text-[10px] font-bold tabular-nums text-white placeholder:text-white/20 focus:border-[#ffcf4d]/40 focus:outline-none"
                  />
                </label>
              </div>
              <div className="flex items-end gap-2">
                <label className="block w-28">
                  <span className="mb-1 block text-[7px] font-black uppercase tracking-[0.12em] text-white/28">Активаций</span>
                  <input
                    value={maxUses}
                    onChange={(event_) => setMaxUses(event_.target.value.replace(/[^0-9]/g, ''))}
                    inputMode="numeric"
                    className="h-9 w-full rounded-lg border border-white/[0.09] bg-black/30 px-2.5 text-[10px] font-bold tabular-nums text-white focus:border-[#ffcf4d]/40 focus:outline-none"
                  />
                </label>
                <button
                  type="submit"
                  disabled={creating}
                  className="h-9 flex-1 rounded-lg border border-[#ffcf4d]/35 bg-[#ffcf4d]/12 text-[9px] font-black uppercase tracking-[0.08em] text-[#ffe6a3] transition hover:bg-[#ffcf4d]/20 disabled:opacity-40"
                >
                  {creating ? 'Создаём...' : 'Создать промокод'}
                </button>
              </div>
            </form>
          )}

          {promos?.canRequest && (
            <div className="relative mt-3 rounded-xl border border-[#ffcf4d]/18 bg-[#ffcf4d]/[0.05] p-3">
              <div className="text-[9px] font-bold leading-relaxed text-[#ffe6a3]/85">
                Админ не создаёт промокоды напрямую. Отправь заявку — владелец одобрит, и код появится
                в списке.
              </div>
              <button
                type="button"
                onClick={() => onNavigate?.('requests')}
                className="mt-2 w-full rounded-lg border border-[#ffcf4d]/35 bg-[#ffcf4d]/12 px-3 py-2 text-[8px] font-black uppercase tracking-[0.1em] text-[#ffe6a3] transition hover:bg-[#ffcf4d]/20"
              >
                Перейти к заявке
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.018]">
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/35">
            Все промокоды · {list.length}
          </span>
          <span className="text-[8px] font-semibold text-white/22">Нажми на код, чтобы скопировать</span>
        </div>
        {list.length ? (
          <div className="divide-y divide-white/[0.05]">
            {list.map((promo) => (
              <div key={promo.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => copyCode(promo.code)}
                  className="rounded-md border border-white/[0.1] bg-black/25 px-2 py-1 font-mono text-[10px] font-bold tracking-[0.08em] text-white/80 transition hover:border-acid/30 hover:text-acid"
                  title="Скопировать промокод"
                >
                  {promo.code}
                </button>
                {promo.type === 'deposit_percent' ? (
                  <span className="rounded-md border border-[#9fdcff]/25 bg-[#9fdcff]/[0.07] px-2 py-1 text-[9px] font-extrabold tabular-nums text-[#cbefff]">
                    +{promo.percent}% к пополнению
                  </span>
                ) : (
                  <span className="rounded-md border border-acid/20 bg-acid/[0.06] px-2 py-1 text-[9px] font-extrabold tabular-nums text-acid">
                    +{formatPrice(promo.amount)}
                  </span>
                )}
                <span className="text-[8px] font-semibold text-white/28">
                  осталось {promo.remaining} из {promo.maxUses}
                  {promo.createdBy ? ` · ${promo.createdBy === 'system' || promo.createdBy === 'winter-event' ? 'система' : promo.createdBy}` : ''}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  {promo.activated && (
                    <span className="rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em] text-white/45">
                      активирован
                    </span>
                  )}
                  {!promo.activated && !promo.exhausted && (
                    <span className="rounded-md border border-acid/25 bg-acid/[0.07] px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em] text-acid">
                      доступен
                    </span>
                  )}
                  {promo.exhausted && (
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em] text-white/30">
                      закончился
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-[10px] font-semibold text-white/30">
            Промокодов пока нет. Владелец проекта может создать первый.
          </div>
        )}
      </div>
    </section>
  )
}

function UpgradeSection({ user, catalog, token, fast, onToggleFast, onUpdate, onToast }) {
  const inventory = user.inventory
  const [baseIds, setBaseIds] = useState(() => (inventory[0] ? [inventory[0].instanceId] : []))
  const [targetId, setTargetId] = useState(null)
  const [upgrading, setUpgrading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [boost, setBoost] = useState(0)
  const [customChance, setCustomChance] = useState('')
  const [targetQuery, setTargetQuery] = useState('')
  const [targetSort, setTargetSort] = useState('asc')
  const [targetMinPrice, setTargetMinPrice] = useState('')
  const [targetMaxPrice, setTargetMaxPrice] = useState('')
  const [targetLimit, setTargetLimit] = useState(120)
  const [shopOpen, setShopOpen] = useState(true)
  const [spin, setSpin] = useState(null)
  const needleRef = useRef(null)
  const duration = fast ? ANIM_MS_FAST : ANIM_MS_NORMAL

  const baseItems = useMemo(
    () =>
      baseIds
        .map((instanceId) => inventory.find((item) => item.instanceId === instanceId))
        .filter(Boolean),
    [inventory, baseIds],
  )
  const baseTotal = useMemo(
    () => Math.round(baseItems.reduce((sum, item) => sum + item.price, 0) * 100) / 100,
    [baseItems],
  )
  const base = baseItems[0] || null
  const higherTargets = useMemo(
    () => (baseItems.length ? catalog.filter((skin) => skin.price > baseTotal) : []),
    [baseItems, baseTotal, catalog],
  )
  const filteredTargets = useMemo(() => {
    const normalized = targetQuery.trim().toLowerCase()
    const min = targetMinPrice ? Number(targetMinPrice) : 0
    const max = targetMaxPrice ? Number(targetMaxPrice) : Infinity
    return higherTargets
      .filter((skin) => skin.price >= min && skin.price <= max)
      .filter(
        (skin) =>
          !normalized ||
          skin.name.toLowerCase().includes(normalized) ||
          String(skin.weapon || '').toLowerCase().includes(normalized),
      )
      .sort((a, b) => (targetSort === 'asc' ? a.price - b.price : b.price - a.price))
  }, [higherTargets, targetQuery, targetSort, targetMinPrice, targetMaxPrice])
  const visibleTargets = filteredTargets.slice(0, targetLimit)

  useEffect(() => {
    setTargetLimit(120)
  }, [targetQuery, targetSort, targetMinPrice, targetMaxPrice, baseTotal, baseIds.length])

  const target = useMemo(
    () => higherTargets.find((skin) => skin.id === targetId) || null,
    [higherTargets, targetId],
  )
  const maxBoost =
    baseItems.length && target
      ? Math.max(0, Math.round((target.price * UPGRADE_EDGE - baseTotal) * 100) / 100)
      : 0
  const boostCap = Math.min(maxBoost, Math.max(0, user.balance))
  const chance =
    baseItems.length && target
      ? Math.min(
          90,
          Math.max(1, Math.round(((baseTotal + boost) / target.price) * 90 * 100) / 100),
        )
      : 0
  const naturalChance =
    baseItems.length && target
      ? Math.min(90, Math.max(1, Math.round((baseTotal / target.price) * 90 * 100) / 100))
      : 0
  const profit =
    baseItems.length && target ? Math.round((target.price - baseTotal - boost) * 100) / 100 : 0
  const multiplier =
    baseItems.length && target ? target.price / (baseTotal + boost) : 0
  const resultBaseSkins = result?.baseSkins || (result?.baseSkin ? [result.baseSkin] : [])
  const resultBaseTotal =
    result?.baseTotal ?? Math.round(resultBaseSkins.reduce((sum, skin) => sum + skin.price, 0) * 100) / 100

  useEffect(() => {
    setBaseIds((previous) => {
      const valid = previous
        .filter((instanceId) => inventory.some((item) => item.instanceId === instanceId))
        .slice(0, UPGRADE_MAX_ITEMS)
      if (!valid.length && inventory[0]) return [inventory[0].instanceId]
      if (
        valid.length === previous.length &&
        valid.every((instanceId, index) => instanceId === previous[index])
      ) {
        return previous
      }
      return valid
    })
  }, [inventory])

  useEffect(() => {
    if (!baseItems.length) {
      if (targetId) setTargetId(null)
      return
    }
    if (!higherTargets.some((skin) => skin.id === targetId)) {
      setTargetId(higherTargets[0]?.id || null)
    }
  }, [baseItems.length, higherTargets, targetId])

  useLayoutEffect(() => {
    if (!spin) return undefined
    const needle = needleRef.current
    if (!needle) return undefined
    needle.style.transition = 'none'
    needle.style.transform = 'rotate(0deg)'
    void needle.offsetWidth
    const stopSound = startSpinSound(duration, 'upgrade')
    const frame = requestAnimationFrame(() => {
      needle.style.transition = `transform ${duration}ms ${REEL_EASING}`
      needle.style.transform = `rotate(${spin.angle}deg)`
    })
    const timer = setTimeout(() => {
      stopSound()
      onUpdate(spin.data)
      setResult(spin.data)
      setUpgrading(false)
      playUpgradeResult(spin.data.won)
      onToast(
        spin.data.message || (spin.data.won ? `Апгрейд успешен: ${spin.data.targetSkin.name}` : 'Апгрейд не удался'),
        spin.data.won ? 'success' : 'error',
      )
    }, duration + 120)
    return () => {
      stopSound()
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [spin, duration, onUpdate, onToast])

  function resetWheel() {
    setSpin(null)
    if (needleRef.current) {
      needleRef.current.style.transition = 'none'
      needleRef.current.style.transform = 'rotate(0deg)'
    }
  }

  function chooseBase(item) {
    if (upgrading) return
    const selected = baseIds.includes(item.instanceId)
    if (!selected && baseIds.length >= UPGRADE_MAX_ITEMS) {
      onToast(`В одном апгрейде можно использовать до ${UPGRADE_MAX_ITEMS} предметов`, 'error')
      return
    }
    setBaseIds(
      selected
        ? baseIds.filter((instanceId) => instanceId !== item.instanceId)
        : [...baseIds, item.instanceId],
    )
    setTargetId(null)
    setBoost(0)
    setCustomChance('')
    setTargetQuery('')
    setTargetLimit(120)
    setResult(null)
    setError('')
    resetWheel()
  }

  function handleShopBought(item) {
    if (!item?.instanceId) return
    if (baseIds.includes(item.instanceId)) return
    if (baseIds.length >= UPGRADE_MAX_ITEMS) {
      onToast(`Куплено. В апгрейде уже максимум — ${UPGRADE_MAX_ITEMS} предметов`, 'info')
      return
    }
    setBaseIds((previous) => [...previous, item.instanceId])
    setTargetId(null)
    setBoost(0)
    setCustomChance('')
    setResult(null)
    setError('')
    resetWheel()
  }

  function chooseTarget(skin) {
    if (upgrading) return
    setTargetId(skin.id)
    setBoost(0)
    setCustomChance('')
    setResult(null)
    setError('')
    resetWheel()
  }

  function quickPick(chancePercent) {
    if (!baseItems.length) return
    const ideal = baseTotal * (90 / chancePercent)
    if (!higherTargets.length) return
    const best = higherTargets.reduce((closest, skin) => {
      const currentDistance = Math.abs(skin.price - ideal)
      const bestDistance = Math.abs(closest.price - ideal)
      return currentDistance < bestDistance ? skin : closest
    }, higherTargets[0])
    setBoost(0)
    setCustomChance(String(chancePercent))
    chooseTarget(best)
  }

  function applyCustomChance(value) {
    if (!baseItems.length || !higherTargets.length) return
    const percent = Math.min(90, Math.max(1, Number(value) || 1))
    // Ищем цель, для которой нужна минимальная доплата, и добиваем шанс балансом.
    const options = higherTargets
      .map((skin) => ({
        skin,
        need: Math.round((skin.price * (percent / 90) - baseTotal) * 100) / 100,
      }))
      .filter((option) => option.need >= -0.01)
      .sort((a, b) => a.need - b.need)
    const option = options[0]
    if (!option) {
      setError('Для такого шанса нужна цель подороже')
      return
    }
    setTargetId(option.skin.id)
    const needed = Math.max(0, option.need)
    const affordable = Math.min(
      needed,
      Math.max(0, user.balance),
      Math.max(0, option.skin.price * UPGRADE_EDGE - baseTotal),
    )
    setBoost(Math.round(affordable * 100) / 100)
    setCustomChance(String(percent))
    setError(needed > user.balance ? 'Недостаточно баланса для точного шанса — доплата ограничена' : '')
    setResult(null)
    resetWheel()
  }

  function updateBoost(value) {
    const numeric = Math.max(0, Number(value) || 0)
    setBoost(Math.min(boostCap, Math.round(numeric * 100) / 100))
    setCustomChance('')
  }

  async function runUpgrade() {
    if (!baseItems.length || !target || upgrading) return
    unlockAudio()
    setUpgrading(true)
    setError('')
    setResult(null)
    try {
      const data = await apiRequest('/api/upgrade', {
        method: 'POST',
        token,
        body: { instanceIds: baseIds, targetSkinId: target.id, boost },
      })
      const serverChance = Math.max(0, Math.min(100, Number(data.chance) || 0))
      const winDeg = serverChance * 3.6
      const won = Boolean(data.won)
      const sectorSize = won ? winDeg : 360 - winDeg
      const landing = (won ? 0 : winDeg) + sectorSize * (0.18 + Math.random() * 0.64)
      setSpin({ angle: 360 * (fast ? 2 : 6) + landing, data })
    } catch (requestError) {
      setError(requestError.message)
      setUpgrading(false)
      onToast(requestError.message, 'error')
      if (requestError.data?.user) onUpdate(requestError.data)
    }
  }

  return (
    <section id="upgrade" className="pt-5 sm:pt-7">
      <div className="relative overflow-hidden rounded-[26px] border border-acid/[0.14] bg-[linear-gradient(160deg,#0e1b12_0%,#0a120d_48%,#080d09_100%)] shadow-[0_40px_130px_-40px_rgba(0,0,0,.9)] sm:rounded-[30px]">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-30" />
        <div className="pointer-events-none absolute -left-24 -top-28 h-80 w-80 rounded-full bg-acid/[0.13] blur-[110px]" />
        <div className="pointer-events-none absolute -right-24 top-8 h-72 w-72 rounded-full bg-lime/[0.075] blur-[110px]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-acid/60 to-transparent" />

        <div className="relative flex flex-col gap-5 px-4 pt-5 sm:px-6 sm:pt-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-acid" />
              <span className="text-[9px] font-black uppercase tracking-[0.24em] text-acid/80">
                Stand Grade · Upgrade Arena
              </span>
              <span className="rounded-full border border-lime/20 bg-lime/[0.07] px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.14em] text-lime">
                дом-эдж 10%
              </span>
            </div>
            <h2 className="mt-2.5 font-display text-[30px] font-black leading-[0.95] tracking-[-0.055em] text-white sm:text-[46px]">
              АПГРЕЙД <span className="text-gradient">СКИНОВ</span>
            </h2>
            <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-white/40 sm:text-[12px]">
              Главная арена STAND GRADE: объединяй до {UPGRADE_MAX_ITEMS} скинов и меняй их на более
              дорогой предмет, запускай колесо шанса и забирай профит. Расчёт фиксируется на сервере и не
              подменяется клиентом.
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2 lg:w-[360px]">
            <button
              type="button"
              role="switch"
              aria-checked={fast}
              onClick={onToggleFast}
              className={cx(
                'flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition',
                fast
                  ? 'border-acid/35 bg-acid/[0.08]'
                  : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.16]',
              )}
            >
              <span className="min-w-0">
                <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-white/70">
                  Быстрые анимации
                </span>
                <span className="mt-0.5 block text-[8px] font-semibold text-white/28">
                  {fast ? 'Включены · ~0.5 сек' : 'Выключены · 3.5 сек'}
                </span>
              </span>
              <span
                className={cx(
                  'relative h-5 w-9 shrink-0 rounded-full border transition',
                  fast ? 'border-acid/40 bg-acid/30' : 'border-white/12 bg-white/[0.07]',
                )}
              >
                <span
                  className={cx(
                    'absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all',
                    fast ? 'left-[18px] bg-acid' : 'left-[2px] bg-white/40',
                  )}
                />
              </span>
            </button>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-2.5">
                <div className="text-[7px] font-black uppercase tracking-[0.14em] text-white/28">Цели</div>
                <div className="mt-1 font-display text-[16px] font-black tabular-nums tracking-[-0.04em] text-white">
                  {higherTargets.length}
                </div>
              </div>
              <div className="rounded-xl border border-acid/[0.16] bg-acid/[0.055] px-2.5 py-2.5">
                <div className="text-[7px] font-black uppercase tracking-[0.14em] text-acid/55">Профит</div>
                <div className="mt-1 font-display text-[16px] font-black tabular-nums tracking-[-0.04em] text-acid">
                  {profit > 0 ? `+${formatPrice(profit)}` : '—'}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-2.5">
                <div className="text-[7px] font-black uppercase tracking-[0.14em] text-white/28">Множитель</div>
                <div className="mt-1 font-display text-[16px] font-black tabular-nums tracking-[-0.04em] text-lime">
                  {multiplier > 1 ? `×${multiplier.toFixed(multiplier >= 10 ? 0 : 1)}` : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid gap-x-6 gap-y-5 border-t border-white/[0.06] px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6 lg:grid-cols-[1.12fr_.88fr]">
          <div className="relative min-w-0 lg:border-r lg:border-white/[0.06] lg:pr-6">
            <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-acid/[0.045] blur-3xl" />

            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md border border-acid/20 bg-acid/[0.07] text-[9px] font-black text-acid">
                    1
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-[0.17em] text-white/40">
                    Ваши скины
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShopOpen((open) => !open)}
                    className={cx(
                      'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[8px] font-black uppercase tracking-[0.05em] transition',
                      shopOpen
                        ? 'border-acid/35 bg-acid/10 text-acid'
                        : 'border-white/[0.09] bg-white/[0.03] text-white/45 hover:border-acid/30 hover:text-acid',
                    )}
                  >
                    <Icon name="bag" size={12} />
                    {shopOpen ? 'Скрыть магазин' : 'Магазин'}
                  </button>
                  <span className="text-[9px] font-semibold text-white/24">
                    {baseIds.length}/{UPGRADE_MAX_ITEMS} выбрано · {inventory.length} в инвентаре
                  </span>
                </div>
              </div>

              {inventory.length ? (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
                  {inventory.map((item) => {
                    const meta = RARITY[item.rarity] || RARITY.Common
                    const selected = baseIds.includes(item.instanceId)
                    const selectedIndex = baseIds.indexOf(item.instanceId)
                    return (
                      <button
                        key={item.instanceId}
                        type="button"
                        onClick={() => chooseBase(item)}
                        disabled={upgrading}
                        className={cx(
                          'relative w-full overflow-hidden rounded-xl border text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                          selected
                            ? 'border-acid/55 bg-acid/[0.07] shadow-[0_0_26px_rgba(53,255,135,.14)]'
                            : 'border-white/[0.07] bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.04]',
                        )}
                      >
                        <SkinVisual skin={item} className="h-16 w-full sm:h-[74px]" showRarity={false} />
                        <div className="p-2">
                          <div className="truncate text-[8px] font-bold text-white/72">{item.name}</div>
                          <div className="mt-1 flex items-center justify-between gap-1">
                            <span
                              className="truncate text-[6.5px] font-black uppercase tracking-[0.06em]"
                              style={{ color: meta.color }}
                            >
                              {meta.label}
                            </span>
                            <span className="shrink-0 text-[8px] font-extrabold tabular-nums text-white/34">
                              {formatPrice(item.price)}
                            </span>
                          </div>
                        </div>
                        {selected && (
                          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-acid text-[9px] font-black text-[#041007]">
                            {selectedIndex + 1}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-3 flex flex-col items-start gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4">
                  <div className="text-[11px] font-bold text-white/50">Инвентарь пуст</div>
                  <div className="text-[10px] leading-relaxed text-white/28">
                    Для апгрейда нужен хотя бы один скин. Открой кейс или купи его в магазине.
                  </div>
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() => document.getElementById('cases')?.scrollIntoView({ behavior: 'smooth' })}
                      className="btn-ghost !py-2 !text-[10px]"
                    >
                      К кейсам
                    </button>
                    <button
                      type="button"
                      onClick={() => document.getElementById('store-promo')?.scrollIntoView({ behavior: 'smooth' })}
                      className="btn-ghost !border-acid/15 !py-2 !text-[10px] !text-acid"
                    >
                      В магазин
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 items-stretch gap-2 sm:mt-5 sm:gap-3 md:grid-cols-[minmax(0,1fr)_260px_minmax(0,1fr)] md:items-center md:gap-4">
                <div className="min-w-0 md:col-start-1 md:row-start-1">
                  <div className="mb-1.5 flex items-center justify-between gap-1">
                    <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/28">
                      Отдаёте · {baseItems.length}/{UPGRADE_MAX_ITEMS}
                    </span>
                    {base && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: RARITY[base.rarity].color }}
                      />
                    )}
                  </div>
                  {baseItems.length === 1 ? (
                    <div
                      className="relative overflow-hidden rounded-xl border bg-black/25 sm:rounded-2xl"
                      style={{ borderColor: `${RARITY[base.rarity].color}38` }}
                    >
                      <SkinVisual skin={base} className="h-24 w-full sm:h-32" showRarity={false} />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#040804] via-[#040804]/80 to-transparent p-2 pt-7 sm:p-2.5 sm:pt-8">
                        <div className="truncate text-[10px] font-extrabold text-white sm:text-[11px]">{base.name}</div>
                        <div className="mt-0.5 flex items-center justify-between gap-1">
                          <span className="text-[9px] font-bold tabular-nums text-white/42">{formatPrice(baseTotal)}</span>
                          <span
                            className="hidden truncate text-[6.5px] font-black uppercase tracking-[0.08em] sm:block"
                            style={{ color: RARITY[base.rarity].color }}
                          >
                            {RARITY[base.rarity].label}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : baseItems.length > 1 ? (
                    <div className="relative overflow-hidden rounded-xl border border-acid/25 bg-black/25 sm:rounded-2xl">
                      <div className="grid grid-cols-2 gap-1 p-1.5">
                        {baseItems.slice(0, 4).map((item) => (
                          <div
                            key={item.instanceId}
                            className="relative h-[44px] overflow-hidden rounded-lg border border-white/[0.06] sm:h-[54px]"
                          >
                            <SkinVisual skin={item} className="h-full w-full" showRarity={false} />
                          </div>
                        ))}
                      </div>
                      {baseItems.length > 4 && (
                        <span className="absolute right-2 top-2 rounded-full bg-acid px-1.5 py-0.5 text-[8px] font-black text-[#041007]">
                          +{baseItems.length - 4}
                        </span>
                      )}
                      <div className="flex items-center justify-between gap-1 border-t border-white/[0.07] px-2 py-1.5">
                        <span className="text-[9px] font-extrabold text-white/70">
                          {baseItems.length} {plural(baseItems.length, ['предмет', 'предмета', 'предметов'])}
                        </span>
                        <span className="text-[9px] font-black tabular-nums text-acid">{formatPrice(baseTotal)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-[142px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-2 text-center sm:h-[168px] sm:rounded-2xl">
                      <Icon name="box" size={18} className="text-white/15" />
                      <span className="text-[9px] leading-tight text-white/25">
                        Выберите до {UPGRADE_MAX_ITEMS} предметов
                      </span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 md:col-start-3 md:row-start-1">
                  <div className="mb-1.5 flex items-center justify-between gap-1">
                    <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/28">Получаете</span>
                    {target && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: RARITY[target.rarity].color }} />}
                  </div>
                  {target ? (
                    <div
                      className="relative overflow-hidden rounded-xl border bg-black/25 sm:rounded-2xl"
                      style={{ borderColor: `${RARITY[target.rarity].color}45` }}
                    >
                      <SkinVisual skin={target} className="h-24 w-full sm:h-32" showRarity={false} />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#040804] via-[#040804]/80 to-transparent p-2 pt-7 sm:p-2.5 sm:pt-8">
                        <div className="truncate text-[10px] font-extrabold text-white sm:text-[11px]">{target.name}</div>
                        <div className="mt-0.5 flex items-center justify-between gap-1">
                          <span className="text-[9px] font-bold tabular-nums text-white/42">{formatPrice(target.price)}</span>
                          <span
                            className="hidden truncate text-[6.5px] font-black uppercase tracking-[0.08em] sm:block"
                            style={{ color: RARITY[target.rarity].color }}
                          >
                            {RARITY[target.rarity].label}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-[142px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-2 text-center sm:h-[168px] sm:rounded-2xl">
                      <Icon name="crown" size={18} className="text-white/15" />
                      <span className="text-[9px] leading-tight text-white/25">Выберите цель дороже</span>
                    </div>
                  )}
                </div>

                <div className="col-span-2 flex flex-col items-center gap-2 md:col-span-1 md:col-start-2 md:row-start-1">
                  <div className="relative h-[252px] w-[252px] max-w-full sm:h-[260px] sm:w-[260px]">
                    <div className="pointer-events-none absolute -inset-4 rounded-full bg-acid/[0.06] blur-2xl" />
                    <div className="absolute inset-0 rounded-full border border-white/[0.07] bg-[#060b07] shadow-[inset_0_0_50px_rgba(0,0,0,.85)]" />
                    <div
                      className="absolute inset-[8px] rounded-full"
                      style={{
                        background: chance
                          ? `conic-gradient(#35ff87 0deg ${chance * 3.6}deg, rgba(255,93,122,.24) ${chance * 3.6}deg 360deg)`
                          : 'conic-gradient(rgba(255,255,255,.07) 0deg 360deg)',
                        filter: chance ? 'drop-shadow(0 0 16px rgba(53,255,135,.16))' : 'none',
                      }}
                    />
                    <div className="pointer-events-none absolute inset-[44px] rounded-full border border-white/[0.08] bg-[#080f0a] shadow-[inset_0_0_42px_rgba(0,0,0,.8)]" />

                    {Array.from({ length: 40 }).map((_, tick) => (
                      <div
                        key={tick}
                        className="pointer-events-none absolute inset-0"
                        style={{ transform: `rotate(${tick * 9}deg)` }}
                      >
                        <span className="absolute left-1/2 top-[10px] h-2 w-px -translate-x-1/2 bg-[#041007]/45" />
                      </div>
                    ))}

                    <div
                      ref={needleRef}
                      className="pointer-events-none absolute inset-0 z-20"
                      style={{ transform: 'rotate(0deg)', willChange: 'transform' }}
                    >
                      <div className="absolute left-1/2 top-[3px] flex -translate-x-1/2 flex-col items-center">
                        <span className="h-0 w-0 border-x-[8px] border-t-[15px] border-x-transparent border-t-[#f6fffb] drop-shadow-[0_0_10px_rgba(255,255,255,.7)]" />
                        <span className="h-2 w-[2px] rounded-full bg-[#f6fffb]/70" />
                      </div>
                    </div>

                    <div className="absolute inset-[44px] z-10 flex flex-col items-center justify-center overflow-hidden rounded-full text-center">
                      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-20" />
                      {upgrading ? (
                        <>
                          <span className="spin-ring relative h-8 w-8 rounded-full border-2 border-acid/15 border-t-acid" />
                          <span className="relative mt-2 text-[8px] font-black uppercase tracking-[0.18em] text-acid/75">
                            Крутим
                          </span>
                          <span className="relative mt-0.5 text-[6.5px] font-bold uppercase tracking-[0.1em] text-white/22">
                            шанс решает сервер
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="relative text-[7px] font-black uppercase tracking-[0.2em] text-white/28">
                            шанс успеха
                          </span>
                          <span className="relative mt-1 font-display text-[36px] font-black leading-none tracking-[-0.07em] text-white sm:text-[42px]">
                            {chance ? `${chance.toFixed(chance >= 10 ? 0 : 1)}%` : '—'}
                          </span>
                          {baseItems.length && target ? (
                            <span className="relative mt-1.5 flex items-center gap-1 rounded-full border border-acid/15 bg-acid/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-acid/80">
                              <Icon name="trending" size={9} />
                              {profit > 0 ? `+${formatPrice(profit)}` : 'профит'}
                            </span>
                          ) : (
                            <span className="relative mt-1 text-[7px] font-bold uppercase tracking-[0.08em] text-white/24">
                              выберите скин и цель
                            </span>
                          )}
                          {multiplier > 1 && (
                            <span className="relative mt-1 text-[7px] font-black uppercase tracking-[0.12em] text-lime/60">
                              множитель ×{multiplier.toFixed(multiplier >= 10 ? 0 : 1)}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {result && (
                      <div
                        className={cx(
                          'pop-in pointer-events-none absolute inset-0 z-30 rounded-full border-2',
                          result.won ? 'border-acid/45' : 'border-[#ff5d7a]/45',
                        )}
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[7px] font-black uppercase tracking-[0.1em]">
                    {chance ? (
                      <>
                        <span className="flex items-center gap-1 text-acid/80">
                          <span className="h-1.5 w-1.5 rounded-full bg-acid" />
                          успех {chance.toFixed(chance >= 10 ? 0 : 1)}%
                        </span>
                        <span className="flex items-center gap-1 text-[#ff8b9e]/70">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#ff5d7a]" />
                          провал {(100 - chance).toFixed(chance >= 10 ? 0 : 1)}%
                        </span>
                      </>
                    ) : (
                      <span className="flex items-center gap-1 text-white/25">
                        <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                        колесо шанса
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={runUpgrade}
                    disabled={!baseItems.length || !target || upgrading}
                    className="btn-acid group mt-2 w-full !px-2 !py-3.5 !text-[11px] uppercase tracking-[0.08em] disabled:shadow-none"
                  >
                    {upgrading ? (
                      <>
                        <span className="spin-ring h-4 w-4 rounded-full border-2 border-[#041007]/30 border-t-[#041007]" />
                        Крутим колесо...
                      </>
                    ) : (
                      <>
                        <Icon name="refresh" size={15} strokeWidth={2.6} />
                        {target
                          ? `Апгрейд за ${baseItems.length ? formatPrice(baseTotal + boost) : ''}`
                          : 'Выберите цель'}
                        {target && (
                          <span className="text-[9px] font-black text-[#041007]/55">
                            {chance.toFixed(chance >= 10 ? 0 : 1)}%
                          </span>
                        )}
                      </>
                    )}
                  </button>
                  <div className="mt-1 flex items-center justify-center gap-1.5 text-center text-[7.5px] font-semibold text-white/22">
                    <Icon name="alert" size={9} className="text-white/18" />
                    При провале предметы сгорают
                  </div>
                  {error && (
                    <div className="mt-1 text-center text-[9px] font-semibold text-[#ff8b9e]">
                      {error}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 sm:mt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[8px] font-black uppercase tracking-[0.15em] text-white/30">
                    Быстрый подбор шанса
                  </span>
                  <span className="flex items-center gap-1 text-[8px] font-semibold text-white/20">
                    <Icon name="shield" size={10} className="text-acid/40" />
                    шанс всегда считает сервер
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {[10, 25, 50, 75].map((preset) => {
                    const active = Math.abs(chance - preset) <= 2
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => quickPick(preset)}
                        disabled={!baseItems.length || !higherTargets.length || upgrading}
                        className={cx(
                          'group rounded-lg border px-2 py-2 text-[9px] font-extrabold transition disabled:cursor-not-allowed disabled:opacity-25',
                          active
                            ? 'border-acid/40 bg-acid/[0.1] text-acid'
                            : 'border-white/[0.08] bg-white/[0.03] text-white/45 hover:border-acid/30 hover:bg-acid/[0.06] hover:text-acid',
                        )}
                      >
                        ≈ {preset}%
                      </button>
                    )
                  })}
                </div>

                <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/38">
                      Тонкая настройка шанса
                    </span>
                    <span className="text-[8px] font-semibold text-white/24">
                      базовый {naturalChance ? `${naturalChance.toFixed(naturalChance >= 10 ? 0 : 1)}%` : '—'}
                    </span>
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[7px] font-black uppercase tracking-[0.12em] text-white/26">
                        Желаемый шанс, %
                      </span>
                      <span className="flex gap-1.5">
                        <input
                          value={customChance}
                          onChange={(event_) => setCustomChance(event_.target.value.replace(/[^0-9.]/g, ''))}
                          onKeyDown={(event_) => {
                            if (event_.key === 'Enter') {
                              event_.preventDefault()
                              applyCustomChance(customChance)
                            }
                          }}
                          inputMode="decimal"
                          placeholder="37"
                          disabled={!baseItems.length || !higherTargets.length || upgrading}
                          className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-black/30 px-2.5 text-[10px] font-bold tabular-nums text-white placeholder:text-white/20 focus:border-acid/40 focus:outline-none disabled:opacity-40"
                        />
                        <button
                          type="button"
                          onClick={() => applyCustomChance(customChance)}
                          disabled={!baseItems.length || !higherTargets.length || upgrading}
                          className="shrink-0 rounded-lg border border-acid/25 bg-acid/[0.08] px-2.5 text-[8px] font-black uppercase tracking-[0.06em] text-acid transition hover:bg-acid/[0.14] disabled:opacity-30"
                        >
                          Задать
                        </button>
                      </span>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[7px] font-black uppercase tracking-[0.12em] text-white/26">
                        Доплата из баланса, G
                      </span>
                      <span className="flex gap-1.5">
                        <input
                          value={boost || ''}
                          onChange={(event_) => updateBoost(event_.target.value.replace(/[^0-9.]/g, ''))}
                          onBlur={() => setBoost((value) => Math.min(boostCap, Math.max(0, Math.round(value * 100) / 100)))}
                          inputMode="decimal"
                          placeholder="0"
                          disabled={!baseItems.length || !target || upgrading || boostCap <= 0}
                          className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-black/30 px-2.5 text-[10px] font-bold tabular-nums text-white placeholder:text-white/20 focus:border-acid/40 focus:outline-none disabled:opacity-40"
                        />
                        <button
                          type="button"
                          onClick={() => setBoost(boostCap)}
                          disabled={!baseItems.length || !target || upgrading || boostCap <= 0}
                          className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2 text-[8px] font-black uppercase tracking-[0.06em] text-white/55 transition hover:border-acid/30 hover:text-acid disabled:opacity-30"
                        >
                          Макс
                        </button>
                      </span>
                    </label>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 rounded-lg bg-black/25 px-2 py-1.5 text-[8px] font-semibold">
                    <span className="text-white/30">
                      Итоговый шанс:{' '}
                      <span className="font-black tabular-nums text-acid">{chance ? `${chance.toFixed(chance >= 10 ? 0 : 1)}%` : '—'}</span>
                    </span>
                    <span className="text-white/30">
                      Вход:{' '}
                      <span className="font-black tabular-nums text-white/70">
                        {baseItems.length ? formatPrice(baseTotal + boost) : '—'}
                      </span>
                      {boost > 0 ? ` (скин + ${formatPrice(boost)})` : ''}
                    </span>
                  </div>
                  <div className="mt-1 text-[7px] font-semibold text-white/20">
                    Доплата списывается при запуске и повышает шанс тем сильнее, чем дешевле цель относительно скина.
                  </div>
                </div>
              </div>

              </div>
            </div>

          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md border border-acid/20 bg-acid/[0.07] text-[9px] font-black text-acid">
                  2
                </span>
                <span className="text-[9px] font-black uppercase tracking-[0.17em] text-white/40">
                  Цель апгрейда
                </span>
              </div>
              <span className="text-[9px] font-semibold text-white/24">
                {higherTargets.length
                  ? filteredTargets.length === higherTargets.length
                    ? `${higherTargets.length} доступно`
                    : `${filteredTargets.length} из ${higherTargets.length}`
                  : 'нет целей'}
              </span>
            </div>

            <div className="relative mt-2.5">
              <Icon
                name="search"
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/24"
              />
              <input
                value={targetQuery}
                onChange={(event) => setTargetQuery(event.target.value)}
                placeholder="Найти цель по названию или оружию..."
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-black/25 pl-8 pr-3 text-[9px] font-semibold text-white placeholder:text-white/20 transition focus:border-acid/40 focus:outline-none"
              />
            </div>

            <PriceSortControls
              sort={targetSort}
              onSortChange={setTargetSort}
              minPrice={targetMinPrice}
              maxPrice={targetMaxPrice}
              onMinPriceChange={setTargetMinPrice}
              onMaxPriceChange={setTargetMaxPrice}
              className="mt-2"
            />

            {higherTargets.length ? (
              <div className="no-scrollbar mt-3 grid max-h-[480px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
                {visibleTargets.map((skin) => {
                  const meta = RARITY[skin.rarity] || RARITY.Common
                  const selected = targetId === skin.id
                  const targetChance = baseItems.length
                    ? Math.min(
                        90,
                        Math.max(
                          1,
                          Math.round(
                            ((baseTotal + (selected ? boost : 0)) / skin.price) * 90 * 100,
                          ) / 100,
                        ),
                      )
                    : 0
                  return (
                    <button
                      key={skin.id}
                      type="button"
                      onClick={() => chooseTarget(skin)}
                      disabled={upgrading}
                      className={cx(
                        'group relative overflow-hidden rounded-xl border text-left transition duration-200 disabled:cursor-not-allowed disabled:opacity-60',
                        selected
                          ? 'border-acid/50 bg-acid/[0.06] shadow-[0_0_28px_rgba(53,255,135,.1)]'
                          : 'border-white/[0.07] bg-white/[0.022] hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-white/[0.04]',
                      )}
                    >
                      <SkinVisual skin={skin} className="h-[64px] w-full sm:h-[72px]" showRarity={false} />
                      <span
                        className="absolute right-1.5 top-1.5 rounded-md border px-1.5 py-0.5 text-[7px] font-black tabular-nums backdrop-blur"
                        style={{
                          color: meta.color,
                          borderColor: `${meta.color}33`,
                          backgroundColor: 'rgba(4,8,5,.62)',
                        }}
                      >
                        {targetChance.toFixed(targetChance >= 10 ? 0 : 1)}%
                      </span>
                      <div className="p-2">
                        <div className="truncate text-[9px] font-extrabold text-white/85">{skin.name}</div>
                        <div className="mt-1 flex items-center justify-between gap-1">
                          <span className="truncate text-[8px] font-bold tabular-nums text-white/34">
                            {formatPrice(skin.price)}
                          </span>
                          <span
                            className="hidden truncate text-[6.5px] font-black uppercase tracking-[0.06em] sm:block"
                            style={{ color: meta.color }}
                          >
                            {meta.label}
                          </span>
                        </div>
                      </div>
                      {selected && (
                        <span className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-acid text-[#041007]">
                          <Icon name="check" size={10} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  )
                })}
                {!visibleTargets.length && (
                  <div className="col-span-full rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-[9px] font-semibold text-white/30">
                    Ничего не найдено. Измените запрос.
                  </div>
                )}
                {filteredTargets.length > targetLimit && (
                  <button
                    type="button"
                    onClick={() => setTargetLimit((value) => value + 120)}
                    className="col-span-full flex items-center justify-center gap-2 rounded-xl border border-acid/25 bg-acid/[0.07] px-4 py-2.5 text-[8px] font-black uppercase tracking-[0.08em] text-acid transition hover:bg-acid/[0.14]"
                  >
                    <Icon name="plus" size={12} />
                    Показать ещё 120 целей
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-3 flex h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-white/25">
                  <Icon name="crown" size={24} />
                </div>
                <div className="mt-3 text-[11px] font-bold text-white/45">
                  {baseItems.length ? 'Это максимальный скин' : 'Сначала выберите исходные скины'}
                </div>
                <div className="mt-1.5 max-w-[210px] text-[9px] leading-relaxed text-white/24">
                  {baseItems.length
                    ? 'Для апгрейда нужна цель дороже. Выберите предметы подешевле.'
                    : 'Цели появятся после выбора предметов из инвентаря.'}
                </div>
              </div>
            )}

            {result && (
              <div
                className={cx(
                  'pop-in mt-4 overflow-hidden rounded-xl border',
                  result.won
                    ? 'border-acid/30 bg-acid/[0.06]'
                    : 'border-[#ff6d85]/20 bg-[#ff5d7a]/[0.055]',
                )}
              >
                <div className="flex items-center gap-2.5 p-3">
                  <span
                    className={cx(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      result.won ? 'bg-acid text-[#041007]' : 'bg-[#ff5d7a]/15 text-[#ff8b9e]',
                    )}
                  >
                    <Icon name={result.won ? 'check' : 'x'} size={17} strokeWidth={3} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cx(
                        'text-[10px] font-black uppercase tracking-[0.1em]',
                        result.won ? 'text-acid' : 'text-[#ff8b9e]',
                      )}
                    >
                      {result.won ? 'Апгрейд успешен' : 'Апгрейд не удался'}
                    </div>
                    <div className="mt-0.5 truncate text-[9px] text-white/38">
                      {result.won
                        ? result.targetSkin.name
                        : resultBaseSkins.length > 1
                          ? `${resultBaseSkins.length} ${plural(resultBaseSkins.length, ['предмет', 'предмета', 'предметов'])} сгорели`
                          : `${result.baseSkin?.name || 'Предмет'} сгорел`}{' '}
                      · шанс {result.chance.toFixed(2)}%
                      {result.boost > 0 ? ` · доплата ${formatPrice(result.boost)}` : ''}
                    </div>
                  </div>
                  <span
                    className={cx(
                      'shrink-0 rounded-md border px-2 py-1 text-[9px] font-black tabular-nums',
                      result.won
                        ? 'border-acid/25 bg-acid/[0.08] text-acid'
                        : 'border-[#ff5d7a]/20 bg-[#ff5d7a]/[0.07] text-[#ff8b9e]',
                    )}
                  >
                    {result.won
                      ? `+${formatPrice(result.targetSkin.price - resultBaseTotal - (result.boost || 0))}`
                      : `−${formatPrice(resultBaseTotal + (result.boost || 0))}`}
                  </span>
                </div>
                {!result.won && result.compensation > 0 && (
                  <div className="flex items-center justify-between gap-2 border-t border-[#ff6d85]/15 px-3 py-2">
                    <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-[#ffb3c0]/70">
                      Компенсация 5–10% от сгоревших предметов
                    </span>
                    <span className="text-[9px] font-black tabular-nums text-acid">
                      +{formatPrice(result.compensation)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[8px] leading-relaxed text-white/27">
              <Icon name="shield" size={12} className="mt-0.5 shrink-0 text-acid/40" />
              <span>
                Можно объединить до 7 предметов. При успехе они заменяются целью, при неудаче сгорают, но
                5–10% их суммарной стоимости возвращается на баланс. Доплата списывается в любом случае.
                Итоговый шанс и результат генерируются на бэкенде STAND GRADE.
              </span>
            </div>
          </div>
        </div>
      </div>

      {shopOpen && (
        <UpgradeShop
          catalog={catalog}
          balance={user.balance}
          token={token}
          onUpdate={onUpdate}
          onToast={onToast}
          onBought={handleShopBought}
          onClose={() => setShopOpen(false)}
        />
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Inventory                                                          */
/* ------------------------------------------------------------------ */

const INVENTORY_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'epic', label: 'Epic+' },
  { id: 'high', label: '100+ G' },
  { id: 'knives', label: 'Ножи' },
]

function InventorySection({ user, onSell, onSellMany, onWithdraw }) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('desc')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sellingId, setSellingId] = useState(null)
  const [sellingAll, setSellingAll] = useState(false)
  const [confirmSellAll, setConfirmSellAll] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])

  const items = useMemo(() => {
    const min = minPrice ? Number(minPrice) : 0
    const max = maxPrice ? Number(maxPrice) : Infinity
    return user.inventory
      .filter((item) => {
        if (item.price < min || item.price > max) return false
        if (filter === 'epic') return ['Epic', 'Legendary', 'Arcane', 'Nameless'].includes(item.rarity)
        if (filter === 'high') return item.price >= 100
        if (filter === 'knives') {
          return ['Karambit', 'M9 Bayonet', 'Butterfly Knife', 'Kunai', 'Gloves', 'Flip', 'Mantis', 'Sting'].includes(
            item.weapon,
          )
        }
        return true
      })
      .sort((a, b) => (sort === 'asc' ? a.price - b.price : b.price - a.price))
  }, [user.inventory, filter, sort, minPrice, maxPrice])

  const totalValue = user.inventory.reduce((sum, item) => sum + item.price, 0)
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedItems = useMemo(
    () => user.inventory.filter((item) => selectedSet.has(item.instanceId)),
    [user.inventory, selectedSet],
  )
  const selectedValue = selectedItems.reduce((sum, item) => sum + item.price, 0)

  useEffect(() => {
    setSelectedIds((previous) =>
      previous.filter((instanceId) =>
        user.inventory.some((item) => item.instanceId === instanceId),
      ),
    )
  }, [user.inventory])

  function toggleSelectMode() {
    if (sellingAll) return
    if (selectMode) {
      setSelectMode(false)
      setSelectedIds([])
    } else {
      setConfirmSellAll(false)
      setSelectMode(true)
    }
  }

  function toggleSelect(item) {
    if (sellingAll) return
    setSelectedIds((previous) =>
      previous.includes(item.instanceId)
        ? previous.filter((instanceId) => instanceId !== item.instanceId)
        : [...previous, item.instanceId],
    )
  }

  async function sell(item) {
    if (sellingId || sellingAll) return
    setSellingId(item.instanceId)
    try {
      await onSell(item)
    } finally {
      setSellingId(null)
    }
  }

  async function sellAll() {
    if (sellingAll || !user.inventory.length) return
    setSellingAll(true)
    try {
      const sold = await onSellMany(user.inventory.map((item) => item.instanceId))
      if (sold) {
        setSelectedIds([])
        setSelectMode(false)
      }
    } finally {
      setSellingAll(false)
      setConfirmSellAll(false)
    }
  }

  async function sellSelected() {
    if (sellingAll || !selectedIds.length) return
    setSellingAll(true)
    try {
      const sold = await onSellMany(selectedIds)
      if (sold) {
        setSelectedIds([])
        setSelectMode(false)
      }
    } finally {
      setSellingAll(false)
    }
  }

  return (
    <section id="inventory" className="pt-10 sm:pt-14">
      <SectionHeading
        eyebrow="Your inventory"
        title="Инвентарь"
        description="Выпавшие и купленные скины хранятся здесь. Продай предмет за голду или нажми «Вывести»."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2">
              <div className="text-[7px] font-bold uppercase tracking-[0.14em] text-white/26">Стоимость</div>
              <div className="mt-0.5 text-[11px] font-extrabold tabular-nums text-acid">
                {formatGold(totalValue)}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2">
              <div className="text-[7px] font-bold uppercase tracking-[0.14em] text-white/26">Предметов</div>
              <div className="mt-0.5 text-[11px] font-extrabold tabular-nums text-white/72">
                {user.inventory.length}
              </div>
            </div>
          </div>
        }
      />

      <div className="rounded-[24px] border border-white/[0.075] bg-panel p-3 sm:p-5">
        <div className="flex flex-col gap-3 border-b border-white/[0.06] pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {INVENTORY_FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                className={cx(
                  'shrink-0 rounded-lg border px-3 py-1.5 text-[9px] font-extrabold transition',
                  filter === option.id
                    ? 'border-acid/30 bg-acid/10 text-acid'
                    : 'border-white/[0.07] bg-white/[0.025] text-white/35 hover:border-white/[0.14] hover:text-white/65',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[8px] font-bold uppercase tracking-[0.12em] text-white/22">
            <Icon name="shield" size={11} />
            демо-инвентарь · без вывода
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <PriceSortControls
            sort={sort}
            onSortChange={setSort}
            minPrice={minPrice}
            maxPrice={maxPrice}
            onMinPriceChange={setMinPrice}
            onMaxPriceChange={setMaxPrice}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[8px] font-semibold text-white/24">
              Показано {items.length} из {user.inventory.length}
            </span>
            <button
              type="button"
              onClick={toggleSelectMode}
              disabled={!user.inventory.length || sellingAll}
              className={cx(
                'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[9px] font-extrabold transition disabled:cursor-not-allowed disabled:opacity-35',
                selectMode
                  ? 'border-acid/40 bg-acid/[0.1] text-acid'
                  : 'border-white/[0.1] bg-white/[0.035] text-white/55 hover:border-acid/30 hover:text-acid',
              )}
            >
              <Icon name={selectMode ? 'x' : 'check'} size={12} />
              {selectMode ? 'Отменить выбор' : 'Выделить'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmSellAll(true)}
              disabled={!user.inventory.length || sellingAll || Boolean(sellingId)}
              className="flex items-center gap-1.5 rounded-lg border border-[#ff5d7a]/25 bg-[#ff5d7a]/[0.07] px-3 py-2 text-[9px] font-extrabold text-[#ff9aac] transition hover:border-[#ff5d7a]/40 hover:bg-[#ff5d7a]/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Icon name="tag" size={12} />
              Продать всё
            </button>
          </div>
        </div>

        {selectMode && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-acid/20 bg-acid/[0.055] px-3 py-2.5">
            <span className="text-[9px] font-semibold text-white/55">
              Выбрано:{' '}
              <span className="font-black text-acid">
                {selectedItems.length}{' '}
                {plural(selectedItems.length, ['предмет', 'предмета', 'предметов'])}
              </span>{' '}
              · {formatGold(selectedValue)}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(items.map((item) => item.instanceId))}
                disabled={!items.length || sellingAll}
                className="rounded-lg border border-white/[0.09] px-2.5 py-2 text-[8px] font-bold text-white/45 transition hover:border-white/20 hover:text-white/75 disabled:opacity-35"
              >
                Выбрать все видимые
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                disabled={!selectedIds.length || sellingAll}
                className="rounded-lg border border-white/[0.09] px-2.5 py-2 text-[8px] font-bold text-white/45 transition hover:border-white/20 hover:text-white/75 disabled:opacity-35"
              >
                Снять
              </button>
              <button
                type="button"
                onClick={sellSelected}
                disabled={!selectedIds.length || sellingAll || Boolean(sellingId)}
                className="flex items-center gap-1.5 rounded-lg border border-[#ff5d7a]/30 bg-[#ff5d7a]/[0.1] px-3 py-2 text-[9px] font-black uppercase tracking-[0.05em] text-[#ff9aac] transition hover:bg-[#ff5d7a]/[0.16] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Icon name="tag" size={12} />
                {sellingAll ? 'Продаём...' : 'Продать выбранные'}
              </button>
            </div>
          </div>
        )}

        {confirmSellAll && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ff5d7a]/25 bg-[#ff5d7a]/[0.06] px-3 py-2.5">
            <span className="text-[9px] font-semibold leading-relaxed text-[#ffb3c0]">
              Продать весь инвентарь: {user.inventory.length}{' '}
              {plural(user.inventory.length, ['предмет', 'предмета', 'предметов'])} за{' '}
              <span className="font-black tabular-nums text-white">{formatGold(totalValue)}</span>?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={sellAll}
                disabled={sellingAll}
                className="rounded-lg border border-[#ff5d7a]/35 bg-[#ff5d7a]/[0.12] px-3 py-2 text-[9px] font-black uppercase tracking-[0.06em] text-[#ff9aac] transition hover:bg-[#ff5d7a]/20 disabled:opacity-40"
              >
                {sellingAll ? 'Продаём...' : 'Да, продать'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmSellAll(false)}
                disabled={sellingAll}
                className="rounded-lg border border-white/[0.08] px-3 py-2 text-[9px] font-bold text-white/40 transition hover:text-white disabled:opacity-40"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {items.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((item) => {
              const meta = RARITY[item.rarity] || RARITY.Common
              const isSelling = sellingId === item.instanceId
              const selected = selectMode && selectedSet.has(item.instanceId)
              return (
                <article
                  key={item.instanceId}
                  role={selectMode ? 'button' : undefined}
                  tabIndex={selectMode ? 0 : undefined}
                  aria-pressed={selectMode ? selected : undefined}
                  onClick={selectMode ? () => toggleSelect(item) : undefined}
                  onKeyDown={
                    selectMode
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            toggleSelect(item)
                          }
                        }
                      : undefined
                  }
                  className={cx(
                    'group relative overflow-hidden rounded-2xl border bg-[#0b120d] transition duration-200',
                    selectMode && 'cursor-pointer',
                    selected
                      ? 'border-acid/55 bg-acid/[0.04] shadow-[0_0_28px_rgba(53,255,135,.12)]'
                      : 'border-white/[0.075] hover:border-white/[0.15] hover:shadow-[0_18px_45px_rgba(0,0,0,.28)]',
                  )}
                  style={{ '--rarity-border': `${meta.color}30` }}
                >
                  <SkinVisual skin={item} className="h-28 w-full sm:h-32" />
                  {selectMode && (
                    <span
                      className={cx(
                        'absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg border transition',
                        selected
                          ? 'border-acid bg-acid text-[#041007]'
                          : 'border-white/30 bg-black/50 text-white/35',
                      )}
                    >
                      {selected && <Icon name="check" size={14} strokeWidth={3} />}
                    </span>
                  )}
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-[11px] font-extrabold text-white">{item.name}</h3>
                        <div className="mt-0.5 text-[8px] font-semibold text-white/28">{item.weapon}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] font-extrabold tabular-nums" style={{ color: meta.color }}>
                          {formatPrice(item.price)}
                        </div>
                        <div className="mt-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-white/20">
                          sell price
                        </div>
                      </div>
                    </div>

                    {selectMode ? (
                      <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2 text-center text-[8px] font-bold text-white/35">
                        {selected ? 'Выбран для продажи' : 'Нажмите, чтобы выделить'}
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-[1fr_auto] gap-1.5">
                        <button
                          type="button"
                          onClick={() => sell(item)}
                          disabled={Boolean(sellingId)}
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-acid/22 bg-acid/[0.08] px-2 py-2 text-[9px] font-extrabold text-acid transition hover:bg-acid hover:text-[#041007] disabled:opacity-40"
                        >
                          {isSelling ? (
                            <span className="spin-ring h-3 w-3 rounded-full border-2 border-current/30 border-t-current" />
                          ) : (
                            <Icon name="tag" size={12} />
                          )}
                          Продать
                        </button>
                        <button
                          type="button"
                          onClick={() => onWithdraw(item)}
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.03] px-2.5 py-2 text-[9px] font-extrabold text-white/48 transition hover:border-white/20 hover:text-white"
                        >
                          <Icon name="download" size={12} />
                          Вывести
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="flex min-h-[270px] flex-col items-center justify-center px-6 text-center">
            <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-acid/12 bg-acid/[0.035]">
              <div className="absolute inset-3 rounded-2xl border border-dashed border-acid/15" />
              <Icon name="archive" size={32} className="text-acid/40" />
            </div>
            <h3 className="mt-4 font-display text-[16px] font-extrabold text-white/75">
              {user.inventory.length ? 'Под фильтр ничего не попало' : 'Пока здесь пусто'}
            </h3>
            <p className="mt-1.5 max-w-sm text-[10px] leading-relaxed text-white/28">
              {user.inventory.length
                ? 'Попробуйте выбрать другой фильтр или откройте ещё один кейс.'
                : 'Открой первый кейс или загляни в магазин скинов — всё, что выпадет, появится здесь.'}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => document.getElementById('cases')?.scrollIntoView({ behavior: 'smooth' })}
                className="btn-acid !px-4 !py-2.5 !text-[10px]"
              >
                <Icon name="box" size={14} />
                Открыть кейс
              </button>
              <button
                type="button"
                onClick={() => document.getElementById('store-promo')?.scrollIntoView({ behavior: 'smooth' })}
                className="btn-ghost !py-2.5 !text-[10px]"
              >
                <Icon name="bag" size={14} />
                Магазин
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Store promo & footer                                               */
/* ------------------------------------------------------------------ */

function StorePromo({ catalog, onStore }) {
  const featured = catalog.find((skin) => skin.id === 'm4-samurai') || catalog[catalog.length - 1]
  const second = catalog.find((skin) => skin.id === 'butterfly-dragon-glass') || catalog[Math.max(0, catalog.length - 2)]

  return (
    <section id="store-promo" className="pt-10 sm:pt-14">
      <div className="relative overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#0c140e]">
        <div className="absolute inset-0 bg-grid-faint opacity-40" />
        <div className="absolute -right-16 -top-24 h-80 w-80 rounded-full bg-acid/12 blur-[90px]" />
        <div className="absolute bottom-0 left-1/3 h-40 w-80 rounded-full bg-lime/[0.055] blur-[80px]" />
        <div className="relative grid items-center gap-4 p-5 sm:p-7 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip !border-acid/20 !text-acid/70">
                <Icon name="bag" size={11} />
                Skin market
              </span>
              <span className="chip">Мгновенная покупка</span>
            </div>
            <h2 className="mt-3 font-display text-[24px] font-black tracking-[-0.045em] text-white sm:text-[34px]">
              Магазин <span className="text-gradient-soft">скинов</span>
            </h2>
            <p className="mt-2 max-w-lg text-[11px] leading-relaxed text-white/38">
              Купи любой предмет из каталога за голду. Сразу в инвентарь — без ожидания и без реальных платежей.
            </p>
            <button type="button" onClick={onStore} className="btn-acid mt-4 !px-5 !py-3 !text-[11px]">
              <Icon name="bag" size={15} />
              Открыть магазин
              <Icon name="arrowUpRight" size={14} />
            </button>
          </div>

          <div className="hidden items-end gap-2 lg:flex">
            {[featured, second].filter(Boolean).map((skin, index) => {
              const meta = RARITY[skin.rarity] || RARITY.Common
              return (
                <div
                  key={skin.id}
                  className={cx(
                    'relative w-40 overflow-hidden rounded-2xl border bg-black/25',
                    index === 0 ? 'translate-y-2' : '-translate-y-1',
                  )}
                  style={{ borderColor: `${meta.color}35` }}
                >
                  <SkinVisual skin={skin} className="h-24 w-full" />
                  <div className="p-2.5">
                    <div className="truncate text-[9px] font-extrabold text-white/80">{skin.name}</div>
                    <div className="mt-1 text-[8px] font-extrabold tabular-nums" style={{ color: meta.color }}>
                      {formatPrice(skin.price)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer({ onHistory, onNavigate, onStore }) {
  return (
    <footer className="mt-16 border-t border-white/[0.06] pb-28 pt-8 lg:pb-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-[9px] leading-relaxed text-white/25">
            Демонстрационный прототип. Виртуальная голда и скины не имеют реальной стоимости. Реальные платежи,
            вывод предметов и торговая площадка отключены. Каталог, цены и изображения предметов — публичные данные
            StandoffCraft.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-[9px] font-semibold text-white/28 sm:grid-cols-3">
          {[
            ['Кейсы', 'cases'],
            ['Крафт', 'craft'],
            ['Битва', 'battle'],
            ['Апгрейд', 'upgrade'],
            ['Инвентарь', 'inventory'],
            ['Настройки', 'settings'],
            ['Магазин', 'store-promo'],
          ].map(([label, target]) => (
            <button
              key={target}
              type="button"
              onClick={() => (target === 'store-promo' ? onStore() : onNavigate(target))}
              className="text-left transition hover:text-acid"
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={onHistory} className="text-left transition hover:text-acid">
            История
          </button>
        </div>
      </div>
      <div className="mt-8 flex flex-col gap-2 border-t border-white/[0.05] pt-4 text-[8px] uppercase tracking-[0.12em] text-white/18 sm:flex-row sm:justify-between">
        <span>© {new Date().getFullYear()} STAND GRADE — demo build</span>
        <span>Standoff 2 · все права на игру принадлежат Axlebolt</span>
      </div>
    </footer>
  )
}

/* ------------------------------------------------------------------ */
/*  Toasts & loading                                                   */
/* ------------------------------------------------------------------ */

function ToastStack({ toasts }) {
  return (
    <div className="pointer-events-none fixed bottom-20 right-3 z-[80] flex w-[min(350px,calc(100vw-24px))] flex-col gap-2 lg:bottom-5 lg:right-5">
      {toasts.map((toast) => {
        const tone =
          toast.type === 'error'
            ? '#ff7189'
            : toast.type === 'info'
              ? '#8adfff'
              : '#35ff87'
        return (
          <div
            key={toast.id}
            className="toast-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-[#101711]/96 p-3 shadow-panel backdrop-blur-xl"
            style={{ borderColor: `${tone}38` }}
          >
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${tone}15`, color: tone }}
            >
              <Icon name={toast.type === 'error' ? 'alert' : toast.type === 'info' ? 'info' : 'check'} size={14} />
            </span>
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: tone }}>
                {toast.title}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold leading-relaxed text-white/60">{toast.message}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BootScreen() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-6">
      <div className="absolute inset-0 bg-grid-faint opacity-30" />
      <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-acid/10 blur-[110px]" />
      <div className="relative flex flex-col items-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-acid/25 blur-2xl" />
          <LogoMark size={66} className="relative" />
        </div>
        <div className="mt-5 font-display text-[16px] font-black tracking-[-0.03em] text-white">
          STAND <span className="text-acid">GRADE</span>
        </div>
        <div className="mt-4 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">
          <span className="spin-ring h-3.5 w-3.5 rounded-full border-2 border-acid/20 border-t-acid" />
          Подключаемся к серверу
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Login                                                              */
/* ------------------------------------------------------------------ */

const LOGIN_CRATE_SKIN = {
  id: 'login-karambit-gold',
  name: 'Karambit Gold',
  weapon: 'Karambit',
  rarity: 'Nameless',
  price: 147994,
  image: 'https://skin.standoffcraft.com/items/Karambit%20Gold.webp',
}

const LOGIN_FEATURED_SKIN = {
  id: 'login-year-of-the-tiger',
  name: 'M4A1 Year Of The Tiger',
  weapon: 'M4A1',
  rarity: 'Arcane',
  price: 199999,
  image: 'https://skin.standoffcraft.com/items/M4A1%20Year%20Of%20The%20Tiger.webp',
}

function LoginScreen({ onLogin, onRegister, notice }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isRegister = mode === 'register'

  async function submit(event) {
    event.preventDefault()
    if (loading) return
    setError('')
    if (isRegister) {
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
        setError('Логин: 3–20 символов, только латиница, цифры и _')
        return
      }
      if (password.length < 6) {
        setError('Пароль должен быть не короче 6 символов')
        return
      }
      if (password !== confirmPassword) {
        setError('Пароли не совпадают')
        return
      }
    }
    setLoading(true)
    try {
      const action = isRegister ? onRegister : onLogin
      await action({ username, password })
    } catch (loginError) {
      setError(loginError.message || (isRegister ? 'Не удалось создать аккаунт' : 'Не удалось войти'))
    } finally {
      setLoading(false)
    }
  }

  function switchMode(next) {
    setMode(next)
    setConfirmPassword('')
    setError('')
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink">
      <div className="absolute inset-0 bg-grid-faint opacity-30" />
      <div className="absolute -left-32 -top-40 h-[560px] w-[560px] rounded-full bg-acid/[0.11] blur-[130px]" />
      <div className="absolute -right-40 top-1/3 h-[460px] w-[460px] rounded-full bg-lime/[0.055] blur-[120px]" />
      <div className="absolute bottom-[-220px] left-1/3 h-[420px] w-[520px] rounded-full bg-[#16ff9b]/[0.05] blur-[120px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-acid/50 to-transparent" />
      {isWinterSeason() && <WinterSnow />}

      <div className="relative mx-auto grid min-h-screen max-w-[1320px] items-center gap-10 px-5 py-8 lg:grid-cols-[1.1fr_.9fr] lg:gap-16 lg:px-10">
        <div className="hidden lg:block">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-md border border-acid/25 bg-acid/10 px-2 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-acid">
              demo
            </span>
          </div>

          <h1 className="mt-12 max-w-[620px] font-display text-[58px] font-black leading-[0.93] tracking-[-0.07em] text-white xl:text-[74px]">
            Твой дроп.
            <span className="block text-gradient text-shadow-glow">Твой STAND.</span>
            <span className="block text-white/22">Твой GRADE.</span>
          </h1>
          <p className="mt-6 max-w-lg text-[13px] leading-relaxed text-white/39">
            Кейсы Standoff 2, апгрейд, магазин и полноценный инвентарь. Всё в одном неоново-зелёном
            демо-проекте.
          </p>

          <div className="mt-8 grid max-w-[380px] grid-cols-2 gap-2">
            {[
              ['20', 'кейсов', 'box'],
              ['1 498', 'предметов', 'coin'],
            ].map(([value, label, icon]) => (
              <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-display text-[19px] font-black text-white">{value}</span>
                  <Icon name={icon} size={15} className="text-acid/60" />
                </div>
                <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.12em] text-white/25">{label}</div>
              </div>
            ))}
          </div>

          <div className="mt-9 flex max-w-[600px] items-end gap-3">
            <div className="relative flex flex-1 items-center justify-center rounded-[24px] border border-white/[0.07] bg-[radial-gradient(circle_at_50%_60%,rgba(53,255,135,.09),transparent_65%)] py-4">
              <CaseCrate accent="#35ff87" skin={LOGIN_CRATE_SKIN} className="h-40 w-full" />
            </div>
            <div className="w-[190px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c130e]">
              <SkinVisual skin={LOGIN_FEATURED_SKIN} className="h-24 w-full" />
              <div className="p-3">
                <div
                  className="text-[8px] font-black uppercase tracking-[0.14em]"
                  style={{ color: RARITY[LOGIN_FEATURED_SKIN.rarity].color }}
                >
                  {RARITY[LOGIN_FEATURED_SKIN.rarity].label}
                </div>
                <div className="mt-1 text-[10px] font-extrabold text-white/82">{LOGIN_FEATURED_SKIN.name}</div>
                <div className="mt-1 text-[9px] font-bold tabular-nums text-white/35">
                  {formatPrice(LOGIN_FEATURED_SKIN.price)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[430px]">
          <div className="mb-7 flex items-center justify-between lg:hidden">
            <Logo />
            <span className="rounded-md border border-acid/20 bg-acid/[0.07] px-2 py-1 text-[7px] font-black uppercase tracking-[0.16em] text-acid">
              demo
            </span>
          </div>

          <div className="relative overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#0e1510]/90 p-5 shadow-panel backdrop-blur-2xl sm:p-7">
            <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-acid/10 blur-[60px]" />
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-acid/20 bg-acid/[0.07]">
                  <LogoMark size={30} />
                </div>
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.18em] text-acid/65">Account access</div>
                  <h2 className="mt-0.5 font-display text-[19px] font-black tracking-[-0.04em] text-white">
                    {isRegister ? 'Создание аккаунта' : 'Вход в аккаунт'}
                  </h2>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-white/[0.07] bg-black/25 p-1">
                {[
                  ['login', 'Вход'],
                  ['register', 'Регистрация'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => switchMode(value)}
                    className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] transition ${
                      mode === value
                        ? 'bg-acid/12 text-acid shadow-[0_0_18px_rgba(53,255,135,0.12)]'
                        : 'text-white/32 hover:bg-white/[0.04] hover:text-white/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <p className="mt-4 text-[10px] leading-relaxed text-white/32">
                {isRegister
                  ? 'Придумай логин и пароль — аккаунт создастся сразу, стартовый баланс 100 G.'
                  : 'Войди, чтобы открывать кейсы, копить скины и собирать коллекцию.'}
              </p>

              {notice && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#ffc857]/20 bg-[#ffc857]/[0.06] p-3 text-[9px] leading-relaxed text-[#ffd98a]/80">
                  <Icon name="info" size={13} className="mt-0.5 shrink-0" />
                  {notice}
                </div>
              )}

              <form onSubmit={submit} className="mt-5 space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-[8px] font-black uppercase tracking-[0.14em] text-white/35">
                    Логин
                  </span>
                  <div className="relative">
                    <Icon name="user" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      autoComplete="username"
                      placeholder="my_login"
                      className="h-11 w-full rounded-xl border border-white/[0.09] bg-black/25 pl-10 pr-3 text-[12px] font-semibold text-white placeholder:text-white/20 transition focus:border-acid/45 focus:bg-black/35 focus:outline-none"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[8px] font-black uppercase tracking-[0.14em] text-white/35">
                    Пароль
                  </span>
                  <div className="relative">
                    <Icon name="lock" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete={isRegister ? 'new-password' : 'current-password'}
                      placeholder="••••••••"
                      className="h-11 w-full rounded-xl border border-white/[0.09] bg-black/25 pl-10 pr-11 text-[12px] font-semibold text-white placeholder:text-white/20 transition focus:border-acid/45 focus:bg-black/35 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-white/28 transition hover:bg-white/[0.05] hover:text-white/70"
                      aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    >
                      <Icon name={showPassword ? 'eyeOff' : 'eye'} size={15} />
                    </button>
                  </div>
                </label>

                {isRegister && (
                  <label className="block">
                    <span className="mb-1.5 block text-[8px] font-black uppercase tracking-[0.14em] text-white/35">
                      Повтори пароль
                    </span>
                    <div className="relative">
                      <Icon name="lock" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        autoComplete="new-password"
                        placeholder="••••••••"
                        className="h-11 w-full rounded-xl border border-white/[0.09] bg-black/25 pl-10 pr-3 text-[12px] font-semibold text-white placeholder:text-white/20 transition focus:border-acid/45 focus:bg-black/35 focus:outline-none"
                      />
                    </div>
                  </label>
                )}

                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-[#ff7189]/20 bg-[#ff7189]/[0.06] p-3 text-[9px] leading-relaxed text-[#ff9aac]">
                    <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} className="btn-acid mt-1 w-full !py-3.5 !text-[11px]">
                  {loading ? (
                    <>
                      <span className="spin-ring h-4 w-4 rounded-full border-2 border-[#041007]/30 border-t-[#041007]" />
                      {isRegister ? 'Создаём...' : 'Проверяем...'}
                    </>
                  ) : (
                    <>
                      {isRegister ? 'Создать аккаунт' : 'Войти'}
                      <Icon name="arrowRight" size={15} />
                    </>
                  )}
                </button>
              </form>

              {isRegister ? (
                <div className="mt-5 flex items-start gap-2 rounded-xl border border-acid/12 bg-acid/[0.04] p-3 text-[9px] leading-relaxed text-white/38">
                  <Icon name="info" size={13} className="mt-0.5 shrink-0 text-acid/70" />
                  На одного человека можно создать не более 2 аккаунтов.
                </div>
              ) : (
                <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[9px] leading-relaxed text-white/35">
                  <Icon name="info" size={13} className="mt-0.5 shrink-0 text-acid/60" />
                  Нет аккаунта? Открой вкладку «Регистрация» и придумай свой логин и пароль.
                </div>
              )}

              <p className="mt-4 text-center text-[8px] leading-relaxed text-white/20">
                Демо-проект. Реальные платежи отключены.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Case opening modal                                                 */
/* ------------------------------------------------------------------ */

function makePreviewReel(caseData) {
  return Array.from({ length: 120 }, (_, index) => {
    const skin = caseData.contents[(index * 5 + 2) % caseData.contents.length]
    return { ...skin, reelId: `preview-${caseData.id}-${index}` }
  })
}

function useEscape(callback, active = true) {
  useEffect(() => {
    if (!active) return undefined
    const handler = (event) => {
      if (event.key === 'Escape') callback()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [callback, active])
}

function CaseModal({
  caseData,
  token,
  user,
  fast,
  onClose,
  onUpdate,
  onToast,
  onDonate,
  onGoInventory,
}) {
  const [count, setCount] = useState(1)
  const [reels, setReels] = useState(() => [makePreviewReel(caseData)])
  const [spinning, setSpinning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [soldIds, setSoldIds] = useState([])
  const [selling, setSelling] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const viewportRefs = useRef([])
  const trackRefs = useRef([])
  const stopSoundRef = useRef(null)
  const duration = fast ? ANIM_MS_FAST : ANIM_MS_NORMAL
  const balance = user.balance
  const isFree = caseData.price === 0
  const effectiveCount = isFree ? 1 : count
  const totalPrice = caseData.price * effectiveCount
  const canAfford = balance + 1e-9 >= totalPrice
  const pityDry = Math.max(0, Number(user.pity?.[caseData.id]?.dry) || 0)
  const naturalRare = Number(caseData.naturalRareChance) || 0
  const rareChanceNow = Math.min(100, naturalRare + pityDry)
  const accent = caseData.accent || '#35ff87'
  const freeCooldownIn =
    isFree && user.nextFreeCaseAt ? Math.max(0, new Date(user.nextFreeCaseAt).getTime() - now) : 0
  const freeLocked = freeCooldownIn > 0 && !user.unlimitedFreeCase
  const soldSet = new Set(soldIds)
  const unsoldResults = (results || []).filter((item) => !soldSet.has(item.instanceId))
  const unsoldValue = unsoldResults.reduce((sum, item) => sum + item.price, 0)
  const totalValue = (results || []).reduce((sum, item) => sum + item.price, 0)
  const remainingCount = unsoldResults.length

  useEffect(() => {
    if (!isFree || !user.nextFreeCaseAt) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [isFree, user.nextFreeCaseAt])

  const requestClose = useCallback(() => {
    if (!spinning) onClose()
  }, [spinning, onClose])

  useEscape(requestClose, true)

  useLayoutEffect(() => {
    if (!spinning || !reels.length) return undefined
    const tracks = []
    const frames = []

    reels.forEach((reel, index) => {
      const track = trackRefs.current[index]
      const viewport = viewportRefs.current[index]
      if (!track || !viewport) return
      const flaggedIndex = reel.findIndex((item) => item.winner)
      const target = track.children[flaggedIndex >= 0 ? flaggedIndex : WINNER_INDEX]
      if (!target) return

      track.style.transition = 'none'
      track.style.transform = 'translate3d(0,0,0)'
      void track.offsetWidth

      const jitter = (Math.random() * 0.4 - 0.2) * target.offsetWidth
      const offset = Math.max(
        0,
        target.offsetLeft + target.offsetWidth / 2 + jitter - viewport.clientWidth / 2,
      )
      tracks.push({ track, offset })
    })

    const stopSound = startSpinSound(duration, 'case')
    stopSoundRef.current = stopSound

    const frame = requestAnimationFrame(() => {
      tracks.forEach(({ track, offset }) => {
        track.style.transition = `transform ${duration}ms ${REEL_EASING}`
        track.style.transform = `translate3d(${-offset}px,0,0)`
      })
    })
    frames.push(frame)

    const timer = setTimeout(() => {
      stopSound()
      stopSoundRef.current = null
      setSpinning(false)
      setShowResult(true)
      const best = (results || []).reduce((top, item) => {
        const nextIndex = RARITY_ORDER.indexOf(item.rarity)
        const topIndex = RARITY_ORDER.indexOf(top)
        return nextIndex > topIndex ? item.rarity : top
      }, 'Common')
      playCaseResult(best)
    }, duration + 120)

    return () => {
      stopSound()
      stopSoundRef.current = null
      frames.forEach((id) => cancelAnimationFrame(id))
      clearTimeout(timer)
    }
  }, [spinning, reels, duration, results])

  useEffect(
    () => () => {
      if (stopSoundRef.current) stopSoundRef.current()
    },
    [],
  )

  function changeCount(next) {
    if (spinning || loading || isFree) return
    setCount(next)
    setShowResult(false)
    setResults(null)
    setSoldIds([])
    setError('')
    setReels([makePreviewReel(caseData)])
  }

  async function spin() {
    if (spinning || loading || freeLocked) return
    unlockAudio()
    setLoading(true)
    setError('')
    setShowResult(false)
    setResults(null)
    setSoldIds([])
    try {
      const data = await apiRequest('/api/open-case', {
        method: 'POST',
        token,
        body: { caseId: caseData.id, count: effectiveCount },
      })
      const openings = data.openings?.length
        ? data.openings
        : [{ winner: data.winner, reel: data.reel }]
      onUpdate(data)
      setReels(openings.map((opening) => opening.reel))
      setResults(openings.map((opening) => opening.winner))
      setSpinning(true)
    } catch (requestError) {
      setError(requestError.message)
      onToast(requestError.message, 'error')
      if (requestError.data?.user) onUpdate(requestError.data)
    } finally {
      setLoading(false)
    }
  }

  function resetTable() {
    setShowResult(false)
    setResults(null)
    setSoldIds([])
    setError('')
    setReels([makePreviewReel(caseData)])
    trackRefs.current.forEach((track) => {
      if (!track) return
      track.style.transition = 'none'
      track.style.transform = 'translate3d(0,0,0)'
    })
  }

  async function spinAgain() {
    resetTable()
    await sleep(30)
    await spin()
  }

  async function sellPrize() {
    if (!results?.length || selling || freeLocked) return
    const targets = unsoldResults
    if (!targets.length) return
    setSelling(true)
    try {
      const data =
        targets.length === 1
          ? await apiRequest('/api/sell-skin', {
              method: 'POST',
              token,
              body: { instanceId: targets[0].instanceId },
            })
          : await apiRequest('/api/sell-many', {
              method: 'POST',
              token,
              body: { instanceIds: targets.map((item) => item.instanceId) },
            })
      onUpdate(data)
      setSoldIds((previous) => [...previous, ...targets.map((item) => item.instanceId)])
      playCoin()
      onToast(data.message, 'success')
    } catch (requestError) {
      onToast(requestError.message, 'error')
    } finally {
      setSelling(false)
    }
  }

  function goInventory() {
    onClose()
    setTimeout(() => onGoInventory(), 80)
  }

  const compactReels = reels.length > 1
  const winnerSpot = (reels[0] || []).findIndex((skin) => skin.winner)
  const single = results?.[0] || null
  const ctaLabel = freeLocked
    ? `Через ${formatCountdown(freeCooldownIn)}`
    : isFree
      ? 'Открыть бесплатно'
      : effectiveCount > 1
        ? `Открыть ×${effectiveCount} за ${formatPrice(totalPrice)}`
        : canAfford
          ? `Открыть за ${formatPrice(totalPrice)}`
          : 'Недостаточно голды'

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-[#030604]/85 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Кейс: ${caseData.name}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div className="relative flex h-full w-full max-w-[1120px] flex-col overflow-hidden border border-white/[0.09] bg-[#0a100c] shadow-panel sm:h-auto sm:max-h-[94vh] sm:rounded-[26px]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] bg-[#0d1510]/95 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
              style={{ borderColor: `${accent}2c`, backgroundColor: `${accent}0d`, color: accent }}
            >
              <Icon name="box" size={19} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate font-display text-[15px] font-black tracking-[-0.03em] text-white sm:text-[18px]">
                  {caseData.name}
                </h2>
                <span
                  className="hidden rounded-md border px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.12em] sm:inline"
                  style={{ color: accent, borderColor: `${accent}30`, backgroundColor: `${accent}0a` }}
                >
                  {caseData.kicker}
                </span>
              </div>
              <div className="mt-0.5 text-[9px] font-semibold text-white/28">
                {isFree
                  ? freeLocked
                    ? `Следующее открытие через ${formatCountdown(freeCooldownIn)}`
                    : 'Бесплатное открытие · раз в 24 часа'
                  : `Цена открытия ${formatPrice(caseData.price)}`}{' '}
                · {caseData.totalItems || caseData.contents.length}{' '}
                {plural(caseData.totalItems || caseData.contents.length, ['предмет', 'предмета', 'предметов'])}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-2 sm:flex">
              <Icon name="coin" size={12} className="text-acid" />
              <span className="text-[10px] font-extrabold tabular-nums text-white/75">{formatGold(balance)}</span>
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={spinning}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/42 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
              aria-label="Закрыть"
            >
              <Icon name="x" size={17} />
            </button>
          </div>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto">
          <div className="p-3 sm:p-5">
            {caseData.price > 0 && (
              <div className="relative mb-3 overflow-hidden rounded-2xl border border-acid/12 bg-[#08120c] p-3 sm:p-4">
                <div className="absolute inset-0 bg-grid-faint opacity-15" />
                <div
                  className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-acid/10 blur-3xl"
                  aria-hidden="true"
                />
                <div className="relative flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-acid/20 bg-acid/[0.07] text-acid">
                      <Icon name="shield" size={16} />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[8px] font-black uppercase tracking-[0.18em] text-acid/70">
                          Гарант кейса
                        </span>
                        {pityDry > 0 && (
                          <span className="rounded border border-acid/20 bg-acid/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em] text-acid">
                            серия {pityDry}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 max-w-[360px] text-[9px] leading-relaxed text-white/32">
                        Каждое открытие без Arcane или ножа добавляет{' '}
                        <span className="font-bold text-white/55">+1%</span> к шансу редкого дропа. На 30-м
                        открытии бонус уже <span className="font-bold text-white/55">+30%</span>, на 100-м —
                        гарантия.
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[7px] font-black uppercase tracking-[0.14em] text-white/25">
                      Шанс редкого
                    </div>
                    <div className="mt-0.5 font-display text-[20px] font-black tabular-nums leading-none text-acid">
                      {formatChance(rareChanceNow)}
                    </div>
                    <div className="mt-1 text-[7.5px] font-semibold tabular-nums text-white/28">
                      база {formatChance(naturalRare)} · бонус +{pityDry}%
                    </div>
                  </div>
                </div>

                <div className="relative mt-3">
                  <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-acid/35 via-acid/70 to-acid transition-all duration-700"
                      style={{ width: `${Math.min(100, pityDry)}%` }}
                    />
                  </div>
                  <div className="relative mt-1.5 flex items-center justify-between text-[7px] font-bold tabular-nums text-white/22">
                    <span>0</span>
                    <span className={pityDry >= 30 ? 'text-acid/80' : ''}>30 · +30%</span>
                    <span className={pityDry >= 100 ? 'text-acid' : ''}>100 · гарант</span>
                  </div>
                </div>

                <div className="relative mt-2.5 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5">
                    <div className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/22">Сухих</div>
                    <div className="mt-0.5 text-[10px] font-extrabold tabular-nums text-white/75">
                      {pityDry} / 100
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5">
                    <div className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/22">
                      Следующее
                    </div>
                    <div className="mt-0.5 text-[10px] font-extrabold tabular-nums text-white/75">
                      {formatChance(Math.min(100, rareChanceNow + 1))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5">
                    <div className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/22">
                      До гаранта
                    </div>
                    <div className="mt-0.5 text-[10px] font-extrabold tabular-nums text-white/75">
                      {Math.max(0, 100 - pityDry)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#060a07] p-3 sm:p-4">
              <div className="absolute inset-0 bg-grid-faint opacity-20" />
              <div className="relative mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-acid" />
                  <span className="text-[8px] font-black uppercase tracking-[0.18em] text-white/38">
                    Рулетка · {reels[0]?.length || 120} предметов
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[7px] font-bold uppercase tracking-[0.1em] text-white/24">
                      Открыть
                    </span>
                    <div className="flex items-center gap-1">
                      {OPEN_COUNTS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          disabled={spinning || loading || isFree}
                          onClick={() => changeCount(option)}
                          className={cx(
                            'h-6 min-w-6 rounded-md border px-1.5 text-[8px] font-extrabold transition disabled:opacity-35',
                            effectiveCount === option
                              ? 'border-acid/40 bg-acid/12 text-acid'
                              : 'border-white/[0.07] bg-white/[0.025] text-white/35 hover:text-white/70',
                          )}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                  <span className="rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[8px] font-bold text-white/35">
                    {fast ? '0.5 сек' : '3.5 сек'}
                  </span>
                </div>
              </div>

              <div className={cx('space-y-1.5', compactReels && 'max-h-[46vh] overflow-y-auto pr-1')}>
                {reels.map((reel, reelIndex) => {
                  if (!compactReels) {
                    return (
                      <div
                        key={`reel-${reelIndex}`}
                        className="relative h-[142px] overflow-hidden rounded-xl border border-white/[0.06] sm:h-[160px]"
                        ref={(node) => {
                          viewportRefs.current[reelIndex] = node
                        }}
                      >
                        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2 bg-acid/80 shadow-[0_0_12px_rgba(53,255,135,.85)]" />
                        <div className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent border-t-acid" />
                        <div className="pointer-events-none absolute bottom-0 left-1/2 z-30 -translate-x-1/2 border-x-[6px] border-b-[7px] border-x-transparent border-b-acid" />
                        <div className="roulette-mask h-full">
                          <div
                            ref={(node) => {
                              trackRefs.current[reelIndex] = node
                            }}
                            className={cx(
                              'flex h-full items-center gap-2 px-3',
                              spinning && 'will-change-transform',
                            )}
                          >
                            {reel.map((skin, index) => {
                              const meta = RARITY[skin.rarity] || RARITY.Common
                              const isWinner =
                                showResult && results && (skin.winner || index === WINNER_INDEX)
                              return (
                                <div
                                  key={skin.reelId || `${skin.id}-${index}`}
                                  className={cx(
                                    'relative w-[108px] shrink-0 overflow-hidden rounded-xl border bg-[#0b120d] transition duration-300 sm:w-[128px]',
                                    isWinner
                                      ? 'result-glow scale-[1.04] border-acid/60'
                                      : 'border-white/[0.08]',
                                  )}
                                  style={!isWinner ? { borderColor: `${meta.color}20` } : undefined}
                                >
                                  <SkinVisual
                                    skin={skin}
                                    className="h-[70px] w-full sm:h-[82px]"
                                    showRarity={false}
                                  />
                                  <div className="p-2">
                                    <div className="flex items-center gap-1">
                                      <span
                                        className="h-1 w-1 shrink-0 rounded-full"
                                        style={{ backgroundColor: meta.color }}
                                      />
                                      <span
                                        className="truncate text-[7px] font-black uppercase tracking-[0.08em]"
                                        style={{ color: meta.color }}
                                      >
                                        {meta.label}
                                      </span>
                                    </div>
                                    <div className="mt-1 truncate text-[8px] font-extrabold text-white/72">
                                      {skin.name}
                                    </div>
                                    <div className="mt-0.5 text-[8px] font-bold tabular-nums text-white/28">
                                      {formatPrice(skin.price)}
                                    </div>
                                  </div>
                                  {isWinner && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-[#041007]/55">
                                      <span className="rounded-full bg-acid px-2 py-1 text-[7px] font-black uppercase tracking-[0.1em] text-[#041007]">
                                        winner
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        {spinning && (
                          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(53,255,135,.045),transparent)]" />
                        )}
                      </div>
                    )
                  }

                  return (
                    <div
                      key={`reel-${reelIndex}`}
                      className="relative h-[78px] overflow-hidden rounded-lg border border-white/[0.06] bg-black/20"
                      ref={(node) => {
                        viewportRefs.current[reelIndex] = node
                      }}
                    >
                      <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2 bg-acid/70" />
                      <div className="roulette-mask h-full">
                        <div
                          ref={(node) => {
                            trackRefs.current[reelIndex] = node
                          }}
                          className={cx(
                            'flex h-full items-center gap-1.5 px-2',
                            spinning && 'will-change-transform',
                          )}
                        >
                          {reel.map((skin, index) => {
                            const meta = RARITY[skin.rarity] || RARITY.Common
                            const isWinner = showResult && (skin.winner || index === WINNER_INDEX)
                            return (
                              <div
                                key={skin.reelId || `${skin.id}-${index}`}
                                className={cx(
                                  'relative h-[60px] w-[58px] shrink-0 overflow-hidden rounded-lg border bg-[#0b120d]',
                                  isWinner ? 'result-glow border-acid/70' : 'border-white/[0.07]',
                                )}
                                style={!isWinner ? { borderColor: `${meta.color}20` } : undefined}
                              >
                                <SkinVisual
                                  skin={skin}
                                  className="h-full w-full"
                                  showRarity={false}
                                  artClassName="w-[124%]"
                                />
                                {isWinner && (
                                  <span className="absolute inset-x-0 bottom-0 bg-acid py-0.5 text-center text-[6px] font-black uppercase tracking-[0.08em] text-[#041007]">
                                    winner
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {!showResult && (
                <div className="relative mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-[9px] text-white/30">
                    <Icon name="shield" size={13} className="text-acid/55" />
                    Выигрыш определяется на сервере
                    <span className="hidden text-white/15 sm:inline">·</span>
                    <span className="hidden sm:inline">
                      {winnerSpot >= 0
                        ? `${winnerSpot + 1}-й предмет в ленте — ваш`
                        : 'Победитель уже определён на сервере'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!canAfford && !isFree && (
                      <button
                        type="button"
                        onClick={onDonate}
                        className="text-[9px] font-bold text-[#ffc857] underline decoration-[#ffc857]/30 underline-offset-2"
                      >
                        Пополнить
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={spin}
                      disabled={spinning || loading || !canAfford || freeLocked}
                      className="btn-acid min-w-[190px] !py-3 !text-[11px] disabled:shadow-none"
                    >
                      {loading || spinning ? (
                        <>
                          <span className="spin-ring h-4 w-4 rounded-full border-2 border-[#041007]/30 border-t-[#041007]" />
                          {spinning ? 'Крутим...' : 'Открываем...'}
                        </>
                      ) : (
                        <>
                          <Icon name={freeLocked ? 'lock' : 'play'} size={14} />
                          {ctaLabel}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {showResult && results?.length === 1 && single && (
                <div className="pop-in relative mt-3 overflow-hidden rounded-xl border border-acid/25 bg-[#0c1710] p-3 sm:p-4">
                  <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-acid/12 blur-3xl" />
                  <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative h-[74px] w-[96px] shrink-0 overflow-hidden rounded-xl border border-acid/25">
                        <SkinVisual skin={single} className="h-full w-full" showRarity={false} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[8px] font-black uppercase tracking-[0.15em] text-acid">
                            Вам выпало
                          </span>
                          <RarityBadge rarity={single.rarity} />
                        </div>
                        <h3 className="mt-1.5 truncate font-display text-[15px] font-extrabold tracking-[-0.03em] text-white sm:text-[18px]">
                          {single.name}
                        </h3>
                        <div className="mt-1 flex items-center gap-2 text-[9px] font-bold text-white/35">
                          <span>{single.weapon}</span>
                          <span className="text-white/12">·</span>
                          <span className="text-acid">{formatPrice(single.price)}</span>
                          <span className="text-white/12">·</span>
                          <span>{soldSet.has(single.instanceId) ? 'продано' : 'в инвентаре'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={sellPrize}
                        disabled={soldSet.has(single.instanceId) || selling}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-acid/25 bg-acid/[0.08] px-3 py-2.5 text-[9px] font-extrabold text-acid transition hover:bg-acid hover:text-[#041007] disabled:opacity-40 sm:flex-none"
                      >
                        {selling ? (
                          <span className="spin-ring h-3 w-3 rounded-full border-2 border-current/30 border-t-current" />
                        ) : (
                          <Icon name="tag" size={12} />
                        )}
                        {soldSet.has(single.instanceId)
                          ? 'Продано'
                          : `Продать за ${formatPrice(single.price)}`}
                      </button>
                      <button
                        type="button"
                        onClick={goInventory}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 text-[9px] font-extrabold text-white/60 transition hover:text-white sm:flex-none"
                      >
                        <Icon name="archive" size={12} />
                        В инвентарь
                      </button>
                      <button
                        type="button"
                        onClick={spinAgain}
                        disabled={!canAfford || freeLocked}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 text-[9px] font-extrabold text-white/60 transition hover:border-acid/25 hover:text-acid disabled:opacity-30 sm:flex-none"
                      >
                        <Icon name="refresh" size={12} />
                        Ещё
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showResult && results && results.length > 1 && (
                <div className="pop-in relative mt-3 overflow-hidden rounded-xl border border-acid/25 bg-[#0c1710] p-3 sm:p-4">
                  <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-acid/12 blur-3xl" />
                  <div className="relative flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-black uppercase tracking-[0.15em] text-acid">
                        Вам выпало
                      </span>
                      <span className="font-display text-[16px] font-black tracking-[-0.03em] text-white">
                        {results.length} {plural(results.length, ['предмет', 'предмета', 'предметов'])}
                      </span>
                      <span className="rounded-md border border-acid/25 bg-acid/[0.08] px-2 py-1 text-[9px] font-black tabular-nums text-acid">
                        {formatPrice(totalValue)}
                      </span>
                    </div>
                    {soldIds.length > 0 && (
                      <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/30">
                        продано {soldIds.length} из {results.length}
                      </span>
                    )}
                  </div>

                  <div className="relative mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {results.map((item) => {
                      const meta = RARITY[item.rarity] || RARITY.Common
                      const isSold = soldSet.has(item.instanceId)
                      return (
                        <div
                          key={item.instanceId}
                          className={cx(
                            'relative overflow-hidden rounded-lg border bg-black/25 transition',
                            isSold ? 'opacity-40' : '',
                          )}
                          style={{ borderColor: `${meta.color}30` }}
                        >
                          <SkinVisual skin={item} className="h-16 w-full" showRarity={false} />
                          <div className="p-2">
                            <div className="truncate text-[8px] font-extrabold text-white/80">{item.name}</div>
                            <div className="mt-0.5 flex items-center justify-between gap-1">
                              <span
                                className="truncate text-[6.5px] font-black uppercase tracking-[0.06em]"
                                style={{ color: meta.color }}
                              >
                                {meta.label}
                              </span>
                              <span className="shrink-0 text-[8px] font-bold tabular-nums text-white/40">
                                {formatPrice(item.price)}
                              </span>
                            </div>
                          </div>
                          {isSold && (
                            <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-[#041007]/70 py-1 text-center text-[7px] font-black uppercase tracking-[0.1em] text-acid">
                              продано
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="relative mt-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={sellPrize}
                      disabled={!remainingCount || selling}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-acid/25 bg-acid/[0.08] px-3 py-2.5 text-[9px] font-extrabold text-acid transition hover:bg-acid hover:text-[#041007] disabled:opacity-40 sm:flex-none"
                    >
                      {selling ? (
                        <span className="spin-ring h-3 w-3 rounded-full border-2 border-current/30 border-t-current" />
                      ) : (
                        <Icon name="tag" size={12} />
                      )}
                      {remainingCount
                        ? `Продать всё за ${formatPrice(unsoldValue)}`
                        : 'Всё продано'}
                    </button>
                    <button
                      type="button"
                      onClick={goInventory}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 text-[9px] font-extrabold text-white/60 transition hover:text-white sm:flex-none"
                    >
                      <Icon name="archive" size={12} />
                      В инвентарь
                    </button>
                    <button
                      type="button"
                      onClick={spinAgain}
                      disabled={!canAfford || freeLocked}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 text-[9px] font-extrabold text-white/60 transition hover:border-acid/25 hover:text-acid disabled:opacity-30 sm:flex-none"
                    >
                      <Icon name="refresh" size={12} />
                      Ещё ×{effectiveCount}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#ff7189]/20 bg-[#ff7189]/[0.05] px-3 py-2 text-[9px] font-semibold text-[#ff9aac]">
                  <Icon name="alert" size={12} />
                  {error}
                </div>
              )}
            </div>

            <div className="mt-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[8px] font-black uppercase tracking-[0.18em] text-acid/55">Case contents</div>
                  <h3 className="mt-1 font-display text-[16px] font-extrabold tracking-[-0.03em] text-white">
                    Содержимое кейса
                  </h3>
                </div>
                <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                  {caseData.rarityBreakdown.map((row) => (
                    <span
                      key={row.rarity}
                      className="shrink-0 rounded-md border px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em]"
                      style={{
                        color: RARITY[row.rarity].color,
                        borderColor: `${RARITY[row.rarity].color}24`,
                        backgroundColor: `${RARITY[row.rarity].color}08`,
                      }}
                      title={`${row.rarity}: ${formatChance(row.chance)}`}
                    >
                      {RARITY[row.rarity].label} {formatChance(row.chance)}
                    </span>
                  ))}
                </div>
              </div>

              {caseData.totalItems > caseData.contents.length && (
                <div className="mt-2 text-[8px] font-semibold text-white/22">
                  Показаны {caseData.contents.length} из {caseData.totalItems} предметов. Полный пул
                  используется при открытии кейса.
                </div>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {caseData.contents.map((skin) => {
                  const meta = RARITY[skin.rarity] || RARITY.Common
                  return (
                    <div
                      key={skin.id}
                      className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.022] p-2"
                    >
                      <div
                        className="relative h-12 w-[70px] shrink-0 overflow-hidden rounded-lg border"
                        style={{ borderColor: `${meta.color}20` }}
                      >
                        <SkinVisual skin={skin} className="h-full w-full" showRarity={false} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
                          <span
                            className="truncate text-[7px] font-black uppercase tracking-[0.09em]"
                            style={{ color: meta.color }}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[9px] font-bold text-white/75">{skin.name}</div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="text-[8px] font-bold tabular-nums text-white/28">
                            {formatPrice(skin.price)}
                          </span>
                          <span className="text-[8px] font-extrabold text-white/38">{formatChance(skin.chance)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Store modal                                                        */
/* ------------------------------------------------------------------ */

function StoreModal({ catalog, balance, token, onClose, onUpdate, onToast }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('desc')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [buying, setBuying] = useState(null)
  const [visibleCount, setVisibleCount] = useState(80)

  const close = useCallback(() => onClose(), [onClose])
  useEscape(close)

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const min = minPrice ? Number(minPrice) : 0
    const max = maxPrice ? Number(maxPrice) : Infinity
    return catalog
      .filter((skin) => skin.price >= min && skin.price <= max)
      .filter((skin) => filter === 'all' || skin.rarity === filter)
      .filter((skin) => !normalized || skin.name.toLowerCase().includes(normalized) || skin.weapon.toLowerCase().includes(normalized))
      .sort((a, b) => (sort === 'asc' ? a.price - b.price : b.price - a.price))
  }, [catalog, filter, query, sort, minPrice, maxPrice])

  useEffect(() => {
    setVisibleCount(80)
  }, [filter, query, sort, minPrice, maxPrice])

  const visibleItems = items.slice(0, visibleCount)

  async function buy(skin) {
    if (buying) return
    setBuying(skin.id)
    try {
      const data = await apiRequest('/api/buy-skin', {
        method: 'POST',
        token,
        body: { skinId: skin.id },
      })
      onUpdate(data)
      onToast(data.message, 'success')
    } catch (requestError) {
      onToast(requestError.message, 'error')
      if (requestError.data?.user) onUpdate(requestError.data)
    } finally {
      setBuying(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-[#030604]/85 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Магазин скинов"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex h-full w-full max-w-[1180px] flex-col overflow-hidden border border-white/[0.09] bg-[#0a100c] shadow-panel sm:h-auto sm:max-h-[92vh] sm:rounded-[26px]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-acid/20 bg-acid/[0.07] text-acid">
              <Icon name="bag" size={19} />
            </div>
            <div>
              <h2 className="font-display text-[17px] font-black tracking-[-0.035em] text-white sm:text-[20px]">
                Магазин скинов
              </h2>
              <div className="mt-0.5 text-[9px] font-semibold text-white/28">
                {catalog.length} предметов · реальные цены Standoff 2
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-lg border border-acid/15 bg-acid/[0.05] px-3 py-2 sm:flex">
              <Icon name="coin" size={13} className="text-acid" />
              <span className="text-[11px] font-extrabold tabular-nums text-white/80">{formatGold(balance)}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/42 transition hover:bg-white/[0.07] hover:text-white"
              aria-label="Закрыть"
            >
              <Icon name="x" size={17} />
            </button>
          </div>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-[310px]">
              <Icon name="search" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск предмета или оружия..."
                className="h-10 w-full rounded-xl border border-white/[0.08] bg-black/25 pl-9 pr-3 text-[11px] font-semibold text-white placeholder:text-white/20 transition focus:border-acid/40 focus:outline-none"
              />
            </div>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={cx(
                  'shrink-0 rounded-lg border px-2.5 py-1.5 text-[8px] font-extrabold transition',
                  filter === 'all'
                    ? 'border-acid/30 bg-acid/10 text-acid'
                    : 'border-white/[0.07] bg-white/[0.025] text-white/32 hover:text-white/60',
                )}
              >
                Все
              </button>
              {RARITY_ORDER.map((rarity) => {
                const meta = RARITY[rarity]
                return (
                  <button
                    key={rarity}
                    type="button"
                    onClick={() => setFilter(rarity)}
                    className={cx(
                      'shrink-0 rounded-lg border px-2.5 py-1.5 text-[8px] font-extrabold transition',
                      filter === rarity
                        ? 'bg-white/[0.06] text-white'
                        : 'border-white/[0.07] bg-white/[0.025] text-white/32 hover:text-white/60',
                    )}
                    style={
                      filter === rarity
                        ? { borderColor: `${meta.color}45`, color: meta.color }
                        : undefined
                    }
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <PriceSortControls
              sort={sort}
              onSortChange={setSort}
              minPrice={minPrice}
              maxPrice={maxPrice}
              onMinPriceChange={setMinPrice}
              onMaxPriceChange={setMaxPrice}
            />
            <span className="text-[8px] font-semibold text-white/24">
              Найдено {items.length} из {catalog.length}
            </span>
          </div>

          {items.length ? (
            <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleItems.map((skin) => {
                const meta = RARITY[skin.rarity] || RARITY.Common
                const isBuying = buying === skin.id
                const affordable = balance + 1e-9 >= skin.price
                return (
                  <article
                    key={skin.id}
                    className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] transition hover:border-white/[0.15] hover:bg-white/[0.035]"
                  >
                    <SkinVisual skin={skin} className="h-28 w-full" />
                    <div className="p-3">
                      <h3 className="truncate text-[10px] font-extrabold text-white">{skin.name}</h3>
                      <div className="mt-0.5 text-[8px] font-semibold text-white/26">{skin.weapon}</div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[7px] font-bold uppercase tracking-[0.1em] text-white/22">Цена</div>
                          <div className="mt-0.5 text-[11px] font-extrabold tabular-nums" style={{ color: meta.color }}>
                            {formatPrice(skin.price)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => buy(skin)}
                          disabled={!affordable || Boolean(buying)}
                          className={cx(
                            'flex items-center gap-1 rounded-lg border px-2.5 py-2 text-[8px] font-extrabold transition',
                            affordable
                              ? 'border-acid/25 bg-acid/[0.08] text-acid hover:bg-acid hover:text-[#041007]'
                              : 'cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-white/20',
                            buying && !isBuying && 'opacity-30',
                          )}
                        >
                          {isBuying ? (
                            <span className="spin-ring h-3 w-3 rounded-full border-2 border-current/30 border-t-current" />
                          ) : (
                            <Icon name={affordable ? 'plus' : 'lock'} size={11} />
                          )}
                          {affordable ? 'Купить' : 'Мало G'}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
              <Icon name="search" size={30} className="text-white/15" />
              <div className="mt-3 text-[12px] font-bold text-white/42">Ничего не найдено</div>
              <div className="mt-1 text-[9px] text-white/22">Измените запрос или фильтр редкости.</div>
            </div>
          )}

          {items.length > visibleCount && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setVisibleCount((value) => value + 80)}
                className="flex items-center gap-2 rounded-xl border border-acid/25 bg-acid/[0.07] px-5 py-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-acid transition hover:bg-acid/[0.14]"
              >
                <Icon name="plus" size={13} />
                Показать ещё 80
              </button>
              <span className="text-[8px] font-semibold text-white/22">
                Показано {Math.min(visibleCount, items.length)} из {items.length}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Donate & withdraw modals                                           */
/* ------------------------------------------------------------------ */

const DONATE_PRESETS = [100, 500, 1000, 3000]
const MAX_DEPOSIT = 10000000

function DonateModal({ balance, token, user, daily, event, onClose, onUpdate, onToast }) {
  const [amountInput, setAmountInput] = useState('500')
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const loading = phase !== 'idle'
  const unlimited = user?.role === 'admin' || user?.role === 'owner'
  const remaining = unlimited ? Infinity : Math.max(0, Number(daily?.remaining) || 0)
  const limit = Number(daily?.limit) || 15000
  const amount = Math.max(0, Math.floor(Number(amountInput) || 0))
  const eventPercent =
    user?.role === 'player' && event?.active ? Number(event.depositBonusPercent) || 0 : 0
  const promoPercent = Math.max(0, Number(user?.depositBoost?.percent) || 0)
  const eventBonus = Math.round(amount * (eventPercent / 100) * 100) / 100
  const promoBonus = Math.round(amount * (promoPercent / 100) * 100) / 100
  const bonus = Math.round((eventBonus + promoBonus) * 100) / 100
  const exceeds = !unlimited && amount > remaining + 1e-9
  const close = useCallback(() => onClose(), [onClose])
  useEscape(close)

  async function deposit() {
    if (loading) return
    setError('')
    setPhase('checking')
    // Имитация платёжного шлюза: показываем «Проверяем платёж» 1.5–2 секунды.
    await sleep(1500 + Math.random() * 500)
    if (exceeds) {
      const message = `Дневной лимит пополнения. Доступно сегодня ${formatGold(remaining)} из ${formatGold(limit)}. Уменьшите сумму или дождитесь сброса в 00:00.`
      setError(message)
      setPhase('idle')
      onToast(message, 'error')
      return
    }
    setPhase('crediting')
    try {
      const data = await apiRequest('/api/deposit', {
        method: 'POST',
        token,
        body: { amount },
      })
      onUpdate(data)
      playCoin()
      onToast(data.message, 'success', 'Платёж подтверждён')
    } catch (requestError) {
      setError(requestError.message)
      onToast(requestError.message, 'error')
      if (requestError.data?.daily) onUpdate(requestError.data)
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#030604]/85 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Донат"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="pop-in relative w-full max-w-[430px] overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#0d1510] shadow-panel">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-acid/12 blur-3xl" />
        <div className="relative p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-acid/20 bg-acid/[0.08] text-acid">
                <Icon name="wallet" size={20} />
              </div>
              <div>
                <div className="text-[8px] font-black uppercase tracking-[0.16em] text-acid/60">Demo top-up</div>
                <h2 className="mt-0.5 font-display text-[18px] font-black tracking-[-0.04em] text-white">Донат</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition hover:bg-white/[0.05] hover:text-white"
              aria-label="Закрыть"
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/30">Текущий баланс</span>
            <GoldBalance value={balance} className="text-[12px] text-acid" />
          </div>

          <div className="mt-2 rounded-xl border border-[#ffc857]/15 bg-[#ffc857]/[0.035] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[8px] font-black uppercase tracking-[0.12em] text-[#ffda8a]/70">
                Дневной лимит пополнения
              </span>
              <span className="text-[9px] font-extrabold tabular-nums text-[#ffda8a]">
                {unlimited ? 'Без лимита' : `${formatGold(remaining)} / ${formatGold(limit)}`}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#ffc857] to-[#ffe9a8] transition-all duration-500"
                style={{
                  width: unlimited ? '100%' : `${Math.min(100, (remaining / limit) * 100).toFixed(1)}%`,
                }}
              />
            </div>
            <div className="mt-1.5 text-[7.5px] font-semibold leading-relaxed text-white/25">
              {unlimited
                ? 'Аккаунт пополняется без дневных ограничений.'
                : `Сегодня можно пополнить ещё ${formatGold(remaining)}. Лимит сбрасывается в 00:00.`}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {DONATE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmountInput(String(preset))}
                className={cx(
                  'relative overflow-hidden rounded-xl border p-3 text-left transition',
                  amount === preset
                    ? 'border-acid/40 bg-acid/[0.07]'
                    : 'border-white/[0.07] bg-white/[0.025] hover:border-white/[0.15]',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-acid/10 text-acid">
                    <Icon name="coin" size={13} />
                  </span>
                  <span className="font-display text-[15px] font-black tracking-[-0.03em] text-white">
                    {new Intl.NumberFormat('ru-RU').format(preset)}
                  </span>
                  <span className="text-[9px] font-bold text-white/30">G</span>
                </div>
                <div className="mt-1.5 text-[8px] font-bold uppercase tracking-[0.1em] text-white/22">
                  {preset === 100 ? 'Стартовый' : preset === 500 ? 'Базовый' : preset === 1000 ? 'Плюс' : 'Про'}
                </div>
                {amount === preset && (
                  <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-acid text-[#041007]">
                    <Icon name="check" size={9} strokeWidth={3} />
                  </span>
                )}
              </button>
            ))}
          </div>

          <label className="mt-3 block">
            <span className="mb-1.5 block text-[8px] font-black uppercase tracking-[0.14em] text-white/35">
              Своя сумма
            </span>
            <div className="relative">
              <Icon name="coin" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-acid/55" />
              <input
                inputMode="numeric"
                value={amountInput}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '').slice(0, 7)
                  setAmountInput(digits ? String(Math.min(MAX_DEPOSIT, Number(digits))) : '')
                }}
                placeholder="Например, 750"
                aria-label="Своя сумма пополнения"
                className="h-11 w-full rounded-xl border border-white/[0.09] bg-black/25 pl-10 pr-10 text-[12px] font-semibold tabular-nums text-white placeholder:text-white/20 transition focus:border-acid/45 focus:bg-black/35 focus:outline-none"
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/30">G</span>
            </div>
            {exceeds && (
              <div className="mt-1.5 text-[8px] font-semibold text-[#ff9aac]">
                Сегодня доступно {formatGold(remaining, false)}
              </div>
            )}
          </label>

          {eventPercent > 0 && amount > 0 && (
            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-[#9fdcff]/20 bg-[#9fdcff]/[0.06] px-3 py-2">
              <span className="flex items-center gap-1.5 text-[8px] font-bold text-[#d8f4ff]">
                <Icon name="snowflake" size={12} className="text-[#bfe9ff]" />
                Зимний бонус +{eventPercent}%
              </span>
              <span className="text-[9px] font-black tabular-nums text-[#d8f4ff]">
                +{formatGold(eventBonus, false)}
              </span>
            </div>
          )}

          {promoPercent > 0 && amount > 0 && (
            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-[#ffcf4d]/25 bg-[#ffcf4d]/[0.07] px-3 py-2">
              <span className="flex min-w-0 items-center gap-1.5 text-[8px] font-bold text-[#ffe6a3]">
                <Icon name="ticket" size={12} className="shrink-0 text-[#ffcf4d]" />
                <span className="truncate">
                  Промокод +{promoPercent}%{user?.depositBoost?.code ? ` · ${user.depositBoost.code}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-[9px] font-black tabular-nums text-[#ffe6a3]">
                +{formatGold(promoBonus, false)}
              </span>
            </div>
          )}

          {bonus > 0 && amount > 0 && (
            <div className="mt-1.5 text-right text-[8px] font-bold tabular-nums text-white/35">
              Итого к зачислению: {formatGold(amount + bonus, false)}
            </div>
          )}

          <button
            type="button"
            onClick={deposit}
            disabled={loading || amount <= 0}
            className="btn-acid mt-4 w-full !py-3.5"
          >
            {phase === 'checking' ? (
              <>
                <span className="spin-ring h-4 w-4 rounded-full border-2 border-[#041007]/30 border-t-[#041007]" />
                Проверяем платёж...
              </>
            ) : phase === 'crediting' ? (
              <>
                <span className="spin-ring h-4 w-4 rounded-full border-2 border-[#041007]/30 border-t-[#041007]" />
                Зачисляем голду...
              </>
            ) : amount > 0 ? (
              <>
                <Icon name="plus" size={15} strokeWidth={2.6} />
                Пополнить на {formatGold(amount, false)}
                {bonus > 0 ? ` + ${formatGold(bonus, false)}` : ''}
              </>
            ) : (
              'Введите сумму'
            )}
          </button>

          {error && (
            <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-[#ff7189]/25 bg-[#ff7189]/[0.06] px-3 py-2.5 text-[8px] font-semibold leading-relaxed text-[#ff9aac]">
              <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#ffc857]/15 bg-[#ffc857]/[0.04] p-3 text-[8px] leading-relaxed text-[#ffda8a]/65">
            <Icon name="info" size={12} className="mt-0.5 shrink-0" />
            Демо-режим: реальные платежи не проводятся. После нажатия «Пополнить» мы имитируем проверку платежа
            (1.5–2 сек) и зачисляем голду{unlimited ? ' без дневного лимита.' : ', если дневной лимит не превышен.'}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Settings modal                                                     */
/* ------------------------------------------------------------------ */

function SettingToggle({ icon, title, description, active, onToggle }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-black/20 text-white/40">
        <Icon name={icon} size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-extrabold text-white/75">{title}</div>
        <div className="mt-0.5 text-[8px] font-semibold text-white/28">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={title}
        onClick={onToggle}
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full border transition',
          active ? 'border-acid/40 bg-acid/25' : 'border-white/[0.12] bg-white/[0.05]',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 rounded-full transition-all duration-200',
            active ? 'left-[22px] bg-acid' : 'left-0.5 bg-white/45',
          )}
          style={{ height: 18, width: 18 }}
        />
      </button>
    </div>
  )
}

const APPLICATION_TYPE_META = {
  admin: { label: 'Админка', icon: 'shield', color: '#7bdcff' },
  gold: { label: 'Голда', icon: 'coin', color: '#35ff87' },
  promo: { label: 'Промокод', icon: 'ticket', color: '#ffcf4d' },
}

const APPLICATION_STATUS_META = {
  pending: {
    label: 'На рассмотрении',
    className: 'border-[#ffcf4d]/25 bg-[#ffcf4d]/[0.08] text-[#ffe6a3]',
  },
  approved: {
    label: 'Одобрена',
    className: 'border-acid/25 bg-acid/[0.08] text-acid',
  },
  rejected: {
    label: 'Отклонена',
    className: 'border-[#ff5d7a]/25 bg-[#ff5d7a]/[0.08] text-[#ff9aac]',
  },
}

function ApplicationStatus({ status }) {
  const meta = APPLICATION_STATUS_META[status] || APPLICATION_STATUS_META.pending
  return (
    <span
      className={cx(
        'rounded-md border px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em]',
        meta.className,
      )}
    >
      {meta.label}
    </span>
  )
}

function ApplicationPromoDetails({ promo }) {
  if (!promo) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="rounded-md border border-[#ffcf4d]/25 bg-[#ffcf4d]/[0.07] px-2 py-1 text-[8px] font-extrabold tabular-nums text-[#ffe6a3]">
        {promo.type === 'deposit_percent'
          ? `+${promo.percent}% к пополнению`
          : `+${formatGold(promo.amount)}`}
      </span>
      <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[8px] font-bold text-white/45">
        активаций: {promo.maxUses}
      </span>
      {promo.code && (
        <span className="rounded-md border border-white/[0.1] bg-black/25 px-2 py-1 font-mono text-[8px] font-bold tracking-[0.06em] text-white/70">
          {promo.code}
        </span>
      )}
    </div>
  )
}

function ApplicationsSection({ applications, user, token, onUpdate, onToast }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [adminMessage, setAdminMessage] = useState('')
  const [goldAmount, setGoldAmount] = useState('15000')
  const [promoType, setPromoType] = useState('gold')
  const [promoCode, setPromoCode] = useState('')
  const [promoAmount, setPromoAmount] = useState('1000')
  const [promoPercent, setPromoPercent] = useState('10')
  const [promoMaxUses, setPromoMaxUses] = useState('100')

  const isOwner = user.role === 'owner'
  const isAdmin = user.role === 'admin'
  const isPlayer = user.role === 'player'
  const mine = applications?.mine || []
  const pending = applications?.pending || []
  const history = applications?.history || []
  const dailyRemaining = Number(
    applications?.dailyRemaining ?? user.dailyLimit?.remaining ?? 0,
  )
  const maxGoldRequest = Number(applications?.maxGoldRequest) || 100000
  const pendingAdmin = mine.find((item) => item.type === 'admin' && item.status === 'pending')
  const pendingGold = mine.find((item) => item.type === 'gold' && item.status === 'pending')
  const pendingPromo = mine.find((item) => item.type === 'promo' && item.status === 'pending')
  const security = applications?.security || null

  async function submitApplication(type, payload = {}) {
    if (busy) return
    setBusy(type)
    setError('')
    try {
      const data = await apiRequest('/api/applications', {
        method: 'POST',
        token,
        body: { type, ...payload },
      })
      onUpdate({ applications: data.applications })
      onToast(data.message, 'success', 'Заявка отправлена')
    } catch (requestError) {
      setError(requestError.message)
      onToast(requestError.message, 'error')
    } finally {
      setBusy('')
    }
  }

  async function reviewApplication(id, action) {
    if (busy) return
    setBusy(`${id}:${action}`)
    setError('')
    try {
      const data = await apiRequest(`/api/applications/${id}/${action}`, {
        method: 'POST',
        token,
      })
      onUpdate({ applications: data.applications, promos: data.promos })
      onToast(data.message, 'success', action === 'approve' ? 'Заявка одобрена' : 'Заявка отклонена')
    } catch (requestError) {
      setError(requestError.message)
      onToast(requestError.message, 'error')
    } finally {
      setBusy('')
    }
  }

  async function unbanUser(id) {
    if (busy) return
    setBusy(`unban:${id}`)
    setError('')
    try {
      const data = await apiRequest(`/api/admin/users/${id}/unban`, {
        method: 'POST',
        token,
      })
      onUpdate({ applications: data.applications })
      onToast(data.message, 'success', 'Аккаунт разбанен')
    } catch (requestError) {
      setError(requestError.message)
      onToast(requestError.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const pendingCounts = pending.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1
    return acc
  }, {})

  return (
    <section id="requests" className="pt-10 sm:pt-14">
      <SectionHeading
        eyebrow="REQUESTS"
        title="Центр заявок"
        description={
          isOwner
            ? 'Заявки на админку, голду и промокоды. Одобряй или отклоняй — изменения сразу применяются.'
            : isAdmin
              ? 'Отправь владельцу заявку на создание промокода и следи за статусом.'
              : 'Заявка на админку и запрос голды после исчерпания дневного лимита — всё здесь.'
        }
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#ff7189]/20 bg-[#ff7189]/[0.06] p-3 text-[9px] leading-relaxed text-[#ff9aac]">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {isOwner ? (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              ['admin', 'Админка'],
              ['gold', 'Голда'],
              ['promo', 'Промокоды'],
            ].map(([type, label]) => (
              <div
                key={type}
                className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
              >
                <div className="text-[8px] font-black uppercase tracking-[0.12em] text-white/30">
                  {label}
                </div>
                <div className="mt-1 font-display text-[20px] font-black text-white">
                  {pendingCounts[type] || 0}
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(155deg,#0e1714,#090d0b)]">
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-white/50">
                Ожидают решения · {pending.length}
              </div>
              <span className="text-[8px] font-semibold text-white/25">
                Одобрение сразу меняет роль, баланс или создаёт промокод
              </span>
            </div>

            {pending.length ? (
              <div className="grid gap-3 p-3 lg:grid-cols-2">
                {pending.map((application) => {
                  const meta = APPLICATION_TYPE_META[application.type]
                  return (
                    <div
                      key={application.id}
                      className="rounded-2xl border border-white/[0.08] bg-black/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                            style={{
                              borderColor: `${meta.color}33`,
                              backgroundColor: `${meta.color}12`,
                              color: meta.color,
                            }}
                          >
                            <Icon name={meta.icon} size={17} />
                          </span>
                          <div className="min-w-0">
                            <div className="text-[8px] font-black uppercase tracking-[0.14em] text-white/35">
                              {meta.label}
                            </div>
                            <div className="mt-0.5 truncate text-[12px] font-extrabold text-white">
                              {application.username}
                            </div>
                            <div className="mt-0.5 text-[8px] font-semibold text-white/25">
                              {formatWhen(application.createdAt)}
                            </div>
                          </div>
                        </div>
                        <ApplicationStatus status={application.status} />
                      </div>

                      {application.type === 'admin' && application.message && (
                        <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-[9px] leading-relaxed text-white/45">
                          {application.message}
                        </p>
                      )}

                      {application.type === 'gold' && (
                        <div className="mt-3 rounded-xl border border-acid/15 bg-acid/[0.05] p-2.5 text-[11px] font-extrabold tabular-nums text-acid">
                          Запрос: +{formatGold(application.amount)}
                        </div>
                      )}

                      {application.type === 'promo' && (
                        <ApplicationPromoDetails promo={application.promo} />
                      )}

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => reviewApplication(application.id, 'approve')}
                          className="flex-1 rounded-lg border border-acid/30 bg-acid/[0.09] px-3 py-2 text-[8px] font-black uppercase tracking-[0.1em] text-acid transition hover:bg-acid/[0.16] disabled:opacity-40"
                        >
                          {busy === `${application.id}:approve` ? 'Применяем...' : 'Одобрить'}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => reviewApplication(application.id, 'reject')}
                          className="rounded-lg border border-[#ff5d7a]/25 bg-[#ff5d7a]/[0.06] px-3 py-2 text-[8px] font-black uppercase tracking-[0.1em] text-[#ff9aac] transition hover:bg-[#ff5d7a]/[0.12] disabled:opacity-40"
                        >
                          Отклонить
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="px-4 py-10 text-center text-[10px] font-semibold text-white/30">
                Новых заявок нет. Как только кто-то отправит — появится здесь.
              </div>
            )}
          </div>

          <div className="mt-3 overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.018]">
            <div className="border-b border-white/[0.06] px-4 py-2.5 text-[8px] font-black uppercase tracking-[0.14em] text-white/35">
              История решений · {history.length}
            </div>
            {history.length ? (
              <div className="divide-y divide-white/[0.05]">
                {history.slice(0, 30).map((application) => {
                  const meta = APPLICATION_TYPE_META[application.type]
                  return (
                    <div key={application.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                      <span style={{ color: meta.color }}>
                        <Icon name={meta.icon} size={13} />
                      </span>
                      <span className="text-[10px] font-bold text-white/70">{application.username}</span>
                      <span className="text-[8px] font-semibold text-white/28">{meta.label}</span>
                      <ApplicationStatus status={application.status} />
                      {application.result?.amount ? (
                        <span className="text-[8px] font-bold tabular-nums text-acid">
                          +{formatGold(application.result.amount)}
                        </span>
                      ) : null}
                      {application.result?.promoCode ? (
                        <span className="font-mono text-[8px] font-bold text-[#ffe6a3]">
                          {application.result.promoCode}
                        </span>
                      ) : null}
                      <span className="ml-auto text-[8px] font-semibold text-white/25">
                        {formatWhen(application.reviewedAt || application.createdAt)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-[9px] font-semibold text-white/25">
                Решений пока нет.
              </div>
            )}
          </div>

          {security && (
            <div className="mt-3 overflow-hidden rounded-[22px] border border-[#ff5d7a]/15 bg-[#120d0f]/70">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
                <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.14em] text-[#ff9aac]">
                  <Icon name="shield" size={13} />
                  Безопасность · анти-DDoS
                </div>
                <span className="text-[8px] font-semibold text-white/30">
                  В бане: {security.banned?.length || 0} · IP в блоке: {security.blockedCount || 0}
                </span>
              </div>

              {security.banned?.length ? (
                <div className="divide-y divide-white/[0.05]">
                  {security.banned.map((entry) => (
                    <div key={entry.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#ff5d7a]/25 bg-[#ff5d7a]/[0.08] text-[#ff9aac]">
                        <Icon name="user" size={13} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[10px] font-extrabold text-white/80">{entry.username}</div>
                        <div className="mt-0.5 text-[8px] font-semibold text-white/30">
                          {entry.banReason || 'Подозрительная активность'}
                        </div>
                      </div>
                      <span className="rounded-md border border-[#ff5d7a]/25 bg-[#ff5d7a]/[0.08] px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em] text-[#ff9aac]">
                        {entry.role === 'admin' ? 'ADMIN' : 'PLAYER'}
                      </span>
                      {(entry.bannedIps || []).length > 0 && (
                        <span className="font-mono text-[7px] font-semibold text-white/25">
                          {entry.bannedIps.join(', ')}
                        </span>
                      )}
                      <span className="ml-auto text-[8px] font-semibold text-white/22">
                        {entry.bannedAt ? formatWhen(entry.bannedAt) : '—'}
                      </span>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => unbanUser(entry.id)}
                        className="rounded-lg border border-acid/25 bg-acid/[0.07] px-2.5 py-1.5 text-[7px] font-black uppercase tracking-[0.08em] text-acid transition hover:bg-acid/[0.14] disabled:opacity-40"
                      >
                        {busy === `unban:${entry.id}` ? '...' : 'Разбанить'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-5 text-center text-[9px] font-semibold text-white/25">
                  Заблокированных аккаунтов нет.
                </div>
              )}

              {security.limits && (
                <div className="border-t border-white/[0.05] px-4 py-2 text-[7px] font-semibold leading-relaxed text-white/22">
                  Автобан: {security.limits.accountIpLimit}+ IP за {security.limits.windowMinutes} мин.
                  IP-блок: {security.limits.ipViolationLimit} нарушений за 5 мин на{' '}
                  {security.limits.ipBlockMinutes} мин.
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {isPlayer && (
            <div className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(155deg,#0e1714,#090d0b)] p-4 sm:p-5">
              <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#7bdcff]/10 blur-3xl" />
              <div className="relative flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#7bdcff]/25 bg-[#7bdcff]/[0.08] text-[#7bdcff]">
                  <Icon name="shield" size={16} />
                </span>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70">
                    Заявка на админку
                  </div>
                  <div className="text-[8px] font-semibold text-white/30">
                    Владелец рассмотрит и выдаст роль вручную
                  </div>
                </div>
              </div>

              {pendingAdmin ? (
                <div className="relative mt-3 rounded-xl border border-[#ffcf4d]/20 bg-[#ffcf4d]/[0.06] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-bold text-[#ffe6a3]">
                      Заявка уже отправлена
                    </span>
                    <ApplicationStatus status={pendingAdmin.status} />
                  </div>
                  <div className="mt-1 text-[8px] font-semibold text-white/30">
                    {formatWhen(pendingAdmin.createdAt)}
                  </div>
                </div>
              ) : applications?.can?.admin ? (
                <>
                  <textarea
                    value={adminMessage}
                    onChange={(event) => setAdminMessage(event.target.value)}
                    maxLength={300}
                    rows={3}
                    placeholder="Почему вам нужна админка? Пара предложений."
                    className="relative mt-3 w-full resize-none rounded-xl border border-white/[0.09] bg-black/30 px-3 py-2.5 text-[10px] font-semibold text-white placeholder:text-white/20 focus:border-[#7bdcff]/40 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy === 'admin'}
                    onClick={() => submitApplication('admin', { message: adminMessage })}
                    className="relative mt-2 w-full rounded-xl border border-[#7bdcff]/30 bg-[#7bdcff]/[0.09] px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-[#bfe9ff] transition hover:bg-[#7bdcff]/[0.16] disabled:opacity-40"
                  >
                    {busy === 'admin' ? 'Отправляем...' : 'Отправить заявку'}
                  </button>
                </>
              ) : (
                <div className="relative mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[9px] leading-relaxed text-white/35">
                  {user.role === 'admin'
                    ? 'У вас уже есть админка.'
                    : 'Заявка недоступна: вы уже отправили её или у вас другая роль.'}
                </div>
              )}
            </div>
          )}

          {isPlayer && (
            <div className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(155deg,#14110b,#0a0d09)] p-4 sm:p-5">
              <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-acid/10 blur-3xl" />
              <div className="relative flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-acid/25 bg-acid/[0.08] text-acid">
                  <Icon name="coin" size={16} />
                </span>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70">
                    Заявка на голду
                  </div>
                  <div className="text-[8px] font-semibold text-white/30">
                    Доступна после исчерпания дневного лимита
                  </div>
                </div>
              </div>

              {pendingGold ? (
                <div className="relative mt-3 rounded-xl border border-[#ffcf4d]/20 bg-[#ffcf4d]/[0.06] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-bold text-[#ffe6a3]">
                      Запрос на {formatGold(pendingGold.amount)} отправлен
                    </span>
                    <ApplicationStatus status={pendingGold.status} />
                  </div>
                  <div className="mt-1 text-[8px] font-semibold text-white/30">
                    {formatWhen(pendingGold.createdAt)}
                  </div>
                </div>
              ) : dailyRemaining > 0 ? (
                <div className="relative mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[9px] leading-relaxed text-white/35">
                  Дневной лимит ещё не исчерпан. Осталось{' '}
                  <span className="font-bold text-white/60">{formatGold(dailyRemaining)}</span>.
                  Заявка станет доступна, когда лимит закончится.
                </div>
              ) : applications?.can?.gold ? (
                <>
                  <label className="relative mt-3 block">
                    <span className="mb-1 block text-[7px] font-black uppercase tracking-[0.12em] text-white/28">
                      Сколько голды нужно
                    </span>
                    <input
                      value={goldAmount}
                      onChange={(event) => setGoldAmount(event.target.value.replace(/[^0-9]/g, ''))}
                      inputMode="numeric"
                      placeholder="15000"
                      className="h-10 w-full rounded-xl border border-white/[0.09] bg-black/30 px-3 text-[11px] font-bold tabular-nums text-white focus:border-acid/40 focus:outline-none"
                    />
                  </label>
                  <div className="relative mt-1 text-[8px] font-semibold text-white/25">
                    Максимум за одну заявку: {formatGold(maxGoldRequest)}
                  </div>
                  <button
                    type="button"
                    disabled={busy === 'gold'}
                    onClick={() => submitApplication('gold', { amount: Number(goldAmount) })}
                    className="relative mt-2 w-full rounded-xl border border-acid/30 bg-acid/[0.09] px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-acid transition hover:bg-acid/[0.16] disabled:opacity-40"
                  >
                    {busy === 'gold' ? 'Отправляем...' : 'Отправить заявку'}
                  </button>
                </>
              ) : (
                <div className="relative mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[9px] leading-relaxed text-white/35">
                  У вас уже есть активная заявка на голду.
                </div>
              )}
            </div>
          )}

          {isAdmin && (
            <div className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(155deg,#14110b,#0a0d09)] p-4 sm:p-5 lg:col-span-2">
              <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#ffcf4d]/10 blur-3xl" />
              <div className="relative flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#ffcf4d]/25 bg-[#ffcf4d]/[0.08] text-[#ffcf4d]">
                  <Icon name="ticket" size={16} />
                </span>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70">
                    Заявка на создание промокода
                  </div>
                  <div className="text-[8px] font-semibold text-white/30">
                    Уходит владельцу. После одобрения промокод появится автоматически
                  </div>
                </div>
              </div>

              {pendingPromo ? (
                <div className="relative mt-3 rounded-xl border border-[#ffcf4d]/20 bg-[#ffcf4d]/[0.06] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[9px] font-bold text-[#ffe6a3]">
                      Заявка на промокод уже отправлена
                    </span>
                    <ApplicationStatus status={pendingPromo.status} />
                  </div>
                  <ApplicationPromoDetails promo={pendingPromo.promo} />
                </div>
              ) : applications?.can?.promo ? (
                <div className="relative mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-1">
                    {[
                      ['gold', 'Голда'],
                      ['deposit_percent', '% к пополнению'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPromoType(value)}
                        className={cx(
                          'rounded-lg px-2 py-1.5 text-[8px] font-black uppercase tracking-[0.08em] transition',
                          promoType === value
                            ? 'bg-[#ffcf4d] text-[#241a00]'
                            : 'text-white/35 hover:bg-white/[0.05] hover:text-white/65',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[7px] font-black uppercase tracking-[0.12em] text-white/28">
                        Код (пусто = авто)
                      </span>
                      <input
                        value={promoCode}
                        onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
                        placeholder={promoType === 'deposit_percent' ? 'BOOST10' : 'WINTER2026'}
                        maxLength={24}
                        className="h-9 w-full rounded-lg border border-white/[0.09] bg-black/30 px-2.5 text-[10px] font-bold uppercase tracking-[0.06em] text-white placeholder:text-white/20 focus:border-[#ffcf4d]/40 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[7px] font-black uppercase tracking-[0.12em] text-white/28">
                        {promoType === 'deposit_percent' ? 'Процент, %' : 'Награда, G'}
                      </span>
                      <input
                        value={promoType === 'deposit_percent' ? promoPercent : promoAmount}
                        onChange={(event) => {
                          const value = event.target.value
                            .replace(/[^0-9]/g, '')
                            .slice(0, promoType === 'deposit_percent' ? 3 : 7)
                          if (promoType === 'deposit_percent') setPromoPercent(value)
                          else setPromoAmount(value)
                        }}
                        inputMode="numeric"
                        placeholder={promoType === 'deposit_percent' ? '10' : '1000'}
                        className="h-9 w-full rounded-lg border border-white/[0.09] bg-black/30 px-2.5 text-[10px] font-bold tabular-nums text-white placeholder:text-white/20 focus:border-[#ffcf4d]/40 focus:outline-none"
                      />
                    </label>
                  </div>

                  <div className="flex items-end gap-2">
                    <label className="block w-28">
                      <span className="mb-1 block text-[7px] font-black uppercase tracking-[0.12em] text-white/28">
                        Активаций
                      </span>
                      <input
                        value={promoMaxUses}
                        onChange={(event) =>
                          setPromoMaxUses(event.target.value.replace(/[^0-9]/g, ''))
                        }
                        inputMode="numeric"
                        className="h-9 w-full rounded-lg border border-white/[0.09] bg-black/30 px-2.5 text-[10px] font-bold tabular-nums text-white focus:border-[#ffcf4d]/40 focus:outline-none"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy === 'promo'}
                      onClick={() =>
                        submitApplication('promo', {
                          promo: {
                            type: promoType,
                            amount: Number(promoAmount) || 0,
                            percent: Number(promoPercent) || 0,
                            maxUses: Number(promoMaxUses) || 0,
                            code: promoCode.trim() || undefined,
                          },
                        })
                      }
                      className="h-9 flex-1 rounded-lg border border-[#ffcf4d]/35 bg-[#ffcf4d]/12 text-[9px] font-black uppercase tracking-[0.08em] text-[#ffe6a3] transition hover:bg-[#ffcf4d]/20 disabled:opacity-40"
                    >
                      {busy === 'promo' ? 'Отправляем...' : 'Отправить заявку'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[9px] leading-relaxed text-white/35">
                  У вас уже есть активная заявка на промокод.
                </div>
              )}
            </div>
          )}

          {!isPlayer && !isAdmin && (
            <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.02] p-4 text-[10px] text-white/35 lg:col-span-2">
              Для вашей роли заявки не требуются.
            </div>
          )}
        </div>
      )}

      {!isOwner && (
        <div className="mt-3 overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.018]">
          <div className="border-b border-white/[0.06] px-4 py-2.5 text-[8px] font-black uppercase tracking-[0.14em] text-white/35">
            Мои заявки · {mine.length}
          </div>
          {mine.length ? (
            <div className="divide-y divide-white/[0.05]">
              {mine.slice(0, 30).map((application) => {
                const meta = APPLICATION_TYPE_META[application.type]
                return (
                  <div key={application.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <span style={{ color: meta.color }}>
                      <Icon name={meta.icon} size={13} />
                    </span>
                    <span className="text-[10px] font-bold text-white/70">{meta.label}</span>
                    <ApplicationStatus status={application.status} />
                    {application.type === 'gold' && (
                      <span className="text-[8px] font-bold tabular-nums text-white/45">
                        {formatGold(application.amount)}
                      </span>
                    )}
                    {application.type === 'promo' && application.promo && (
                      <span className="font-mono text-[8px] font-bold text-[#ffe6a3]">
                        {application.promo.code || 'авто'}
                      </span>
                    )}
                    {application.result?.promoCode && (
                      <span className="font-mono text-[8px] font-bold text-acid">
                        {application.result.promoCode}
                      </span>
                    )}
                    {application.result?.amount ? (
                      <span className="text-[8px] font-bold tabular-nums text-acid">
                        +{formatGold(application.result.amount)}
                      </span>
                    ) : null}
                    {application.status === 'rejected' && application.reviewNote && (
                      <span className="text-[8px] font-semibold text-[#ff9aac]/70">
                        {application.reviewNote}
                      </span>
                    )}
                    <span className="ml-auto text-[8px] font-semibold text-white/25">
                      {formatWhen(application.reviewedAt || application.createdAt)}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-[9px] font-semibold text-white/25">
              Вы ещё не отправляли заявки.
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function SettingsSection({
  user,
  token,
  soundOn,
  fast,
  onToggleSound,
  onToggleFast,
  onLogout,
  onStore,
  onPasswordChanged,
  onToast,
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordOk, setPasswordOk] = useState('')
  const roleLabel =
    user.role === 'owner'
      ? 'Владелец проекта'
      : user.role === 'admin'
        ? 'Скрытый администратор'
        : 'Player account'
  const roleTag = user.role === 'owner' ? 'OWNER' : user.role === 'admin' ? 'ADMIN' : 'PLAYER'

  async function changePassword(event) {
    event.preventDefault()
    if (changingPassword) return
    setPasswordError('')
    setPasswordOk('')

    if (newPassword.length < 8) {
      setPasswordError('Новый пароль должен быть не короче 8 символов')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Новые пароли не совпадают')
      return
    }

    setChangingPassword(true)
    try {
      const data = await apiRequest('/api/account/password', {
        method: 'POST',
        token,
        body: { currentPassword, newPassword },
      })
      onPasswordChanged?.(data.token)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordOk(data.message || 'Пароль изменён')
      onToast?.(data.message || 'Пароль изменён', 'success', 'Безопасность')
    } catch (requestError) {
      setPasswordError(requestError.message)
      onToast?.(requestError.message, 'error')
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <section id="settings" className="pt-10 sm:pt-14">
      <SectionHeading
        eyebrow="ACCOUNT SETTINGS"
        title="Настройки"
        description="Профиль, звук, скорость анимаций и выход из аккаунта — всё в одном разделе."
      />

      <div className="grid gap-3 lg:grid-cols-[1.05fr_.95fr]">
        <div className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(155deg,#0e1714,#090d0b)] p-4 sm:p-5">
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-acid/10 blur-3xl" />
          <div className="relative flex items-center justify-between gap-2">
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">Аккаунт</div>
            <span className="rounded-md border border-lime/25 bg-lime/10 px-1.5 py-1 text-[8px] font-black tracking-[0.12em] text-lime">
              {roleTag}
            </span>
          </div>

          <div className="relative mt-3 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-acid/20 bg-acid/[0.07] text-sm font-extrabold uppercase text-acid">
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(53,255,135,.2),transparent_70%)]" />
              <span className="relative">{user.username.slice(0, 1)}</span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-extrabold text-white">{user.username}</div>
              <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-white/30">
                {roleLabel}
              </div>
            </div>
          </div>

          <div className="relative mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
              <div className="text-[8px] uppercase tracking-[0.14em] text-white/28">Баланс</div>
              <div className="mt-1 text-[12px] font-extrabold tabular-nums text-acid">
                {formatGold(user.balance)}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
              <div className="text-[8px] uppercase tracking-[0.14em] text-white/28">Скины</div>
              <div className="mt-1 text-[12px] font-extrabold tabular-nums text-white/75">
                {user.inventory.length}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onStore}
            className="relative mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-acid/25 bg-acid/[0.07] px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-acid transition hover:bg-acid/[0.12]"
          >
            <Icon name="bag" size={14} />
            Магазин скинов
          </button>
        </div>

        <div className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(155deg,#14110b,#0a0d09)] p-4 sm:p-5">
          <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-[#ffcf4d]/10 blur-3xl" />
          <div className="relative text-[9px] font-black uppercase tracking-[0.14em] text-white/40">
            Настройки аккаунта
          </div>

          <div className="relative mt-3 space-y-2">
            <SettingToggle
              icon={soundOn ? 'volume' : 'volumeOff'}
              title="Звук интерфейса"
              description={soundOn ? 'Звуки кейсов и апгрейдов включены' : 'Все звуки выключены'}
              active={soundOn}
              onToggle={onToggleSound}
            />
            <SettingToggle
              icon="bolt"
              title="Быстрые анимации"
              description={fast ? 'Короткие анимации (~0.5 сек)' : 'Полные анимации (3.5 сек)'}
              active={fast}
              onToggle={onToggleFast}
            />
            <button
              type="button"
              onClick={() => {
                unlockAudio()
                playCoin()
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-[8px] font-black uppercase tracking-[0.1em] text-white/45 transition hover:border-acid/25 hover:text-acid"
            >
              <Icon name="volume" size={13} />
              Проверить звук
            </button>
          </div>

          <div className="relative mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[8px] leading-relaxed text-white/27">
            Выход завершит текущую сессию на этом устройстве. Баланс и инвентарь сохранятся на сервере — можно
            войти снова в любой момент.
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="relative mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#ff5d7a]/25 bg-[#ff5d7a]/[0.07] px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#ff9aac] transition hover:border-[#ff5d7a]/40 hover:bg-[#ff5d7a]/[0.12]"
          >
            <Icon name="logout" size={15} />
            Выйти из аккаунта
          </button>
        </div>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(155deg,#0e1714,#090d0b)] p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#7bdcff]/10 blur-3xl" />
        <div className="relative flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#7bdcff]/25 bg-[#7bdcff]/[0.08] text-[#7bdcff]">
            <Icon name="lock" size={16} />
          </span>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70">
              Смена пароля
            </div>
            <div className="text-[8px] font-semibold text-white/30">
              После смены остальные сессии завершатся
            </div>
          </div>
        </div>

        <form onSubmit={changePassword} className="relative mt-3 grid gap-2 sm:grid-cols-3">
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
            placeholder="Текущий пароль"
            className="h-10 w-full rounded-xl border border-white/[0.09] bg-black/30 px-3 text-[10px] font-semibold text-white placeholder:text-white/20 focus:border-[#7bdcff]/40 focus:outline-none"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Новый пароль (мин. 8)"
            className="h-10 w-full rounded-xl border border-white/[0.09] bg-black/30 px-3 text-[10px] font-semibold text-white placeholder:text-white/20 focus:border-[#7bdcff]/40 focus:outline-none"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Повтори новый пароль"
            className="h-10 w-full rounded-xl border border-white/[0.09] bg-black/30 px-3 text-[10px] font-semibold text-white placeholder:text-white/20 focus:border-[#7bdcff]/40 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
            <button
              type="submit"
              disabled={changingPassword}
              className="rounded-xl border border-[#7bdcff]/30 bg-[#7bdcff]/[0.09] px-4 py-2.5 text-[8px] font-black uppercase tracking-[0.1em] text-[#bfe9ff] transition hover:bg-[#7bdcff]/[0.16] disabled:opacity-40"
            >
              {changingPassword ? 'Меняем...' : 'Изменить пароль'}
            </button>
            {passwordError && (
              <span className="text-[8px] font-semibold text-[#ff9aac]">{passwordError}</span>
            )}
            {passwordOk && (
              <span className="text-[8px] font-semibold text-acid">{passwordOk}</span>
            )}
          </div>
        </form>
      </div>
    </section>
  )
}

function WithdrawModal({ skin, onClose }) {
  const close = useCallback(() => onClose(), [onClose])
  useEscape(close)
  if (!skin) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#030604]/85 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Вывод предметов"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="pop-in relative w-full max-w-[410px] overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#0d1510] p-5 shadow-panel sm:p-6">
        <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-[#ffc857]/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#ffc857]/20 bg-[#ffc857]/[0.07] text-[#ffc857]">
              <Icon name="lock" size={21} />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition hover:bg-white/[0.05] hover:text-white"
              aria-label="Закрыть"
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <h2 className="mt-4 font-display text-[19px] font-black tracking-[-0.04em] text-white">
            Вывод недоступен
          </h2>
          <p className="mt-2 text-[11px] leading-relaxed text-white/42">
            В демо-режиме STAND GRADE вывод предметов в игру отключен.
          </p>

          <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-2.5">
            <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-white/[0.08]">
              <SkinVisual skin={skin} className="h-full w-full" showRarity={false} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[10px] font-extrabold text-white/80">{skin.name}</div>
              <div className="mt-0.5 text-[8px] font-semibold text-white/25">{skin.weapon}</div>
              <div className="mt-1 text-[9px] font-extrabold text-[#ffc857]">{formatPrice(skin.price)}</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[8px] leading-relaxed text-white/27">
            Предмет останется в вашем инвентаре. Его можно продать за голду или использовать в апгрейде.
          </div>

          <button type="button" onClick={onClose} className="btn-acid mt-4 w-full !py-3">
            Понятно
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  History modal                                                      */
/* ------------------------------------------------------------------ */

const HISTORY_TABS = [
  { id: 'cases', label: 'Кейсы', icon: 'box' },
  { id: 'upgrades', label: 'Апгрейды', icon: 'refresh' },
  { id: 'crafts', label: 'Крафты', icon: 'sparkles' },
  { id: 'battles', label: 'Битвы', icon: 'flame' },
]

function formatWhen(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function HistoryModal({ token, onClose, onToast }) {
  const [tab, setTab] = useState('cases')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const close = useCallback(() => onClose(), [onClose])
  useEscape(close)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiRequest('/api/history', { token })
      .then((payload) => {
        if (cancelled) return
        setData(payload)
        setError('')
      })
      .catch((requestError) => {
        if (cancelled) return
        setError(requestError.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const caseEntries = data?.cases || []
  const upgradeEntries = data?.upgrades || []
  const craftEntries = data?.crafts || []
  const battleEntries = data?.battles || []
  const droppedValue = caseEntries.reduce((sum, entry) => sum + (entry.skin?.price || 0), 0)
  const upgradeNet = upgradeEntries.reduce((sum, entry) => sum + (Number(entry.profit) || 0), 0)
  const upgradeWins = upgradeEntries.filter((entry) => entry.won).length
  const battleNet = battleEntries.reduce((sum, entry) => sum + ((Number(entry.payout) || 0) - (Number(entry.entry) || 0)), 0)
  const battleWins = battleEntries.filter((entry) => entry.won).length
  const counts = {
    cases: caseEntries.length,
    upgrades: upgradeEntries.length,
    crafts: craftEntries.length,
    battles: battleEntries.length,
  }
  const rows =
    tab === 'cases'
      ? caseEntries
      : tab === 'crafts'
        ? craftEntries
        : tab === 'battles'
          ? battleEntries
          : upgradeEntries

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-[#030604]/85 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="История"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="relative flex h-full w-full max-w-[620px] flex-col overflow-hidden border border-white/[0.09] bg-[#0d1510] shadow-panel sm:h-auto sm:max-h-[88vh] sm:rounded-[26px]">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-acid/10 blur-3xl" />
        <div className="relative flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-acid/20 bg-acid/[0.08] text-acid">
              <Icon name="history" size={20} />
            </div>
            <div>
              <div className="text-[8px] font-black uppercase tracking-[0.16em] text-acid/60">Your history</div>
              <h2 className="mt-0.5 font-display text-[18px] font-black tracking-[-0.04em] text-white">История</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition hover:bg-white/[0.05] hover:text-white"
            aria-label="Закрыть"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="relative shrink-0 px-5 pt-4">
          <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1">
            {HISTORY_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cx(
                  'flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[9px] font-extrabold transition',
                  tab === item.id ? 'bg-acid text-[#041007]' : 'text-white/40 hover:text-white/75',
                )}
              >
                <Icon name={item.icon} size={12} strokeWidth={2.4} />
                {item.label}
                <span
                  className={cx(
                    'rounded px-1 text-[8px] font-black tabular-nums',
                    tab === item.id ? 'bg-[#041007]/15 text-[#041007]' : 'bg-white/[0.06] text-white/38',
                  )}
                >
                  {counts[item.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
              <div className="text-[7px] font-black uppercase tracking-[0.12em] text-white/25">Кейсов</div>
              <div className="mt-0.5 font-display text-[13px] font-black tabular-nums text-white">{caseEntries.length}</div>
            </div>
            <div className="rounded-xl border border-acid/15 bg-acid/[0.05] px-2.5 py-2">
              <div className="text-[7px] font-black uppercase tracking-[0.12em] text-acid/55">Дропы</div>
              <div className="mt-0.5 font-display text-[13px] font-black tabular-nums text-acid">
                {formatPrice(droppedValue)}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
              <div className="text-[7px] font-black uppercase tracking-[0.12em] text-white/25">Апгрейды</div>
              <div
                className={cx(
                  'mt-0.5 font-display text-[13px] font-black tabular-nums',
                  upgradeNet > 0 ? 'text-acid' : upgradeNet < 0 ? 'text-[#ff8ba0]' : 'text-white',
                )}
              >
                {upgradeNet > 0 ? '+' : ''}
                {formatPrice(upgradeNet)}
              </div>
            </div>
          </div>
        </div>

        <div className="no-scrollbar relative flex-1 overflow-y-auto px-5 pb-5 pt-3">
          {loading && (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-white/30">
              <span className="spin-ring h-7 w-7 rounded-full border-2 border-acid/20 border-t-acid" />
              <span className="text-[10px] font-bold">Загружаем историю...</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 rounded-xl border border-[#ff7189]/20 bg-[#ff7189]/[0.05] px-3 py-2.5 text-[9px] font-semibold text-[#ff9aac]">
              <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {!loading && !error && !rows.length && (
            <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
              <Icon
                name={tab === 'cases' ? 'box' : tab === 'crafts' ? 'sparkles' : tab === 'battles' ? 'flame' : 'refresh'}
                size={30}
                className="text-white/12"
              />
              <div className="mt-3 text-[12px] font-bold text-white/40">
                {tab === 'cases'
                  ? 'Кейсы ещё не открывались'
                  : tab === 'crafts'
                    ? 'Контрактов ещё не было'
                    : tab === 'battles'
                      ? 'Битв ещё не было'
                      : 'Апгрейдов ещё не было'}
              </div>
              <div className="mt-1 text-[9px] text-white/22">
                {tab === 'cases'
                  ? 'Открой первый кейс — результат появится здесь.'
                  : tab === 'crafts'
                    ? 'Собери 3–10 скинов одной редкости — результат сохранится.'
                    : tab === 'battles'
                      ? 'Проведи дуэль на арене — итог появится здесь.'
                      : 'Прокачай скин в арене — история сохранится.'}
              </div>
            </div>
          )}

          {!loading && !error && rows.length > 0 && (
            <div className="space-y-1.5">
              {tab === 'cases' &&
                caseEntries.map((entry) => {
                  const meta = RARITY[entry.skin?.rarity] || RARITY.Common
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2"
                    >
                      <div
                        className="h-11 w-16 shrink-0 overflow-hidden rounded-lg border bg-black/30"
                        style={{ borderColor: `${meta.color}28` }}
                      >
                        {entry.skin && <SkinVisual skin={entry.skin} className="h-full w-full" showRarity={false} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[10px] font-extrabold text-white/80">
                          {entry.skin?.name || 'Предмет удалён'}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span
                            className="text-[7px] font-black uppercase tracking-[0.08em]"
                            style={{ color: meta.color }}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[7px] text-white/15">·</span>
                          <span className="truncate text-[7.5px] font-semibold text-white/30">{entry.caseName}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] font-extrabold tabular-nums text-acid">
                          {formatPrice(entry.skin?.price || 0)}
                        </div>
                        <div className="mt-0.5 text-[7px] font-semibold text-white/22">{formatWhen(entry.at)}</div>
                      </div>
                    </div>
                  )
                })}

              {tab === 'upgrades' &&
                upgradeEntries.map((entry) => {
                  const baseMeta = RARITY[entry.baseSkin?.rarity] || RARITY.Common
                  const targetMeta = RARITY[entry.targetSkin?.rarity] || RARITY.Common
                  const baseCount = entry.baseSkins?.length || 1
                  const baseTotal =
                    entry.baseTotal ??
                    Math.round((entry.baseSkin?.price || 0) * 100) / 100
                  return (
                    <div
                      key={entry.id}
                      className="rounded-xl border p-2"
                      style={{
                        borderColor: entry.won ? 'rgba(53,255,135,.22)' : 'rgba(255,113,137,.16)',
                        backgroundColor: entry.won ? 'rgba(53,255,135,.035)' : 'rgba(255,113,137,.03)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div
                            className="h-10 w-14 shrink-0 overflow-hidden rounded-lg border bg-black/30"
                            style={{ borderColor: `${baseMeta.color}26` }}
                          >
                            {entry.baseSkin && (
                              <SkinVisual skin={entry.baseSkin} className="h-full w-full" showRarity={false} />
                            )}
                            {baseCount > 1 && (
                              <span className="absolute bottom-0 right-0 rounded-tl bg-acid px-1 text-[8px] font-black text-[#041007]">
                                +{baseCount - 1}
                              </span>
                            )}
                          </div>
                          <Icon name="arrowRight" size={11} className="shrink-0 text-white/20" />
                          <div
                            className="h-10 w-14 shrink-0 overflow-hidden rounded-lg border bg-black/30"
                            style={{ borderColor: `${targetMeta.color}26` }}
                          >
                            {entry.targetSkin && (
                              <SkinVisual skin={entry.targetSkin} className="h-full w-full" showRarity={false} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[9px] font-bold text-white/70">
                              {baseCount > 1
                                ? `${baseCount} ${plural(baseCount, ['предмет', 'предмета', 'предметов'])} · ${formatPrice(baseTotal)}`
                                : entry.baseSkin?.name || '—'}
                            </div>
                            <div className="truncate text-[8px] font-semibold text-white/30">
                              → {entry.targetSkin?.name || '—'}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span
                            className={cx(
                              'inline-block rounded-md px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em]',
                              entry.won ? 'bg-acid/15 text-acid' : 'bg-[#ff7189]/12 text-[#ff9aac]',
                            )}
                          >
                            {entry.won ? 'успех' : 'провал'}
                          </span>
                          <div className="mt-1 text-[7px] font-bold tabular-nums text-white/25">
                            {formatChance(entry.chance)} · {formatWhen(entry.at)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}

              {tab === 'crafts' &&
                craftEntries.map((entry) => {
                  const meta = RARITY[entry.output?.rarity] || RARITY.Common
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2"
                    >
                      <div
                        className="h-11 w-16 shrink-0 overflow-hidden rounded-lg border bg-black/30"
                        style={{ borderColor: `${meta.color}28` }}
                      >
                        {entry.output && (
                          <SkinVisual skin={entry.output} className="h-full w-full" showRarity={false} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[10px] font-extrabold text-white/80">
                          {entry.output?.name || 'Предмет удалён'}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span
                            className="text-[7px] font-black uppercase tracking-[0.08em]"
                            style={{ color: meta.color }}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[7px] text-white/15">·</span>
                          <span className="text-[7.5px] font-semibold text-white/30">
                            {entry.inputSkins?.length || 0} → {entry.nextRarity}
                          </span>
                          <span className="rounded bg-white/[0.05] px-1 py-0.5 text-[6.5px] font-black uppercase tracking-[0.06em] text-white/38">
                            стабильность {entry.stability}%
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] font-extrabold tabular-nums text-acid">
                          {formatPrice(entry.output?.price || 0)}
                        </div>
                        <div className="mt-0.5 text-[7px] font-semibold text-white/22">
                          вложено {formatPrice(entry.totalValue || 0)} · {formatWhen(entry.at)}
                        </div>
                      </div>
                    </div>
                  )
                })}

              {tab === 'battles' &&
                battleEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border p-2"
                    style={{
                      borderColor: entry.won ? 'rgba(53,255,135,.2)' : 'rgba(255,113,137,.14)',
                      backgroundColor: entry.won ? 'rgba(53,255,135,.03)' : 'rgba(255,113,137,.025)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          backgroundColor: entry.won ? 'rgba(53,255,135,.1)' : 'rgba(255,255,255,.04)',
                          color: entry.won ? '#35ff87' : 'rgba(255,255,255,.35)',
                        }}
                      >
                        <Icon name="flame" size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[9.5px] font-extrabold text-white/78">
                          {entry.caseName}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[7px] font-semibold text-white/30">
                          <span>
                            {entry.rounds} {plural(entry.rounds, ['раунд', 'раунда', 'раундов'])}
                          </span>
                          <span className="text-white/15">·</span>
                          <span>{entry.mode === 'underdog' ? 'Андердог' : 'Обычный'}</span>
                          <span className="text-white/15">·</span>
                          <span className="truncate">vs {entry.opponent?.name || '—'}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={cx(
                            'inline-block rounded-md px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em]',
                            entry.won ? 'bg-acid/15 text-acid' : 'bg-[#ff7189]/12 text-[#ff9aac]',
                          )}
                        >
                          {entry.won ? 'победа' : 'поражение'}
                        </span>
                        <div className="mt-1 text-[7px] font-bold tabular-nums text-white/25">
                          {formatPrice(entry.playerTotal)} vs {formatPrice(entry.opponentTotal)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between border-t border-white/[0.05] pt-1.5 text-[7.5px] font-bold tabular-nums">
                      <span className="text-white/26">вход {formatPrice(entry.entry)}</span>
                      <span className={entry.won ? 'text-acid' : 'text-white/32'}>
                        выплата {formatPrice(entry.payout)} · {formatWhen(entry.at)}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {tab === 'crafts' && craftEntries.length > 0 && (
            <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[8px] font-semibold text-white/27">
              Контрактов собрано: {craftEntries.length}. Хранится последние 80 записей.
            </div>
          )}

          {tab === 'battles' && battleEntries.length > 0 && (
            <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[8px] font-semibold text-white/27">
              Побед: {battleWins} из {battleEntries.length}. Итог:{' '}
              <span className={battleNet >= 0 ? 'text-acid' : 'text-[#ff9aac]'}>
                {battleNet > 0 ? '+' : ''}
                {formatPrice(battleNet)}
              </span>
              . Хранится последние 80 записей.
            </div>
          )}

          {tab === 'upgrades' && upgradeEntries.length > 0 && (
            <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[8px] font-semibold text-white/27">
              Успешных апгрейдов: {upgradeWins} из {upgradeEntries.length}. Итог:{' '}
              <span className={upgradeNet >= 0 ? 'text-acid' : 'text-[#ff9aac]'}>
                {upgradeNet > 0 ? '+' : ''}
                {formatPrice(upgradeNet)}
              </span>
              . Хранится последние 80 записей.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Application                                                        */
/* ------------------------------------------------------------------ */

export default function App() {
  const [token, setToken] = useState(() => readToken())
  const [status, setStatus] = useState(null)
  const [booting, setBooting] = useState(() => Boolean(readToken()))
  const [notice, setNotice] = useState('')
  const [toasts, setToasts] = useState([])
  const [activeCase, setActiveCase] = useState(null)
  const [storeOpen, setStoreOpen] = useState(false)
  const [donateOpen, setDonateOpen] = useState(false)
  const [activeSection, setActiveSection] = useState(readSectionFromHash)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [withdrawSkin, setWithdrawSkin] = useState(null)
  const [online, setOnline] = useState(1)
  const [fast, setFast] = useState(() => {
    try {
      return localStorage.getItem(FAST_KEY) === '1'
    } catch {
      return false
    }
  })
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled())
  const toastIdRef = useRef(0)
  const lastUnseenRef = useRef(0)
  const now = useNow()

  // Разблокируем Web Audio на первом же жесте пользователя.
  // Иначе первый звук после async-запроса может остаться в suspended-контексте.
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true, capture: true })
    window.addEventListener('keydown', unlock, { once: true, capture: true })
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true })
      window.removeEventListener('keydown', unlock, { capture: true })
    }
  }, [])

  const pushToast = useCallback((message, type = 'success', title) => {
    const id = ++toastIdRef.current
    const defaultTitle =
      type === 'error' ? 'Ошибка' : type === 'info' ? 'Информация' : 'Готово'
    setToasts((previous) => [
      ...previous.slice(-3),
      { id, type, message, title: title || defaultTitle },
    ])
    setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id))
    }, 4200)
  }, [])

  useEffect(() => {
    if (!token) {
      setBooting(false)
      return undefined
    }

    let cancelled = false
    setBooting(true)
    apiRequest('/api/status', { token })
      .then((data) => {
        if (cancelled) return
        setStatus(data)
        setNotice('')
        setBooting(false)
      })
      .catch((error) => {
        if (cancelled) return
        setBooting(false)
        if (error.status === 401) {
          saveToken(null)
          setToken(null)
          setStatus(null)
          setNotice('Сессия истекла — войдите снова.')
        } else if (error.status === 403) {
          saveToken(null)
          setToken(null)
          setStatus(null)
          setNotice(error.message)
        } else {
          pushToast(error.message, 'error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [token, pushToast])

  useEffect(() => {
    if (!token) return undefined
    let cancelled = false
    const load = () => {
      apiRequest('/api/online')
        .then((data) => {
          if (cancelled) return
          if (Number.isFinite(Number(data.online))) setOnline(Number(data.online))
        })
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token])

  useEffect(() => {
    if (!status?.online) return
    setOnline(Number(status.online) || 1)
  }, [status?.online])

  useEffect(() => {
    if (!token) return undefined
    let cancelled = false
    const loadPromos = () => {
      apiRequest('/api/promos', { token })
        .then((data) => {
          if (cancelled) return
          setStatus((previous) => (previous ? { ...previous, promos: data.promos } : previous))
        })
        .catch(() => {})
    }
    loadPromos()
    const interval = setInterval(loadPromos, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token])

  const unseenPromos = Number(status?.promos?.unseenCount) || 0

  useEffect(() => {
    if (!status) return
    if (unseenPromos > lastUnseenRef.current) {
      pushToast(
        unseenPromos === 1
          ? 'Появился новый промокод — загляни во вкладку «Промокоды»'
          : `Новых промокодов: ${unseenPromos} — загляни во вкладку «Промокоды»`,
        'info',
        'Промокоды',
      )
    }
    lastUnseenRef.current = unseenPromos
  }, [unseenPromos, status, pushToast])

  useBodyLock(Boolean(activeCase || storeOpen || donateOpen || historyOpen || withdrawSkin))

  useEffect(() => {
    const syncSection = () => setActiveSection(readSectionFromHash())
    window.addEventListener('popstate', syncSection)
    return () => window.removeEventListener('popstate', syncSection)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [activeSection])

  const applyUpdate = useCallback((data) => {
    if (!data) return
    setStatus((previous) => {
      if (!previous) return previous
      const feed = data.feedEntry
        ? [data.feedEntry, ...(previous.feed || [])].slice(0, 30)
        : previous.feed
      return {
        ...previous,
        user: data.user || previous.user,
        daily: data.daily || previous.daily,
        feed,
        promos: data.promos || previous.promos,
        applications: data.applications || previous.applications,
        event: data.event || previous.event,
      }
    })
  }, [])

  function applySession(data) {
    saveToken(data.token)
    setToken(data.token)
    setNotice('')
    setActiveCase(null)
    setStoreOpen(false)
    setDonateOpen(false)
    setHistoryOpen(false)
    setWithdrawSkin(null)
    setStatus({
      user: data.user,
      daily: data.daily,
      cases: data.cases,
      glyphs: data.glyphs,
      catalog: data.catalog,
      feed: data.feed || [],
      online: data.online || 1,
      promos: data.promos,
      applications: data.applications,
      event: data.event,
    })
    if (Number.isFinite(Number(data.online))) setOnline(Number(data.online))
    setBooting(false)
    unlockAudio()
  }

  async function handleLogin(credentials) {
    const data = await apiRequest('/api/login', {
      method: 'POST',
      body: credentials,
    })
    applySession(data)
  }

  async function handleRegister(credentials) {
    const data = await apiRequest('/api/register', {
      method: 'POST',
      body: credentials,
    })
    applySession(data)
  }

  async function handleLogout() {
    try {
      if (token) await apiRequest('/api/logout', { method: 'POST', token })
    } catch {
      /* stateless demo logout */
    } finally {
      saveToken(null)
      setToken(null)
      setStatus(null)
      setActiveCase(null)
      setStoreOpen(false)
      setDonateOpen(false)
      setHistoryOpen(false)
      setWithdrawSkin(null)
      setOnline(1)
      setNotice('')
    }
  }

  function toggleFast() {
    setFast((previous) => {
      const next = !previous
      try {
        localStorage.setItem(FAST_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  function toggleSound() {
    setSoundOn((previous) => {
      const next = !previous
      setSoundEnabled(next)
      if (next) unlockAudio()
      return next
    })
  }

  async function sellItem(item) {
    if (!token) return
    try {
      const data = await apiRequest('/api/sell-skin', {
        method: 'POST',
        token,
        body: { instanceId: item.instanceId },
      })
      applyUpdate(data)
      pushToast(data.message, 'success')
    } catch (error) {
      pushToast(error.message, 'error')
      if (error.data?.user) applyUpdate(error.data)
    }
  }

  async function sellManyItems(instanceIds) {
    if (!token || !instanceIds?.length) return false
    try {
      const data = await apiRequest('/api/sell-many', {
        method: 'POST',
        token,
        body: { instanceIds },
      })
      applyUpdate(data)
      playCoin()
      pushToast(data.message, 'success')
      return true
    } catch (error) {
      pushToast(error.message, 'error')
      if (error.data?.user) applyUpdate(error.data)
      return false
    }
  }

  function navigate(target) {
    if (!SECTION_IDS.includes(target)) return
    if (target === 'promos' && token && unseenPromos > 0) {
      apiRequest('/api/promos/seen', { method: 'POST', token })
        .then((data) => {
          setStatus((previous) => (previous ? { ...previous, promos: data.promos } : previous))
          lastUnseenRef.current = 0
        })
        .catch(() => {})
    }
    setActiveSection(target)
    if (window.location.hash !== `#${target}`) {
      window.history.pushState(null, '', `#${target}`)
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  function openCase(caseData) {
    setActiveCase(caseData)
  }

  function goStore() {
    setStoreOpen(true)
  }

  function goHistory() {
    setHistoryOpen(true)
  }

  if (booting) return <BootScreen />

  if (!token || !status) {
    return (
      <>
        <LoginScreen onLogin={handleLogin} onRegister={handleRegister} notice={notice} />
        <ToastStack toasts={toasts} />
      </>
    )
  }

  const user = status.user
  const daily = status.daily
  const cases = status.cases || []
  const glyphs = status.glyphs || []
  const catalog = status.catalog || []
  const requestBadge =
    user.role === 'owner' ? Number(status.applications?.pendingCount) || 0 : 0

  return (
    <div key={user.id} className="relative min-h-screen overflow-x-hidden">
      {status.event?.active && <WinterSnow />}

      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-grid-faint opacity-30" />
        <div className="absolute -left-40 top-32 h-[460px] w-[460px] rounded-full bg-acid/[0.045] blur-[130px]" />
        <div className="absolute right-[-180px] top-[38%] h-[520px] w-[520px] rounded-full bg-lime/[0.035] blur-[140px]" />
        <div className="absolute bottom-0 left-1/2 h-[420px] w-[780px] -translate-x-1/2 rounded-full bg-[#10ff84]/[0.028] blur-[140px]" />
        {status.event?.active && (
          <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(120,205,255,.08),transparent_70%)]" />
        )}
      </div>

      <LiveBar feed={status.feed || []} online={online} username={user.username} />
      <Header
        user={user}
        online={online}
        soundOn={soundOn}
        promoBadge={unseenPromos}
        requestBadge={requestBadge}
        activeSection={activeSection}
        onNavigate={navigate}
        onStore={goStore}
        onDonate={() => setDonateOpen(true)}
        onHistory={goHistory}
        onSettings={() => navigate('settings')}
        onToggleSound={toggleSound}
        onLogout={handleLogout}
      />
      {status.event?.active && <WinterEventBar event={status.event} onNavigate={navigate} />}

      <main className="relative mx-auto max-w-[1540px] px-3 pb-28 sm:px-6 lg:pb-10 xl:px-8">
        <div key={activeSection} className="fade-up">
          {activeSection === 'upgrade' && (
            <UpgradeSection
              user={user}
              catalog={catalog}
              token={token}
              fast={fast}
              onToggleFast={toggleFast}
              onUpdate={applyUpdate}
              onToast={pushToast}
            />
          )}

          {activeSection === 'cases' && (
            <>
              <CasesSection cases={cases} onOpen={openCase} user={user} now={now} />
              <StorePromo catalog={catalog} onStore={goStore} />
            </>
          )}

          {activeSection === 'glyphs' && (
            <GlyphSection
              glyphs={glyphs}
              user={user}
              token={token}
              fast={fast}
              onUpdate={applyUpdate}
              onToast={pushToast}
            />
          )}

          {activeSection === 'craft' && (
            <CraftSection user={user} token={token} onUpdate={applyUpdate} onToast={pushToast} />
          )}

          {activeSection === 'battle' && (
            <BattleSection
              cases={cases}
              user={user}
              token={token}
              fast={fast}
              onUpdate={applyUpdate}
              onToast={pushToast}
            />
          )}

          {activeSection === 'promos' && (
            <PromoSection
              promos={status.promos}
              user={user}
              token={token}
              event={status.event}
              onUpdate={applyUpdate}
              onToast={pushToast}
              onNavigate={navigate}
            />
          )}

          {activeSection === 'requests' && (
            <ApplicationsSection
              applications={status.applications}
              user={user}
              token={token}
              onUpdate={applyUpdate}
              onToast={pushToast}
            />
          )}

          {activeSection === 'inventory' && (
            <InventorySection
              user={user}
              onSell={sellItem}
              onSellMany={sellManyItems}
              onWithdraw={(item) => setWithdrawSkin(item)}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsSection
              user={user}
              token={token}
              soundOn={soundOn}
              fast={fast}
              onToggleSound={toggleSound}
              onToggleFast={toggleFast}
              onLogout={handleLogout}
              onStore={goStore}
              onPasswordChanged={(newToken) => {
                saveToken(newToken)
                setToken(newToken)
              }}
              onToast={pushToast}
            />
          )}
        </div>

        <Footer onHistory={goHistory} onNavigate={navigate} onStore={goStore} />
      </main>

      <MobileDock
        onNavigate={navigate}
        onStore={goStore}
        onHistory={goHistory}
        inventoryCount={user.inventory.length}
        promoBadge={unseenPromos}
        activeSection={activeSection}
      />

      <ToastStack toasts={toasts} />

      {activeCase && (
        <CaseModal
          key={`${user.id}-${activeCase.id}`}
          caseData={activeCase}
          token={token}
          user={user}
          fast={fast}
          onClose={() => setActiveCase(null)}
          onUpdate={applyUpdate}
          onToast={pushToast}
          onDonate={() => setDonateOpen(true)}
          onGoInventory={() => navigate('inventory')}
        />
      )}

      {storeOpen && (
        <StoreModal
          catalog={catalog}
          balance={user.balance}
          token={token}
          onClose={() => setStoreOpen(false)}
          onUpdate={applyUpdate}
          onToast={pushToast}
        />
      )}

      {donateOpen && (
        <DonateModal
          balance={user.balance}
          token={token}
          user={user}
          daily={daily}
          event={status.event}
          onClose={() => setDonateOpen(false)}
          onUpdate={applyUpdate}
          onToast={pushToast}
        />
      )}

      {historyOpen && (
        <HistoryModal token={token} onClose={() => setHistoryOpen(false)} onToast={pushToast} />
      )}

      {withdrawSkin && (
        <WithdrawModal skin={withdrawSkin} onClose={() => setWithdrawSkin(null)} />
      )}
    </div>
  )
}




