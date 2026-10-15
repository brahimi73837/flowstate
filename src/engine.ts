import { useSyncExternalStore } from 'react'
import { audio } from './lib/audio'
import { broadcastAlarm, broadcastState } from './lib/bridge'
import { drawFavicon } from './lib/favicon'
import { clock, clockUp } from './lib/format'
import { notify } from './lib/notify'
import { startTicker } from './lib/ticker'
import { UNATTENDED_OVERTIME_MS, dueAt, elapsed, isRunning, remaining } from './lib/timer'
import { useStore, type Ringing } from './store'

// ---- Shared clock for the UI -----------------------------------------------

let now = Date.now()
const listeners = new Set<() => void>()

export function useNow(): number {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => now,
  )
}

// ---- Engine -------------------------------------------------------------------

let started = false

export function startEngine(): () => void {
  if (started) return () => {}
  started = true

  let alarmKey: string | null = ''
  let wakeLock: { release: () => Promise<void> } | null = null
  let wantWake = false

  const taskTitle = () => {
    const { timer, tasks } = useStore.getState()
    return tasks.find((t) => t.id === timer.taskId)?.title ?? null
  }

  /** Keep the pre-scheduled audio alarm in line with the timer. */
  const syncAlarm = () => {
    const { timer, settings, ringing } = useStore.getState()
    const due = dueAt(timer)
    const key =
      isRunning(timer) && !timer.reached && due !== null
        ? `${timer.sessionId}:${timer.resumedAt}:${timer.plannedMs}:${settings.alarmVolume}:${settings.repeatAlarm}:${audio.ready}`
        : null
    if (key === alarmKey) return
    alarmKey = key
    if (key && due !== null) {
      audio.scheduleAlarm(due - Date.now(), timer.phase === 'focus' ? 'focus-end' : 'break-end', settings.alarmVolume, settings.repeatAlarm)
    } else if (!ringing) {
      audio.cancelAlarm()
    }
  }

  const syncBed = () => {
    const { timer, settings } = useStore.getState()
    const running = isRunning(timer)
    if (timer.phase === 'focus' && running) audio.setBed(settings.soundscape, settings.soundscapeVolume, settings.keepAwake, true)
    else audio.setBed('off', 0, settings.keepAwake, running)
  }

  const syncWakeLock = async () => {
    const { timer, settings } = useStore.getState()
    wantWake = settings.screenWakeLock && timer.phase === 'focus' && isRunning(timer)
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
    if (!wl) return
    try {
      if (wantWake && !wakeLock && document.visibilityState === 'visible') wakeLock = await wl.request('screen')
      else if (!wantWake && wakeLock) {
        await wakeLock.release()
        wakeLock = null
      }
    } catch {
      wakeLock = null
    }
  }

  const onRing = (r: Ringing) => {
    const { settings, timer } = useStore.getState()
    // If the audio thread already played the pre-scheduled chime, don't double up.
    if (!audio.alarmHasPlayed()) audio.ring(r.kind, settings.alarmVolume, settings.repeatAlarm)
    if (settings.tunesBridge) broadcastAlarm(r.kind)
    if (settings.notifications) {
      const task = taskTitle()
      if (r.kind === 'focus-end') {
        notify(
          'Focus block done',
          timer.phase === 'focus' ? `${task ? `“${task}” — ` : ''}keep flowing, or take a break when you reach a stopping point.` : `${task ? `“${task}” — ` : ''}time for a break.`,
        )
      } else {
        notify('Break over', 'Ready for the next block.')
      }
    }
  }

  const render = () => {
    const { timer, settings } = useStore.getState()
    const t = Date.now()
    const rem = remaining(timer, t)
    const task = taskTitle()
    if (timer.phase === 'idle') {
      document.title = 'Flowstate'
      drawFavicon(null, 'idle', false)
    } else {
      const face = rem >= 0 ? clock(rem) : `+${clockUp(-rem)}`
      const label = timer.phase === 'break' ? 'Break' : rem < 0 ? 'In flow' : task ?? 'Focus'
      document.title = `${timer.resumedAt === null ? '❚❚ ' : ''}${face} · ${label}`
      drawFavicon(Math.min(1, elapsed(timer, t) / timer.plannedMs), timer.phase, timer.resumedAt === null)
    }
    if (settings.tunesBridge) {
      broadcastState({ phase: timer.phase, running: isRunning(timer), endsAt: dueAt(timer), task })
    }
  }

  const tick = () => {
    const state = useStore.getState()
    const { timer } = state
    const t = Date.now()
    if (isRunning(timer) && !timer.reached && remaining(timer, t) <= 0) state.reach(t)
    const after = useStore.getState().timer
    if (after.phase === 'focus' && after.reached && !after.acknowledged && -remaining(after, t) > UNATTENDED_OVERTIME_MS) {
      useStore.getState().autoFinish()
    }
    render()
    now = t
    listeners.forEach((fn) => fn())
  }

  const unsubStore = useStore.subscribe((s, prev) => {
    if (s.ringing && s.ringing !== prev.ringing) onRing(s.ringing)
    if (!s.ringing && prev.ringing) audio.cancelAlarm()
    if (s.timer !== prev.timer || s.settings !== prev.settings || s.ringing !== prev.ringing) {
      syncAlarm()
      syncBed()
      void syncWakeLock()
      render()
      now = Date.now()
      listeners.forEach((fn) => fn())
    }
  })

  // The first interaction unlocks audio (browser autoplay rules) and silences any ringing.
  const onGesture = () => {
    const wasReady = audio.ready
    audio.unlock()
    if (useStore.getState().ringing) useStore.getState().acknowledge()
    if (!wasReady) setTimeout(() => {
      alarmKey = ''
      syncAlarm()
      syncBed()
    }, 50)
  }
  window.addEventListener('pointerdown', onGesture, true)
  window.addEventListener('keydown', onGesture, true)

  let unsubAudio = () => {}
  const watchAudio = setInterval(() => {
    // Attach once the context exists; re-sync whenever it starts or stops.
    unsubAudio()
    unsubAudio = audio.onStateChange(() => {
      alarmKey = ''
      syncAlarm()
      syncBed()
      listeners.forEach((fn) => fn())
    })
    if (audio.ready) clearInterval(watchAudio)
  }, 1000)

  const onVisible = () => {
    tick()
    void syncWakeLock()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)

  const stopTicker = startTicker(tick, 250)
  tick()
  syncAlarm()

  return () => {
    started = false
    stopTicker()
    unsubStore()
    unsubAudio()
    clearInterval(watchAudio)
    window.removeEventListener('pointerdown', onGesture, true)
    window.removeEventListener('keydown', onGesture, true)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
  }
}
