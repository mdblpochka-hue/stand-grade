import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildCs2Cases, pickCaseSkin } from './cases'
import { CS2_CURRENCIES, formatCs2Price } from './currency'
import {
  createInstanceId,
  loadCs2State,
  normalizeCs2State,
  pushCs2History,
  saveCs2State,
} from './storage'
import { CS2Confetti, CS2Icon, CaseArt, RarityTag, SkinImage, formatChance } from './ui'
import {
  Cs2Battle,
  Cs2Cases,
  Cs2Contracts,
  Cs2History,
  Cs2Inventory,
  Cs2Store,
  Cs2Upgrade,
} from './modes'

const FREE_COOLDOWN = 24 * 60 * 60 * 1000

const CS2_NAV = [
  { id: 'cases', label: 'Кейсы', icon: 'box' },
  { id: 'inventory', label: 'Инвентарь', icon: 'archive' },
  { id: 'upgrade', label: 'Апгрейд', icon: 'refresh' },
  { id: 'contracts', label: 'Контракты', icon: 'sparkles' },
  { id: 'battle', label: 'Битва', icon: 'users' },
  { id: 'store', label: 'Магазин', icon: 'bag' },
  { id: 'history', label: 'История', icon: 'history' },
]

function useCs2Now() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])
  return now
}

function Cs2LogoMark({ size = 38, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`cs2-logo-${size}`} x1="8" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffd08a" />
          <stop offset=".48" stopColor="#f0a92e" />
          <stop offset="1" stopColor="#4aa8ff" />
        </linearGradient>
      </defs>
      <path
        d="M24 2.5 42.5 13v22L24 45.5 5.5 35V13L24 2.5Z"
        fill="#080c11"
        stroke={`url(#cs2-logo-${size})`}
        strokeWidth="2"
      />
      <circle cx="24" cy="23" r="7.5" fill="none" stroke={`url(#cs2-logo-${size})`} strokeWidth="2.4" />
      <path d="M24 11v6M24 29v8M11 23h6M31 23h8" stroke={`url(#cs2-logo-${size})`} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="24" cy="23" r="1.8" fill="#ffd08a" />
    </svg>
  )
}

function Cs2Logo({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative shrink-0">
        <div className="absolute inset-0 rounded-xl bg-[#f0a92e]/25 blur-lg" />
        <Cs2LogoMark size={compact ? 33 : 38} className="relative" />
      </div>
      <div className="leading-none">
        <div className="font-display text-[13px] font-extrabold tracking-[-0.03em] text-white sm:text-[15px]">
          CS2 <span className="bg-gradient-to-r from-[#ffd08a] to-[#4aa8ff] bg-clip-text text-transparent">DROP</span>
        </div>
        {!compact && (
          <div className="mt-1.5 text-[7px] font-bold uppercase tracking-[0.3em] text-white/30 sm:text-[8px]">
            Counter-Strike 2 case arena
          </div>
        )}
      </div>
    </div>
  )
}

export function SiteModeSwitch({ mode = 'stand', onSwitch, compact = false }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-white/[0.08] bg-black/25 p-0.5">
      <button
        type="button"
        onClick={() => onSwitch?.('stand')}
        className={`rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] transition ${
          mode === 'stand'
            ? 'bg-acid/15 text-acid shadow-[inset_0_0_0_1px_rgba(53,255,135,.18)]'
            : 'text-white/35 hover:text-white/70'
        }`}
      >
        {compact ? 'SG' : 'StandGrade'}
      </button>
      <button
        type="button"
        onClick={() => onSwitch?.('cs2')}
        className={`rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] transition ${
          mode === 'cs2'
            ? 'bg-[#f0a92e]/15 text-[#ffd08a] shadow-[inset_0_0_0_1px_rgba(240,169,46,.22)]'
            : 'text-white/35 hover:text-[#ffd08a]/80'
        }`}
      >
        {compact ? 'CS2' : 'CS2 Drop'}
      </button>
    </div>
  )
}

function Toasts({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => onDismiss(toast.id)}
          className={`toast-in pointer-events-auto w-full max-w-sm rounded-xl border px-3.5 py-2.5 text-left shadow-[0_18px_50px_rgba(0,0,0,.5)] ${
            toast.type === 'error'
              ? 'border-[#ff7a59]/30 bg-[#1a0d0a]/95 text-[#ffb0a0]'
              : 'border-[#59d98d]/25 bg-[#08130c]/95 text-[#a9ffd0]'
          }`}
        >
          <div className="text-[9px] font-black uppercase tracking-[0.14em] opacity-60">
            {toast.type === 'error' ? 'Ошибка' : 'CS2 Drop'}
          </div>
          <div className="mt-0.5 text-[11px] font-bold">{toast.message}</div>
        </button>
      ))}
    </div>
  )
}

function Cs2BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#06080c] p-6">
      <div className="relative text-center">
        <div className="absolute inset-0 -z-10 mx-auto h-40 w-40 rounded-full bg-[#f0a92e]/15 blur-3xl" />
        <div className="mx-auto flex h-16 w-16 items-center justify-center">
          <Cs2LogoMark size={58} className="spin-ring" />
        </div>
        <div className="mt-5 font-display text-lg font-bold text-white">CS2 DROP</div>
        <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/30">
          Загружаем каталог скинов…
        </div>
        <div className="mx-auto mt-4 h-1 w-44 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-[#f0a92e] to-[#4aa8ff]" />
        </div>
      </div>
    </div>
  )
}

function Cs2ErrorScreen({ message, onRetry }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#06080c] p-6">
      <div className="max-w-md rounded-2xl border border-[#ff7a59]/25 bg-[#160c09] p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[#ff7a59]/25 bg-[#ff7a59]/10 text-[#ff9a8b]">
          <CS2Icon name="crosshair" size={22} />
        </div>
        <div className="mt-4 font-display text-base font-bold text-white">Каталог CS2 недоступен</div>
        <p className="mt-2 text-[11px] leading-5 text-white/40">{message}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={onRetry} className="cs2-btn-primary">
            Повторить
          </button>
          <a href="/cs2/catalog.json" target="_blank" rel="noreferrer" className="cs2-btn-ghost">
            Открыть JSON
          </a>
        </div>
      </div>
    </div>
  )
}

export default function CS2DropApp({ username = 'guest', onSwitchMode, onLogout }) {
  const [catalog, setCatalog] = useState([])
  const [catalogError, setCatalogError] = useState('')
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState(() => loadCs2State(username))
  const [activeMode, setActiveMode] = useState('cases')
  const [toasts, setToasts] = useState([])
  const [openCaseData, setOpenCaseData] = useState(null)
  const [reveal, setReveal] = useState(null)
  const [isOpening, setIsOpening] = useState(false)
  const [upgradePrefill, setUpgradePrefill] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const toastIdRef = useRef(0)
  const openTimerRef = useRef(null)
  const now = useCs2Now()

  const pushToast = useCallback((message, type = 'success') => {
    const id = ++toastIdRef.current
    setToasts((previous) => [...previous.slice(-2), { id, type, message }])
    setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id))
    }, 4200)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id))
  }, [])

  useEffect(() => {
    document.body.classList.add('cs2-mode')
    window.scrollTo({ top: 0, behavior: 'auto' })
    return () => document.body.classList.remove('cs2-mode')
  }, [])

  useEffect(() => {
    setState(loadCs2State(username))
  }, [username])

  useEffect(() => {
    saveCs2State(username, state)
  }, [username, state])

  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current)
    }
  }, [])

  const loadCatalog = useCallback(() => {
    setLoading(true)
    setCatalogError('')
    fetch('/cs2/catalog.json', { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((payload) => {
        const items = Array.isArray(payload) ? payload : payload?.items
        if (!Array.isArray(items) || !items.length) throw new Error('Пустой каталог скинов')
        setCatalog(items)
        setLoading(false)
      })
      .catch((error) => {
        setCatalogError(error.message || 'Не удалось загрузить каталог')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  const cases = useMemo(() => buildCs2Cases(catalog), [catalog])
  const format = useCallback(
    (coins) => formatCs2Price(coins, state.currency),
    [state.currency],
  )

  const updateState = useCallback((updater) => {
    setState((previous) => normalizeCs2State(
      typeof updater === 'function' ? updater(previous) : updater,
    ))
  }, [])

  const changeCurrency = useCallback((currency) => {
    updateState((previous) => ({ ...previous, currency }))
  }, [updateState])

  const makeInventoryItem = useCallback((skin) => ({
    ...skin,
    instanceId: createInstanceId(),
    obtainedAt: new Date().toISOString(),
  }), [])

  const freeReady = useMemo(() => {
    if (!state.lastFreeAt) return true
    const last = new Date(state.lastFreeAt).getTime()
    if (!Number.isFinite(last)) return true
    return now - last >= FREE_COOLDOWN
  }, [state.lastFreeAt, now])

  function openCase(caseData) {
    if (!caseData || isOpening) return
    const isFree = Boolean(caseData.free) || caseData.priceCoins <= 0
    if (isFree && !freeReady) {
      pushToast('Ежедневный кейс уже открыт. Возвращайтесь через 24 часа.', 'error')
      return
    }
    if (!isFree && state.balanceCoins < caseData.priceCoins) {
      pushToast('Недостаточно КС коинов для открытия кейса.', 'error')
      return
    }

    setIsOpening(true)
    setReveal(null)
    updateState((previous) => ({
      ...previous,
      balanceCoins: isFree ? previous.balanceCoins : previous.balanceCoins - caseData.priceCoins,
      lastFreeAt: isFree ? new Date().toISOString() : previous.lastFreeAt,
    }))

    openTimerRef.current = setTimeout(() => {
      const skin = pickCaseSkin(caseData)
      if (!skin) {
        setIsOpening(false)
        pushToast('В кейсе не оказалось доступных скинов.', 'error')
        return
      }
      const item = makeInventoryItem(skin)
      updateState((previous) => ({
        ...previous,
        inventory: [item, ...previous.inventory],
        history: pushCs2History(previous, {
          type: isFree ? 'free' : 'case',
          title: skin.name,
          detail: `${caseData.name} · ${skin.wear || 'CS2'}`,
          priceCoins: skin.priceCoins,
          image: skin.image,
          rarityColor: skin.rarityColor,
        }),
      }))
      setReveal({ skin, caseId: caseData.id, key: Date.now(), free: isFree })
      setIsOpening(false)
      pushToast(
        isFree
          ? `Бесплатный дроп: ${skin.name}`
          : `Из кейса «${caseData.name}» выпал ${skin.name}`,
      )
    }, 1100)
  }

  function sellItem(item) {
    const value = Math.max(1, Math.round(item.priceCoins * 0.9))
    updateState((previous) => ({
      ...previous,
      balanceCoins: previous.balanceCoins + value,
      inventory: previous.inventory.filter((entry) => entry.instanceId !== item.instanceId),
      history: pushCs2History(previous, {
        type: 'sell',
        title: item.name,
        detail: 'Продажа за 90% рыночной цены',
        priceCoins: value,
        image: item.image,
        rarityColor: item.rarityColor,
      }),
    }))
    pushToast(`Продано: ${item.name} · +${format(value)}`)
  }

  function sellAll() {
    if (!state.inventory.length) return
    const total = state.inventory.reduce(
      (sum, item) => sum + Math.max(1, Math.round(item.priceCoins * 0.9)),
      0,
    )
    const ok = typeof window === 'undefined' ? true : window.confirm(
      `Продать все ${state.inventory.length} скинов за ${format(total)}?`,
    )
    if (!ok) return
    updateState((previous) => ({
      ...previous,
      balanceCoins: previous.balanceCoins + total,
      inventory: [],
      history: pushCs2History(previous, {
        type: 'sell',
        title: `Продажа ${previous.inventory.length} скинов`,
        detail: 'Массовая продажа за 90% рыночной цены',
        priceCoins: total,
      }),
    }))
    pushToast(`Инвентарь продан · +${format(total)}`)
  }

  function buySkin(skin) {
    if (state.balanceCoins < skin.priceCoins) {
      pushToast('Недостаточно коинов для покупки.', 'error')
      return
    }
    const item = makeInventoryItem(skin)
    updateState((previous) => ({
      ...previous,
      balanceCoins: previous.balanceCoins - skin.priceCoins,
      inventory: [item, ...previous.inventory],
      history: pushCs2History(previous, {
        type: 'store',
        title: skin.name,
        detail: 'Покупка в магазине CS2',
        priceCoins: skin.priceCoins,
        image: skin.image,
        rarityColor: skin.rarityColor,
      }),
    }))
    pushToast(`Куплено: ${skin.name}`)
  }

  function upgradeSkin(source, target) {
    if (!source || !target) return null
    const chance = Math.min(0.9, Math.max(0.01, (source.priceCoins / target.priceCoins) * 0.9))
    const success = Math.random() < chance
    if (success) {
      const item = makeInventoryItem(target)
      updateState((previous) => ({
        ...previous,
        inventory: [
          item,
          ...previous.inventory.filter((entry) => entry.instanceId !== source.instanceId),
        ],
        history: pushCs2History(previous, {
          type: 'upgrade',
          title: `${source.name} → ${target.name}`,
          detail: `Успех · шанс ${(chance * 100).toFixed(1)}%`,
          priceCoins: target.priceCoins,
          image: target.image,
          rarityColor: target.rarityColor,
        }),
      }))
      return {
        skin: target,
        success: true,
        message: `Шанс ${(chance * 100).toFixed(1)}% — апгрейд прошёл.`,
      }
    }
    updateState((previous) => ({
      ...previous,
      inventory: previous.inventory.filter((entry) => entry.instanceId !== source.instanceId),
      history: pushCs2History(previous, {
        type: 'upgrade_fail',
        title: source.name,
        detail: `Неудача · шанс ${(chance * 100).toFixed(1)}%`,
        priceCoins: source.priceCoins,
        image: source.image,
        rarityColor: source.rarityColor,
      }),
    }))
    return {
      skin: source,
      success: false,
      message: `Шанс был ${(chance * 100).toFixed(1)}%. Скин потерян.`,
    }
  }

  function pickContractSkin(total) {
    if (!catalog.length) return null
    const ideal = total * 0.9
    const min = Math.max(1, Math.floor(total * 0.35))
    const max = Math.max(min + 1, Math.ceil(total * 2.2))
    let pool = catalog.filter((skin) => skin.priceCoins >= min && skin.priceCoins <= max)
    if (pool.length < 8) pool = catalog.filter((skin) => skin.priceCoins <= max)
    if (!pool.length) pool = catalog
    const span = Math.max(1, total * 0.35)
    const weighted = pool.map((skin) => ({
      skin,
      weight: 1 / (1 + Math.abs(skin.priceCoins - ideal) / span),
    }))
    const sum = weighted.reduce((acc, entry) => acc + entry.weight, 0)
    let cursor = Math.random() * sum
    for (const entry of weighted) {
      if (cursor < entry.weight) return entry.skin
      cursor -= entry.weight
    }
    return weighted[weighted.length - 1]?.skin || null
  }

  function performContract(selectedItems) {
    if (!selectedItems || selectedItems.length < 2) return null
    const total = selectedItems.reduce((sum, item) => sum + item.priceCoins, 0)
    const skin = pickContractSkin(total)
    if (!skin) return null
    const item = makeInventoryItem(skin)
    const ids = new Set(selectedItems.map((entry) => entry.instanceId))
    updateState((previous) => ({
      ...previous,
      inventory: [item, ...previous.inventory.filter((entry) => !ids.has(entry.instanceId))],
      history: pushCs2History(previous, {
        type: 'contract',
        title: skin.name,
        detail: `Контракт из ${selectedItems.length} скинов на ${format(total)}`,
        priceCoins: skin.priceCoins,
        image: skin.image,
        rarityColor: skin.rarityColor,
      }),
    }))
    return {
      skin,
      success: true,
      message: `Контракт на ${format(total)} → ${format(skin.priceCoins)}.`,
    }
  }

  function performBattle(caseData, playerCount) {
    if (!caseData || caseData.free || caseData.priceCoins <= 0) return null
    const entry = caseData.priceCoins
    if (state.balanceCoins < entry) {
      pushToast('Недостаточно коинов для входа в битву.', 'error')
      return null
    }
    const botNames = ['BOT Neo', 'BOT Viper', 'BOT Frost']
    const drops = Array.from({ length: playerCount }, (_, index) => ({
      name: index === 0 ? username : botNames[index - 1],
      isUser: index === 0,
      skin: pickCaseSkin(caseData),
    })).filter((drop) => drop.skin)
    if (!drops.length) return null
    const winner = drops.reduce((best, drop) => (
      drop.skin.priceCoins > best.skin.priceCoins ? drop : best
    ), drops[0])
    const userWon = winner.isUser
    const total = drops.reduce((sum, drop) => sum + drop.skin.priceCoins, 0)
    const wonItems = userWon ? drops.map((drop) => makeInventoryItem(drop.skin)) : []
    updateState((previous) => ({
      ...previous,
      balanceCoins: previous.balanceCoins - entry,
      inventory: [...wonItems, ...previous.inventory],
      history: pushCs2History(previous, {
        type: 'battle',
        title: userWon ? `Победа в битве · ${caseData.name}` : `Битва · ${caseData.name}`,
        detail: userWon
          ? `Забрано скинов: ${wonItems.length} · ${format(total)}`
          : `Победил ${winner.name} · ${format(total)}`,
        priceCoins: userWon ? total : entry,
        image: winner.skin.image,
        rarityColor: winner.skin.rarityColor,
      }),
    }))
    return { drops, winner, userWon, caseData }
  }

  function handleUseInUpgrade(item) {
    setUpgradePrefill(`${item.instanceId}:${Date.now()}`)
    setActiveMode('upgrade')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleSwitch(mode) {
    if (mode === 'cs2') return
    if (isOpening) {
      pushToast('Дождитесь окончания открытия кейса.', 'error')
      return
    }
    setProfileOpen(false)
    onSwitchMode?.(mode)
  }

  if (loading) return <Cs2BootScreen />
  if (catalogError) return <Cs2ErrorScreen message={catalogError} onRetry={loadCatalog} />

  const activeCaseReady = cases.length > 0

  return (
    <div className="cs2-shell relative min-h-screen overflow-x-hidden text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 cs2-grid opacity-25" />
        <div className="absolute -left-40 top-24 h-[480px] w-[480px] rounded-full bg-[#4aa8ff]/[0.055] blur-[130px]" />
        <div className="absolute right-[-160px] top-[30%] h-[520px] w-[520px] rounded-full bg-[#f0a92e]/[0.055] blur-[140px]" />
        <div className="absolute bottom-0 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-[#c08bff]/[0.03] blur-[150px]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-[#4aa8ff]/[0.12] bg-[#06080c]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[66px] max-w-[1540px] items-center justify-between gap-2 px-3 sm:px-6 xl:px-8">
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setActiveMode('cases')
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              className="shrink-0 text-left"
              aria-label="CS2 DROP — наверх"
            >
              <div className="hidden sm:block"><Cs2Logo /></div>
              <div className="sm:hidden"><Cs2Logo compact /></div>
            </button>
          </div>

          <nav className="hidden items-center gap-0.5 2xl:flex" aria-label="Навигация CS2">
            {CS2_NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveMode(item.id)
                  window.scrollTo({ top: 0, behavior: 'auto' })
                }}
                className={`group relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-bold transition ${
                  activeMode === item.id
                    ? 'bg-[#f0a92e]/[0.1] text-white'
                    : 'text-white/48 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <CS2Icon
                  name={item.icon}
                  size={13}
                  className={activeMode === item.id ? 'text-[#f0a92e]' : 'text-white/28 group-hover:text-[#ffd08a]/70'}
                />
                {item.label}
                {item.id === 'inventory' && state.inventory.length > 0 && (
                  <span className="rounded-full bg-[#4aa8ff]/20 px-1.5 text-[8px] font-black text-[#9fd0ff]">
                    {state.inventory.length}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <label className="relative hidden sm:block">
              <span className="sr-only">Валюта</span>
              <select
                value={state.currency}
                onChange={(event) => changeCurrency(event.target.value)}
                className="cs2-select h-9 pr-7 text-[10px] font-extrabold"
              >
                {CS2_CURRENCIES.map((currency) => (
                  <option key={currency.id} value={currency.id}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex h-10 items-center gap-2 rounded-xl border border-[#f0a92e]/20 bg-[#f0a92e]/[0.07] px-2.5 sm:px-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f0a92e]/15 text-[#ffd08a] ring-1 ring-[#f0a92e]/25">
                <CS2Icon name="coin" size={12} strokeWidth={2.4} />
              </span>
              <div className="leading-none">
                <div className="hidden text-[7px] font-bold uppercase tracking-[0.16em] text-white/30 sm:block">
                  Баланс
                </div>
                <span className="block max-w-[120px] truncate text-[11px] font-extrabold tabular-nums text-white sm:text-[12px]">
                  {format(state.balanceCoins)}
                </span>
              </div>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                className="flex h-10 items-center gap-2 rounded-xl border border-[#4aa8ff]/15 bg-[#4aa8ff]/[0.06] px-2.5 text-[10px] font-extrabold uppercase text-[#9fd0ff] transition hover:border-[#4aa8ff]/35"
                aria-label="Профиль CS2"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4aa8ff]/15">
                  {username.slice(0, 1)}
                </span>
                <span className="hidden max-w-[90px] truncate 2xl:block">{username}</span>
              </button>
              {profileOpen && (
                <div className="pop-in absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1016] p-2 shadow-panel">
                  <div className="rounded-xl bg-white/[0.035] p-3">
                    <div className="truncate text-sm font-extrabold text-white">{username}</div>
                    <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#9fd0ff]/60">
                      CS2 Drop account
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-white/40">
                      <span>Скинов</span>
                      <span className="text-white/75">{state.inventory.length}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSwitch('stand')}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12px] font-bold text-white/60 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    <CS2Icon name="arrowRight" size={14} />
                    В StandGrade
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isOpening) {
                        pushToast('Дождитесь окончания открытия кейса.', 'error')
                        return
                      }
                      setProfileOpen(false)
                      onLogout?.()
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12px] font-bold text-[#ff9a8b]/80 transition hover:bg-[#ff7a59]/[0.07] hover:text-[#ffb0a0]"
                  >
                    <CS2Icon name="close" size={14} />
                    Выйти
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1540px] items-center gap-2 overflow-x-auto px-3 pb-2">
          <div className="shrink-0">
            <SiteModeSwitch mode="cs2" onSwitch={handleSwitch} compact />
          </div>
          <nav className="flex min-w-0 items-center gap-0.5 2xl:hidden" aria-label="Навигация CS2 (компакт)">
            {CS2_NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveMode(item.id)
                  window.scrollTo({ top: 0, behavior: 'auto' })
                }}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${
                  activeMode === item.id
                    ? 'bg-[#f0a92e]/12 text-[#ffd08a]'
                    : 'text-white/40'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto hidden shrink-0 items-center gap-3 text-[9px] font-bold text-white/22 2xl:flex">
            <span className="flex items-center gap-1.5">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#59d98d]" />
              CS2 Drop
            </span>
            <span className="h-3 w-px bg-white/[0.08]" />
            <span>100 КС = $1</span>
            <span>$1 = 3.25 BYN</span>
            <span>$1 = 95 RUB</span>
          </div>
          <label className="ml-auto shrink-0 sm:hidden">
            <select
              value={state.currency}
              onChange={(event) => changeCurrency(event.target.value)}
              className="cs2-select h-8 text-[9px] font-extrabold"
            >
              {CS2_CURRENCIES.map((currency) => (
                <option key={currency.id} value={currency.id}>{currency.short}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1540px] px-3 pb-24 pt-5 sm:px-6 lg:pb-10 xl:px-8">
        <div key={activeMode} className="fade-up">
          {activeMode === 'cases' && (
            <Cs2Cases
              cases={cases}
              currency={state.currency}
              format={format}
              balance={state.balanceCoins}
              now={now}
              lastFreeAt={state.lastFreeAt}
              onOpenCase={(caseData) => {
                if (!activeCaseReady) return
                setReveal(null)
                setOpenCaseData(caseData)
              }}
              onGoStore={() => setActiveMode('store')}
            />
          )}
          {activeMode === 'inventory' && (
            <Cs2Inventory
              items={state.inventory}
              currency={state.currency}
              format={format}
              onSell={sellItem}
              onSellAll={sellAll}
              onUseInUpgrade={handleUseInUpgrade}
            />
          )}
          {activeMode === 'upgrade' && (
            <Cs2Upgrade
              items={state.inventory}
              catalog={catalog}
              format={format}
              currency={state.currency}
              prefillId={upgradePrefill}
              onUpgrade={upgradeSkin}
            />
          )}
          {activeMode === 'contracts' && (
            <Cs2Contracts
              items={state.inventory}
              catalog={catalog}
              format={format}
              onContract={performContract}
            />
          )}
          {activeMode === 'battle' && (
            <Cs2Battle
              cases={cases}
              format={format}
              balance={state.balanceCoins}
              onBattle={performBattle}
            />
          )}
          {activeMode === 'store' && (
            <Cs2Store
              catalog={catalog}
              format={format}
              balance={state.balanceCoins}
              onBuy={buySkin}
            />
          )}
          {activeMode === 'history' && (
            <Cs2History history={state.history} format={format} />
          )}
        </div>

        <footer className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/[0.06] pt-5 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-white/28">
            <Cs2LogoMark size={22} />
            CS2 Drop · скины, цены и дроп-пул синхронизированы с LisSkins
          </div>
          <div className="flex items-center gap-2">
            <SiteModeSwitch mode="cs2" onSwitch={handleSwitch} />
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/20">
              18+ · демо-экономика
            </span>
          </div>
        </footer>
      </main>

      <Toasts toasts={toasts} onDismiss={dismissToast} />

      {openCaseData && (
        <CaseOpenModal
          caseData={openCaseData}
          format={format}
          balance={state.balanceCoins}
          currency={state.currency}
          isOpening={isOpening}
          reveal={reveal}
          freeReady={freeReady}
          lastFreeAt={state.lastFreeAt}
          now={now}
          onOpen={openCase}
          onClose={() => {
            setOpenCaseData(null)
            setReveal(null)
          }}
          onGoInventory={() => {
            setOpenCaseData(null)
            setReveal(null)
            setActiveMode('inventory')
          }}
          onGoStore={() => {
            setOpenCaseData(null)
            setReveal(null)
            setActiveMode('store')
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Case opening modal                                                 */
/* ------------------------------------------------------------------ */

function CaseOpenModal({
  caseData,
  format,
  balance,
  currency,
  isOpening,
  reveal,
  freeReady,
  lastFreeAt,
  now,
  onOpen,
  onClose,
  onGoInventory,
  onGoStore,
}) {
  const [previewIndex, setPreviewIndex] = useState(0)
  const [showFullPool, setShowFullPool] = useState(false)
  const canOpenFree = !caseData.free || freeReady
  const price = caseData.free ? 0 : caseData.priceCoins
  const affordable = caseData.free ? canOpenFree : balance >= price
  const freeStamp = lastFreeAt ? new Date(lastFreeAt).getTime() : 0
  const freeLeft = caseData.free && Number.isFinite(freeStamp) && freeStamp
    ? Math.max(0, FREE_COOLDOWN - (now - freeStamp))
    : 0

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  useEffect(() => {
    if (!isOpening) return undefined
    const interval = setInterval(() => setPreviewIndex((value) => value + 1), 80)
    return () => clearInterval(interval)
  }, [isOpening])

  const previewSkin = caseData.pool.length
    ? caseData.pool[previewIndex % caseData.pool.length].skin
    : caseData.featured

  const result = reveal?.caseId === caseData.id ? reveal.skin : null
  const rarity = result?.rarityColor || caseData.accent || '#b0c3d9'

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="pop-in max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#080c12] shadow-[0_40px_120px_rgba(0,0,0,.7)] sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-white/[0.07] bg-[#080c12]/95 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: caseData.accent }}
            />
            <div className="min-w-0">
              <div className="truncate font-display text-sm font-bold text-white">{caseData.name}</div>
              <div className="truncate text-[9px] font-semibold text-white/30">{caseData.subtitle}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-white/40 transition hover:border-white/20 hover:text-white"
            aria-label="Закрыть"
          >
            <CS2Icon name="close" size={14} />
          </button>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0f15]">
              <div className="absolute inset-0 cs2-grid opacity-20" />
              <div
                className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
                style={{ backgroundColor: `${rarity}22` }}
              />
              <div className="relative flex min-h-[250px] flex-col items-center justify-center px-4 py-6">
                {isOpening ? (
                  <>
                    <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#ffd08a]">
                      <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[#f0a92e]" />
                      Вскрываем кейс
                    </div>
                    <div className="relative h-36 w-full max-w-sm overflow-hidden rounded-xl border border-white/[0.08] bg-black/30">
                      <div className="roulette-mask flex h-full w-full items-center justify-center">
                        <div key={previewIndex} className="pop-in px-3">
                          <SkinImage skin={previewSkin} className="h-28 w-48" />
                        </div>
                      </div>
                      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#f0a92e]/80 shadow-[0_0_16px_rgba(240,169,46,.8)]" />
                    </div>
                    <div className="mt-3 text-[10px] font-semibold text-white/35">
                      Определяем дроп по честным весам…
                    </div>
                  </>
                ) : result ? (
                  <div key={reveal.key} className="relative w-full text-center">
                    <CS2Confetti count={18} />
                    <div className="relative mx-auto w-full max-w-sm">
                      <div className="flex items-center justify-center gap-2">
                        <RarityTag skin={result} />
                        {caseData.free && (
                          <span className="rounded border border-[#59d98d]/30 bg-[#59d98d]/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-[#8bffba]">
                            Free drop
                          </span>
                        )}
                      </div>
                      <SkinImage skin={result} className="mx-auto mt-2 h-36 w-full" />
                      <div className="mt-2 font-display text-base font-bold text-white">{result.name}</div>
                      <div className="mt-1 text-[12px] font-extrabold tabular-nums text-[#ffd08a]">
                        {format(result.priceCoins)}
                      </div>
                      <div className="mt-3 flex flex-wrap justify-center gap-2">
                        <button type="button" onClick={onGoInventory} className="cs2-btn-ghost">
                          В инвентарь
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpen(caseData)}
                          disabled={isOpening || !affordable}
                          className="cs2-btn-primary"
                        >
                          Ещё раз · {caseData.free ? 'Free' : format(price)}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full">
                    <div className="mx-auto max-w-sm">
                      <CaseArt caseData={caseData} className="h-40 w-full" />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-2 py-2 text-center">
                        <div className="text-[8px] font-black uppercase tracking-[0.12em] text-white/25">Дропов</div>
                        <div className="mt-0.5 text-sm font-extrabold text-white">{caseData.totalItems}</div>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-2 py-2 text-center">
                        <div className="text-[8px] font-black uppercase tracking-[0.12em] text-white/25">RTP</div>
                        <div className="mt-0.5 text-sm font-extrabold text-[#8bffba]">
                          {caseData.rtp ? `${Math.round(caseData.rtp * 100)}%` : 'FREE'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-2 py-2 text-center">
                        <div className="text-[8px] font-black uppercase tracking-[0.12em] text-white/25">Топ</div>
                        <div className="mt-0.5 truncate text-[10px] font-extrabold text-[#ffd08a]">
                          {format(caseData.featured?.priceCoins || 0)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpen(caseData)}
                      disabled={!affordable}
                      className="cs2-btn-primary mt-4 w-full"
                    >
                      <CS2Icon name="box" size={16} />
                      {caseData.free
                        ? freeReady
                          ? 'Открыть бесплатно'
                          : `Доступно через ${formatLeft(freeLeft)}`
                        : `Открыть за ${format(price)}`}
                    </button>
                    {!caseData.free && balance < price && (
                      <button type="button" onClick={onGoStore} className="mt-2 w-full text-center text-[10px] font-bold text-[#ff9a8b]">
                        Не хватает {format(price - balance)} · в магазин
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/28">
                  Шансы по редкостям
                </div>
                <div className="mt-2 space-y-1.5">
                  {caseData.rarityBreakdown.map((entry) => (
                    <div key={entry.rarity} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white/55">{entry.label}</span>
                      <span className="text-[10px] font-extrabold tabular-nums text-white/60">
                        {formatChance(entry.chance)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/28">
                    Пул дропа · {caseData.totalItems}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFullPool((value) => !value)}
                    className="shrink-0 text-[9px] font-extrabold text-[#ffd08a]/70 hover:text-[#ffd08a]"
                  >
                    {showFullPool ? 'Свернуть' : 'Показать все'}
                  </button>
                </div>
                <div className={`mt-2 space-y-1 overflow-y-auto pr-1 ${showFullPool ? 'max-h-[300px]' : 'max-h-[150px]'}`}>
                  {(showFullPool ? caseData.pool : caseData.top).map((entry) => (
                    <div key={entry.skin.id} className="flex items-center gap-2">
                      <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: entry.skin.rarityColor }} />
                      <span className="min-w-0 flex-1 truncate text-[9px] font-semibold text-white/45">
                        {entry.skin.name}
                      </span>
                      <span className="text-[9px] font-bold tabular-nums text-white/35">
                        {formatChance(entry.chance)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-2xl border border-white/[0.07] bg-[#0a0f15] p-3">
              <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/28">
                Топ-дропы кейса
              </div>
              <div className="mt-2 space-y-1.5">
                {[...caseData.pool]
                  .sort((a, b) => b.skin.priceCoins - a.skin.priceCoins)
                  .slice(0, 8)
                  .map((entry) => (
                    <div key={entry.skin.id} className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] p-1.5">
                      <SkinImage skin={entry.skin} className="h-8 w-10 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[9.5px] font-bold text-white/70">{entry.skin.name}</div>
                        <div className="text-[8px] font-semibold text-white/28">
                          {format(entry.skin.priceCoins)} · {formatChance(entry.chance)}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#0a0f15] p-3">
              <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/28">Экономика</div>
              <div className="mt-2 space-y-1.5 text-[10px]">
                <div className="flex items-center justify-between text-white/40">
                  <span>Цена кейса</span>
                  <span className="font-extrabold text-white/75">{caseData.free ? 'Бесплатно' : format(price)}</span>
                </div>
                <div className="flex items-center justify-between text-white/40">
                  <span>Средний дроп</span>
                  <span className="font-extrabold text-white/75">
                    {caseData.rtp
                      ? format(Math.round(price * caseData.rtp))
                      : format(Math.round(caseData.pool.reduce((sum, entry) => sum + entry.skin.priceCoins * entry.chance / 100, 0)))}
                  </span>
                </div>
                <div className="flex items-center justify-between text-white/40">
                  <span>Максимум</span>
                  <span className="font-extrabold text-[#ffd08a]">{format(caseData.featured?.priceCoins || 0)}</span>
                </div>
                <div className="flex items-center justify-between text-white/40">
                  <span>Предметов</span>
                  <span className="font-extrabold text-white/75">{caseData.totalItems}</span>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-[#59d98d]/20 bg-[#59d98d]/[0.06] px-2.5 py-2 text-[9px] leading-4 text-[#8bffba]/80">
                Шансы зафиксированы весами и не меняются от предыдущих открытий.
              </div>
            </div>

            {!result && !isOpening && (
              <button
                type="button"
                onClick={() => onOpen(caseData)}
                disabled={!affordable}
                className="cs2-btn-primary w-full"
              >
                <CS2Icon name="box" size={15} />
                {caseData.free ? 'Открыть бесплатно' : format(price)}
              </button>
            )}
            <button type="button" onClick={onGoStore} className="cs2-btn-ghost w-full">
              <CS2Icon name="bag" size={14} />
              Пополнить инвентарь
            </button>
          </aside>
        </div>
      </div>
    </div>
  )
}

function formatLeft(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
