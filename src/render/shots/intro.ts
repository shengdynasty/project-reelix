import type { ShotEnv } from './env'
import { badge } from './kit'
import { MONO, fitText, font } from '../text'
import { clamp01, ease, progress, rand, spring } from '../easing'
import { fillRound } from '../draw'
import { INTRO_TITLE_START } from '../../motion/beats'

/** Iris burst, title words dropping in with a spring, an accent underline and a burst of particles. */
export function drawIntro(env: ShotEnv) {
  const { ctx, t, theme, scene, shot } = env
  if (scene.visual.kind !== 'title') return
  const v = scene.visual

  // Iris: an accent disc expands, then the background opens from its middle, leaving a fading ring.
  const outer = ease(progress(t, 0, 700)) * 1400
  const inner = ease(progress(t, 160, 760)) * 1420
  const ringFade = 1 - clamp01((t - 700) / 500)
  if (outer > 0 && ringFade > 0) {
    ctx.save()
    ctx.globalAlpha *= ringFade
    ctx.fillStyle = theme.accent
    ctx.beginPath()
    ctx.arc(0, 0, outer, 0, Math.PI * 2)
    ctx.arc(0, 0, Math.min(inner, outer), 0, Math.PI * 2, true)
    ctx.fill('evenodd')
    ctx.restore()
  }

  // Particles flung outward.
  for (let i = 0; i < 18; i++) {
    const p = progress(t, 450 + rand(i) * 200, 1600)
    if (p <= 0) continue
    const a = rand(i + 7) * Math.PI * 2
    const d = 260 + ease(p) * (380 + rand(i + 3) * 420)
    const r = 6 + rand(i + 11) * 10
    ctx.save()
    ctx.globalAlpha *= (1 - p) * 0.9
    ctx.fillStyle = i % 3 === 0 ? theme.ink : theme.accent
    ctx.beginPath()
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.7, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  badge(env, 0, -250, 96, shot.icon, 300)

  const fit = fitText(ctx, v.title, 1500, 3, 124, 68, 600)
  const lineH = fit.size * 1.06
  const top = -70 + (fit.lines.length === 1 ? 40 : 0)
  // Words drop in with a spring scale.
  font(ctx, fit.size, 600)
  const space = ctx.measureText(' ').width
  let k = 0
  ctx.textBaseline = 'alphabetic'
  fit.lines.forEach((line, li) => {
    const lw = ctx.measureText(line).width
    let x = -lw / 2
    for (const w of line.split(' ')) {
      const ww = ctx.measureText(w).width
      const p = spring(progress(t, INTRO_TITLE_START + k * 90, 750))
      if (p > 0) {
        ctx.save()
        ctx.translate(x + ww / 2, top + fit.size + li * lineH)
        ctx.scale(1.35 - 0.35 * p, 1.35 - 0.35 * p)
        ctx.globalAlpha *= clamp01(p * 1.6)
        ctx.fillStyle = theme.ink
        ctx.fillText(w, -ww / 2, 0)
        ctx.restore()
      }
      x += ww + space
      k++
    }
  })
  const lastY = top + fit.size + (fit.lines.length - 1) * lineH
  const widest = Math.max(...fit.lines.map((l) => ctx.measureText(l).width))
  const u = ease(progress(t, INTRO_TITLE_START + k * 90 + 100, 700))
  fillRound(ctx, -(widest * u) / 2, lastY + 36, widest * u, 12, 6, theme.accent)

  font(ctx, 32, 500, MONO)
  const sk = ease(progress(t, INTRO_TITLE_START + k * 90 + 300, 700))
  ctx.save()
  ctx.globalAlpha *= sk
  ctx.fillStyle = theme.inkSoft
  ctx.textAlign = 'center'
  ctx.fillText(v.subtitle, 0, lastY + 120 + (1 - sk) * 16)
  ctx.restore()
}
