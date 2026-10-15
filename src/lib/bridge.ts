/**
 * Same-origin bridge for companion apps (e.g. Tunes at /tunes/ on the same
 * GitHub Pages host). Nothing leaves the browser: BroadcastChannel only talks
 * to other tabs of the same origin.
 *
 * Message shape:
 *   { source: 'flowstate', v: 1, type: 'state', phase: 'idle'|'focus'|'break',
 *     running: boolean, endsAt: number|null, task: string|null }
 *   { source: 'flowstate', v: 1, type: 'alarm', kind: 'focus-end'|'break-end' }
 */
export interface BridgeState {
  phase: 'idle' | 'focus' | 'break'
  running: boolean
  endsAt: number | null
  task: string | null
}

let channel: BroadcastChannel | null = null

function ch(): BroadcastChannel | null {
  if (channel) return channel
  if (typeof BroadcastChannel === 'undefined') return null
  channel = new BroadcastChannel('flowstate')
  return channel
}

let last = ''

export function broadcastState(s: BridgeState): void {
  const msg = { source: 'flowstate', v: 1, type: 'state', ...s }
  const key = JSON.stringify(msg)
  if (key === last) return
  last = key
  ch()?.postMessage(msg)
}

export function broadcastAlarm(kind: 'focus-end' | 'break-end'): void {
  ch()?.postMessage({ source: 'flowstate', v: 1, type: 'alarm', kind })
}

export function resetBridge(): void {
  last = ''
}
