export const canNotify = () => typeof Notification !== 'undefined'

export async function requestNotify(): Promise<boolean> {
  if (!canNotify()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export function notify(title: string, body: string): void {
  if (!canNotify() || Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, { body, tag: 'flowstate', requireInteraction: true, icon: `${import.meta.env.BASE_URL}icon-192.png` })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // Some browsers only allow notifications through a service worker.
    navigator.serviceWorker?.ready
      .then((reg) => reg.showNotification(title, { body, tag: 'flowstate', requireInteraction: true }))
      .catch(() => {})
  }
}
