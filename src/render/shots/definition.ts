import type { ShotEnv } from './env'
import { badge, kinetic } from './kit'
import { MONO, fitText, font } from '../text'
import { ease, progress } from '../easing'
import { focusWord } from '../../motion/icons'

/** "Vaccine / is / a biological preparation that..." beside an illustrated badge. */
export function drawDefinition(env: ShotEnv) {
  const { ctx, t, theme, scene, shot } = env
  if (scene.visual.kind !== 'definition') return
  const v = scene.visual
  badge(env, -560, -30, 200, shot.icon, 0)

  const left = -250
  const width = 1110
  const term = fitText(ctx, v.term, width, 2, 112, 64, 600)
  const termH = term.lines.length * term.size * 1.05
  const meaning = fitText(ctx, v.meaning, width, 4, 50, 34, 500)
  const meaningH = meaning.lines.length * meaning.size * 1.2
  const block = termH + 70 + meaningH
  let y = -30 - block / 2

  kinetic(env, term.lines, left, y + term.size * 0.9, { size: term.size, lineHeight: term.size * 1.05, delay: 120, stagger: 80, color: theme.ink })
  y += termH + 10

  const lk = ease(progress(t, 520, 500))
  ctx.save()
  ctx.globalAlpha *= lk
  font(ctx, 34, 500, MONO)
  ctx.fillStyle = theme.accent
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(v.link, left, y + 34 + (1 - lk) * 10)
  ctx.restore()
  y += 60

  kinetic(env, meaning.lines, left, y + meaning.size * 0.9, {
    size: meaning.size,
    weight: 500,
    lineHeight: meaning.size * 1.2,
    delay: 700,
    stagger: 30,
    color: theme.inkSoft,
    highlight: focusWord(v.meaning),
  })
}
