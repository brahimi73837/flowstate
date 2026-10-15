import { useMemo, useState, type ReactNode } from 'react'
import { useNow } from '../engine'
import { dayKey, dur, timeOfDay } from '../lib/format'
import { averageDepth, byHour, lastDays, monthGrid, startOfDay, startOfMonth, startOfWeek, streak, sumBetween, taskTotals } from '../lib/stats'
import { MIN, elapsed } from '../lib/timer'
import type { Session } from '../lib/types'
import { useStore } from '../store'

interface Tip {
  x: number
  y: number
  content: ReactNode
}

function useTip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const node = tip ? (
    <div className="tip" style={{ left: `${tip.x}%`, top: tip.y }} role="tooltip">
      {tip.content}
    </div>
  ) : null
  return { tip: node, setTip }
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub}
    </div>
  )
}

function DaysChart({ sessions, now, goalMin }: { sessions: Session[]; now: number; goalMin: number }) {
  const days = useMemo(() => lastDays(sessions, 14, now), [sessions, now])
  const { tip, setTip } = useTip()
  const W = 560
  const H = 150
  const padB = 22
  const padT = 10
  const maxMs = Math.max(goalMin * MIN, ...days.map((d) => d.ms), MIN * 60)
  const bw = W / days.length
  const y = (ms: number) => H - padB - (ms / maxMs) * (H - padB - padT)
  const goalY = y(goalMin * MIN)
  return (
    <figure className="chart" onPointerLeave={() => setTip(null)}>
      <figcaption>Last 14 days</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Focus time per day for the last 14 days">
        {goalMin > 0 && (
          <g className="goal">
            <line x1={0} x2={W} y1={goalY} y2={goalY} />
            <text x={W - 2} y={goalY - 4} textAnchor="end">
              goal {dur(goalMin * MIN)}
            </text>
          </g>
        )}
        <line className="baseline" x1={0} x2={W} y1={H - padB} y2={H - padB} />
        {days.map((d, i) => {
          const h = Math.max(0, H - padB - y(d.ms))
          const x = i * bw + 4
          const w = bw - 8
          const isToday = i === days.length - 1
          return (
            <g key={d.key}>
              {h > 0 && <path className={`bar${d.ms >= goalMin * MIN ? ' met' : ''}`} d={roundedTop(x, H - padB - h, w, h, Math.min(4, h, w / 2))} />}
              <text className={`axis${isToday ? ' today' : ''}`} x={x + w / 2} y={H - 6} textAnchor="middle">
                {isToday ? 'Today' : d.date.toLocaleDateString([], { weekday: 'narrow' })}
              </text>
              <rect
                className="hit"
                x={i * bw}
                y={0}
                width={bw}
                height={H}
                onPointerEnter={() =>
                  setTip({
                    x: ((i + 0.5) / days.length) * 100,
                    y: 0,
                    content: (
                      <>
                        <b>{dur(d.ms)}</b> {d.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      </>
                    ),
                  })
                }
              />
            </g>
          )
        })}
      </svg>
      {tip}
    </figure>
  )
}

/** Bar with only the top corners rounded, anchored to the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

function MonthCalendar({ sessions, now }: { sessions: Session[]; now: number }) {
  const [offset, setOffset] = useState(0)
  const ref = new Date(startOfMonth(now))
  ref.setMonth(ref.getMonth() + offset)
  const refTime = ref.getTime()
  const cells = useMemo(() => monthGrid(sessions, refTime, now), [sessions, refTime, now])
  const monthTotal = cells.filter((c) => c.inMonth).reduce((a, c) => a + c.ms, 0)
  const max = Math.max(...cells.map((c) => c.ms), 1)
  const { tip, setTip } = useTip()
  const level = (ms: number) => (ms <= 0 ? 0 : Math.min(4, Math.ceil((ms / max) * 4)))
  const todayKey = dayKey(now)
  const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  return (
    <figure className="chart" onPointerLeave={() => setTip(null)}>
      <figcaption className="cal-head">
        <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label="Previous month">
          ‹
        </button>
        <span>
          {ref.toLocaleDateString([], { month: 'long', year: 'numeric' })} · {dur(monthTotal)}
        </span>
        <button className="icon-btn" onClick={() => setOffset(offset + 1)} disabled={offset >= 0} aria-label="Next month">
          ›
        </button>
      </figcaption>
      <div className="cal" role="grid" aria-label="Focus per day this month">
        {weekdays.map((w, i) => (
          <span key={i} className="cal-wd" aria-hidden>
            {w}
          </span>
        ))}
        {cells.map((c, i) => (
          <span
            key={c.key}
            role="gridcell"
            className={`cal-cell l${level(c.ms)}${c.inMonth ? '' : ' out'}${c.future ? ' future' : ''}${c.key === todayKey ? ' today' : ''}`}
            aria-label={`${c.date.toDateString()}: ${dur(c.ms)}`}
            onPointerEnter={() =>
              setTip({
                x: (((i % 7) + 0.5) / 7) * 100,
                y: Math.floor(i / 7) * 14 + 6,
                content: (
                  <>
                    <b>{dur(c.ms)}</b> {c.date.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </>
                ),
              })
            }
          >
            {c.date.getDate()}
          </span>
        ))}
      </div>
      <div className="cal-legend" aria-hidden>
        less {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`cal-cell l${l}`} />)} more
      </div>
      {tip}
    </figure>
  )
}

function HoursChart({ sessions }: { sessions: Session[] }) {
  const hours = useMemo(() => byHour(sessions), [sessions])
  const max = Math.max(...hours, 1)
  const { tip, setTip } = useTip()
  const total = hours.reduce((a, b) => a + b, 0)
  // Best 2-hour window.
  let best = 0
  for (let h = 0; h < 24; h++) if (hours[h] + hours[(h + 1) % 24] > hours[best] + hours[(best + 1) % 24]) best = h
  const fmtH = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })
  return (
    <figure className="chart" onPointerLeave={() => setTip(null)}>
      <figcaption>When you focus</figcaption>
      {total > 0 && (
        <p className="insight">
          Your strongest window is {fmtH(best)}–{fmtH((best + 2) % 24)}. Guard it for your hardest work.
        </p>
      )}
      <div className="hours">
        {hours.map((ms, h) => (
          <span
            key={h}
            className="hour"
            onPointerEnter={() => setTip({ x: ((h + 0.5) / 24) * 100, y: 30, content: <><b>{dur(ms)}</b> at {fmtH(h)}</> })}
          >
            <i style={{ height: `${(ms / max) * 100}%` }} />
          </span>
        ))}
      </div>
      <div className="hours-axis" aria-hidden>
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>12a</span>
      </div>
      {tip}
    </figure>
  )
}

export function InsightsPanel() {
  const now = useNow()
  const logged = useStore((s) => s.sessions)
  const tasks = useStore((s) => s.tasks)
  const timer = useStore((s) => s.timer)
  const goalMin = useStore((s) => s.settings.dailyGoalMin)

  // Count the block in progress so today's number moves while you work.
  const sessions = useMemo<Session[]>(() => {
    if (timer.phase !== 'focus' || timer.startedAt === null) return logged
    const ms = elapsed(timer, now)
    return [...logged, { id: 'live', start: timer.startedAt, end: now, focusMs: ms, plannedMs: timer.plannedMs, segments: {}, completed: false, depth: null }]
  }, [logged, timer, now])

  const today = sumBetween(sessions, startOfDay(now), Infinity)
  const week = sumBetween(sessions, startOfWeek(now), Infinity)
  const month = sumBetween(sessions, startOfMonth(now), Infinity)
  const days = streak(sessions, now)
  const depth = averageDepth(logged)
  const deepShare = logged.filter((s) => s.depth).length ? logged.filter((s) => s.depth === 3).length / logged.filter((s) => s.depth).length : null

  const monthSessions = logged.filter((s) => s.start >= startOfMonth(now))
  const top = [...taskTotals(monthSessions).entries()]
    .filter(([id]) => id)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const topMax = top[0]?.[1] ?? 1

  if (logged.length === 0 && timer.phase !== 'focus') {
    return (
      <div className="panel">
        <p className="empty">Nothing logged yet. Finish your first focus block and your days, weeks and best hours show up here.</p>
      </div>
    )
  }

  const goalPct = goalMin ? Math.min(100, (today / (goalMin * MIN)) * 100) : 0

  return (
    <div className="panel insights">
      <div className="stats">
        <Stat label="today" value={dur(today)} sub={goalMin > 0 && <div className="goal-bar" aria-label={`${Math.round(goalPct)}% of daily goal`}><i style={{ width: `${goalPct}%` }} /></div>} />
        <Stat label="this week" value={dur(week)} />
        <Stat label="this month" value={dur(month)} />
        <Stat label="day streak" value={String(days)} />
      </div>

      <DaysChart sessions={sessions} now={now} goalMin={goalMin} />
      <MonthCalendar sessions={sessions} now={now} />
      <HoursChart sessions={logged} />

      {depth !== null && (
        <div className="chart">
          <p className="figcap">Depth</p>
          <p className="insight">
            Average {depth.toFixed(1)} of 3{deepShare !== null ? ` — ${Math.round(deepShare * 100)}% of rated blocks went deep.` : '.'} Compare deep blocks with your best hours and block lengths to find your conditions for flow.
          </p>
        </div>
      )}

      {top.length > 0 && (
        <div className="chart">
          <p className="figcap">Top tasks this month</p>
          <ul className="top-tasks">
            {top.map(([id, ms]) => (
              <li key={id}>
                <span className="tt-name">{tasks.find((t) => t.id === id)?.title ?? 'Deleted task'}</span>
                <span className="tt-bar">
                  <i style={{ width: `${(ms / topMax) * 100}%` }} />
                </span>
                <span className="tt-val">{dur(ms)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="chart">
        <p className="figcap">Recent blocks</p>
        <ul className="recent">
          {[...logged]
            .reverse()
            .slice(0, 8)
            .map((s) => {
              const ids = Object.keys(s.segments).filter((k) => k && s.segments[k] > 0)
              const names = ids.map((id) => tasks.find((t) => t.id === id)?.title ?? 'Deleted task')
              return (
                <li key={s.id}>
                  <span className="r-when">
                    {new Date(s.start).toLocaleDateString([], { month: 'short', day: 'numeric' })}, {timeOfDay(s.start)}
                  </span>
                  <span className="r-what">{names.length ? names.join(', ') : 'No task'}</span>
                  <span className="r-dur">
                    {dur(s.focusMs)}
                    {s.depth ? ` · ${['', 'shallow', 'steady', 'deep'][s.depth]}` : ''}
                  </span>
                </li>
              )
            })}
        </ul>
      </div>
    </div>
  )
}
