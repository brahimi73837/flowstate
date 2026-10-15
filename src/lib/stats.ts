import { dayKey } from './format'
import type { Session } from './types'

const DAY = 86_400_000

export function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function byDay(sessions: Session[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of sessions) {
    const k = dayKey(s.start)
    map.set(k, (map.get(k) ?? 0) + s.focusMs)
  }
  return map
}

export interface DayBar {
  key: string
  date: Date
  ms: number
}

/** The last `n` days ending today, oldest first. */
export function lastDays(sessions: Session[], n: number, now: number): DayBar[] {
  const map = byDay(sessions)
  const today = startOfDay(now)
  const out: DayBar[] = []
  for (let i = n - 1; i >= 0; i--) {
    // Step via Date to stay correct across DST changes.
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = dayKey(d)
    out.push({ key, date: d, ms: map.get(key) ?? 0 })
  }
  return out
}

export function sumBetween(sessions: Session[], from: number, to: number): number {
  let ms = 0
  for (const s of sessions) if (s.start >= from && s.start < to) ms += s.focusMs
  return ms
}

export function startOfWeek(t: number): number {
  const d = new Date(startOfDay(t))
  const dow = (d.getDay() + 6) % 7 // Monday first
  d.setDate(d.getDate() - dow)
  return d.getTime()
}

export function startOfMonth(t: number): number {
  const d = new Date(startOfDay(t))
  d.setDate(1)
  return d.getTime()
}

/** Consecutive days with any focus, counting back from today (or yesterday if today is empty). */
export function streak(sessions: Session[], now: number, minMs = 60_000): number {
  const map = byDay(sessions)
  const d = new Date(startOfDay(now))
  if ((map.get(dayKey(d)) ?? 0) < minMs) d.setDate(d.getDate() - 1)
  let n = 0
  while ((map.get(dayKey(d)) ?? 0) >= minMs) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** Focus minutes by hour of day (0-23), spreading each session across the hours it covered. */
export function byHour(sessions: Session[]): number[] {
  const hours = new Array(24).fill(0)
  for (const s of sessions) {
    // Distribute focus time proportionally over the wall-clock span.
    const span = Math.max(1, s.end - s.start)
    const ratio = s.focusMs / span
    let t = s.start
    while (t < s.end) {
      const d = new Date(t)
      const next = new Date(d)
      next.setMinutes(0, 0, 0)
      next.setHours(d.getHours() + 1)
      const stop = Math.min(next.getTime(), s.end)
      hours[d.getHours()] += (stop - t) * ratio
      t = stop
    }
  }
  return hours
}

export interface MonthCell {
  key: string
  date: Date
  ms: number
  inMonth: boolean
  future: boolean
}

/** Calendar grid (Monday-first weeks) for the month containing `t`. */
export function monthGrid(sessions: Session[], t: number, now: number): MonthCell[] {
  const map = byDay(sessions)
  const first = new Date(startOfMonth(t))
  const month = first.getMonth()
  const d = new Date(startOfWeek(first.getTime()))
  const cells: MonthCell[] = []
  const today = startOfDay(now)
  do {
    for (let i = 0; i < 7; i++) {
      const key = dayKey(d)
      cells.push({ key, date: new Date(d), ms: map.get(key) ?? 0, inMonth: d.getMonth() === month, future: d.getTime() > today })
      d.setDate(d.getDate() + 1)
    }
  } while (d.getMonth() === month)
  return cells
}

export function taskTotals(sessions: Session[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of sessions) for (const [k, v] of Object.entries(s.segments)) map.set(k, (map.get(k) ?? 0) + v)
  return map
}

export function averageDepth(sessions: Session[]): number | null {
  const rated = sessions.filter((s) => s.depth)
  if (!rated.length) return null
  return rated.reduce((a, s) => a + (s.depth ?? 0), 0) / rated.length
}

export { DAY }
