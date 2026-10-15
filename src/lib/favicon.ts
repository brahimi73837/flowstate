/** Draws the tab icon as a progress ring so you can glance at it from another tab. */
let link: HTMLLinkElement | null = null
let lastKey = ''
const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null

export function drawFavicon(progress: number | null, phase: 'idle' | 'focus' | 'break', paused: boolean): void {
  if (!canvas) return
  const key = `${phase}${paused}${progress === null ? '-' : Math.round(progress * 48)}`
  if (key === lastKey) return
  lastKey = key
  const size = 64
  canvas.width = canvas.height = size
  const c = canvas.getContext('2d')
  if (!c) return
  const color = phase === 'break' ? '#c98a4b' : '#2f8f83'
  c.clearRect(0, 0, size, size)
  c.lineWidth = 9
  c.strokeStyle = 'rgba(120,140,150,0.35)'
  c.beginPath()
  c.arc(32, 32, 24, 0, Math.PI * 2)
  c.stroke()
  if (progress !== null) {
    c.strokeStyle = paused ? '#8a9aa3' : color
    c.lineCap = 'round'
    c.beginPath()
    c.arc(32, 32, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.max(0.001, progress)))
    c.stroke()
  } else {
    c.fillStyle = '#2f8f83'
    c.beginPath()
    c.arc(32, 32, 9, 0, Math.PI * 2)
    c.fill()
  }
  if (!link) {
    link = document.querySelector('link[rel="icon"]') ?? document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.type = 'image/png'
  link.href = canvas.toDataURL('image/png')
}
