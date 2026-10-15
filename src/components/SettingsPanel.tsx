import { useRef, useState, type ReactNode } from 'react'
import { audio } from '../lib/audio'
import { canNotify, requestNotify } from '../lib/notify'
import type { Settings, Soundscape } from '../lib/types'
import { exportData, useStore } from '../store'

const TUNES_URL = 'https://brahimi73837.github.io/tunes/'

function Toggle({ k, label, hint, onTurnOn }: { k: keyof Settings; label: string; hint?: ReactNode; onTurnOn?: () => Promise<boolean> }) {
  const value = useStore((s) => s.settings[k]) as boolean
  const setSettings = useStore((s) => s.setSettings)
  return (
    <label className="row toggle-row">
      <span className="row-text">
        <span className="row-label">{label}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={value}
        onChange={async (e) => {
          const on = e.target.checked
          if (on && onTurnOn && !(await onTurnOn())) return
          setSettings({ [k]: on } as Partial<Settings>)
        }}
      />
    </label>
  )
}

function Slider({ k, label, onCommit }: { k: 'alarmVolume' | 'soundscapeVolume'; label: string; onCommit?: (v: number) => void }) {
  const value = useStore((s) => s.settings[k])
  const setSettings = useStore((s) => s.setSettings)
  return (
    <label className="row">
      <span className="row-label">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => setSettings({ [k]: Number(e.target.value) })}
        onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        aria-label={label}
      />
    </label>
  )
}

const SCAPES: [Soundscape, string][] = [
  ['off', 'Silence'],
  ['brown', 'Brown noise'],
  ['rain', 'Rain'],
  ['ocean', 'Ocean'],
]

export function SettingsPanel() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const importData = useStore((s) => s.importData)
  const resetAll = useStore((s) => s.resetAll)
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [preview, setPreview] = useState(false)

  const notifyState = !canNotify() ? 'unsupported' : Notification.permission

  const download = () => {
    const blob = new Blob([exportData()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `flowstate-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    setMsg('Backup downloaded.')
  }

  const upload = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if (data?.app !== 'flowstate') throw new Error('not a Flowstate backup')
      importData(data)
      setMsg(`Imported ${data.sessions?.length ?? 0} sessions and ${data.tasks?.length ?? 0} tasks.`)
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}. Choose a file exported from Flowstate.`)
    }
  }

  // Preview the soundscape for a few seconds while picking one.
  const previewScape = (scape: Soundscape) => {
    audio.unlock()
    setPreview(true)
    audio.setBed(scape, useStore.getState().settings.soundscapeVolume, false, true)
    window.setTimeout(() => {
      setPreview(false)
      // Hand control back to the engine's normal rules.
      const { timer, settings: s } = useStore.getState()
      const focusing = timer.phase === 'focus' && timer.resumedAt !== null
      audio.setBed(focusing ? s.soundscape : 'off', s.soundscapeVolume, s.keepAwake, timer.phase !== 'idle' && timer.resumedAt !== null)
    }, 4000)
  }

  return (
    <div className="panel settings">
      <section>
        <h3 className="panel-h">Blocks</h3>
        <label className="row">
          <span className="row-text">
            <span className="row-label">Daily focus goal</span>
            <span className="row-hint">A target, not a quota. Shown on your insights.</span>
          </span>
          <span className="num-unit">
            <input
              type="number"
              min={0}
              max={16}
              step={0.5}
              value={settings.dailyGoalMin / 60}
              onChange={(e) => setSettings({ dailyGoalMin: Math.round(Math.min(16, Math.max(0, Number(e.target.value) || 0)) * 60) })}
              aria-label="Daily focus goal in hours"
            />
            h
          </span>
        </label>
        <Toggle k="flowOvertime" label="Don't break my flow" hint="When a block ends, the chime plays and the clock keeps counting up. You take the break when you reach a stopping point." />
        <Toggle k="autoStartBreak" label="Start breaks automatically" hint={settings.flowOvertime ? 'Applies when “Don’t break my flow” is off.' : undefined} />
        <Toggle k="autoStartFocus" label="Start the next block after a break" />
      </section>

      <section>
        <h3 className="panel-h">Sound</h3>
        <Slider k="alarmVolume" label="Chime volume" onCommit={(v) => audio.ring('test', v)} />
        <div className="row">
          <span className="row-label">Test the chime</span>
          <button className="btn-small" onClick={() => audio.ring('test', settings.alarmVolume)} data-testid="test-sound">
            Play
          </button>
        </div>
        <Toggle k="repeatAlarm" label="Ring again until I respond" hint="Every 2 minutes, a little louder, up to 3 times." />
        <div className="row column">
          <span className="row-text">
            <span className="row-label">Focus sound</span>
            <span className="row-hint">Steady noise masks distractions. Plays during focus only — breaks stay quiet.</span>
          </span>
          <div className="seg" role="radiogroup" aria-label="Focus sound">
            {SCAPES.map(([id, label]) => (
              <button
                key={id}
                role="radio"
                aria-checked={settings.soundscape === id}
                onClick={() => {
                  setSettings({ soundscape: id })
                  if (id !== 'off') previewScape(id)
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {preview && <span className="row-hint">Previewing…</span>}
        </div>
        {settings.soundscape !== 'off' && <Slider k="soundscapeVolume" label="Focus sound volume" />}
        <Toggle
          k="keepAwake"
          label="Keep this tab awake"
          hint="Plays an inaudible tone while a block runs, so the browser never puts the tab to sleep and the chime is always on time. Leave this on."
        />
      </section>

      <section>
        <h3 className="panel-h">Alerts</h3>
        <Toggle
          k="notifications"
          label="Desktop notification"
          hint={
            notifyState === 'denied'
              ? 'Blocked by your browser. Allow notifications for this site in the address bar to use it. The chime still works.'
              : notifyState === 'unsupported'
                ? 'Not supported in this browser. The chime still works.'
                : 'Extra to the chime, in case your sound is off.'
          }
          onTurnOn={requestNotify}
        />
        <Toggle k="screenWakeLock" label="Keep the screen on during focus" />
      </section>

      <section>
        <h3 className="panel-h">Music</h3>
        <Toggle
          k="tunesBridge"
          label="Share focus and break status with Tunes"
          hint={
            <>
              Tunes, open in another tab, can follow your blocks. Stays inside this browser.{' '}
              <a href={TUNES_URL} target="_blank" rel="noopener noreferrer">
                Open Tunes
              </a>
            </>
          }
        />
      </section>

      <section>
        <h3 className="panel-h">Your data</h3>
        <p className="row-hint">Everything is saved in this browser only. No account, no server, no tracking. Use a backup to move to another computer.</p>
        <div className="btn-line">
          <button className="btn-small" onClick={download}>
            Download backup
          </button>
          <button className="btn-small" onClick={() => fileRef.current?.click()}>
            Restore from backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
              e.target.value = ''
            }}
          />
          {confirmReset ? (
            <>
              <button
                className="btn-small danger"
                onClick={() => {
                  resetAll()
                  setConfirmReset(false)
                  setMsg('Everything was erased.')
                }}
              >
                Erase everything
              </button>
              <button className="btn-small" onClick={() => setConfirmReset(false)}>
                Keep my data
              </button>
            </>
          ) : (
            <button className="btn-small subtle" onClick={() => setConfirmReset(true)}>
              Erase all data…
            </button>
          )}
        </div>
        {msg && (
          <p className="row-hint" role="status">
            {msg}
          </p>
        )}
      </section>

      <section>
        <h3 className="panel-h">Keyboard</h3>
        <dl className="keys">
          <dt><kbd>Space</kbd></dt><dd>Start, pause, resume</dd>
          <dt><kbd>N</kbd></dt><dd>Park a stray thought</dd>
          <dt><kbd>T</kbd></dt><dd>Tasks</dd>
          <dt><kbd>I</kbd></dt><dd>Insights</dd>
          <dt><kbd>,</kbd></dt><dd>Settings</dd>
          <dt><kbd>F</kbd></dt><dd>Full screen</dd>
          <dt><kbd>Esc</kbd></dt><dd>Close panel</dd>
        </dl>
      </section>

      <section>
        <h3 className="panel-h">How this helps you reach flow</h3>
        <ul className="about">
          <li><b>One clear goal.</b> Each block starts with the one thing you're doing. Clear goals are the first condition for flow.</li>
          <li><b>No forced exits.</b> Flow takes 10–20 minutes to build and is fragile. With “Don't break my flow”, the chime tells you time is up, but you choose when to surface.</li>
          <li><b>Distractions get parked, not chased.</b> Press <kbd>N</kbd>, write the thought down, and your mind lets go of it.</li>
          <li><b>Steady sound, quiet screen.</b> Noise masks interruptions, and the controls fade while you work.</li>
          <li><b>Feedback to tune the challenge.</b> Rate each block's depth, then check which lengths, hours and tasks got you deep. Too easy means boredom, too hard means anxiety — flow sits in between.</li>
          <li><b>Real rest.</b> Long blocks earn longer breaks (a fifth of the time you focused). Step away from the screen.</li>
        </ul>
      </section>
    </div>
  )
}
