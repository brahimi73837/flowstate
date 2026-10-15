import { useMemo } from 'react'
import { useNow } from './engine'
import { taskTotals } from './lib/stats'
import { liveSegments } from './lib/timer'
import { useStore } from './store'

/** Focus time per task id: everything logged plus the block in progress. */
export function useTaskSpent(): Map<string, number> {
  const now = useNow()
  const sessions = useStore((s) => s.sessions)
  const timer = useStore((s) => s.timer)
  const logged = useMemo(() => taskTotals(sessions), [sessions])
  return useMemo(() => {
    if (timer.phase !== 'focus') return logged
    const map = new Map(logged)
    for (const [k, v] of Object.entries(liveSegments(timer, now))) map.set(k, (map.get(k) ?? 0) + v)
    return map
  }, [logged, timer, now])
}
