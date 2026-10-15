import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN } from './lib/timer'
import { useStore } from './store'

const T0 = new Date(2026, 9, 15, 9, 0).getTime()

describe('store flow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    useStore.getState().resetAll()
  })

  it('flow overtime: keeps counting, rings once, logs everything on finish', () => {
    const s = useStore.getState()
    const id = s.addTask('Write report', 60)
    s.selectTask(id)
    s.startFocus({ minutes: 50 })
    vi.setSystemTime(T0 + 50 * MIN + 3000)
    useStore.getState().reach()
    let st = useStore.getState()
    expect(st.timer.reached).toBe(true)
    expect(st.ringing?.kind).toBe('focus-end')
    // Reported at the true due time, not when it was noticed.
    expect(st.ringing?.at).toBe(T0 + 50 * MIN)
    vi.setSystemTime(T0 + 70 * MIN)
    st.finishToBreak(true)
    st = useStore.getState()
    expect(st.sessions).toHaveLength(1)
    expect(st.sessions[0].focusMs).toBe(70 * MIN)
    expect(st.sessions[0].segments[id]).toBe(70 * MIN)
    expect(st.timer.phase).toBe('break')
    // Planned 10m break, but 70m of focus earns 14m.
    expect(st.timer.plannedMs).toBe(14 * MIN)
    expect(st.pendingRating).toBe(st.sessions[0].id)
  })

  it('classic mode: stops at the plan and waits for the break', () => {
    useStore.getState().setSettings({ flowOvertime: false, presetId: 'sprint' })
    useStore.getState().startFocus()
    vi.setSystemTime(T0 + 40 * MIN) // noticed late (tab was asleep)
    useStore.getState().reach()
    const st = useStore.getState()
    expect(st.sessions[0].focusMs).toBe(25 * MIN)
    expect(st.sessions[0].end).toBe(T0 + 25 * MIN)
    expect(st.timer.phase).toBe('idle')
    expect(st.timer.up).toBe('break')
  })

  it('auto-starts the break from the real end time', () => {
    useStore.getState().setSettings({ flowOvertime: false, autoStartBreak: true, presetId: 'sprint' })
    useStore.getState().startFocus()
    vi.setSystemTime(T0 + 27 * MIN)
    useStore.getState().reach()
    const t = useStore.getState().timer
    expect(t.phase).toBe('break')
    expect(t.startedAt).toBe(T0 + 25 * MIN)
  })

  it('does not log blocks under a minute', () => {
    useStore.getState().startFocus()
    vi.setSystemTime(T0 + 30_000)
    useStore.getState().stopTimer()
    expect(useStore.getState().sessions).toHaveLength(0)
  })

  it('finishing the active task keeps the clock running', () => {
    const s = useStore.getState()
    const id = s.addTask('A', null)
    const id2 = s.addTask('B', null)
    s.selectTask(id)
    s.startFocus()
    vi.setSystemTime(T0 + 10 * MIN)
    useStore.getState().toggleDone(id)
    expect(useStore.getState().timer.taskId).toBeNull()
    expect(useStore.getState().timer.phase).toBe('focus')
    useStore.getState().startFocus({ taskId: id2 })
    vi.setSystemTime(T0 + 20 * MIN)
    useStore.getState().stopTimer()
    const seg = useStore.getState().sessions[0].segments
    expect(seg[id]).toBe(10 * MIN)
    expect(seg[id2]).toBe(10 * MIN)
  })

  it('auto-finishes unattended overtime at the plan', () => {
    useStore.getState().startFocus({ minutes: 50 })
    vi.setSystemTime(T0 + 50 * MIN)
    useStore.getState().reach()
    vi.setSystemTime(T0 + 90 * MIN)
    useStore.getState().autoFinish()
    expect(useStore.getState().sessions[0].focusMs).toBe(50 * MIN)
  })
})
