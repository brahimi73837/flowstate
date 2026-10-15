import { useState, type FormEvent } from 'react'
import { dur, minLabel } from '../lib/format'
import { MIN, parseMinutes } from '../lib/timer'
import type { Task } from '../lib/types'
import { durations, useStore } from '../store'
import { useTaskSpent } from '../useTaskSpent'
import { IconArrow, IconCheck, IconDown, IconPlay, IconTrash, IconUp } from './Icons'

function TaskRow({ task, spentMs, active, onPicked }: { task: Task; spentMs: number; active: boolean; onPicked: () => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [est, setEst] = useState(task.estimateMin ? minLabel(task.estimateMin) : '')
  const a = useStore.getState()
  const phase = useStore((s) => s.timer.phase)
  const focusMin = useStore((s) => durations(s.settings).focusMin)

  const pct = task.estimateMin ? Math.min(100, (spentMs / (task.estimateMin * MIN)) * 100) : null
  const leftMin = task.estimateMin ? Math.max(1, Math.round(task.estimateMin - spentMs / MIN)) : null
  const over = task.estimateMin !== null && spentMs > task.estimateMin * MIN

  const save = (e?: FormEvent) => {
    e?.preventDefault()
    if (title.trim()) a.updateTask(task.id, { title: title.trim(), estimateMin: parseMinutes(est) })
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="task-row editing">
        <form onSubmit={save} className="task-edit">
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task title" autoFocus maxLength={140} />
          <input value={est} onChange={(e) => setEst(e.target.value)} aria-label="Planned time" placeholder="time" className="est-input" />
          <button type="submit" className="btn-small">
            Save
          </button>
        </form>
      </li>
    )
  }

  return (
    <li className={`task-row${active ? ' active' : ''}${task.done ? ' done' : ''}`}>
      <button className="check" onClick={() => a.toggleDone(task.id)} aria-label={task.done ? 'Mark not done' : 'Mark done'} aria-pressed={task.done}>
        {task.done && <IconCheck width={14} height={14} />}
      </button>
      <button
        className="task-main"
        onClick={() => {
          if (task.done) return
          a.selectTask(active ? null : task.id)
          if (!active) onPicked()
        }}
        onDoubleClick={() => setEditing(true)}
        title={task.done ? undefined : active ? 'Active — click to clear' : 'Make this the active task'}
      >
        <span className="task-title">{task.title}</span>
        <span className={`task-meta${over ? ' over' : ''}`}>
          {dur(spentMs)}
          {task.estimateMin ? ` / ${minLabel(task.estimateMin)}` : ''}
          {active ? ' · active' : ''}
        </span>
        {pct !== null && !task.done && <span className="task-bar" style={{ width: `${pct}%` }} aria-hidden />}
      </button>
      {!task.done && (
        <div className="task-actions">
          <button
            className="icon-btn play"
            aria-label={phase === 'focus' ? `Switch to ${task.title}` : `Start focus on ${task.title}${leftMin ? ` for ${leftMin} minutes` : ''}`}
            title={phase === 'focus' ? 'Switch to this task' : `Focus ${minLabel(leftMin ?? focusMin)}`}
            onClick={() => {
              a.startFocus({ taskId: task.id, minutes: leftMin ?? undefined })
              onPicked()
            }}
          >
            <IconPlay width={16} height={16} />
          </button>
          <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit task" title="Edit">
            <span aria-hidden className="edit-glyph">✎</span>
          </button>
          <button className="icon-btn move" onClick={() => a.moveTask(task.id, -1)} aria-label="Move up">
            <IconUp width={16} height={16} />
          </button>
          <button className="icon-btn move" onClick={() => a.moveTask(task.id, 1)} aria-label="Move down">
            <IconDown width={16} height={16} />
          </button>
        </div>
      )}
      <button className="icon-btn danger" onClick={() => a.removeTask(task.id)} aria-label="Delete task" title="Delete">
        <IconTrash width={16} height={16} />
      </button>
    </li>
  )
}

export function TasksPanel({ onPicked }: { onPicked: () => void }) {
  const tasks = useStore((s) => s.tasks)
  const notes = useStore((s) => s.notes)
  const activeId = useStore((s) => s.timer.taskId)
  const spent = useTaskSpent()
  const [title, setTitle] = useState('')
  const [est, setEst] = useState('')
  const [showDone, setShowDone] = useState(false)
  const a = useStore.getState()

  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    a.addTask(title, parseMinutes(est))
    setTitle('')
    setEst('')
  }

  return (
    <div className="panel">
      <form className="add-task" onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task" aria-label="New task" maxLength={140} data-testid="new-task" />
        <input value={est} onChange={(e) => setEst(e.target.value)} placeholder="45m" aria-label="Planned time (optional)" className="est-input" data-testid="new-task-est" />
        <button type="submit" className="btn-small" disabled={!title.trim()}>
          Add
        </button>
      </form>
      <p className="panel-hint">Planned time is optional — "45m", "1h30", "2h". Pick a task, or press play to run the timer on its remaining time.</p>

      {open.length === 0 ? (
        <p className="empty">No open tasks. Add the one thing that matters next.</p>
      ) : (
        <ul className="task-list" data-testid="task-list">
          {open.map((t) => (
            <TaskRow key={t.id} task={t} spentMs={spent.get(t.id) ?? 0} active={t.id === activeId} onPicked={onPicked} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="done-block">
          <button className="link" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
            {showDone ? 'Hide' : 'Show'} {done.length} done
          </button>
          {showDone && (
            <>
              <ul className="task-list">
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} spentMs={spent.get(t.id) ?? 0} active={false} onPicked={onPicked} />
                ))}
              </ul>
              <button className="link" onClick={() => a.clearDone()}>
                Clear done tasks
              </button>
            </>
          )}
        </div>
      )}

      <h3 className="panel-h">Parked thoughts</h3>
      {notes.length === 0 ? (
        <p className="empty">
          Stray thought mid-block? Press <kbd>N</kbd> to park it and get back to work. They wait here.
        </p>
      ) : (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id} className="note-row">
              <span>{n.text}</span>
              <button className="icon-btn" onClick={() => a.noteToTask(n.id)} aria-label="Turn into task" title="Turn into task">
                <IconArrow width={16} height={16} />
              </button>
              <button className="icon-btn danger" onClick={() => a.removeNote(n.id)} aria-label="Dismiss" title="Dismiss">
                <IconTrash width={16} height={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
