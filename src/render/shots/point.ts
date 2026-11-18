import type { ShotEnv } from './env'
import { badge, kinetic } from './kit'
import { fitText } from '../text'
import { focusWord } from '../../motion/icons'

/** One idea per shot: a big illustrated badge on one side, the phrase in kinetic type on the other. */
export function drawPoint(env: ShotEnv) {
  const { ctx, theme, scene, shot } = env
  if (scene.visual.kind !== 'bullets') return
  const v = scene.visual
  const text = v.items[shot.item] ?? v.items[0]
  const mirror = shot.index % 2 === 1
  const badgeX = mirror ? 540 : -540
  const textLeft = mirror ? -860 : -250
  const textW = 1110

  badge(env, badgeX, -40, 210, shot.icon, 0)

  const single = shot.itemCount === 1
  const fit = fitText(ctx, text, textW, single ? 5 : 4, single ? 84 : 96, 52, 600)
  const lineH = fit.size * 1.12
  const blockH = fit.lines.length * lineH
  const top = -40 - blockH / 2

  kinetic(env, fit.lines, textLeft, top + fit.size * 0.9, {
    size: fit.size,
    lineHeight: lineH,
    delay: 180,
    stagger: single ? 35 : 55,
    color: theme.ink,
    highlight: focusWord(text),
  })
}
