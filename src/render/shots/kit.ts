import type { ShotEnv } from './env'
import { drawIcon } from '../../motion/icons'
import { SANS, font } from '../text'
import { ease, pop, progress } from '../easing'
import { fillRound } from '../draw'

/** Icon in a disc with an accent ring that sweeps on, a dot orbiting the ring, and a gentle bob. */
export function badge(env: ShotEnv, cx: number, cy: number, r: number, icon: string, delay = 0) {
  const { ctx, t, theme } = env
  const k = pop(t, delay, 800)
  if (k <= 0) return
  ctx.save()
  ctx.translate(cx, cy + Math.sin(env.global / 850) * 7)
  ctx.scale(k, k)
  ctx.fillStyle = theme.surface
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  const sweep = ease(progress(t, delay + 120, 900))
  ctx.strokeStyle = theme.accent
  ctx.lineWidth = Math.max(6, r * 0.055)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sweep)
  ctx.stroke()
  const ang = -Math.PI / 2 + Math.PI * 2 * sweep + Math.max(0, t - delay - 1000) / 1500
  ctx.fillStyle = theme.accent
  ctx.beginPath()
  ctx.arc(Math.cos(ang) * (r + r * 0.14), Math.sin(ang) * (r + r * 0.14), r * 0.06, 0, Math.PI * 2)
  ctx.fill()
  const ik = pop(t, delay + 140, 750)
  if (ik > 0) drawIcon(ctx, icon, 0, 0, r * 1.15 * ik, theme.ink, theme.accent, 0.45)
  ctx.restore()
}

const clean = (w: string) => w.toLowerCase().replace(/[^a-z0-9.%$'’]/g, '').replace(/\.$/, '')

export interface KineticOpts {
  size: number
  weight?: number
  lineHeight?: number
  align?: 'left' | 'center'
  delay?: number
  stagger?: number
  color: string
  /** Word drawn over an accent marker stroke. */
  highlight?: string
}

/** Words rise into place one after another; an optional focus word gets a marker sweep behind it. */
export function kinetic(env: ShotEnv, lines: string[], x: number, y: number, o: KineticOpts) {
  const { ctx, t, theme } = env
  const weight = o.weight ?? 600
  const lineH = o.lineHeight ?? o.size * 1.12
  const delay = o.delay ?? 0
  const stagger = o.stagger ?? 45
  font(ctx, o.size, weight, SANS)
  const space = ctx.measureText(' ').width
  const hl = o.highlight ? clean(o.highlight) : ''
  let k = 0
  let marked = false
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  lines.forEach((line, li) => {
    const words = line.split(' ')
    const lw = ctx.measureText(line).width
    let wx = o.align === 'center' ? x - lw / 2 : x
    const by = y + li * lineH
    for (const w of words) {
      const p = ease(progress(t, delay + k * stagger, 650))
      const ww = ctx.measureText(w).width
      if (p > 0) {
        if (!marked && hl && clean(w) === hl) {
          marked = true
          const hk = ease(progress(t, delay + 450 + k * stagger, 550))
          ctx.save()
          ctx.globalAlpha *= 0.5
          fillRound(ctx, wx - 8, by - o.size * 0.42, (ww + 16) * hk, o.size * 0.5, 8, theme.accent)
          ctx.restore()
        }
        ctx.save()
        ctx.globalAlpha *= p
        ctx.fillStyle = o.color
        ctx.fillText(w, wx, by + (1 - p) * o.size * 0.45)
        ctx.restore()
      }
      wx += ww + space
      k++
    }
  })
}

export function chip(env: ShotEnv, text: string, cx: number, cy: number, k: number, opts: { fill?: string; color?: string; size?: number } = {}) {
  const { ctx, theme } = env
  if (k <= 0) return
  const size = opts.size ?? 38
  font(ctx, size, 600, SANS)
  const w = ctx.measureText(text).width + size * 1.4
  const h = size * 1.9
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(k, k)
  fillRound(ctx, -w / 2, -h / 2, w, h, h / 2, opts.fill ?? theme.surface)
  ctx.fillStyle = opts.color ?? theme.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 2)
  ctx.restore()
}

/** Short lines radiating from a point, for emphasis when a number lands. */
export function burst(env: ShotEnv, cx: number, cy: number, r: number, at: number) {
  const { ctx, t, theme } = env
  const p = progress(t, at, 700)
  if (p <= 0 || p >= 1) return
  const e = ease(p)
  ctx.save()
  ctx.strokeStyle = theme.accent
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.globalAlpha *= 1 - p
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3
    const r0 = r * (0.9 + 0.5 * e)
    const r1 = r0 + 40 * (1 - e) + 20
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
    ctx.stroke()
  }
  ctx.restore()
}
