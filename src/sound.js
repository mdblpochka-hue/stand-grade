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

function tick(freq, gain = 0.024, duration = 0.035) {
  tone({ freq, duration, type: 'square', gain })
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

/**
 * Тики апгрейда строго по вращению стрелки: звук играет в момент,
 * когда стрелка пересекает очередную чёрточку на колесе (каждые 9°).
 */
export function startUpgradeTickSound(needle, duration) {
  if (!enabled || !needle) return () => {}
  const ctx = ensureContext()
  if (!ctx) return () => {}

  const step = duration < 1000 ? 45 : 9
  const startedAt = performance.now()
  let stopped = false
  let frameId = 0
  let lastAngle = 0
  let cumulative = 0
  let lastTick = -1

  const poll = () => {
    if (stopped) return
    let angle = 0
    const transform = window.getComputedStyle(needle).transform
    if (transform && transform !== 'none') {
      const values = transform.match(/matrix\(([^)]+)\)/)
      if (values) {
        const parts = values[1].split(',').map(Number)
        if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
          angle = (Math.atan2(parts[1], parts[0]) * 180) / Math.PI
        }
      }
    }
    angle = ((angle % 360) + 360) % 360

    let delta = angle - lastAngle
    if (delta < -180) delta += 360
    cumulative += delta
    lastAngle = angle

    const tickIndex = Math.floor(cumulative / step)
    if (tickIndex > lastTick) {
      const count = Math.min(3, tickIndex - lastTick)
      for (let index = 0; index < count; index += 1) {
        tick(1480 + ((tickIndex + index) % 4) * 45, 0.014, 0.016)
      }
      lastTick = tickIndex
    }

    if (performance.now() - startedAt < duration + 220) {
      frameId = requestAnimationFrame(poll)
    }
  }

  frameId = requestAnimationFrame(poll)

  return () => {
    stopped = true
    cancelAnimationFrame(frameId)
  }
}

export function playCaseResult(rarity = 'Common') {
  if (!enabled) return
  const order = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Arcane', 'Nameless']
  const tier = Math.max(0, order.indexOf(rarity))
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

export function playCoin() {
  if (!enabled) return
  tone({ freq: 880, duration: 0.09, type: 'square', gain: 0.02 })
  tone({ freq: 1318.5, duration: 0.16, type: 'square', gain: 0.018, delay: 0.07 })
}
