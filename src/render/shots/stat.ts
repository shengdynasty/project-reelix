import type { ShotEnv } from './env'
import { badge, burst, chip } from './kit'
import { MONO, SANS, fitText, font, measure } from '../text'
import { ease, easeInOut, lerp, pop, progress } from '../easing'
import { fillRound, rowBar } from '../draw'
import { fixedNumber, formatValue, pctChange } from '../../input/numbers'
import { STAT_COUNT_DUR, STAT_COUNT_START } from '../../motion/beats'

/**
 * Count up progress at local time t. A count of the usual length keeps its settle; a longer one, when the number
 * comes late in the sentence, runs on the symmetric curve so the final digits land with the burst, not early.
 */
export function countProgress(t: number, countDur: number): number {
  return (countDur <= STAT_COUNT_DUR ? ease : easeInOut)(progress(t, STAT_COUNT_START, countDur))
}

/**
 * A number that counts up and lands with a burst as the narration says it. Percentages get a 10 by 10 pictogram
 * that fills in step with the count; changes get before and after bars; other figures get an illustrated badge.
 */
export function drawStat(env: ShotEnv) {
  const { ctx, t, theme, scene, shot } = env
  if (scene.visual.kind !== 'stat') return
  const v = scene.visual
  const countEnd = (shot.countEnd ?? shot.t0 + STAT_COUNT_START + STAT_COUNT_DUR) - shot.t0
  const countDur = countEnd - STAT_COUNT_START
  const countK = countProgress(t, countDur)
  const from = v.from ?? 0
  const value = lerp(from, v.value, countK)
  const landAt = countEnd - 150
  const isPct = v.unit.suffix === '%' && v.value >= 0 && v.value <= 100 && v.from === null

  const leftX = -840
  const colW = isPct || v.from !== null ? 820 : 900
  const numText = v.unit.prefix + fixedNumber(value, v.decimals).replace('−', '-') + v.unit.suffix
  const finalText = v.unit.prefix + fixedNumber(v.value, v.decimals) + v.unit.suffix
  const wordSize = (s: number) => Math.round(s * 0.3)
  let size = 250
  const wordW = (s: number) => (v.unit.word ? measure(ctx, v.unit.word, wordSize(s), 500) + 24 : 0)
  while (size > 110 && measure(ctx, finalText, size, 600) + wordW(size) > colW) size -= 6
  const baseY = v.from !== null ? -10 : 10

  // The number, with a small squash when it lands.
  const land = pop(t, landAt, 500)
  const squash = t > landAt ? 1 + 0.06 * Math.sin(Math.min(1, (t - landAt) / 350) * Math.PI) : 1
  const appear = ease(progress(t, 120, 500))
  ctx.save()
  ctx.globalAlpha *= appear
  ctx.translate(leftX, baseY)
  ctx.scale(squash, squash)
  font(ctx, size, 600, SANS)
  ctx.fillStyle = theme.ink
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillText(numText, 0, 0)
  const numW = ctx.measureText(finalText).width
  if (v.unit.word) {
    font(ctx, wordSize(size), 500, SANS)
    ctx.fillStyle = theme.inkSoft
    ctx.fillText(v.unit.word, numW + 24, 0)
  }
  ctx.restore()
  burst(env, leftX + numW / 2, baseY - size * 0.36, Math.max(140, numW * 0.55), landAt)

  // Label.
  const lk = ease(progress(t, 650, 650))
  const lf = fitText(ctx, v.label, colW, 3, 48, 34, 500)
  ctx.save()
  ctx.globalAlpha *= lk
  ctx.fillStyle = theme.inkSoft
  lf.lines.forEach((l, i) => ctx.fillText(l, leftX, baseY + 110 + i * lf.size * 1.22 + (1 - lk) * 18))
  ctx.restore()

  if (v.from !== null) {
    // "from 9%" above, delta chip, and before/after bars.
    const fk = ease(progress(t, 100, 600))
    ctx.save()
    ctx.globalAlpha *= fk
    font(ctx, 36, 500, MONO)
    ctx.fillStyle = theme.muted
    ctx.fillText(`from ${formatValue(v.from, v.unit, v.decimals)}`, leftX, baseY - size * 0.88)
    ctx.restore()
    const change = v.unit.suffix === '%' ? v.value - v.from : pctChange(v.from, v.value)
    const up = (change ?? 0) >= 0
    const label =
      change === null
        ? ''
        : v.unit.suffix === '%'
          ? `${up ? '+' : '−'}${Math.abs(change).toFixed(Math.min(1, v.decimals))} pts`
          : `${up ? '+' : '−'}${Math.abs(change) >= 10 ? Math.round(Math.abs(change)) : Math.abs(change).toFixed(1)}%`
    // Bars on the right half.
    const bx = 120
    const bw = 560
    const max = Math.max(Math.abs(v.from), Math.abs(v.value)) || 1
    const rows = [
      { label: 'Before', val: v.from, color: theme.deemph, at: 300 },
      { label: 'After', val: v.value, color: theme.accent, at: STAT_COUNT_START },
    ]
    rows.forEach((r, i) => {
      const y = -200 + i * 190
      const k = i === 0 ? ease(progress(t, r.at, 700)) : countProgress(t, countDur)
      ctx.save()
      ctx.globalAlpha *= ease(progress(t, r.at - 200, 400))
      font(ctx, 30, 500, MONO)
      ctx.fillStyle = theme.muted
      ctx.fillText(r.label, bx, y - 22)
      ctx.restore()
      // "After" grows out of the "before" length, so the change itself is what moves.
      const shown = i === 0 ? r.val * k : lerp(from, v.value, k)
      const len = (Math.abs(shown) / max) * bw
      const vis = ease(progress(t, r.at - 150, 350))
      if (vis > 0) {
        ctx.save()
        ctx.globalAlpha *= vis
        rowBar(ctx, bx, y, len, 72, r.color)
        font(ctx, 40, 600, SANS)
        ctx.fillStyle = theme.ink
        ctx.textBaseline = 'middle'
        ctx.fillText(formatValue(shown, v.unit, v.decimals), bx + len + 20, y + 38)
        ctx.restore()
      }
    })
    if (label) chip(env, label, bx + 200, 240, land, { fill: theme.accent, color: theme.onAccent, size: 40 })
    return
  }

  if (isPct) {
    // 10 by 10 pictogram: one dot per percent, filling in step with the count.
    const cell = 60
    const gx = 160
    const gy = -320
    const filled = value
    for (let i = 0; i < 100; i++) {
      const row = Math.floor(i / 10)
      const col = i % 10
      const x = gx + col * cell + cell / 2
      const y = gy + row * cell + cell / 2
      const appearK = pop(t, 80 + (row + col) * 18, 500)
      if (appearK <= 0) continue
      const fill = Math.min(1, Math.max(0, filled - i))
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(appearK, appearK)
      ctx.fillStyle = theme.grid
      ctx.beginPath()
      ctx.arc(0, 0, 21, 0, Math.PI * 2)
      ctx.fill()
      if (fill > 0) {
        // Partial cells fill from the bottom, so 2.5% shows two and a half dots.
        ctx.save()
        ctx.beginPath()
        ctx.rect(-22, 22 - 44 * fill, 44, 44 * fill)
        ctx.clip()
        ctx.fillStyle = theme.accent
        ctx.beginPath()
        ctx.arc(0, 0, 21, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      ctx.restore()
    }
    const ck = ease(progress(t, 900, 600))
    ctx.save()
    ctx.globalAlpha *= ck
    fillRound(ctx, gx, gy + 10 * cell + 26, 18, 18, 9, theme.accent)
    font(ctx, 26, 500, MONO)
    ctx.fillStyle = theme.muted
    ctx.textAlign = 'left'
    ctx.fillText('= 1% of the total', gx + 32, gy + 10 * cell + 42)
    ctx.restore()
    return
  }

  badge(env, 520, -40, 220, shot.icon, 150)
}
