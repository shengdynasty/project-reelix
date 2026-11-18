import type { ShotEnv } from './env'
import { kinetic } from './kit'
import { SANS, fitText, font, wrapLines } from '../text'
import { ease, mixHex, pop, progress } from '../easing'
import { itemArrival } from '../../motion/plan'

/** Dated events on a line that draws itself, each landing as it is named. */
export function drawTimeline(env: ShotEnv) {
  const { ctx, t, theme, scene, shot } = env
  if (scene.visual.kind !== 'timeline') return
  const v = scene.visual
  const head = fitText(ctx, v.heading, 1500, 1, 64, 44, 600)
  kinetic(env, head.lines, -860, -330, { size: head.size, color: theme.ink, delay: 0, stagger: 70 })

  const n = v.events.length
  const spacing = Math.min(420, 1560 / Math.max(1, n - 1))
  const total = spacing * (n - 1)
  const xs = v.events.map((_, i) => -total / 2 + i * spacing)
  const y = 20
  const arrivals = v.events.map((_, i) => itemArrival(shot, i) - shot.t0)
  const active = arrivals.reduce((a, at, i) => (t >= at ? i : a), -1)

  // Base line, then an accent line that reaches the latest event.
  const lineK = ease(progress(t, 100, 900))
  const x0 = xs[0] - 80
  const x1 = xs[n - 1] + 80
  ctx.fillStyle = theme.grid
  ctx.fillRect(x0, y - 3, (x1 - x0) * lineK, 6)
  if (active >= 0) {
    const reach = ease(progress(t, arrivals[active], 600))
    const from = active > 0 ? xs[active - 1] : x0
    const to = from + (xs[active] - from) * reach
    ctx.fillStyle = theme.accent
    ctx.fillRect(x0, y - 3, to - x0, 6)
  }

  v.events.forEach((e, i) => {
    const k = pop(t, arrivals[i], 650)
    if (k <= 0) return
    const isActive = i === active
    const dim = active > i ? ease(progress(t, arrivals[active], 400)) : 0
    // Dot with a surface ring.
    ctx.save()
    ctx.translate(xs[i], y)
    ctx.scale(k, k)
    ctx.fillStyle = theme.bg
    ctx.beginPath()
    ctx.arc(0, 0, 30, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = isActive ? theme.accent : mixHex(theme.accent, theme.deemph, dim)
    ctx.beginPath()
    ctx.arc(0, 0, 21, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    const a = Math.min(1, k * 1.4)
    ctx.save()
    ctx.globalAlpha *= a
    ctx.textAlign = 'center'
    font(ctx, 58, 600, SANS)
    ctx.fillStyle = isActive || active < 0 ? theme.ink : mixHex(theme.ink, theme.muted, dim)
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(e.when, xs[i], y - 64 + (1 - k) * 20)
    font(ctx, 34, 500, SANS)
    ctx.fillStyle = isActive || active < 0 ? theme.inkSoft : mixHex(theme.inkSoft, theme.muted, dim)
    wrapLines(ctx, e.label, spacing - 50).slice(0, 3).forEach((l, li) => ctx.fillText(l, xs[i], y + 90 + li * 42 + (1 - k) * 20))
    ctx.restore()
  })
}
