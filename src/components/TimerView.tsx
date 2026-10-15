import { useState, type FormEvent } from 'react'
import { useNow } from '../engine'
import { audio } from '../lib/audio'
import { clock, clockUp, dur, minLabel, timeOfDay } from '../lib/format'
import { MIN, dueAt, liveSegments, parseMinutes, remaining } from '../lib/timer'
import { PRESETS, durations, useStore } from '../store'
import { useTaskSpent } from '../useTaskSpent'
import { IconPause, IconPlay, IconSkip, IconStop } from './Icons'

function Digits({ text, label }: { text: string; label: string }) {
  return (
    <div className="digits" role="timer" aria-label={label}>
      {text.split('').map((ch, i) => (
        <span key={i} className={ch === ':' ? 'd-colon' : ch === '+' ? 'd-plus' : 'd'}>
          {ch}
        </span>
      ))}
    </div>
  )
}

/** Splits "Write report 45m" into a title and an estimate. */
function splitIntention(raw: string): { title: string; estimate: number | null } {
  const m = raw.trim().match(/^(.*?)\s+(\d+(?:\.\d+)?h(?:\s?\d+m?)?|\d+\s?m(?:in)?)$/i)
  if (m && m[1].trim()) return { title: m[1].trim(), estimate: parseMinutes(m[2]) }
  return { title: raw.trim(), estimate: null }
}

function Presets() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const custom = settings.presetId === 'custom'
  return (
    <div className="presets">
      <div className="preset-row" role="radiogroup" aria-label="Session length">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={settings.presetId === p.id}
            className="preset"
            onClick={() => setSettings({ presetId: p.id })}
            title={`${p.name}: ${minLabel(p.focusMin)} focus, ${minLabel(p.breakMin)} break`}
          >
            <span className="preset-main">{minLabel(p.focusMin)}</span>
            <span className="preset-sub">{minLabel(p.breakMin)}</span>
          </button>
        ))}
        <button role="radio" aria-checked={custom} className="preset" onClick={() => setSettings({ presetId: 'custom' })}>
          <span className="preset-main">Custom</span>
          <span className="preset-sub">{custom ? 'set below' : `${minLabel(settings.customFocusMin)}/${minLabel(settings.customBreakMin)}`}</span>
        </button>
      </div>
      {custom && (
        <div className="custom-row">
          <label>
            Focus
            <input
              type="number"
              min={1}
              max={720}
              inputMode="numeric"
              value={settings.customFocusMin}
              onChange={(e) => setSettings({ customFocusMin: clampMin(e.target.value, 1, 720) })}
              aria-label="Focus minutes"
            />
            min
          </label>
          <label>
            Break
            <input
              type="number"
              min={1}
              max={180}
              inputMode="numeric"
              value={settings.customBreakMin}
              onChange={(e) => setSettings({ customBreakMin: clampMin(e.target.value, 1, 180) })}
              aria-label="Break minutes"
            />
            min
          </label>
        </div>
      )}
    </div>
  )
}

const clampMin = (v: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || lo)))

function Intention({ onOpenTasks }: { onOpenTasks: () => void }) {
  const [text, setText] = useState('')
  const taskId = useStore((s) => s.timer.taskId)
  const task = useStore((s) => s.tasks.find((t) => t.id === s.timer.taskId))
  const addTask = useStore((s) => s.addTask)
  const selectTask = useStore((s) => s.selectTask)
  const openCount = useStore((s) => s.tasks.filter((t) => !t.done).length)
  const spent = useTaskSpent()

  if (task) {
    const ms = spent.get(task.id) ?? 0
    return (
      <div className="intention">
        <button className="task-chip" onClick={onOpenTasks} title="Change task">
          <span className="task-chip-title">{task.title}</span>
          <span className="task-chip-meta">
            {dur(ms)}
            {task.estimateMin ? ` of ${minLabel(task.estimateMin)}` : ''}
          </span>
        </button>
        <button className="link" onClick={() => selectTask(null)} aria-label="Clear task">
          clear
        </button>
      </div>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    const { title, estimate } = splitIntention(text)
    const id = addTask(title, estimate)
    selectTask(id)
    setText('')
  }

  return (
    <form className="intention" onSubmit={submit}>
      <input
        className="intention-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's the one thing for this block?"
        aria-label="Task for this block"
        maxLength={140}
        data-taskid={taskId ?? ''}
      />
      {openCount > 0 && (
        <button type="button" className="link" onClick={onOpenTasks}>
          or pick from {openCount} {openCount === 1 ? 'task' : 'tasks'}
        </button>
      )}
    </form>
  )
}

function DepthRating() {
  const pending = useStore((s) => s.pendingRating)
  const rate = useStore((s) => s.rate)
  if (!pending) return null
  const opts: [1 | 2 | 3, string][] = [
    [1, 'Shallow'],
    [2, 'Steady'],
    [3, 'Deep'],
  ]
  return (
    <div className="depth" role="group" aria-label="How deep was that block?">
      <span className="depth-q">How deep did you go?</span>
      {opts.map(([v, label]) => (
        <button key={v} className={`depth-btn depth-${v}`} onClick={() => rate(pending, v)}>
          <span className="depth-bars" aria-hidden>
            {[1, 2, 3].map((i) => (
              <i key={i} className={i <= v ? 'on' : ''} />
            ))}
          </span>
          {label}
        </button>
      ))}
    </div>
  )
}

export function TimerView({ onOpenTasks }: { onOpenTasks: () => void }) {
  const now = useNow()
  const timer = useStore((s) => s.timer)
  const settings = useStore((s) => s.settings)
  const ringing = useStore((s) => s.ringing)
  const nextBreakMs = useStore((s) => s.nextBreakMs)
  const lastSession = useStore((s) => s.sessions[s.sessions.length - 1])
  const task = useStore((s) => s.tasks.find((t) => t.id === s.timer.taskId))
  const spent = useTaskSpent()
  const a = useStore.getState()

  const { focusMin, breakMin } = durations(settings)
  const breakLen = nextBreakMs ?? breakMin * MIN
  const rem = remaining(timer, now)
  const paused = timer.phase !== 'idle' && timer.resumedAt === null
  const soundBlocked = timer.phase !== 'idle' && !paused && !audio.ready

  // Task time left, if the task has an estimate.
  const taskLeftMin = task?.estimateMin ? Math.max(0, Math.round(task.estimateMin - (spent.get(task.id) ?? 0) / MIN)) : null

  let label: string
  let face: string
  let body: React.ReactNode = null
  let controls: React.ReactNode

  if (timer.phase === 'idle' && timer.up === 'focus') {
    label = ringing ? 'Break over — ready when you are' : 'Ready when you are'
    face = clock(focusMin * MIN)
    body = (
      <>
        <Presets />
        <Intention onOpenTasks={onOpenTasks} />
      </>
    )
    controls = (
      <div className="controls">
        <button className="btn-primary" onClick={() => a.startFocus()} data-testid="start">
          <IconPlay /> Start focus
        </button>
        {taskLeftMin !== null && taskLeftMin > 0 && taskLeftMin !== focusMin && (
          <button className="btn-ghost" onClick={() => a.startFocus({ minutes: taskLeftMin })}>
            Run task’s remaining {minLabel(taskLeftMin)}
          </button>
        )}
      </div>
    )
  } else if (timer.phase === 'idle') {
    label = lastSession ? `Logged ${dur(lastSession.focusMs)} of focus` : 'Block done'
    face = clock(breakLen)
    body = (
      <>
        <DepthRating />
        {nextBreakMs && <p className="hint">You went long, so the break is longer too.</p>}
      </>
    )
    controls = (
      <div className="controls">
        <button className="btn-primary" onClick={() => a.startBreak()} data-testid="start-break">
          <IconPlay /> Start {dur(breakLen)} break
        </button>
        <button className="btn-ghost" onClick={() => a.startFocus()}>
          Skip break
        </button>
      </div>
    )
  } else if (timer.phase === 'focus' && timer.reached) {
    label = 'In flow'
    face = `+${clockUp(-rem)}`
    const due = dueAt(timer)
    body = (
      <p className="hint">
        Block ended {due ? `at ${timeOfDay(due)}` : ''}. Ride it, then surface at a natural stopping point.
      </p>
    )
    controls = (
      <div className="controls">
        <button className="btn-primary" onClick={() => a.finishToBreak(true)} data-testid="take-break">
          Take a break
        </button>
        <button className="btn-ghost" onClick={() => a.finishToBreak(false)}>
          Finish
        </button>
      </div>
    )
  } else if (timer.phase === 'focus') {
    label = paused ? 'Paused' : 'Focus'
    face = clock(rem)
    controls = (
      <div className="controls">
        {paused ? (
          <button className="btn-primary" onClick={() => a.resumeTimer()} data-testid="resume">
            <IconPlay /> Resume
          </button>
        ) : (
          <button className="btn-round" onClick={() => a.pauseTimer()} aria-label="Pause" data-testid="pause">
            <IconPause />
          </button>
        )}
        <button className="btn-round subtle" onClick={() => a.stopTimer()} aria-label="End block now" title="End block now" data-testid="stop">
          <IconStop />
        </button>
      </div>
    )
    body = <RunningTask onOpenTasks={onOpenTasks} />
  } else {
    label = paused ? 'Break paused' : 'Break'
    face = clock(rem)
    body = (
      <>
        <DepthRating />
        <p className="hint">Look at something far away. Stand, stretch, refill water.</p>
      </>
    )
    controls = (
      <div className="controls">
        {paused ? (
          <button className="btn-primary" onClick={() => a.resumeTimer()}>
            <IconPlay /> Resume
          </button>
        ) : (
          <button className="btn-round" onClick={() => a.pauseTimer()} aria-label="Pause">
            <IconPause />
          </button>
        )}
        <button className="btn-round subtle" onClick={() => a.stopTimer()} aria-label="End break" title="End break" data-testid="end-break">
          <IconSkip />
        </button>
      </div>
    )
  }

  return (
    <section className="timer" aria-live="off">
      <p className="phase-label" data-testid="phase-label">
        {label}
      </p>
      <Digits text={face} label={label} />
      {ringing && (
        <p className="ringing" role="status">
          <span className="ringing-dot" aria-hidden /> Ringing — click anywhere to silence
        </p>
      )}
      {soundBlocked && (
        <button className="sound-blocked" onClick={() => audio.unlock()}>
          Sound is off after reload. Click to turn it back on.
        </button>
      )}
      <div className="timer-body">{body}</div>
      {controls}
    </section>
  )
}

function RunningTask({ onOpenTasks }: { onOpenTasks: () => void }) {
  const now = useNow()
  const timer = useStore((s) => s.timer)
  const task = useStore((s) => s.tasks.find((t) => t.id === s.timer.taskId))
  const toggleDone = useStore((s) => s.toggleDone)
  const spent = useTaskSpent()
  if (!task) {
    return (
      <div className="intention">
        <button className="task-chip empty" onClick={onOpenTasks}>
          <span className="task-chip-title">Choose a task</span>
          <span className="task-chip-meta">{dur(liveSegments(timer, now)[''] ?? 0)} untagged</span>
        </button>
      </div>
    )
  }
  const ms = spent.get(task.id) ?? 0
  const pct = task.estimateMin ? Math.min(100, (ms / (task.estimateMin * MIN)) * 100) : null
  return (
    <div className="intention">
      <button className="task-chip" onClick={onOpenTasks} title="Switch task">
        <span className="task-chip-title">{task.title}</span>
        <span className="task-chip-meta">
          {dur(ms)}
          {task.estimateMin ? ` of ${minLabel(task.estimateMin)}` : ''}
        </span>
        {pct !== null && <span className="task-chip-bar" style={{ width: `${pct}%` }} aria-hidden />}
      </button>
      <button
        className="link"
        onClick={() => {
          toggleDone(task.id)
          onOpenTasks()
        }}
        data-testid="task-done"
      >
        done, next
      </button>
    </div>
  )
}
