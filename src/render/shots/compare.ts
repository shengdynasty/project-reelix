import type { ShotEnv } from './env'
import { chip } from './kit'
import { MONO, SANS, fitText, font } from '../text'
import { ease, lerp, mixHex, pop, progress } from '../easing'
import { formatValue } from '../../input/numbers'
import { COMPARE_DELTA, COMPARE_POP } from '../../motion/beats'
import { drawIcon, iconFor } from '../../motion/icons'

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const c = [16, 8, 0].map((s) => ((n >> s) & 255) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** Two discs whose areas match the values, popping in one after the other, with a "vs" badge between. */
export function drawCompare(env: ShotEnv) {
  const { ctx, t, theme, scene } = env
  if (scene.visual.kind !== 'compare') return
  const v = scene.visual
  const items = [v.left, v.right]
  const max = Math.max(Math.abs(v.left.value), Math.abs(v.right.value)) || 1
  const bigger = Math.abs(v.right.value) >= Math.abs(v.left.value) ? 1 : 0
  const emph = ease(progress(t, 1300, 600))
  const cy = -30

  items.forEach((it, i) => {
    const cx = i === 0 ? -440 : 440
    const r = Math.max(110, Math.sqrt(Math.abs(it.value) / max) * 250)
    const k = pop(t, COMPARE_POP[i], 800)
    if (k <= 0) return
    const fill = i === bigger ? theme.accent : mixHex(theme.accent, theme.deemph, emph)
    const fillHex = i === bigger ? theme.accent : emph > 0.5 ? theme.deemph : theme.accent
    const textColor = luminance(fillHex) > 0.18 ? '#0A0A0A' : '#FFFFFF'
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(k, k)
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
    const count = ease(progress(t, COMPARE_POP[i] + 100, 1000))
    const text = formatValue(lerp(0, it.value, count), v.unit.word ? { ...v.unit, word: '' } : v.unit, v.decimals)
    const fit = fitText(ctx, text, r * 1.6, 1, Math.min(110, r * 0.62), 30, 600)
    font(ctx, fit.size, 600, SANS)
    ctx.fillStyle = textColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(fit.lines[0], 0, v.unit.word ? -fit.size * 0.18 : 4)
    if (v.unit.word) {
      font(ctx, Math.max(24, fit.size * 0.34), 500, SANS)
      ctx.fillText(v.unit.word, 0, fit.size * 0.5)
    }
    ctx.restore()

    // Label under the disc, and an icon above it when the label suggests one.
    const lk = ease(progress(t, COMPARE_POP[i] + 200, 600))
    const lf = fitText(ctx, it.label, 560, 2, 46, 32, 500)
    ctx.save()
    ctx.globalAlpha *= lk
    ctx.fillStyle = theme.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    lf.lines.forEach((l, li) => ctx.fillText(l, cx, cy + r + 70 + li * lf.size * 1.15))
    const icon = iconFor(it.label, '')
    if (icon) drawIcon(ctx, icon, cx, cy - r - 70, 84 * lk, theme.ink, theme.accent, 0.45)
    ctx.restore()
  })

  // "vs" badge.
  const vk = pop(t, 480, 600)
  if (vk > 0) {
    ctx.save()
    ctx.translate(0, cy)
    ctx.scale(vk, vk)
    ctx.fillStyle = theme.surface
    ctx.beginPath()
    ctx.arc(0, 0, 58, 0, Math.PI * 2)
    ctx.fill()
    font(ctx, 34, 600, MONO)
    ctx.fillStyle = theme.inkSoft
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('vs', 0, 2)
    ctx.restore()
  }

  // Difference.
  const a = Math.abs(v.left.value)
  const b = Math.abs(v.right.value)
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  if (lo > 0 && hi !== lo) {
    const ratio = hi / lo
    const rel = ratio >= 2 ? `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}×` : `+${Math.round((ratio - 1) * 100)}%`
    chip(env, `+${formatValue(hi - lo, v.unit, v.decimals)} · ${rel}`, 0, -390, pop(t, COMPARE_DELTA, 700), { fill: theme.accent, color: theme.onAccent, size: 38 })
  }
}
