/* ------------------------------------------------------------------ */
/*  STAND GRADE · synth sounds                                          */
/*  Синтезированные эффекты в духе кейс-сайтов: тики рулетки,          */
/*  нарастание при апгрейде, победные и проигрышные аккорды.           */
/* ------------------------------------------------------------------ */

const SOUND_KEY = 'stand_grade_sound'

let audioContext = null
let enabled = true

try {
  enabled = localStorage.getItem(SOUND_KEY) !== 'off'
} catch {
  /* localStorage may be unavailable */
}

function ensureContext() {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  if (!audioContext) audioContext = new Ctor()
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {})
  }
  return audioContext
}

export function unlockAudio() {
  ensureContext()
}

export function isSoundEnabled() {
  return enabled
}

export function setSoundEnabled(value) {
  enabled = Boolean(value)
  try {
    localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off')
  } catch {
    /* ignore */
  }
}

function tone({ freq, duration = 0.12, type = 'triangle', gain = 0.05, slideTo, delay = 0 }) {
  if (!enabled) return
  const ctx = ensureContext()
  if (!ctx) return
  const startAt = ctx.currentTime + delay
  const oscillator = ctx.createOscillator()
  const volume = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(freq, startAt)
  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), startAt + duration)
  }
  volume.gain.setValueAtTime(0.0001, startAt)
  volume.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), startAt + 0.012)
  volume.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
  oscillator.connect(volume)
  volume.connect(ctx.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + duration + 0.03)
}

function tick(freq, gain = 0.024) {
  tone({ freq, duration: 0.035, type: 'square', gain })
}

/**
 * Тики, синхронные по ощущению со скоростью ленты:
 * медленный старт, быстрый центр, долгое затухание.
 */
export function startSpinSound(duration, variant = 'case') {
  if (!enabled) return () => {}
  const ctx = ensureContext()
  if (!ctx) return () => {}
  const startedAt = performance.now()
  const timers = []
  let stopped = false
  const base = variant === 'upgrade' ? 1.35 : 1

  const schedule = () => {
    if (stopped) return
    const elapsed = performance.now() - startedAt
    const progress = Math.min(1, elapsed / Math.max(120, duration))
    if (progress >= 1) return
    const speed = Math.sin(Math.PI * progress)
    tick((1150 + 900 * speed) * base, variant === 'upgrade' ? 0.02 : 0.026)
    if (variant === 'upgrade' && progress > 0.55 && progress < 0.6) {
      tone({ freq: 220, slideTo: 640, duration: 0.3, type: 'sawtooth', gain: 0.012 })
    }
    const delay = Math.max(34, 245 - 208 * speed)
    timers.push(setTimeout(schedule, delay))
  }

  schedule()

  return () => {
    stopped = true
    timers.forEach((timer) => clearTimeout(timer))
  }
}

export function playCaseResult(rarity = 'Common') {
  if (!enabled) return
  const order = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Arcane', 'Nameless']
  const cs2Tiers = {
    'Consumer Grade': 0,
    'Industrial Grade': 1,
    'Mil-Spec Grade': 2,
    Restricted: 3,
    Classified: 4,
    Covert: 5,
    Extraordinary: 6,
    Contraband: 6,
  }
  const tier = cs2Tiers[rarity] ?? Math.max(0, order.indexOf(rarity))
  const baseNotes = [392, 523.25, 659.25, 783.99, 987.77, 1174.66, 1396.91]
  const notes = baseNotes.slice(0, 3 + Math.min(4, tier))
  notes.forEach((freq, index) => {
    tone({
      freq,
      duration: 0.26,
      type: tier >= 5 ? 'triangle' : 'sine',
      gain: 0.05,
      delay: index * 0.075,
    })
  })
  if (tier >= 4) {
    tone({ freq: notes[notes.length - 1] * 2, duration: 0.4, type: 'sine', gain: 0.035, delay: 0.34 })
  }
}

export function playUpgradeResult(won) {
  if (!enabled) return
  if (won) {
    ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, index) => {
      tone({ freq, duration: 0.3, type: 'triangle', gain: 0.055, delay: index * 0.085 })
    })
  } else {
    ;[392, 311.13, 233.08].forEach((freq, index) => {
      tone({
        freq,
        duration: 0.34,
        type: 'sawtooth',
        gain: 0.03,
        slideTo: freq * 0.82,
        delay: index * 0.1,
      })
    })
  }
}

export function playGlyphSkip() {
  if (!enabled) return
  tone({ freq: 760, slideTo: 150, duration: 0.3, type: 'sawtooth', gain: 0.025 })
  tone({ freq: 320, slideTo: 90, duration: 0.24, type: 'triangle', gain: 0.03, delay: 0.05 })
  tone({ freq: 1180, duration: 0.08, type: 'square', gain: 0.012, delay: 0.22 })
}

/**
 * Результат открытия глифов:
 * jackpot — дроп 2x+ (фанфары + искры), profit — окуп меньше 2x, loss — обычный проигрыш.
 */
export function playGlyphResult(tier = 'loss') {
  if (!enabled) return
  if (tier === 'jackpot') {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]
    notes.forEach((freq, index) => {
      tone({ freq, duration: 0.32, type: 'triangle', gain: 0.055, delay: index * 0.07 })
    })
    tone({ freq: 261.63, duration: 0.55, type: 'triangle', gain: 0.03 })
    tone({ freq: 2093, duration: 0.5, type: 'sine', gain: 0.03, delay: 0.42 })
    ;[2637.02, 3135.96, 3520].forEach((freq, index) => {
      tone({ freq, duration: 0.16, type: 'sine', gain: 0.018, delay: 0.5 + index * 0.06 })
    })
    return
  }
  if (tier === 'profit') {
    ;[659.25, 880, 1046.5].forEach((freq, index) => {
      tone({ freq, duration: 0.22, type: 'sine', gain: 0.045, delay: index * 0.08 })
    })
    return
  }
  ;[233.08, 196].forEach((freq, index) => {
    tone({
      freq,
      duration: 0.2,
      type: 'triangle',
      gain: 0.03,
      slideTo: freq * 0.9,
      delay: index * 0.09,
    })
  })
}

export function playCoin() {
  if (!enabled) return
  tone({ freq: 880, duration: 0.09, type: 'square', gain: 0.02 })
  tone({ freq: 1318.5, duration: 0.16, type: 'square', gain: 0.018, delay: 0.07 })
}
