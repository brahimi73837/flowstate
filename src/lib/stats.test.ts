import { describe, expect, it } from 'vitest'
import { byHour, lastDays, monthGrid, streak, sumBetween, startOfDay } from './stats'
import type { Session } from './types'

const H = 3_600_000
const mk = (start: Date, hours: number): Session => ({
  id: String(start.getTime()),
  start: start.getTime(),
  end: start.getTime() + hours * H,
  focusMs: hours * H,
  plannedMs: hours * H,
  segments: {},
  completed: true,
  depth: null,
})

describe('stats', () => {
  const now = new Date(2026, 9, 15, 18, 0).getTime()
  const sessions = [
    mk(new Date(2026, 9, 15, 9, 0), 2),
    mk(new Date(2026, 9, 14, 9, 30), 1),
    mk(new Date(2026, 9, 13, 14, 0), 0.5),
    mk(new Date(2026, 9, 10, 10, 0), 1),
  ]

  it('sums today', () => {
    expect(sumBetween(sessions, startOfDay(now), Infinity)).toBe(2 * H)
  })

  it('builds the last n days ending today', () => {
    const days = lastDays(sessions, 7, now)
    expect(days).toHaveLength(7)
    expect(days[6].ms).toBe(2 * H)
    expect(days[5].ms).toBe(1 * H)
    expect(days[0].key).toBe('2026-10-09')
  })

  it('counts a streak of consecutive days', () => {
    expect(streak(sessions, now)).toBe(3)
    // Today not started yet: the streak through yesterday still stands.
    expect(streak(sessions.slice(1), now)).toBe(2)
  })

  it('spreads sessions across hours', () => {
    const hours = byHour([mk(new Date(2026, 9, 15, 9, 30), 1)])
    expect(hours[9]).toBeCloseTo(H / 2)
    expect(hours[10]).toBeCloseTo(H / 2)
  })

  it('lays out a Monday-first month grid', () => {
    const cells = monthGrid(sessions, now, now)
    expect(cells.length % 7).toBe(0)
    expect(cells[0].date.getDay()).toBe(1)
    expect(cells.find((c) => c.key === '2026-10-15')?.ms).toBe(2 * H)
    expect(cells.find((c) => c.key === '2026-10-20')?.future).toBe(true)
  })
})
