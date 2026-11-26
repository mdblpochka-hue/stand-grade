import { useEffect, useMemo, useState } from 'react'
import { CS2Icon, SkinImage, RarityTag, SkinCard, formatChance } from './ui'
import { pickCaseSkin, rarityLabel } from './cases'

const CATEGORY_LABELS = {
  'Все': 'Все',
  Knives: 'Ножи',
  Gloves: 'Перчатки',
  Rifles: 'Винтовки',
  Pistols: 'Пистолеты',
  SMGs: 'Пистолеты-пулемёты',
  Heavy: 'Тяжёлое',
}

const RARITY_FILTERS = [
  'Все',
  'Consumer Grade',
  'Industrial Grade',
  'Mil-Spec Grade',
  'Restricted',
  'Classified',
  'Covert',
  'Extraordinary',
  'Contraband',
]

const HISTORY_LABELS = {
  case: 'Открытие кейса',
  sell: 'Продажа',
  upgrade: 'Апгрейд',
  upgrade_fail: 'Апгрейд',
  contract: 'Контракт',
  store: 'Магазин',
  free: 'Бесплатный кейс',
  battle: 'Битва',
}

function EmptyState({ title, text, action }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.015] p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#f0a92e]/20 bg-[#f0a92e]/[0.07] text-[#f0a92e]">
        <CS2Icon name="archive" size={24} />
      </div>
      <h3 className="mt-4 font-display text-base font-bold text-white">{title}</h3>
      <p className="mt-2 max-w-md text-[12px] leading-5 text-white/40">{text}</p>
      {action}
    </div>
  )
}

function StatCard({ label, value, sub, icon, accent = '#f0a92e' }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b1016]/80 p-4">
      <div
        className="absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl"
        style={{ backgroundColor: `${accent}18` }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/28">{label}</div>
          <div className="mt-1.5 font-display text-lg font-bold tabular-nums text-white">{value}</div>
          {sub && <div className="mt-0.5 text-[10px] font-semibold text-white/32">{sub}</div>}
        </div>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl border"
          style={{ color: accent, borderColor: `${accent}30`, backgroundColor: `${accent}10` }}
        >
          <CS2Icon name={icon} size={16} />
        </span>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition ${
        active
          ? 'border-[#f0a92e]/50 bg-[#f0a92e]/12 text-[#ffd08a]'
          : 'border-white/[0.07] bg-white/[0.025] text-white/45 hover:border-white/15 hover:text-white/75'
      }`}
    >
      {children}
    </button>
  )
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center">
      <CS2Icon name="search" size={14} className="absolute left-3 text-white/25" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] pl-9 pr-3 text-[12px] font-semibold text-white placeholder:text-white/25 focus:border-[#f0a92e]/45 focus:outline-none"
      />
    </label>
  )
}

/* ------------------------------------------------------------------ */
/*  Cases                                                              */
/* ------------------------------------------------------------------ */

export function Cs2Cases({
  cases,
  currency,
  format,
  balance,
  now,
  lastFreeAt,
  onOpenCase,
  onGoStore,
}) {
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')

  const freeCase = cases.find((item) => item.free)
  const freeStamp = lastFreeAt ? new Date(lastFreeAt).getTime() : 0
  const freeReady = !freeCase || !freeStamp || !Number.isFinite(freeStamp) || now - freeStamp >= 86400000
  const freeLeft = freeCase && Number.isFinite(freeStamp) && freeStamp
    ? Math.max(0, 86400000 - (now - freeStamp))
    : 0

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return cases.filter((item) => {
      if (category !== 'all' && item.category !== category) return false
      if (!needle) return true
      return `${item.name} ${item.subtitle} ${item.featured?.name || ''}`
        .toLowerCase()
        .includes(needle)
    })
  }, [cases, category, query])

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#080c12]">
        <div className="absolute inset-0 cs2-grid opacity-30" />
        <div className="absolute -left-24 top-0 h-64 w-64 rounded-full bg-[#4aa8ff]/10 blur-[90px]" />
        <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-[#f0a92e]/12 blur-[100px]" />
        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.2fr_.8fr] lg:p-9">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#f0a92e]/25 bg-[#f0a92e]/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-[#ffd08a]">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#f0a92e]" />
              Counter-Strike 2 · Drop arena
            </span>
            <h1 className="mt-4 max-w-2xl font-display text-2xl font-extrabold leading-[1.12] tracking-[-0.03em] text-white sm:text-4xl">
              Кейсы CS2 с реальными скинами,{' '}
              <span className="bg-gradient-to-r from-[#ffd08a] via-[#f0a92e] to-[#4aa8ff] bg-clip-text text-transparent">
                честными шансами
              </span>{' '}
              и живым курсом
            </h1>
            <p className="mt-3 max-w-xl text-[12px] leading-6 text-white/42 sm:text-[13px]">
              Ножи, перчатки и все редкости CS2. Цены пересчитываются в КС коины, доллары,
              белорусские и российские рубли мгновенно. Инвентарь, апгрейд и контракты работают
              на той же базе скинов.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => onOpenCase(cases[0])} className="cs2-btn-primary" disabled={!cases.length}>
                <CS2Icon name="box" size={15} />
                Открыть кейс
              </button>
              <button type="button" onClick={onGoStore} className="cs2-btn-ghost">
                <CS2Icon name="bag" size={15} />
                Магазин скинов
              </button>
            </div>
            <div className="mt-6 grid max-w-md grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2">
                <div className="text-[8px] font-black uppercase tracking-[0.14em] text-white/25">Кейсов</div>
                <div className="mt-1 text-sm font-extrabold tabular-nums text-white">{cases.length}</div>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2">
                <div className="text-[8px] font-black uppercase tracking-[0.14em] text-white/25">Дропов</div>
                <div className="mt-1 text-sm font-extrabold tabular-nums text-white">
                  {cases.reduce((sum, item) => sum + item.totalItems, 0)}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2">
                <div className="text-[8px] font-black uppercase tracking-[0.14em] text-white/25">Баланс</div>
                <div className="mt-1 truncate text-sm font-extrabold tabular-nums text-[#ffd08a]">
                  {format(balance)}
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex min-h-[220px] items-center justify-center">
            <div className="absolute h-44 w-44 rounded-full border border-[#f0a92e]/20" />
            <div className="absolute h-60 w-60 rounded-full border border-[#4aa8ff]/10" />
            <div className="relative w-full max-w-[280px] rotate-[-4deg]">
              {freeCase ? (
                <button
                  type="button"
                  onClick={() => onOpenCase(freeCase)}
                  className="group w-full text-left"
                >
                  <div className="cs2-free-glow overflow-hidden rounded-2xl border border-[#59d98d]/25 bg-[#08110c] p-2 transition group-hover:border-[#59d98d]/50">
                    <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-[#59d98d]/10 to-transparent">
                      <SkinImage skin={freeCase.featured} className="h-28 w-full" />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-2">
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.16em] text-[#8bffba]">
                          Ежедневный дроп
                        </div>
                        <div className="text-[11px] font-bold text-white/70">
                          {freeReady ? 'Бесплатно · готов' : `Через ${formatCountdown(freeLeft)}`}
                        </div>
                      </div>
                      <span className="rounded-lg bg-[#59d98d] px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-[#04130a]">
                        Free
                      </span>
                    </div>
                  </div>
                </button>
              ) : (
                <div className="rounded-2xl border border-white/10 p-6 text-center text-xs text-white/40">
                  Каталог загружается…
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-white">Все кейсы</h2>
            <p className="mt-0.5 text-[11px] font-semibold text-white/32">
              Прогнозная отдача и полный список шансов — внутри каждого кейса.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Поиск кейса…" />
          </div>
        </div>

        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {[
            { id: 'all', label: 'Все кейсы' },
            { id: 'farm', label: 'Фарм' },
            { id: 'knife', label: 'Ножи' },
            { id: 'glove', label: 'Перчатки' },
            { id: 'weapon', label: 'Оружие' },
            { id: 'rarity', label: 'Редкости' },
            { id: 'free', label: 'Бесплатные' },
          ].map((item) => (
            <FilterChip key={item.id} active={category === item.id} onClick={() => setCategory(item.id)}>
              {item.label}
            </FilterChip>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((item) => (
            <CaseCard
              key={item.id}
              caseData={item}
              format={format}
              onOpen={() => onOpenCase(item)}
              freeReady={item.free ? freeReady : true}
              freeLeft={item.free ? freeLeft : 0}
            />
          ))}
        </div>
        {!visible.length && (
          <div className="mt-4">
            <EmptyState title="Кейсы не найдены" text="Измените категорию или поисковый запрос." />
          </div>
        )}
      </section>
    </div>
  )
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function CaseCard({ caseData, format, onOpen, freeReady, freeLeft }) {
  const accent = caseData.accent || '#f0a92e'
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={caseData.free && !freeReady}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0f15] text-left transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-70"
    >
      <div
        className="absolute inset-0 opacity-70 transition group-hover:opacity-100"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${accent}20 0%, transparent 62%), linear-gradient(160deg, #10171f 0%, #070b10 100%)`,
        }}
      />
      <div className="absolute inset-0 cs2-grid opacity-[0.15]" />
      <div className="relative p-3">
        <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-xl border border-white/[0.05] bg-black/25">
          <div
            className="absolute inset-x-6 top-3 h-20 rounded-full blur-2xl"
            style={{ backgroundColor: `${accent}22` }}
          />
          <SkinImage skin={caseData.featured} className="relative h-28 w-full" imgClassName="group-hover:scale-[1.05]" />
          <span className="absolute left-2 top-2 rounded border border-white/10 bg-black/45 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.14em] text-white/45">
            {caseData.free ? 'FREE' : 'CS2'}
          </span>
          <span
            className="absolute right-2 top-2 rounded border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.12em]"
            style={{ color: accent, borderColor: `${accent}40`, backgroundColor: `${accent}12` }}
          >
            {caseData.totalItems} дропов
          </span>
        </div>
        <div className="mt-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-display text-[13px] font-bold text-white group-hover:text-[#ffd08a]">
                {caseData.name}
              </h3>
              <p className="mt-0.5 truncate text-[9.5px] font-semibold text-white/32">{caseData.subtitle}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] font-extrabold tabular-nums text-[#ffd08a]">
              {caseData.free ? (freeReady ? 'Бесплатно' : formatCountdown(freeLeft)) : format(caseData.priceCoins)}
            </span>
            <span className="shrink-0 rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[8px] font-bold text-white/40">
              RTP {caseData.rtp ? `${Math.round(caseData.rtp * 100)}%` : 'free'}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Inventory                                                          */
/* ------------------------------------------------------------------ */

export function Cs2Inventory({ items, currency, format, onSell, onSellAll, onUseInUpgrade }) {
  const [category, setCategory] = useState('Все')
  const [sort, setSort] = useState('new')
  const [query, setQuery] = useState('')

  const total = items.reduce((sum, item) => sum + item.priceCoins, 0)
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let result = items.filter((item) => {
      if (category !== 'Все' && item.category !== category) return false
      return !needle || `${item.name} ${item.weapon}`.toLowerCase().includes(needle)
    })
    if (sort === 'price-desc') result = [...result].sort((a, b) => b.priceCoins - a.priceCoins)
    else if (sort === 'price-asc') result = [...result].sort((a, b) => a.priceCoins - b.priceCoins)
    return result
  }, [items, category, sort, query])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-white">Инвентарь CS2</h1>
          <p className="mt-1 text-[11px] font-semibold text-white/35">
            Все скины хранятся в аккаунте {items.length ? '· продажа возвращает 90% цены' : '· пока пусто'}
          </p>
        </div>
        {items.length > 0 && (
          <button type="button" onClick={onSellAll} className="cs2-btn-ghost text-[#ff9a8b]">
            Продать всё · {format(Math.round(total * 0.9))}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Скинов" value={items.length} sub="в инвентаре" icon="archive" accent="#4aa8ff" />
        <StatCard label="Стоимость" value={format(total)} sub="рыночная цена" icon="coin" accent="#f0a92e" />
        <StatCard
          label="Лучший скин"
          value={items.length ? items.reduce((best, item) => (item.priceCoins > best.priceCoins ? item : best), items[0]).name : '—'}
          sub={items.length ? format(items.reduce((best, item) => (item.priceCoins > best.priceCoins ? item : best), items[0]).priceCoins) : ''}
          icon="sparkles"
          accent="#c08bff"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {['Все', 'Knives', 'Gloves', 'Rifles', 'Pistols', 'SMGs', 'Heavy'].map((item) => (
          <FilterChip key={item} active={category === item} onClick={() => setCategory(item)}>
            {CATEGORY_LABELS[item]}
          </FilterChip>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Поиск скина…" />
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="cs2-select h-9">
            <option value="new">Сначала новые</option>
            <option value="price-desc">Дороже</option>
            <option value="price-asc">Дешевле</option>
          </select>
        </div>
      </div>

      {visible.length ? (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visible.map((item) => (
            <div
              key={item.instanceId}
              className="group overflow-hidden rounded-xl border border-white/[0.07] bg-[#0a0f15] p-2 transition hover:border-white/20"
            >
              <SkinCard
                skin={item}
                format={format}
                compact
                disabled
                footer={null}
                badge={
                  item.stattrak ? (
                    <span className="absolute left-1.5 top-1.5 rounded bg-[#f0a92e]/15 px-1 text-[6px] font-black text-[#ffd08a]">
                      ST
                    </span>
                  ) : null
                }
              />
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onUseInUpgrade(item)}
                  className="rounded-md border border-white/[0.07] bg-white/[0.03] py-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-white/55 transition hover:border-[#4aa8ff]/35 hover:text-[#9fd0ff]"
                >
                  Апгрейд
                </button>
                <button
                  type="button"
                  onClick={() => onSell(item)}
                  className="rounded-md border border-[#ff7a59]/20 bg-[#ff7a59]/[0.07] py-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-[#ffb0a0] transition hover:border-[#ff7a59]/45"
                >
                  {format(Math.round(item.priceCoins * 0.9))}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Инвентарь пуст"
          text="Откройте кейс или купите скин в магазине — дропы сразу появятся здесь."
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Upgrade                                                            */
/* ------------------------------------------------------------------ */

export function Cs2Upgrade({ items, catalog, format, currency, prefillId, onUpgrade }) {
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Все')
  const [result, setResult] = useState(null)

  useEffect(() => {
    const id = String(prefillId || '').split(':')[0]
    if (id) setSourceId(id)
  }, [prefillId])

  useEffect(() => {
    if (sourceId && !items.some((item) => item.instanceId === sourceId)) setSourceId('')
  }, [items, sourceId])

  const source = items.find((item) => item.instanceId === sourceId) || null
  const target = catalog.find((item) => item.id === targetId) || null
  const chance = source && target ? Math.min(90, Math.max(1, (source.priceCoins / target.priceCoins) * 90)) : 0

  const targets = useMemo(() => {
    if (!source) return []
    const needle = query.trim().toLowerCase()
    return catalog
      .filter((item) => item.priceCoins >= source.priceCoins * 1.1)
      .filter((item) => category === 'Все' || item.category === category)
      .filter((item) => !needle || `${item.name} ${item.weapon}`.toLowerCase().includes(needle))
      .sort((a, b) => a.priceCoins - b.priceCoins)
      .slice(0, 60)
  }, [catalog, source, category, query])

  function handleUpgrade() {
    if (!source || !target) return
    const outcome = onUpgrade(source, target)
    if (outcome) setResult(outcome)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-white">Апгрейд CS2</h1>
        <p className="mt-1 text-[11px] font-semibold text-white/35">
          Обменяйте скин на более дорогой. Шанс зависит от соотношения цен, скрытой комиссии нет.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl border border-white/[0.07] bg-[#0a0f15] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-white/30">Ваш скин</span>
            {source && <span className="text-[10px] font-extrabold text-[#ffd08a]">{format(source.priceCoins)}</span>}
          </div>
          {source ? (
            <SkinCard skin={source} format={format} disabled />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-white/10 text-[11px] font-semibold text-white/30">
              Выберите предмет ниже
            </div>
          )}
          {source && (
            <button
              type="button"
              onClick={() => setSourceId('')}
              className="mt-2 w-full rounded-lg border border-white/[0.07] py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/35 hover:text-white/70"
            >
              Сбросить
            </button>
          )}
        </div>

        <div className="flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#f0a92e]/25 bg-[#f0a92e]/10 text-[#f0a92e]">
            <CS2Icon name="refresh" size={18} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-[#0a0f15] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-white/30">Цель</span>
            {target && <span className="text-[10px] font-extrabold text-[#7ef0c0]">{format(target.priceCoins)}</span>}
          </div>
          {target ? (
            <SkinCard skin={target} format={format} disabled />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-white/10 px-4 text-center text-[11px] font-semibold text-white/30">
              Выберите скин дороже источника
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-[#0a0f15] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/30">Шанс успеха</div>
            <div className="mt-1 font-display text-2xl font-extrabold tabular-nums text-[#f0a92e]">
              {chance ? `${chance.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="cs2-select">
              {Object.keys(CATEGORY_LABELS).map((item) => (
                <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>
              ))}
            </select>
            <SearchInput value={query} onChange={setQuery} placeholder="Поиск цели…" />
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={!source || !target}
              className="cs2-btn-primary"
            >
              <CS2Icon name="refresh" size={15} />
              Апгрейд
            </button>
          </div>
        </div>
        {source && !targets.length && (
          <p className="mt-3 text-[11px] text-white/35">
            Нет доступных целей дороже {format(source.priceCoins)}. Снимите фильтры или выберите
            другой источник.
          </p>
        )}
        <div className="mt-3 grid max-h-[330px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {targets.map((item) => (
            <SkinCard
              key={item.id}
              skin={item}
              format={format}
              compact
              selected={targetId === item.id}
              onClick={() => setTargetId(item.id)}
            />
          ))}
        </div>
        {!source && items.length > 0 && (
          <div className="mt-4">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/30">Инвентарь</div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {items.map((item) => (
                <SkinCard
                  key={item.instanceId}
                  skin={item}
                  format={format}
                  compact
                  selected={sourceId === item.instanceId}
                  onClick={() => setSourceId(item.instanceId)}
                />
              ))}
            </div>
          </div>
        )}
        {!items.length && (
          <p className="mt-3 text-[11px] text-white/35">
            Для апгрейда нужен хотя бы один скин в инвентаре.
          </p>
        )}
      </div>

      {result && (
        <Cs2ResultModal
          result={result}
          format={format}
          onClose={() => setResult(null)}
          title={result.success ? 'Апгрейд успешен' : 'Апгрейд не удался'}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Contracts                                                          */
/* ------------------------------------------------------------------ */

export function Cs2Contracts({ items, catalog, format, onContract }) {
  const [selected, setSelected] = useState([])
  const [result, setResult] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setSelected((prev) => prev.filter((id) => items.some((item) => item.instanceId === id)))
  }, [items])

  const selectedItems = selected
    .map((id) => items.find((item) => item.instanceId === id))
    .filter(Boolean)
  const total = selectedItems.reduce((sum, item) => sum + item.priceCoins, 0)
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((item) => !needle || `${item.name} ${item.weapon}`.toLowerCase().includes(needle))
  }, [items, query])

  function toggle(item) {
    setSelected((prev) => {
      if (prev.includes(item.instanceId)) return prev.filter((id) => id !== item.instanceId)
      if (prev.length >= 5) return [...prev.slice(1), item.instanceId]
      return [...prev, item.instanceId]
    })
  }

  function handleContract() {
    if (selectedItems.length < 2) return
    const outcome = onContract(selectedItems)
    if (outcome) {
      setResult(outcome)
      setSelected([])
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-white">Контракты CS2</h1>
        <p className="mt-1 text-[11px] font-semibold text-white/35">
          Обменяйте 2–5 скинов на один новый. Итоговая стоимость подбирается вокруг 90% суммы
          контракта.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-white/[0.07] bg-[#0a0f15] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/30">
              Выберите 2–5 скинов
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="Поиск в инвентаре…" />
          </div>
          {visible.length ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {visible.map((item) => {
                const active = selected.includes(item.instanceId)
                return (
                  <SkinCard
                    key={item.instanceId}
                    skin={item}
                    format={format}
                    compact
                    selected={active}
                    onClick={() => toggle(item)}
                  />
                )
              })}
            </div>
          ) : (
            <p className="mt-4 text-[11px] text-white/35">
              В инвентаре нет подходящих скинов. Откройте кейс или загляните в магазин.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-[#0a0f15] p-4">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/30">Контракт</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[11px] font-bold text-white/40">{selectedItems.length} / 5 скинов</span>
            <span className="font-display text-lg font-extrabold tabular-nums text-[#ffd08a]">{format(total)}</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {selectedItems.map((item) => (
              <div key={item.instanceId} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] p-1.5">
                <SkinImage skin={item} className="h-8 w-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] font-bold text-white/75">{item.name}</div>
                  <div className="text-[9px] font-semibold text-white/30">{format(item.priceCoins)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(item)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/30 hover:text-white/70"
                >
                  <CS2Icon name="close" size={11} />
                </button>
              </div>
            ))}
            {!selectedItems.length && (
              <div className="rounded-lg border border-dashed border-white/[0.08] p-4 text-center text-[10px] font-semibold text-white/25">
                Добавьте минимум 2 скина
              </div>
            )}
          </div>
          <div className="mt-3 rounded-lg border border-[#4aa8ff]/15 bg-[#4aa8ff]/[0.06] px-3 py-2">
            <div className="text-[8px] font-black uppercase tracking-[0.14em] text-[#9fd0ff]/70">Ожидаемый дроп</div>
            <div className="mt-1 text-[12px] font-extrabold tabular-nums text-[#9fd0ff]">
              ≈ {format(Math.round(total * 0.9))}
            </div>
          </div>
          <button
            type="button"
            onClick={handleContract}
            disabled={selectedItems.length < 2}
            className="cs2-btn-primary mt-3 w-full"
          >
            <CS2Icon name="sparkles" size={15} />
            Заключить контракт
          </button>
        </div>
      </div>

      {result && (
        <Cs2ResultModal
          result={result}
          format={format}
          onClose={() => setResult(null)}
          title="Результат контракта"
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

export function Cs2Store({ catalog, format, balance, onBuy }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Все')
  const [rarity, setRarity] = useState('Все')
  const [sort, setSort] = useState('price-asc')
  const [limit, setLimit] = useState(72)

  useEffect(() => setLimit(72), [query, category, rarity, sort])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let result = catalog.filter((item) => {
      if (category !== 'Все' && item.category !== category) return false
      if (rarity !== 'Все' && item.rarity !== rarity) return false
      return !needle || `${item.name} ${item.weapon}`.toLowerCase().includes(needle)
    })
    if (sort === 'price-desc') result = [...result].sort((a, b) => b.priceCoins - a.priceCoins)
    else if (sort === 'name') result = [...result].sort((a, b) => a.name.localeCompare(b.name))
    else result = [...result].sort((a, b) => a.priceCoins - b.priceCoins)
    return result
  }, [catalog, query, category, rarity, sort])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-white">Магазин CS2</h1>
          <p className="mt-1 text-[11px] font-semibold text-white/35">
            Купить скин можно сразу за внутренние коины. Баланс: {format(balance)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Поиск скина…" />
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="cs2-select">
            {Object.keys(CATEGORY_LABELS).map((item) => (
              <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>
            ))}
          </select>
          <select value={rarity} onChange={(event) => setRarity(event.target.value)} className="cs2-select">
            {RARITY_FILTERS.map((item) => (
              <option key={item} value={item}>{item === 'Все' ? 'Все редкости' : rarityLabel(item)}</option>
            ))}
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="cs2-select">
            <option value="price-asc">Сначала дешёвые</option>
            <option value="price-desc">Сначала дорогие</option>
            <option value="name">По названию</option>
          </select>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {visible.slice(0, limit).map((item) => {
          const affordable = balance >= item.priceCoins
          return (
            <div key={item.id} className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#0a0f15] p-2">
              <SkinCard skin={item} format={format} disabled compact />
              <button
                type="button"
                onClick={() => onBuy(item)}
                disabled={!affordable}
                className={`mt-1.5 w-full rounded-lg border py-1.5 text-[9px] font-black uppercase tracking-[0.1em] transition ${
                  affordable
                    ? 'border-[#f0a92e]/25 bg-[#f0a92e]/[0.08] text-[#ffd08a] hover:border-[#f0a92e]/50'
                    : 'border-white/[0.06] bg-white/[0.02] text-white/25'
                }`}
              >
                {affordable ? 'Купить' : 'Недостаточно коинов'}
              </button>
            </div>
          )
        })}
      </div>

      {visible.length > limit && (
        <div className="flex justify-center">
          <button type="button" onClick={() => setLimit((value) => value + 72)} className="cs2-btn-ghost">
            Показать ещё {Math.min(72, visible.length - limit)}
          </button>
        </div>
      )}
      {!visible.length && <EmptyState title="Ничего не найдено" text="Измените фильтры или запрос." />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Battle                                                             */
/* ------------------------------------------------------------------ */

const BOT_NAMES = ['BOT Neo', 'BOT Viper', 'BOT Frost']

function skinsWord(value) {
  const number = Math.abs(Number(value) || 0) % 100
  const last = number % 10
  if (number > 10 && number < 20) return 'скинов'
  if (last === 1) return 'скин'
  if (last >= 2 && last <= 4) return 'скина'
  return 'скинов'
}

export function Cs2Battle({ cases, format, balance, onBattle }) {
  const paidCases = useMemo(() => cases.filter((item) => !item.free), [cases])
  const [caseId, setCaseId] = useState(paidCases[0]?.id || '')
  const [players, setPlayers] = useState(2)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!paidCases.some((item) => item.id === caseId)) setCaseId(paidCases[0]?.id || '')
  }, [paidCases, caseId])

  const caseData = paidCases.find((item) => item.id === caseId) || paidCases[0]
  const entry = caseData?.priceCoins || 0
  const affordable = entry > 0 && balance >= entry

  function start() {
    if (!caseData) return
    const outcome = onBattle(caseData, players)
    if (outcome) setResult(outcome)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-white">Битва CS2</h1>
        <p className="mt-1 text-[11px] font-semibold text-white/35">
          Вы и боты открывают один и тот же кейс. Победитель забирает все скины. Вход — цена
          кейса.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-white/[0.07] bg-[#0a0f15] p-4">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/30">
            Выберите кейс
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {paidCases.slice(0, 12).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCaseId(item.id)}
                className={`rounded-xl border p-2 text-left transition ${
                  caseId === item.id
                    ? 'border-[#f0a92e]/55 bg-[#f0a92e]/[0.08]'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                }`}
              >
                <SkinImage skin={item.featured} className="h-14 w-full" />
                <div className="mt-1 truncate text-[10px] font-bold text-white/75">{item.name}</div>
                <div className="mt-0.5 flex items-center justify-between text-[8.5px] font-bold">
                  <span className="text-[#ffd08a]">{format(item.priceCoins)}</span>
                  <span className="text-white/25">RTP {Math.round((item.rtp || 0) * 100)}%</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-[#0a0f15] p-4">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/30">
            Состав битвы
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-lg border border-[#59d98d]/30 bg-[#59d98d]/[0.08] px-2.5 py-1.5 text-[10px] font-extrabold text-[#8bffba]">
              ВЫ
            </span>
            {BOT_NAMES.slice(0, players - 1).map((name) => (
              <span key={name} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-bold text-white/50">
                {name}
              </span>
            ))}
          </div>
          <div className="mt-4 flex gap-1.5">
            {[2, 3, 4].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setPlayers(count)}
                className={`flex-1 rounded-lg border py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${
                  players === count
                    ? 'border-[#4aa8ff]/45 bg-[#4aa8ff]/[0.1] text-[#9fd0ff]'
                    : 'border-white/[0.07] bg-white/[0.025] text-white/35'
                }`}
              >
                {count} игрока
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-1.5 text-[10px]">
            <div className="flex justify-between text-white/40">
              <span>Кейс</span>
              <span className="font-extrabold text-white/75">{caseData?.name || '—'}</span>
            </div>
            <div className="flex justify-between text-white/40">
              <span>Вход</span>
              <span className="font-extrabold text-[#ffd08a]">{format(entry)}</span>
            </div>
            <div className="flex justify-between text-white/40">
              <span>Шанс победы</span>
              <span className="font-extrabold text-white/75">≈ {Math.round(100 / players)}%</span>
            </div>
            <div className="flex justify-between text-white/40">
              <span>Ваш баланс</span>
              <span className="font-extrabold text-white/75">{format(balance)}</span>
            </div>
          </div>
          <button type="button" onClick={start} disabled={!affordable || !caseData} className="cs2-btn-primary mt-4 w-full">
            <CS2Icon name="users" size={15} />
            Начать битву · {format(entry)}
          </button>
          {!affordable && (
            <div className="mt-2 text-center text-[10px] font-bold text-[#ff9a8b]">
              Недостаточно коинов для входа
            </div>
          )}
        </div>
      </div>

      {result && <BattleResultModal result={result} format={format} onClose={() => setResult(null)} />}
    </div>
  )
}

function BattleResultModal({ result, format, onClose }) {
  const total = result.drops.reduce((sum, drop) => sum + drop.skin.priceCoins, 0)
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="pop-in max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0a0f15] shadow-[0_30px_100px_rgba(0,0,0,.7)] sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div>
            <div className="font-display text-sm font-bold text-white">Итоги битвы</div>
            <div className="mt-0.5 text-[9px] font-semibold text-white/30">{result.caseData.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-white/40 hover:text-white"
          >
            <CS2Icon name="close" size={14} />
          </button>
        </div>
        <div className="p-4">
          <div className={`rounded-xl border px-3 py-2 text-center text-[11px] font-extrabold ${
            result.userWon
              ? 'border-[#59d98d]/25 bg-[#59d98d]/[0.07] text-[#8bffba]'
              : 'border-[#ff7a59]/25 bg-[#ff7a59]/[0.07] text-[#ffb0a0]'
          }`}>
            {result.userWon
              ? `Победа! Вы забрали ${result.drops.length} ${skinsWord(result.drops.length)} на ${format(total)}`
              : `Победил ${result.winner.name} · ${format(total)}`}
          </div>
          <div className="mt-3 space-y-2">
            {result.drops.map((drop, index) => {
              const winner = drop.isUser ? result.userWon : drop.name === result.winner.name
              return (
                <div
                  key={`${drop.name}-${index}`}
                  className={`flex items-center gap-2.5 rounded-xl border p-2 ${
                    winner
                      ? 'border-[#59d98d]/35 bg-[#59d98d]/[0.06]'
                      : 'border-white/[0.06] bg-white/[0.02]'
                  }`}
                >
                  <SkinImage skin={drop.skin} className="h-12 w-16 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-[10px] font-extrabold ${drop.isUser ? 'text-[#8bffba]' : 'text-white/80'}`}>
                        {drop.isUser ? 'ВЫ' : drop.name}
                      </span>
                      {winner && (
                        <span className="shrink-0 rounded bg-[#59d98d]/15 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.1em] text-[#8bffba]">
                          win
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[10px] font-bold text-white/55">{drop.skin.name}</div>
                    <div className="text-[9px] font-semibold text-white/28">{format(drop.skin.priceCoins)}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <button type="button" onClick={onClose} className="cs2-btn-primary mt-4 w-full">
            {result.userWon ? 'Забрать скины' : 'Понятно'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  History                                                            */
/* ------------------------------------------------------------------ */

export function Cs2History({ history, format }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-white">История CS2</h1>
        <p className="mt-1 text-[11px] font-semibold text-white/35">
          Открытия, продажи, апгрейды и покупки — всего событий: {history.length}.
        </p>
      </div>
      {history.length ? (
        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0f15]">
          {history.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 border-b border-white/[0.05] px-3 py-2.5 last:border-0 hover:bg-white/[0.02]"
            >
              <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-black/25">
                {entry.image ? (
                  <img src={entry.image} alt="" className="h-8 w-12 object-contain" loading="lazy" />
                ) : (
                  <CS2Icon name="history" size={16} className="text-white/25" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[11px] font-extrabold text-white/80">{entry.title}</span>
                  <span
                    className="shrink-0 rounded border px-1 py-0.5 text-[7px] font-black uppercase tracking-[0.08em]"
                    style={{
                      color: entry.rarityColor || '#b0c3d9',
                      borderColor: `${entry.rarityColor || '#b0c3d9'}30`,
                    }}
                  >
                    {HISTORY_LABELS[entry.type] || entry.type}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[9.5px] font-semibold text-white/30">{entry.detail}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] font-extrabold tabular-nums text-white/65">
                  {entry.priceCoins ? format(entry.priceCoins) : '—'}
                </div>
                <div className="mt-0.5 text-[8px] font-semibold text-white/25">
                  {new Date(entry.at).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="История пуста" text="Здесь появятся все операции с вашими CS2 скинами." />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Result modal                                                       */
/* ------------------------------------------------------------------ */

export function Cs2ResultModal({ result, format, onClose, title = 'Результат' }) {
  const skin = result.skin
  const success = result.success !== false
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="pop-in w-full max-w-md overflow-hidden rounded-t-3xl border border-white/10 bg-[#0b1016] shadow-[0_30px_90px_rgba(0,0,0,.65)] sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="font-display text-sm font-bold text-white">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-white/40 hover:text-white"
          >
            <CS2Icon name="close" size={14} />
          </button>
        </div>
        <div className="p-4">
          <div
            className="relative overflow-hidden rounded-2xl border p-3"
            style={{
              borderColor: `${skin?.rarityColor || '#b0c3d9'}35`,
              background: `radial-gradient(ellipse at 50% 0%, ${skin?.rarityColor || '#b0c3d9'}20, transparent 65%)`,
            }}
          >
            <SkinImage skin={skin} className="mx-auto h-32 w-full" />
            <div className="mt-2 text-center">
              <RarityTag skin={skin} />
              <div className="mt-1.5 text-sm font-extrabold text-white">{skin?.name || 'Скин'}</div>
              <div className="mt-0.5 text-[11px] font-bold tabular-nums text-[#ffd08a]">
                {format(skin?.priceCoins || 0)}
              </div>
            </div>
          </div>
          <div className={`mt-3 rounded-xl border px-3 py-2 text-center text-[11px] font-bold ${
            success
              ? 'border-[#59d98d]/25 bg-[#59d98d]/[0.07] text-[#8bffba]'
              : 'border-[#ff7a59]/25 bg-[#ff7a59]/[0.07] text-[#ffb0a0]'
          }`}>
            {result.message || (success ? 'Операция завершена успешно' : 'Повезёт в следующий раз')}
          </div>
          <button type="button" onClick={onClose} className="cs2-btn-primary mt-3 w-full">
            {success ? 'Забрать' : 'Понятно'}
          </button>
        </div>
      </div>
    </div>
  )
}

export { StatCard, FilterChip, SearchInput, EmptyState, CATEGORY_LABELS, RARITY_FILTERS }
