import type { Soundscape } from './types'

/**
 * All sound is synthesized with Web Audio — no files, no network.
 *
 * Why this matters for reliability: browsers throttle or freeze JavaScript in
 * background tabs, which is how other timers end up ringing late. Sounds that
 * are *scheduled ahead of time* on the AudioContext clock are rendered by the
 * audio thread, not by page JavaScript, so the alarm fires on time even when
 * timers are throttled. On top of that, a tab that is producing audio is
 * treated as "in use" and exempt from throttling and tab sleeping — which the
 * keep-awake bed provides.
 */

type ChimeKind = 'focus-end' | 'break-end' | 'test'

const NOTES: Record<ChimeKind, number[]> = {
  // Rising major triad: a gentle "surface".
  'focus-end': [523.25, 659.25, 783.99],
  // Rising fourth: "back in".
  'break-end': [392.0, 523.25],
  test: [523.25, 659.25, 783.99],
}

const PARTIALS: [ratio: number, gain: number, decay: number][] = [
  [1, 1, 2.6],
  [2.0, 0.42, 1.6],
  [3.01, 0.18, 1.0],
  [5.43, 0.07, 0.5],
]

export const REPEAT_EVERY_S = 120
export const REPEAT_COUNT = 3

/** Level for the keep-awake bed: above Chromium's -72 dBFS audibility threshold, below what you can hear. */
const KEEP_AWAKE_GAIN = 0.004

class AudioEngine {
  private ctx: AudioContext | null = null
  private alarmBus: GainNode | null = null
  private scheduled: { node: AudioScheduledSourceNode; at: number }[] = []
  private firstChimeAt: number | null = null
  private bed: { stop: () => void; gain: GainNode; kind: Soundscape | 'keep-awake' } | null = null
  private buffers = new Map<string, AudioBuffer>()

  /** Create or resume the context. Call from a user gesture the first time. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return
        this.ctx = new Ctor({ latencyHint: 'playback' })
        this.alarmBus = this.ctx.createGain()
        this.alarmBus.connect(this.ctx.destination)
      }
      if (this.ctx.state !== 'running') void this.ctx.resume()
    } catch {
      /* audio unavailable */
    }
  }

  get ready(): boolean {
    return this.ctx?.state === 'running'
  }

  onStateChange(fn: () => void): () => void {
    const ctx = this.ctx
    if (!ctx) return () => {}
    ctx.addEventListener('statechange', fn)
    return () => ctx.removeEventListener('statechange', fn)
  }

  private chimeAt(when: number, kind: ChimeKind, volume: number) {
    const ctx = this.ctx!
    const notes = NOTES[kind]
    notes.forEach((freq, i) => {
      const t0 = when + i * 0.32
      for (const [ratio, g, decay] of PARTIALS) {
        const osc = ctx.createOscillator()
        const env = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq * ratio
        env.gain.setValueAtTime(0, t0)
        env.gain.linearRampToValueAtTime(g * volume * 0.32, t0 + 0.012)
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + decay)
        osc.connect(env).connect(this.alarmBus!)
        osc.start(t0)
        osc.stop(t0 + decay + 0.05)
        this.scheduled.push({ node: osc, at: t0 })
      }
    })
  }

  /**
   * Pre-schedule the end-of-block chime `delayMs` from now, plus optional
   * repeats that get a little louder each time.
   */
  scheduleAlarm(delayMs: number, kind: ChimeKind, volume: number, repeat: boolean): void {
    this.cancelAlarm()
    if (!this.ctx || !this.alarmBus) return
    const when = this.ctx.currentTime + Math.max(0.05, delayMs / 1000)
    this.firstChimeAt = when
    const count = repeat ? 1 + REPEAT_COUNT : 1
    for (let i = 0; i < count; i++) {
      this.chimeAt(when + i * REPEAT_EVERY_S, kind, Math.min(1, volume * (1 + i * 0.25)))
    }
  }

  /** True when the pre-scheduled first chime has already sounded (or is about to). */
  alarmHasPlayed(): boolean {
    if (!this.ctx || this.firstChimeAt === null) return false
    return this.ctx.state === 'running' && this.ctx.currentTime >= this.firstChimeAt - 0.25
  }

  /** Cancel what is pending. Notes already sounding ring out naturally. */
  cancelAlarm(): void {
    const now = this.ctx?.currentTime ?? 0
    for (const { node, at } of this.scheduled) {
      if (at <= now) continue
      try {
        node.stop()
        node.disconnect()
      } catch {
        /* already stopped */
      }
    }
    this.scheduled = []
    this.firstChimeAt = null
  }

  ring(kind: ChimeKind, volume: number, repeat = false): void {
    this.unlock()
    if (!this.ctx) return
    this.scheduleAlarm(0, kind, volume, repeat)
  }

  // ---- Soundscapes ------------------------------------------------------

  private noise(kind: 'brown' | 'pink'): AudioBuffer {
    const cached = this.buffers.get(kind)
    if (cached) return cached
    const ctx = this.ctx!
    const len = ctx.sampleRate * 8
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      if (kind === 'brown') {
        let last = 0
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1
          last = (last + 0.02 * white) / 1.02
          data[i] = last * 3.5
        }
      } else {
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1
          b0 = 0.99886 * b0 + white * 0.0555179
          b1 = 0.99332 * b1 + white * 0.0750759
          b2 = 0.969 * b2 + white * 0.153852
          b3 = 0.8665 * b3 + white * 0.3104856
          b4 = 0.55 * b4 + white * 0.5329522
          b5 = -0.7616 * b5 - white * 0.016898
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
          b6 = white * 0.115926
        }
      }
      // Crossfade the loop seam.
      const fade = Math.floor(ctx.sampleRate * 0.5)
      for (let i = 0; i < fade; i++) {
        const a = i / fade
        data[i] = data[i] * a + data[len - fade + i] * (1 - a)
      }
    }
    const trimmed = ctx.createBuffer(2, len - Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) trimmed.copyToChannel(buf.getChannelData(ch).subarray(0, trimmed.length), ch)
    this.buffers.set(kind, trimmed)
    return trimmed
  }

  private buildBed(kind: Soundscape | 'keep-awake'): { stop: () => void; gain: GainNode } {
    const ctx = this.ctx!
    const out = ctx.createGain()
    out.gain.value = 0
    out.connect(ctx.destination)
    const src = ctx.createBufferSource()
    src.loop = true
    const extra: AudioScheduledSourceNode[] = []

    if (kind === 'rain') {
      src.buffer = this.noise('pink')
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 400
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 6000
      src.connect(hp).connect(lp).connect(out)
    } else if (kind === 'ocean') {
      src.buffer = this.noise('brown')
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 900
      const swell = ctx.createGain()
      swell.gain.value = 0.6
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.075
      const depth = ctx.createGain()
      depth.gain.value = 0.4
      lfo.connect(depth).connect(swell.gain)
      lfo.start()
      extra.push(lfo)
      src.connect(lp).connect(swell).connect(out)
    } else {
      src.buffer = this.noise('brown')
      if (kind === 'keep-awake') {
        // Sub-bass only: laptop speakers can't reproduce it, the level meter still sees it.
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 120
        src.connect(lp).connect(out)
      } else {
        src.connect(out)
      }
    }
    src.start()
    return {
      gain: out,
      stop: () => {
        const t = ctx.currentTime
        out.gain.cancelScheduledValues(t)
        out.gain.setTargetAtTime(0, t, 0.4)
        setTimeout(() => {
          try {
            src.stop()
            extra.forEach((n) => n.stop())
            out.disconnect()
          } catch {
            /* noop */
          }
        }, 2500)
      },
    }
  }

  /**
   * Set what plays underneath. `active` is whether a session is running.
   * With no soundscape, keep-awake plays an inaudible bed during sessions.
   */
  setBed(soundscape: Soundscape, volume: number, keepAwake: boolean, active: boolean): void {
    if (!this.ctx) return
    let want: Soundscape | 'keep-awake' | null = null
    if (active && soundscape !== 'off' && volume > 0) want = soundscape
    else if (active && keepAwake) want = 'keep-awake'

    const level = want === 'keep-awake' ? KEEP_AWAKE_GAIN : (volume * volume) * 0.5

    if (this.bed && this.bed.kind !== want) {
      this.bed.stop()
      this.bed = null
    }
    if (want && !this.bed) {
      const b = this.buildBed(want)
      this.bed = { ...b, kind: want }
    }
    if (this.bed) {
      const t = this.ctx.currentTime
      this.bed.gain.gain.cancelScheduledValues(t)
      this.bed.gain.gain.setTargetAtTime(level, t, want === 'keep-awake' ? 0.05 : 0.8)
    }
  }
}

export const audio = new AudioEngine()
