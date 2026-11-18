import type { ShotEnv } from './env'
import { kinetic } from './kit'
import { SANS, fitText, font, wrapLines } from '../text'
import { ease, mixHex, pop, progress } from '../easing'
import { itemArrival } from '../../motion/plan'
import { drawIcon, iconFor } from '../../motion/icons'

/**
 * A process as numbered circles joined by arrows, or a set of kinds as illustrated circles hanging from one
 * bracket. Each lands as the narration names it.
 */
export function drawSteps(env: ShotEnv) {
  const { ctx, t, theme, scene, shot } = env
  if (scene.visual.kind !== 'steps') return
  const v = scene.visual
  const head = fitText(ctx, v.heading, 1500, 1, 64, 44, 600)
  kinetic(env, head.lines, -860, -330, { size: head.size, color: theme.ink, delay: 0, stagger: 70 })

  const n = v.items.length
  const spacing = Math.min(400, 1640 / n)
  const xs = v.items.map((_, i) => (i - (n - 1) / 2) * spacing)
  const y = -10
  const r = Math.min(78, spacing * 0.22)
  const arrivals = v.items.map((_, i) => itemArrival(shot, i) - shot.t0)
  const active = arrivals.reduce((a, at, i) => (t >= at ? i : a), -1)

  if (v.style === 'kinds') {
    // Bracket: a bar above the circles with a drop to each one.
    const k = ease(progress(t, 150, 700))
    const top = y - r - 70
    ctx.fillStyle = theme.grid
    ctx.fillRect(xs[0] - 4, top - 3, (xs[n - 1] - xs[0] + 8) * k, 6)
    ctx.fillRect(-3, top - 60, 6, 60 * k)
    xs.forEach((x, i) => {
      const dk = ease(progress(t, arrivals[i] - 200, 300))
      ctx.fillRect(x - 3, top, 6, (r + 70 - r * 0.2) * dk * 0.75)
    })
  }

  v.items.forEach((item, i) => {
    const k = pop(t, arrivals[i], 700)
    if (k <= 0) return
    const isActive = i === active
    const dim = active > i ? ease(progress(t, arrivals[active], 400)) : 0
    // Arrow from the previous step.
    if (v.style === 'steps' && i > 0) {
      const ak = ease(progress(t, arrivals[i] - 150, 400))
      const ax0 = xs[i - 1] + r + 18
      const ax1 = xs[i] - r - 18
      const ax = ax0 + (ax1 - ax0) * ak
      ctx.strokeStyle = theme.axis
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(ax0, y)
      ctx.lineTo(ax, y)
      ctx.stroke()
      if (ak > 0.9) {
        ctx.fillStyle = theme.axis
        ctx.beginPath()
        ctx.moveTo(ax1 + 4, y)
        ctx.lineTo(ax1 - 16, y - 13)
        ctx.lineTo(ax1 - 16, y + 13)
        ctx.closePath()
        ctx.fill()
      }
    }
    ctx.save()
    ctx.translate(xs[i], y)
    ctx.scale(k, k)
    ctx.fillStyle = isActive ? theme.accent : theme.surface
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = isActive ? theme.accent : mixHex(theme.accent, theme.deemph, dim)
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.stroke()
    if (v.style === 'steps') {
      font(ctx, r * 0.9, 600, SANS)
      ctx.fillStyle = isActive ? theme.onAccent : theme.ink
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), 0, 4)
    } else {
      drawIcon(ctx, iconFor(item, 'circle'), 0, 0, r * 1.1, isActive ? theme.onAccent : theme.ink, isActive ? theme.onAccent : theme.accent, 0.4)
    }
    ctx.restore()

    ctx.save()
    ctx.globalAlpha *= Math.min(1, k * 1.4)
    font(ctx, 38, 500, SANS)
    ctx.fillStyle = isActive || active < 0 ? theme.ink : mixHex(theme.ink, theme.muted, dim)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    wrapLines(ctx, item, spacing - 40).slice(0, 3).forEach((l, li) => ctx.fillText(l, xs[i], y + r + 70 + li * 46 + (1 - k) * 20))
    ctx.restore()
  })
}
