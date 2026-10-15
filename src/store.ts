import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { MIN, finishFocus, idleTimer, pause, resume, start, switchTask, uid } from './lib/timer'
import type { Note, Preset, Session, Settings, Task, TimerState } from './lib/types'

export const PRESETS: Preset[] = [
  { id: 'sprint', name: 'Sprint', focusMin: 25, breakMin: 5 },
  { id: 'deep', name: 'Deep', focusMin: 50, breakMin: 10 },
  { id: 'cycle', name: 'Cycle', focusMin: 90, breakMin: 20 },
  { id: 'marathon', name: 'Marathon', focusMin: 240, breakMin: 30 },
]

export const DEFAULT_SETTINGS: Settings = {
  presetId: 'deep',
  customFocusMin: 75,
  customBreakMin: 15,
  flowOvertime: true,
  autoStartBreak: false,
  autoStartFocus: false,
  repeatAlarm: true,
  alarmVolume: 0.7,
  soundscape: 'off',
  soundscapeVolume: 0.35,
  keepAwake: true,
  notifications: false,
  screenWakeLock: false,
  tunesBridge: true,
  dailyGoalMin: 240,
}

export interface Ringing {
  kind: 'focus-end' | 'break-end'
  at: number
}

interface Data {
  settings: Settings
  tasks: Task[]
  notes: Note[]
  sessions: Session[]
  timer: TimerState
  /** Session awaiting a depth rating. */
  pendingRating: string | null
  ringing: Ringing | null
  /** Length of the next break, scaled up after long overtime. */
  nextBreakMs: number | null
}

interface Actions {
  setSettings: (patch: Partial<Settings>) => void
  addTask: (title: string, estimateMin: number | null) => string
  updateTask: (id: string, patch: Partial<Pick<Task, 'title' | 'estimateMin'>>) => void
  toggleDone: (id: string) => void
  removeTask: (id: string) => void
  selectTask: (id: string | null) => void
  moveTask: (id: string, dir: -1 | 1) => void
  clearDone: () => void
  addNote: (text: string) => void
  removeNote: (id: string) => void
  noteToTask: (id: string) => void
  startFocus: (opts?: { minutes?: number; taskId?: string | null }) => void
  startBreak: () => void
  pauseTimer: () => void
  resumeTimer: () => void
  /** End the current block early (focus is logged if at least a minute). */
  stopTimer: () => void
  /** End focus (normal or overtime) and move on to a break. */
  finishToBreak: (startNow: boolean) => void
  /** Called by the engine when the planned time runs out. */
  reach: (now?: number) => void
  /** Overtime nobody responded to: log only the planned time. */
  autoFinish: () => void
  acknowledge: () => void
  rate: (id: string, depth: 1 | 2 | 3 | null) => void
  importData: (data: Partial<Data>) => void
  resetAll: () => void
}

export type Store = Data & Actions

export function durations(s: Settings): { focusMin: number; breakMin: number } {
  if (s.presetId === 'custom') return { focusMin: s.customFocusMin, breakMin: s.customBreakMin }
  const p = PRESETS.find((x) => x.id === s.presetId) ?? PRESETS[1]
  return { focusMin: p.focusMin, breakMin: p.breakMin }
}

const initial = (): Data => ({
  settings: { ...DEFAULT_SETTINGS },
  tasks: [],
  notes: [],
  sessions: [],
  timer: idleTimer(),
  pendingRating: null,
  ringing: null,
  nextBreakMs: null,
})

/** Sessions shorter than this are not worth logging. */
const MIN_LOG_MS = MIN

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const log = (session: Session | null): Partial<Data> => {
        if (!session || session.focusMs < MIN_LOG_MS) return {}
        const { focusMin, breakMin } = durations(get().settings)
        // Flowtime-style: long overtime earns a proportionally longer break (1/5 of focus).
        const scaled = Math.max(breakMin * MIN, Math.round(session.focusMs / 5 / MIN) * MIN)
        return {
          sessions: [...get().sessions, session],
          pendingRating: session.id,
          nextBreakMs: session.focusMs > focusMin * MIN * 1.2 ? scaled : null,
        }
      }

      const breakMs = () => get().nextBreakMs ?? durations(get().settings).breakMin * MIN

      return {
        ...initial(),

        setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),

        addTask: (title, estimateMin) => {
          const id = uid()
          const task: Task = { id, title: title.trim(), estimateMin, done: false, createdAt: Date.now(), doneAt: null }
          set({ tasks: [...get().tasks, task] })
          return id
        },
        updateTask: (id, patch) => set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
        toggleDone: (id) => {
          const now = Date.now()
          const tasks = get().tasks.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: t.done ? null : now } : t))
          let timer = get().timer
          const nowDone = tasks.find((t) => t.id === id)?.done
          // Finishing the active task closes its time segment; the clock keeps running.
          if (timer.taskId === id && nowDone) timer = switchTask(timer, null, now)
          set({ tasks, timer })
        },
        removeTask: (id) => {
          const timer = get().timer.taskId === id ? switchTask(get().timer, null, Date.now()) : get().timer
          set({ tasks: get().tasks.filter((t) => t.id !== id), timer })
        },
        selectTask: (id) => set({ timer: switchTask(get().timer, id, Date.now()) }),
        moveTask: (id, dir) => {
          const tasks = [...get().tasks]
          const i = tasks.findIndex((t) => t.id === id)
          const j = i + dir
          if (i < 0 || j < 0 || j >= tasks.length) return
          ;[tasks[i], tasks[j]] = [tasks[j], tasks[i]]
          set({ tasks })
        },
        clearDone: () => set({ tasks: get().tasks.filter((t) => !t.done) }),

        addNote: (text) => {
          if (!text.trim()) return
          set({ notes: [...get().notes, { id: uid(), text: text.trim(), at: Date.now() }] })
        },
        removeNote: (id) => set({ notes: get().notes.filter((n) => n.id !== id) }),
        noteToTask: (id) => {
          const note = get().notes.find((n) => n.id === id)
          if (!note) return
          get().addTask(note.text, null)
          get().removeNote(id)
        },

        startFocus: (opts = {}) => {
          const now = Date.now()
          let timer = get().timer
          // Already focusing: picking a task just switches what the time counts toward.
          if (timer.phase === 'focus' && opts.taskId !== undefined) {
            set({ timer: resume(switchTask(timer, opts.taskId, now), now), ringing: null })
            return
          }
          // Starting focus during a break ends the break.
          if (opts.taskId !== undefined) timer = { ...timer, taskId: opts.taskId }
          const minutes = opts.minutes ?? durations(get().settings).focusMin
          set({ timer: start(timer, 'focus', minutes * MIN, now), ringing: null, pendingRating: null, nextBreakMs: null })
        },

        startBreak: () => {
          const now = Date.now()
          const t = get().timer
          const logged: Partial<Data> = t.phase === 'focus' ? log(finishFocus(t, now)) : {}
          const ms = logged.nextBreakMs ?? breakMs()
          set({ ...logged, timer: start(t, 'break', ms, now), ringing: null, nextBreakMs: null })
        },

        pauseTimer: () => set({ timer: pause(get().timer, Date.now()), ringing: null }),
        resumeTimer: () => set({ timer: resume(get().timer, Date.now()), ringing: null }),

        stopTimer: () => {
          const now = Date.now()
          const t = get().timer
          if (t.phase === 'focus') {
            set({ ...log(finishFocus(t, now)), timer: idleTimer('break', t.taskId), ringing: null })
          } else {
            set({ timer: idleTimer('focus', t.taskId), ringing: null, nextBreakMs: null })
          }
        },

        finishToBreak: (startNow) => {
          const now = Date.now()
          const t = get().timer
          if (t.phase !== 'focus') return
          const logged = log(finishFocus(t, now))
          if (startNow) {
            const ms = logged.nextBreakMs ?? durations(get().settings).breakMin * MIN
            set({ ...logged, timer: start(t, 'break', ms, now), ringing: null, nextBreakMs: null })
          } else {
            set({ ...logged, timer: idleTimer('break', t.taskId), ringing: null })
          }
        },

        reach: (now = Date.now()) => {
          const { timer: t, settings } = get()
          if (t.phase === 'idle' || t.reached) return
          // Use the moment it actually ran out, not when we noticed (the tab may have been asleep).
          const due = t.resumedAt !== null ? t.resumedAt + (t.plannedMs - t.accMs) : now
          if (t.phase === 'focus') {
            if (settings.flowOvertime) {
              set({ timer: { ...t, reached: true }, ringing: { kind: 'focus-end', at: due } })
              return
            }
            const capped = { ...t, accMs: t.plannedMs, resumedAt: null }
            const logged = log(finishFocus(capped, due))
            const ms = logged.nextBreakMs ?? durations(settings).breakMin * MIN
            set({
              ...logged,
              timer: settings.autoStartBreak ? { ...start(t, 'break', ms, due), reached: false } : idleTimer('break', t.taskId),
              ringing: { kind: 'focus-end', at: due },
            })
            return
          }
          // Break over.
          set({
            timer: settings.autoStartFocus
              ? start(t, 'focus', durations(settings).focusMin * MIN, due)
              : idleTimer('focus', t.taskId),
            ringing: { kind: 'break-end', at: due },
            nextBreakMs: null,
          })
        },

        autoFinish: () => {
          const t = get().timer
          if (t.phase !== 'focus') return
          const logged = log(finishFocus(t, Date.now(), true))
          set({ ...logged, timer: idleTimer('break', t.taskId), ringing: null })
        },

        acknowledge: () => {
          const t = get().timer
          set({ ringing: null, timer: t.reached ? { ...t, acknowledged: true } : t })
        },

        rate: (id, depth) =>
          set({
            sessions: get().sessions.map((s) => (s.id === id ? { ...s, depth } : s)),
            pendingRating: get().pendingRating === id ? null : get().pendingRating,
          }),

        importData: (data) => {
          const base = initial()
          set({
            settings: { ...base.settings, ...(data.settings ?? {}) },
            tasks: Array.isArray(data.tasks) ? data.tasks : [],
            notes: Array.isArray(data.notes) ? data.notes : [],
            sessions: Array.isArray(data.sessions) ? data.sessions : [],
            timer: idleTimer(),
            pendingRating: null,
            ringing: null,
            nextBreakMs: null,
          })
        },

        resetAll: () => set(initial()),
      }
    },
    {
      name: 'flowstate',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        settings: s.settings,
        tasks: s.tasks,
        notes: s.notes,
        sessions: s.sessions,
        timer: s.timer,
        pendingRating: s.pendingRating,
        nextBreakMs: s.nextBreakMs,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Data>
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } }
      },
    },
  ),
)

export function exportData(): string {
  const { settings, tasks, notes, sessions } = useStore.getState()
  return JSON.stringify({ app: 'flowstate', v: 1, exportedAt: new Date().toISOString(), settings, tasks, notes, sessions }, null, 2)
}

