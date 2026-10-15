export type Phase = 'idle' | 'focus' | 'break'

export interface Preset {
  id: string
  name: string
  focusMin: number
  breakMin: number
}

export type Soundscape = 'off' | 'brown' | 'rain' | 'ocean'

export interface Settings {
  presetId: string
  customFocusMin: number
  customBreakMin: number
  /** When a focus block ends, keep counting as overtime instead of stopping. */
  flowOvertime: boolean
  autoStartBreak: boolean
  autoStartFocus: boolean
  /** Re-ring every 2 minutes until you respond, up to 3 times. */
  repeatAlarm: boolean
  alarmVolume: number
  soundscape: Soundscape
  soundscapeVolume: number
  /** Plays inaudible noise during sessions so the browser never sleeps the tab. */
  keepAwake: boolean
  notifications: boolean
  screenWakeLock: boolean
  tunesBridge: boolean
  dailyGoalMin: number
}

export interface Task {
  id: string
  title: string
  /** Planned time for the task, in minutes. */
  estimateMin: number | null
  done: boolean
  createdAt: number
  doneAt: number | null
}

export interface Note {
  id: string
  text: string
  at: number
}

/** Focus time per task id, in ms. Key '' means no task selected. */
export type Segments = Record<string, number>

export interface Session {
  id: string
  start: number
  end: number
  focusMs: number
  plannedMs: number
  segments: Segments
  completed: boolean
  depth: 1 | 2 | 3 | null
}

export interface TimerState {
  phase: Phase
  /** What the start button will begin when phase is idle. */
  up: 'focus' | 'break'
  sessionId: string | null
  plannedMs: number
  startedAt: number | null
  /** Elapsed ms banked before the current run. */
  accMs: number
  /** Wall-clock time of the last start/resume; null while paused. */
  resumedAt: number | null
  taskId: string | null
  /** Elapsed value at which the current task segment began. */
  segStart: number
  segments: Segments
  /** The planned time ran out (alarm has fired for this session). */
  reached: boolean
  /** User responded to the alarm (stops repeats). */
  acknowledged: boolean
}
