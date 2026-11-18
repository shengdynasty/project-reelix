import type { Camera } from './camera'
import type { Theme } from './theme'
import { H, W } from './env'
import { rand } from './easing'

/** Flat field plus two parallax layers: large slow shapes far back, a dot grid in the middle. */
export function drawBackground(ctx: CanvasRenderingContext2D, theme: Theme, cam: Camera, t: number) {
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, W, H)

  // Far layer.
  const f = 0.35
  const zf = 1 + (cam.z - 1) * f
  const cell = 1100
  const cx = cam.x * f
  const cy = cam.y * f
  const halfW = W / 2 / zf + cell
  const halfH = H / 2 / zf + cell
  ctx.save()
  ctx.translate(W / 2, H / 2)
  ctx.rotate(cam.r * 0.5)
  ctx.scale(zf, zf)
  ctx.translate(-cx, -cy)
  for (let gx = Math.floor((cx - halfW) / cell); gx <= Math.floor((cx + halfW) / cell); gx++) {
    for (let gy = Math.floor((cy - halfH) / cell); gy <= Math.floor((cy + halfH) / cell); gy++) {
      const seed = gx * 92821 + gy * 68917
      const kind = Math.floor(rand(seed) * 4)
      const x = gx * cell + rand(seed + 1) * cell
      const y = gy * cell + rand(seed + 2) * cell
      const r = 90 + rand(seed + 3) * 260
      const spin = t / (9000 + rand(seed + 4) * 9000) + rand(seed + 5) * 6
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(spin)
      ctx.strokeStyle = theme.grid
      ctx.fillStyle = theme.grid
      ctx.lineWidth = 6
      if (kind === 0) {
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.stroke()
      } else if (kind === 1) {
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.7, 0, Math.PI * 1.25)
        ctx.stroke()
      } else if (kind === 2) {
        const a = r * 0.25
        ctx.fillRect(-a, -6, a * 2, 12)
        ctx.fillRect(-6, -a, 12, a * 2)
      } else {
        ctx.globalAlpha *= 0.6
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
  }
  ctx.restore()

  // Middle layer: dot grid that slides with the camera.
  const m = 0.7
  const zm = 1 + (cam.z - 1) * m
  const gap = 64 * zm
  const ox = (((-cam.x * m * zm) % gap) + gap) % gap
  const oy = (((-cam.y * m * zm) % gap) + gap) % gap
  ctx.fillStyle = theme.dot
  for (let y = oy - gap; y < H + gap; y += gap) {
    for (let x = ox - gap; x < W + gap; x += gap) {
      ctx.fillRect(x - 2, y - 2, 4, 4)
    }
  }
}
