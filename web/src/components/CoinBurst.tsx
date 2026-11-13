import { useEffect, useRef } from 'react'

// Zarqa's own gold coins, plus a few paper and tan luggage tags.
const GOLD = ['#f0c44c', '#e3a92f', '#f7d877']
const TAGS = ['#f2eee8', '#bd9777', '#8e9da0']

type Piece = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  /** Coins flip on their vertical axis; tags tumble. */
  spin: number
  spinSpeed: number
  tilt: number
  tiltSpeed: number
  color: string
  tag: boolean
}

/**
 * A burst of gold coins for the big moments (an item returned). They shoot up from `origin` (0–1 of the box),
 * then fall. Drawn on a canvas that covers its positioned parent and never takes taps. Plays once.
 * Skipped entirely under reduced motion.
 */
export function CoinBurst({ origin = [0.5, 0.45], count = 64, delay = 0 }: { origin?: [number, number]; count?: number; delay?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [ox, oy] = origin

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const pieces: Piece[] = Array.from({ length: count }, (_, i) => {
      const tag = i % 5 === 0
      // A fan pointing up, wider than it is tall.
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9
      const speed = 520 + Math.random() * 620
      return {
        x: width * ox + (Math.random() - 0.5) * 40,
        y: height * oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: tag ? 9 + Math.random() * 5 : 6 + Math.random() * 6,
        spin: Math.random() * Math.PI,
        spinSpeed: 6 + Math.random() * 9,
        tilt: Math.random() * Math.PI * 2,
        tiltSpeed: (Math.random() - 0.5) * 8,
        color: (tag ? TAGS : GOLD)[i % 3],
        tag,
      }
    })

    let frame = 0
    let last = 0
    let start = 0
    const draw = (now: number) => {
      if (!start) start = last = now
      const dt = Math.min((now - last) / 1000, 0.034)
      last = now
      const age = (now - start) / 1000
      ctx.clearRect(0, 0, width, height)
      let alive = false
      for (const p of pieces) {
        p.vy += 1500 * dt // gravity
        p.vx *= 1 - 1.4 * dt // air
        p.vy *= 1 - 0.5 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.spin += p.spinSpeed * dt
        p.tilt += p.tiltSpeed * dt
        if (p.y < height + 30) alive = true
        // Fade the last ones out rather than letting them drop off a cliff.
        ctx.globalAlpha = Math.max(0, Math.min(1, 2.6 - age))
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.tilt)
        ctx.fillStyle = p.color
        if (p.tag) {
          // A tiny luggage tag: notched rectangle.
          const w = p.size * 1.5
          const h = p.size
          ctx.scale(1, Math.cos(p.spin))
          ctx.beginPath()
          ctx.moveTo(-w / 2 + 3, -h / 2)
          ctx.lineTo(w / 2, -h / 2)
          ctx.lineTo(w / 2, h / 2)
          ctx.lineTo(-w / 2 + 3, h / 2)
          ctx.lineTo(-w / 2, h / 2 - 3)
          ctx.lineTo(-w / 2, -h / 2 + 3)
          ctx.closePath()
          ctx.fill()
        } else {
          // A coin seen flipping: an ellipse that thins to an edge and back, with a darker rim.
          const flip = Math.abs(Math.cos(p.spin))
          ctx.beginPath()
          ctx.ellipse(0, 0, Math.max(p.size * flip, 1.2), p.size, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.lineWidth = 1.4
          ctx.strokeStyle = 'rgba(116, 87, 63, 0.55)'
          ctx.stroke()
        }
        ctx.restore()
      }
      if (alive && age < 2.6) frame = requestAnimationFrame(draw)
      else ctx.clearRect(0, 0, width, height)
    }
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(draw)
    }, delay)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [ox, oy, count, delay])

  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
}
