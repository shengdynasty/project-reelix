import type { ShotEnv } from './env'
import { badge } from './kit'
import { MONO, fitText, font } from '../text'
import { ease, progress, spring } from '../easing'

/** Closing card: badge, title and where the information came from. */
export function drawEnd(env: ShotEnv) {
  const { ctx, t, theme, shot, plan } = env
  badge(env, 0, -200, 100, shot.icon, 0)
  const f = fitText(ctx, plan.storyboard.title, 1400, 2, 80, 50, 600)
  font(ctx, f.size, 600)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  f.lines.forEach((l, i) => {
    const k = spring(progress(t, 150 + i * 100, 650))
    ctx.save()
    ctx.globalAlpha *= Math.min(1, k * 1.5)
    ctx.translate(0, -10 + f.size + i * f.size * 1.08)
    ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k)
    ctx.fillStyle = theme.ink
    ctx.fillText(l, 0, 0)
    ctx.restore()
  })
  const y = -10 + f.size + (f.lines.length - 1) * f.size * 1.08
  const k = ease(progress(t, 400, 600))
  const sources = plan.storyboard.sources.map((s) => s.label.replace(/^Wikipedia: .*/, 'Wikipedia'))
  const unique = [...new Set(sources)]
  ctx.save()
  ctx.globalAlpha *= k
  font(ctx, 28, 500, MONO)
  ctx.fillStyle = theme.inkSoft
  if (unique.length) {
    let line = `Sources: ${unique.join(' · ')}`
    while (ctx.measureText(line).width > 1400 && line.length > 20) line = line.slice(0, -2)
    ctx.fillText(line === `Sources: ${unique.join(' · ')}` ? line : line + '…', 0, y + 86)
  }
  font(ctx, 24, 500, MONO)
  ctx.fillStyle = theme.muted
  ctx.fillText('Made with Project Reelix', 0, y + (unique.length ? 140 : 86))
  ctx.restore()
}
