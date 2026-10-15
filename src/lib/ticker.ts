/**
 * A heartbeat from a dedicated Web Worker. Worker timers are not subject to the
 * aggressive throttling applied to background-tab main-thread timers, so the
 * app keeps noticing when a block ends even while you're in another tab.
 */
const WORKER_SRC = `let id=null;onmessage=(e)=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}`

export function startTicker(fn: () => void, everyMs = 500): () => void {
  let worker: Worker | null = null
  let fallback: ReturnType<typeof setInterval> | null = null
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))
    worker = new Worker(url)
    URL.revokeObjectURL(url)
    worker.onmessage = fn
    worker.postMessage(everyMs)
  } catch {
    fallback = setInterval(fn, everyMs)
  }
  return () => {
    worker?.terminate()
    if (fallback) clearInterval(fallback)
  }
}
