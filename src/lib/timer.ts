import type { Segments, Session, TimerState } from './types'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const MIN = 60_000

/** Stop counting overtime nobody responded to after this long. */
export const UNATTENDED_OVERTIME_MS = 30 * MIN

export const idleTimer = (up: 'focus' | 'break' = 'focus', taskId: string | null = null): TimerState => ({
  phase: 'idle',
  up,
  sessionId: null,
  plannedMs: 0,
  startedAt: null,
  accMs: 0,
  resumedAt: null,
  taskId,
  segStart: 0,
  segments: {},
  reached: false,
  acknowledged: false,
})

export const isRunning = (t: TimerState) => t.phase !== 'idle' && t.resumedAt !== null

export function elapsed(t: TimerState, now: number): number {
  return t.accMs + (t.resumedAt !== null ? Math.max(0, now - t.resumedAt) : 0)
}

/** Negative once the planned time is over (overtime). */
export function remaining(t: TimerState, now: number): number {
  return t.plannedMs - elapsed(t, now)
}

/** Wall-clock moment the planned time runs out, if the timer is running. */
export function dueAt(t: TimerState): number | null {
  if (t.phase === 'idle' || t.resumedAt === null) return null
  return t.resumedAt + (t.plannedMs - t.accMs)
}

export function start(t: TimerState, kind: 'focus' | 'break', plannedMs: number, now: number): TimerState {
  return {
    ...idleTimer(kind, t.taskId),
    phase: kind,
    sessionId: uid(),
    plannedMs,
    startedAt: now,
    resumedAt: now,
  }
}

export function pause(t: TimerState, now: number): TimerState {
  if (!isRunning(t)) return t
  return { ...t, accMs: elapsed(t, now), resumedAt: null }
}

export function resume(t: TimerState, now: number): TimerState {
  if (t.phase === 'idle' || t.resumedAt !== null) return t
  return { ...t, resumedAt: now }
}

/** Close the running task segment at elapsed value `at`. */
function closeSegment(t: TimerState, at: number): Segments {
  const ms = Math.max(0, at - t.segStart)
  if (t.phase !== 'focus' || ms === 0) return t.segments
  const key = t.taskId ?? ''
  return { ...t.segments, [key]: (t.segments[key] ?? 0) + ms }
}

export function switchTask(t: TimerState, taskId: string | null, now: number): TimerState {
  if (t.taskId === taskId) return t
  if (t.phase !== 'focus') return { ...t, taskId }
  const at = elapsed(t, now)
  return { ...t, segments: closeSegment(t, at), segStart: at, taskId }
}

/** Live per-task focus time including the open segment. */
export function liveSegments(t: TimerState, now: number): Segments {
  return closeSegment(t, elapsed(t, now))
}

/**
 * End a focus block and produce its log entry.
 * `capAtPlan` logs only the planned time (used when overtime went unattended).
 */
export function finishFocus(t: TimerState, now: number, capAtPlan = false): Session | null {
  if (t.phase !== 'focus' || t.startedAt === null) return null
  let focusMs = elapsed(t, now)
  let segments = closeSegment(t, focusMs)
  let end = now
  if (capAtPlan && focusMs > t.plannedMs) {
    const scale = t.plannedMs / focusMs
    segments = Object.fromEntries(Object.entries(segments).map(([k, v]) => [k, Math.round(v * scale)]))
    focusMs = t.plannedMs
    end = dueAt(t) ?? now
  }
  return {
    id: t.sessionId ?? uid(),
    start: t.startedAt,
    end,
    focusMs,
    plannedMs: t.plannedMs,
    segments,
    completed: focusMs >= t.plannedMs - 1000,
    depth: null,
  }
}

/** Parse "45", "45m", "1h", "1h30", "1h 30m", "1.5h" into minutes. */
export function parseMinutes(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null
  let m = s.match(/^(\d+(?:\.\d+)?)h(?:(\d+)m?)?$/)
  if (m) return Math.round(parseFloat(m[1]) * 60 + (m[2] ? parseInt(m[2], 10) : 0)) || null
  m = s.match(/^(\d+)(?:m|min)?$/)
  if (m) return parseInt(m[1], 10) || null
  m = s.match(/^(\d+):(\d{2})$/)
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) || null
  return null
}
