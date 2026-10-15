import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { InsightsPanel } from './components/InsightsPanel'
import { IconChart, IconClose, IconExpand, IconFeather, IconSettings, IconTasks } from './components/Icons'
import { SettingsPanel } from './components/SettingsPanel'
import { TasksPanel } from './components/TasksPanel'
import { TimerView } from './components/TimerView'
import { startEngine, useNow } from './engine'
import { dur } from './lib/format'
import { startOfDay, sumBetween } from './lib/stats'
import { elapsed, isRunning } from './lib/timer'
import { useStore } from './store'

type Tab = 'tasks' | 'insights' | 'settings'

const TABS: [Tab, string][] = [
  ['tasks', 'Tasks'],
  ['insights', 'Insights'],
  ['settings', 'Settings'],
]

function Sheet({ tab, setTab, onClose }: { tab: Tab; setTab: (t: Tab) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <>
      <div className="backdrop" onClick={onClose} aria-hidden />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={TABS.find(([t]) => t === tab)?.[1]} ref={ref} tabIndex={-1}>
        <header className="sheet-head">
          <nav className="tabs" role="tablist">
            {TABS.map(([t, label]) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
                {label}
              </button>
            ))}
          </nav>
          <button className="icon-btn" onClick={onClose} aria-label="Close panel" data-testid="close-sheet">
            <IconClose />
          </button>
        </header>
        <div className="sheet-body">
          {tab === 'tasks' && <TasksPanel onPicked={onClose} />}
          {tab === 'insights' && <InsightsPanel />}
          {tab === 'settings' && <SettingsPanel />}
        </div>
      </aside>
    </>
  )
}

function ParkingLot({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [text, setText] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const addNote = useStore((s) => s.addNote)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(id)
  }, [toast])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim()) {
      addNote(text)
      setToast('Parked. Back to it.')
    }
    setText('')
    setOpen(false)
  }

  return (
    <>
      {open && (
        <form className="park" onSubmit={submit}>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            onBlur={() => !text && setOpen(false)}
            placeholder="Park a thought for later, then press Enter"
            aria-label="Park a thought"
            maxLength={200}
            data-testid="park-input"
          />
        </form>
      )}
      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}
    </>
  )
}

function TodayLine() {
  const now = useNow()
  const sessions = useStore((s) => s.sessions)
  const timer = useStore((s) => s.timer)
  const goal = useStore((s) => s.settings.dailyGoalMin)
  const live = timer.phase === 'focus' && timer.startedAt !== null && timer.startedAt >= startOfDay(now) ? elapsed(timer, now) : 0
  const today = sumBetween(sessions, startOfDay(now), Infinity) + live
  return (
    <p className="today" data-testid="today">
      {dur(today)} today{goal > 0 ? ` of ${dur(goal * 60_000)}` : ''}
    </p>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab | null>(null)
  const [parking, setParking] = useState(false)
  const [still, setStill] = useState(false)
  const timer = useStore((s) => s.timer)
  const now = useNow()

  useEffect(() => startEngine(), [])

  const ringing = useStore((s) => s.ringing)
  // Only fade the chrome during a running block that doesn't need attention.
  const focusing = timer.phase === 'focus' && isRunning(timer) && !timer.reached && !ringing
  const deep = timer.phase === 'focus'
  const progress = timer.phase === 'idle' ? 0 : Math.min(1, elapsed(timer, now) / timer.plannedMs)

  // During a running block, chrome fades out after a few still seconds.
  const calmAllowed = focusing && !tab && !parking
  useEffect(() => {
    if (!calmAllowed) return
    let id = setTimeout(() => setStill(true), 4000)
    const wake = () => {
      setStill(false)
      clearTimeout(id)
      id = setTimeout(() => setStill(true), 4000)
    }
    window.addEventListener('pointermove', wake)
    window.addEventListener('keydown', wake)
    return () => {
      clearTimeout(id)
      setStill(false)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [calmAllowed])
  const calm = calmAllowed && still

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
      const s = useStore.getState()
      const t = s.timer
      switch (e.key) {
        case ' ': {
          if (el.closest('button')) return // let buttons handle their own Space
          e.preventDefault()
          if (t.phase === 'idle') {
            if (t.up === 'focus') s.startFocus()
            else s.startBreak()
          } else if (t.resumedAt === null) s.resumeTimer()
          else if (!t.reached) s.pauseTimer()
          break
        }
        case 'n':
        case 'N':
          e.preventDefault()
          setParking(true)
          break
        case 't':
        case 'T':
          setTab((x) => (x === 'tasks' ? null : 'tasks'))
          break
        case 'i':
        case 'I':
          setTab((x) => (x === 'insights' ? null : 'insights'))
          break
        case ',':
          setTab((x) => (x === 'settings' ? null : 'settings'))
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'Escape':
          setTab(null)
          setParking(false)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen])

  return (
    <div className={`app phase-${timer.phase}${deep ? ' deep' : ''}${timer.reached ? ' reached' : ''}${calm ? ' calm' : ''}`}>
      <div className="tide" style={{ transform: `scaleY(${deep ? progress : 0})` }} aria-hidden />
      {deep && <div className="crest" style={{ bottom: `${progress * 100}%` }} aria-hidden />}

      <header className="top chrome">
        <span className="wordmark" aria-label="Flowstate">
          flowstate
        </span>
        <nav className="top-actions">
          <button className="icon-btn" onClick={() => setTab('tasks')} aria-label="Tasks (T)" title="Tasks (T)" data-testid="open-tasks">
            <IconTasks />
          </button>
          <button className="icon-btn" onClick={() => setTab('insights')} aria-label="Insights (I)" title="Insights (I)" data-testid="open-insights">
            <IconChart />
          </button>
          <button className="icon-btn" onClick={() => setTab('settings')} aria-label="Settings (,)" title="Settings (,)" data-testid="open-settings">
            <IconSettings />
          </button>
          <button className="icon-btn hide-mobile" onClick={toggleFullscreen} aria-label="Full screen (F)" title="Full screen (F)">
            <IconExpand />
          </button>
        </nav>
      </header>

      <main className="stage">
        <TimerView onOpenTasks={() => setTab('tasks')} />
      </main>

      <footer className="bottom chrome">
        <TodayLine />
        <button className="park-btn" onClick={() => setParking(true)} title="Park a stray thought (N)" data-testid="open-park">
          <IconFeather width={16} height={16} /> Park a thought
        </button>
      </footer>

      <ParkingLot open={parking} setOpen={setParking} />
      {tab && <Sheet tab={tab} setTab={setTab} onClose={() => setTab(null)} />}
    </div>
  )
}
