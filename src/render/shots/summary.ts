import type { ShotEnv } from './env'
import { chip, kinetic } from './kit'
import { fitText, font } from '../text'
import { pop } from '../easing'

/** One closing sentence with a few tags (the corner label already says "In short"). A few seconds, not a recap. */
export function drawSummary(env: ShotEnv) {
  const { ctx, t, theme, scene } = env
  if (scene.visual.kind !== 'outro') return
  const v = scene.visual
  const f = fitText(ctx, v.summary, 1500, 3, 72, 44, 600)
  const lineH = f.size * 1.14
  const top = -230
  kinetic(env, f.lines, 0, top + f.size * 0.9, { size: f.size, lineHeight: lineH, align: 'center', delay: 150, stagger: 40, color: theme.ink })

  const tagsY = top + f.lines.length * lineH + 110
  font(ctx, 34, 600)
  const widths = v.tags.map((tg) => ctx.measureText(tg).width + 34 * 1.4)
  const gap = 24
  const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, v.tags.length - 1)
  let x = -total / 2
  v.tags.forEach((tg, i) => {
    chip(env, tg, x + widths[i] / 2, tagsY, pop(t, 900 + i * 180, 600), { size: 34 })
    x += widths[i] + gap
  })
}
