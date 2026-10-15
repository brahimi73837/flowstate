import { describe, expect, it } from 'vitest'
import { MIN, dueAt, elapsed, finishFocus, idleTimer, liveSegments, parseMinutes, pause, remaining, resume, start, switchTask } from './timer'

const T0 = 1_700_000_000_000

describe('timer math', () => {
  it('counts from wall-clock time, not ticks', () => {
    const t = start(idleTimer(), 'focus', 50 * MIN, T0)
    expect(remaining(t, T0 + 10 * MIN)).toBe(40 * MIN)
    // A tab asleep for an hour still knows exactly where it is.
    expect(remaining(t, T0 + 60 * MIN)).toBe(-10 * MIN)
    expect(dueAt(t)).toBe(T0 + 50 * MIN)
  })

  it('pauses and resumes without losing time', () => {
    let t = start(idleTimer(), 'focus', 25 * MIN, T0)
    t = pause(t, T0 + 5 * MIN)
    expect(elapsed(t, T0 + 30 * MIN)).toBe(5 * MIN)
    expect(dueAt(t)).toBeNull()
    t = resume(t, T0 + 30 * MIN)
    expect(dueAt(t)).toBe(T0 + 50 * MIN)
    expect(remaining(t, T0 + 40 * MIN)).toBe(10 * MIN)
  })

  it('splits focus time across tasks', () => {
    let t = start({ ...idleTimer(), taskId: 'a' }, 'focus', 50 * MIN, T0)
    t = switchTask(t, 'b', T0 + 20 * MIN)
    t = pause(t, T0 + 30 * MIN)
    t = resume(t, T0 + 40 * MIN)
    t = switchTask(t, null, T0 + 45 * MIN)
    expect(liveSegments(t, T0 + 50 * MIN)).toEqual({ a: 20 * MIN, b: 15 * MIN, '': 5 * MIN })
    const s = finishFocus(t, T0 + 50 * MIN)!
    expect(s.focusMs).toBe(40 * MIN)
    expect(s.segments).toEqual({ a: 20 * MIN, b: 15 * MIN, '': 5 * MIN })
    expect(s.completed).toBe(false)
  })

  it('caps unattended overtime at the planned length', () => {
    const t = { ...start({ ...idleTimer(), taskId: 'a' }, 'focus', 50 * MIN, T0), reached: true }
    const s = finishFocus(t, T0 + 100 * MIN, true)!
    expect(s.focusMs).toBe(50 * MIN)
    expect(s.end).toBe(T0 + 50 * MIN)
    expect(s.segments.a).toBe(50 * MIN)
    expect(s.completed).toBe(true)
  })

  it('parses human durations', () => {
    expect(parseMinutes('45')).toBe(45)
    expect(parseMinutes('45m')).toBe(45)
    expect(parseMinutes('1h')).toBe(60)
    expect(parseMinutes('1h30')).toBe(90)
    expect(parseMinutes('1h 30m')).toBe(90)
    expect(parseMinutes('1.5h')).toBe(90)
    expect(parseMinutes('2:15')).toBe(135)
    expect(parseMinutes('')).toBeNull()
    expect(parseMinutes('soon')).toBeNull()
  })
})
