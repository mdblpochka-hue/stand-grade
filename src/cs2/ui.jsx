import { useState } from 'react'
import { formatCs2Price } from './currency'
import { rarityLabel } from './cases'

const ICON_PATHS = {
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
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 1 0-2.1 5" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.4 4.1L17.5 9l-4.1 1.4L12 14.5l-1.4-4.1L6.5 9l4.1-1.9L12 3Z" />
      <path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5M12 7v5l3 2" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v10M14.8 8.8c-.6-.5-1.5-.8-2.8-.8-1.7 0-2.8.8-2.8 2 0 2.9 6.2 1.4 6.2 4.4 0 1.3-1.3 2.2-3.4 2.2-1.3 0-2.5-.4-3.2-1" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 1 1 4.5-2.5L12 8m4.5 0A2.5 2.5 0 1 0 12 5.5L12 8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 21c.6-4 2.6-6 6-6s5.4 2 6 6M16 4.5a3 3 0 0 1 0 6M18 15c1.5.8 2.4 2.4 2.7 4.8" />
    </>
  ),
}

export function CS2Icon({ name, size = 18, className = '', strokeWidth = 2 }) {
  const paths = ICON_PATHS[name]
  if (!paths) return null
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
      {paths}
    </svg>
  )
}

export function SkinImage({ skin, className = '', imgClassName = '' }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {skin?.image && !failed ? (
        <img
          src={skin.image}
          alt={skin.name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={`h-full w-full object-contain drop-shadow-[0_10px_22px_rgba(0,0,0,.5)] ${imgClassName}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] font-black uppercase tracking-[0.16em] text-white/20">
          {skin?.weapon || 'CS2'}
        </div>
      )}
    </div>
  )
}

export function RarityTag({ skin, className = '' }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[6.5px] font-black uppercase tracking-[0.07em] ${className}`}
      style={{
        color: skin?.rarityColor || '#b0c3d9',
        borderColor: `${skin?.rarityColor || '#b0c3d9'}35`,
        backgroundColor: `${skin?.rarityColor || '#b0c3d9'}0d`,
      }}
    >
      <span
        className="h-1 w-1 rounded-full"
        style={{ backgroundColor: skin?.rarityColor || '#b0c3d9' }}
      />
      {rarityLabel(skin?.rarity || 'Consumer Grade')}
    </span>
  )
}

export function CaseArt({ caseData, className = '' }) {
  const accent = caseData?.accent || '#f0a92e'
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/[0.07] ${className}`}
      style={{
        background: `radial-gradient(ellipse at 50% 10%, ${accent}26 0%, transparent 60%), linear-gradient(160deg, #151c24 0%, #080c11 100%)`,
      }}
    >
      <div className="absolute inset-0 cs2-grid opacity-[0.18]" />
      <div
        className="absolute left-1/2 top-1/2 h-40 w-52 -translate-x-1/2 -translate-y-1/2 rounded-[26px] border shadow-[0_18px_50px_rgba(0,0,0,.45)]"
        style={{
          borderColor: `${accent}35`,
          background: `linear-gradient(145deg, ${accent}22 0%, #0c1219 48%, #05080b 100%)`,
        }}
      >
        <div className="absolute inset-x-3 top-3 flex items-center justify-between">
          <span className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[6px] font-black uppercase tracking-[0.14em] text-white/45">
            CS2
          </span>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        </div>
        <div className="absolute inset-x-2 top-8 bottom-6">
          <SkinImage skin={caseData?.featured} className="h-full w-full" imgClassName="opacity-90" />
        </div>
        <div className="absolute inset-x-3 bottom-2 flex items-center justify-between">
          <span className="text-[6px] font-black uppercase tracking-[0.16em] text-white/25">Drop</span>
          <span className="h-px w-8" style={{ backgroundColor: `${accent}70` }} />
        </div>
      </div>
    </div>
  )
}

export function SkinCard({
  skin,
  format,
  selected = false,
  onClick,
  disabled = false,
  footer = null,
  compact = false,
  badge = null,
}) {
  const accent = skin?.rarityColor || '#b0c3d9'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group relative overflow-hidden rounded-xl border text-left transition disabled:cursor-default ${
        selected
          ? 'border-[#f0a92e]/70 shadow-[0_0_28px_rgba(240,169,46,.18)]'
          : 'border-white/[0.08] hover:border-white/20'
      } ${compact ? 'p-1.5' : 'p-2'}`}
      style={{
        background: `radial-gradient(ellipse at 50% 0%, ${accent}20 0%, transparent 62%), linear-gradient(160deg, #111820 0%, #080c11 100%)`,
      }}
    >
      <div className={compact ? 'h-12' : 'h-20'}>
        <SkinImage skin={skin} className="h-full w-full" imgClassName="group-hover:scale-[1.04]" />
      </div>
      <div className="relative mt-1">
        <div className="flex items-center justify-between gap-1">
          <span
            className="truncate text-[6px] font-black uppercase tracking-[0.08em]"
            style={{ color: accent }}
          >
            {skin?.weapon || skin?.category}
          </span>
          {skin?.stattrak && (
            <span className="shrink-0 rounded bg-[#f0a92e]/15 px-1 text-[5.5px] font-black text-[#ffd08a]">
              ST
            </span>
          )}
        </div>
        <div className={`truncate font-extrabold text-white/85 ${compact ? 'text-[7px]' : 'text-[8px]'}`}>
          {skin?.name}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <span className="truncate text-[6px] font-semibold text-white/25">{skin?.wear}</span>
          <span className="shrink-0 text-[7px] font-extrabold tabular-nums text-[#f4c568]">
            {format(skin?.priceCoins || 0)}
          </span>
        </div>
      </div>
      {selected && (
        <span className="absolute right-1.5 top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-[#f0a92e] text-[9px] font-black text-[#1c1200]">
          ✓
        </span>
      )}
      {badge}
      {footer}
    </button>
  )
}

export function CS2Confetti({ count = 16 }) {
  const colors = ['#f0a92e', '#4aa8ff', '#ff7a59', '#7ef0c0', '#ffffff', '#c08bff']
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl">
      {Array.from({ length: count }).map((_, index) => (
        <span
          key={index}
          className="glyph-confetti absolute top-1 h-1.5 w-1 rounded-[1px]"
          style={{
            left: `${6 + index * 6}%`,
            backgroundColor: colors[index % colors.length],
            animationDelay: `${(index % 5) * 45}ms`,
            '--dx': `${((index % 5) - 2) * 15}px`,
            '--dy': `${100 + (index % 4) * 24}px`,
            '--rot': `${((index % 7) - 3) * 120}deg`,
          }}
        />
      ))}
    </div>
  )
}

export function formatChance(value) {
  const number = Number(value) || 0
  if (number >= 10) return `${number.toFixed(1)}%`
  if (number >= 1) return `${number.toFixed(2)}%`
  return `${number.toFixed(3)}%`
}

export function cs2Price(coins, currency) {
  return formatCs2Price(coins, currency)
}
