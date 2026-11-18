import type { DataSeries } from '../../model/storyboard'
import type { MotionPlan, Shot } from '../../motion/plan'
import { chartHighlightTime } from '../../motion/plan'
import type { ShotEnv } from './env'
import { chip } from './kit'
import { MONO, SANS, fitText, font, wrapLines } from '../text'
import { clamp01, ease, easeOutBack, mixHex, pop, progress } from '../easing'
import { columnBar, fillRound, rowBar } from '../draw'
import { compactNumber, formatValue, niceTicks } from '../../input/numbers'
import type { Theme } from '../theme'
import { BAR_START, BAR_STAGGER } from '../../motion/beats'

// Card and plot geometry in shot coordinates.
const CARD = { x: -880, y: -440, w: 1760, h: 780 }
const PLOT = { x0: -700, x1: 800, top: -200, base: 250 }

interface BarGeo {
  horizontal: boolean
  ticks: number[]
  yOf: (v: number) => number
  band: number
  barW: number
  group: number
}

function barGeometry(ctx: CanvasRenderingContext2D, d: DataSeries): BarGeo {
  const n = d.categories.length
  font(ctx, 30, 500, SANS)
  const longest = Math.max(...d.categories.map((c) => ctx.measureText(c).width))
  const band = (PLOT.x1 - PLOT.x0) / n
  const horizontal = n > 8 || longest > band * 1.8
  const values = d.series.flatMap((s) => s.values)
  const ticks = niceTicks(Math.min(0, ...values), Math.max(...values), 4)
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const yOf = (v: number) => PLOT.base - ((v - lo) / (hi - lo)) * (PLOT.base - PLOT.top)
  const ns = Math.min(d.series.length, 5)
  const group = Math.min(band * 0.6, ns === 1 ? 140 : 80 * ns)
  const barW = ns === 1 ? group : (group - (ns - 1) * 6) / ns
  return { horizontal, ticks, yOf, band, barW, group }
}

let measureCtx: CanvasRenderingContext2D | null = null
function mctx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!
  return measureCtx
}

/** Where the camera should push in, and when: the top of the highlighted bar, the peak, or the main slice. */
export function chartFocus(plan: MotionPlan, s: Shot): { x: number; y: number; t: number } | null {
  const v = plan.storyboard.scenes[s.scene].visual
  if (v.kind !== 'chart' || v.highlight === null) return null
  const d = v.data
  const at = chartHighlightTime(s, plan.words[s.scene])
  if (d.chart === 'bar' && d.series.length === 1) {
    const g = barGeometry(mctx(), d)
    if (g.horizontal) return null
    return { x: PLOT.x0 + g.band * (v.highlight + 0.5), y: g.yOf(d.series[0].values[v.highlight]), t: at }
  }
  if (d.chart === 'line' && d.series.length === 1) {
    const n = d.categories.length
    // A peak at the end is already labeled where the line stops; no need to move.
    if (v.highlight === n - 1) return null
    const vals = d.series[0].values
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals), 4)
    const yOf = (val: number) => PLOT.base - ((val - ticks[0]) / (ticks[ticks.length - 1] - ticks[0])) * (PLOT.base - PLOT.top)
    return { x: PLOT.x0 + 40 + (v.highlight / Math.max(1, n - 1)) * (PLOT.x1 - PLOT.x0 - 80), y: yOf(vals[v.highlight]), t: at }
  }
  if (d.chart === 'pie') return { x: -380, y: 0, t: at }
  return null
}

export function drawChartShot(env: ShotEnv) {
  const { ctx, t, theme, scene, shot } = env
  if (scene.visual.kind !== 'chart') return
  const v = scene.visual
  const d = v.data
  const hlAt = chartHighlightTime(shot, env.plan.words[shot.scene]) - shot.t0

  // Card rises in.
  const ck = easeOutBack(progress(t, -150, 800))
  if (ck <= 0) return
  ctx.save()
  ctx.translate(0, (1 - ck) * 120)
  ctx.globalAlpha *= clamp01(ck * 1.5)
  fillRound(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 32, theme.surface)

  const legendW = d.series.length > 1 && d.chart !== 'pie' ? 600 : 0
  const tf = fitText(ctx, d.title, CARD.w - 120 - legendW, 1, 56, 36, 600)
  ctx.fillStyle = theme.ink
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillText(tf.lines[0], CARD.x + 60, CARD.y + 96)
  const sub = subtitle(d)
  if (sub) {
    font(ctx, 26, 500, MONO)
    ctx.fillStyle = theme.muted
    ctx.fillText(sub, CARD.x + 60, CARD.y + 144)
  }
  if (legendW) legend(ctx, theme, d)

  if (d.chart === 'pie') pie(env, d, v.highlight, hlAt)
  else if (d.chart === 'line') line(env, d, v.highlight, hlAt)
  else bars(env, d, v.highlight, hlAt)
  ctx.restore()
}

function subtitle(d: DataSeries): string {
  const unitBits: string[] = []
  if (d.unit.prefix) unitBits.push(d.unit.prefix === '$' ? 'US dollars' : d.unit.prefix)
  if (d.unit.suffix === '%') unitBits.push('percent')
  const seriesName = d.series.length === 1 && d.series[0].name !== d.title ? d.series[0].name : ''
  if (d.unit.word && !seriesName.toLowerCase().includes(d.unit.word)) unitBits.push(d.unit.word)
  return [d.xLabel, seriesName, unitBits.join(', ')].filter(Boolean).join(' · ')
}

function legend(ctx: CanvasRenderingContext2D, theme: Theme, d: DataSeries) {
  font(ctx, 28, 500, SANS)
  let x = CARD.x + CARD.w - 60
  const items = d.series.slice(0, 5).map((s, i) => ({ name: s.name, color: theme.series[i], w: ctx.measureText(s.name).width }))
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    x -= it.w
    ctx.fillStyle = theme.inkSoft
    ctx.textBaseline = 'middle'
    ctx.fillText(it.name, x, CARD.y + 88)
    x -= 34
    fillRound(ctx, x, CARD.y + 77, 22, 22, 6, it.color)
    x -= 36
  }
  ctx.textBaseline = 'alphabetic'
}

function axis(env: ShotEnv, d: DataSeries, ticks: number[], yOf: (v: number) => number, x0: number, x1: number) {
  const { ctx, theme, t } = env
  ctx.save()
  ctx.globalAlpha *= ease(progress(t, 100, 600))
  font(ctx, 24, 500, MONO)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (const tk of ticks) {
    const y = yOf(tk)
    ctx.fillStyle = tk === 0 ? theme.axis : theme.grid
    ctx.fillRect(x0, Math.round(y) - 1, x1 - x0, 2)
    ctx.fillStyle = theme.muted
    ctx.fillText(d.unit.prefix + compactNumber(tk, 1) + (d.unit.suffix === '%' ? '%' : ''), x0 - 18, y)
  }
  ctx.restore()
}

function bars(env: ShotEnv, d: DataSeries, highlight: number | null, hlAt: number) {
  const { ctx, theme, t } = env
  const g = barGeometry(ctx, d)
  const n = d.categories.length
  const ns = Math.min(d.series.length, 5)
  const emph = ns === 1 && highlight !== null ? ease(progress(t, hlAt, 600)) : 0
  if (g.horizontal) return rows(env, d, highlight, emph)
  axis(env, d, g.ticks, g.yOf, PLOT.x0, PLOT.x1)
  const zeroY = g.yOf(Math.max(0, g.ticks[0]))
  for (let i = 0; i < n; i++) {
    const cx = PLOT.x0 + g.band * (i + 0.5)
    for (let s = 0; s < ns; s++) {
      const val = d.series[s].values[i]
      const k = easeOutBack(progress(t, BAR_START + i * BAR_STAGGER + s * 50, 750))
      const h = (zeroY - g.yOf(val)) * k
      const x = cx - g.group / 2 + s * (g.barW + 6)
      const base = ns === 1 ? theme.series[0] : theme.series[s]
      const color = ns === 1 && highlight !== null && i !== highlight ? mixHex(base, theme.deemph, emph) : base
      columnBar(ctx, x, zeroY, g.barW, h, color)
      if (ns === 1 && n <= 8 && k > 0) {
        ctx.save()
        // The callout takes over from the highlighted bar's own label.
        ctx.globalAlpha *= clamp01(k) * (i === highlight ? 1 - emph : 1)
        font(ctx, 32, 600, SANS)
        ctx.fillStyle = i === highlight || highlight === null ? theme.ink : mixHex(theme.ink, theme.muted, emph)
        ctx.textAlign = 'center'
        ctx.fillText(formatValue(val * Math.min(1, k), d.unit), cx, zeroY - h - 20)
        ctx.restore()
      }
    }
    ctx.save()
    ctx.globalAlpha *= ease(progress(t, 200 + i * 60, 500))
    font(ctx, 28, 500, SANS)
    ctx.fillStyle = theme.inkSoft
    ctx.textAlign = 'center'
    wrapLines(ctx, d.categories[i], g.band - 12).slice(0, 2).forEach((l, li) => ctx.fillText(l, cx, PLOT.base + 46 + li * 34))
    ctx.restore()
  }
  if (highlight !== null && ns === 1) {
    const cx = PLOT.x0 + g.band * (highlight + 0.5)
    const top = g.yOf(d.series[0].values[highlight])
    chip(env, `${d.categories[highlight]}: ${formatValue(d.series[0].values[highlight], d.unit)}`, cx, top - 52, pop(t, hlAt, 700), {
      fill: theme.accent,
      color: theme.onAccent,
      size: 34,
    })
  }
}

function rows(env: ShotEnv, d: DataSeries, highlight: number | null, emph: number) {
  const { ctx, theme, t } = env
  const n = d.categories.length
  const vals = d.series[0].values
  const max = Math.max(...vals, 0) || 1
  const labelW = 420
  const x0 = PLOT.x0 + labelW - 120
  const x1 = PLOT.x1 - 160
  const top = PLOT.top - 30
  const rowH = Math.min(84, (PLOT.base + 40 - top) / n)
  const barH = Math.min(46, rowH * 0.58)
  for (let i = 0; i < n; i++) {
    const y = top + i * rowH + (rowH - barH) / 2
    const k = easeOutBack(progress(t, BAR_START + i * 90, 750))
    const w = (Math.max(0, vals[i]) / max) * (x1 - x0) * k
    const color = highlight !== null && i !== highlight ? mixHex(theme.series[0], theme.deemph, emph) : theme.series[0]
    rowBar(ctx, x0, y, w, barH, color)
    ctx.save()
    ctx.globalAlpha *= ease(progress(t, 200 + i * 60, 500))
    font(ctx, 28, 500, SANS)
    ctx.fillStyle = theme.inkSoft
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    let label = d.categories[i]
    while (label.length > 3 && ctx.measureText(label).width > labelW - 40) label = label.slice(0, -2)
    ctx.fillText(label === d.categories[i] ? label : label + '…', x0 - 24, y + barH / 2)
    ctx.textAlign = 'left'
    font(ctx, 28, 600, SANS)
    ctx.fillStyle = theme.ink
    ctx.globalAlpha *= clamp01(k)
    ctx.fillText(formatValue(vals[i] * Math.min(1, k), d.unit), x0 + w + 16, y + barH / 2)
    ctx.restore()
  }
}

function line(env: ShotEnv, d: DataSeries, highlight: number | null, hlAt: number) {
  const { ctx, theme, t } = env
  const n = d.categories.length
  const ns = Math.min(d.series.length, 5)
  const values = d.series.slice(0, ns).flatMap((s) => s.values)
  const ticks = niceTicks(Math.min(0, ...values), Math.max(...values), 4)
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const x0 = PLOT.x0 + 40
  const x1 = PLOT.x1 - 40
  const xOf = (i: number) => (n === 1 ? (x0 + x1) / 2 : x0 + (i / (n - 1)) * (x1 - x0))
  const yOf = (val: number) => PLOT.base - ((val - lo) / (hi - lo)) * (PLOT.base - PLOT.top)
  axis(env, d, ticks, yOf, PLOT.x0, PLOT.x1)

  const step = Math.max(1, Math.ceil((n - 1) / 6))
  ctx.save()
  ctx.globalAlpha *= ease(progress(t, 200, 600))
  font(ctx, 26, 500, MONO)
  ctx.fillStyle = theme.muted
  ctx.textAlign = 'center'
  for (let i = 0; i < n; i++) {
    if ((i % step === 0 && (i === n - 1 || n - 1 - i >= step * 0.6)) || i === n - 1) ctx.fillText(d.categories[i], xOf(i), PLOT.base + 50)
  }
  ctx.restore()

  const drawDur = Math.max(1600, Math.min(hlAt - 500, 3600))
  const p = ease(progress(t, 400, drawDur))
  const head = p * (n - 1)
  for (let s = ns - 1; s >= 0; s--) {
    const vals = d.series[s].values
    const color = theme.series[s]
    const pts: [number, number][] = []
    const fi = Math.floor(head)
    for (let i = 0; i <= fi; i++) pts.push([xOf(i), yOf(vals[i])])
    if (fi < n - 1) {
      const f = head - fi
      pts.push([xOf(fi) + (xOf(fi + 1) - xOf(fi)) * f, yOf(vals[fi] + (vals[fi + 1] - vals[fi]) * f)])
    }
    if (!pts.length) continue
    if (ns === 1 && pts.length > 1) {
      ctx.save()
      ctx.globalAlpha *= 0.12
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(pts[0][0], yOf(Math.max(lo, 0)))
      for (const [x, y] of pts) ctx.lineTo(x, y)
      ctx.lineTo(pts[pts.length - 1][0], yOf(Math.max(lo, 0)))
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 7
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
    const [hx, hy] = pts[pts.length - 1]
    // Glowing head: a pulsing ring around the leading dot.
    const pulse = (env.global % 1200) / 1200
    ctx.save()
    ctx.globalAlpha *= (1 - pulse) * 0.5
    ctx.strokeStyle = color
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(hx, hy, 16 + pulse * 26, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    dot(ctx, theme, hx, hy, color)
    if (ns === 1) {
      const cur = fi < n - 1 ? vals[fi] + (vals[fi + 1] - vals[fi]) * (head - fi) : vals[n - 1]
      chip(env, formatValue(cur, d.unit), Math.min(Math.max(hx, PLOT.x0 + 120), PLOT.x1 - 120), hy - 64, ease(progress(t, 400, 300)), { size: 30, fill: theme.bg })
    }
  }
  if (ns === 1 && highlight !== null && highlight !== n - 1) {
    const x = xOf(highlight)
    const y = yOf(d.series[0].values[highlight])
    const k = pop(t, hlAt, 700)
    if (k > 0) {
      dot(ctx, theme, x, y, theme.series[0])
      chip(env, `Peak ${formatValue(d.series[0].values[highlight], d.unit)}`, x, y - 70, k, { fill: theme.accent, color: theme.onAccent, size: 30 })
    }
  }
}

function dot(ctx: CanvasRenderingContext2D, theme: Theme, x: number, y: number, color: string) {
  ctx.fillStyle = theme.surface
  ctx.beginPath()
  ctx.arc(x, y, 19, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 13, 0, Math.PI * 2)
  ctx.fill()
}

function pie(env: ShotEnv, d: DataSeries, highlight: number | null, hlAt: number) {
  const { ctx, theme, t } = env
  const vals = d.series[0].values
  const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1
  const isPct = d.unit.suffix === '%' && Math.abs(total - 100) < 5
  const share = (v: number) => (isPct ? v : (v / total) * 100)
  const colors = d.categories.map((c, i) => (c === 'Other' && i === d.categories.length - 1 ? theme.other : theme.pie[i] ?? theme.other))
  const cx = -380
  const cy = 30
  const R = 250
  const thick = 92
  const sweep = ease(progress(t, 250, 1400)) * Math.PI * 2
  const spin = (1 - ease(progress(t, 250, 1600))) * -0.9
  const hl = highlight ?? 0
  const popK = ease(progress(t, hlAt, 600))
  let a0 = -Math.PI / 2 + spin
  vals.forEach((v, i) => {
    const span = (Math.max(0, v) / total) * Math.PI * 2
    const start = a0
    const end = Math.min(a0 + span, -Math.PI / 2 + spin + sweep)
    if (end > start + 0.002) {
      const mid = (start + end) / 2
      const off = i === hl ? 22 * popK : 0
      ctx.save()
      ctx.translate(Math.cos(mid) * off, Math.sin(mid) * off)
      ctx.fillStyle = colors[i]
      ctx.beginPath()
      // A small angular gap keeps slices apart without outlines.
      const gap = vals.length > 1 ? 0.012 : 0
      ctx.arc(cx, cy, R, start + gap, end - gap)
      ctx.arc(cx, cy, R - thick, end - gap * 1.6, start + gap * 1.6, true)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    a0 += span
  })
  const ck = ease(progress(t, 1200, 600))
  ctx.save()
  ctx.globalAlpha *= ck
  font(ctx, 76, 600, SANS)
  ctx.fillStyle = theme.ink
  ctx.textAlign = 'center'
  ctx.fillText(`${fmtShare(share(vals[hl]) * ck)}%`, cx, cy + 14)
  font(ctx, 28, 500, SANS)
  ctx.fillStyle = theme.inkSoft
  wrapLines(ctx, d.categories[hl], 280).slice(0, 2).forEach((l, i) => ctx.fillText(l, cx, cy + 62 + i * 34))
  ctx.restore()

  const lx = 40
  const rowH = 118
  const ly = cy - ((vals.length - 1) * rowH) / 2
  vals.forEach((v, i) => {
    const k = ease(progress(t, 350 + i * 230, 650))
    if (k <= 0) return
    const y = ly + i * rowH
    ctx.save()
    ctx.globalAlpha *= k
    ctx.translate((1 - k) * 60, 0)
    fillRound(ctx, lx, y - 20, 40, 40, 10, colors[i])
    const lf = fitText(ctx, d.categories[i], 470, 2, 44, 30, 500)
    ctx.fillStyle = i === hl || popK === 0 ? theme.ink : mixHex(theme.ink, theme.muted, popK)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const off = ((lf.lines.length - 1) * lf.size * 1.1) / 2
    lf.lines.forEach((l, li) => ctx.fillText(l, lx + 68, y - off + li * lf.size * 1.1))
    font(ctx, 46, 600, SANS)
    ctx.fillStyle = theme.ink
    ctx.textAlign = 'right'
    ctx.fillText(`${fmtShare(share(v))}%`, CARD.x + CARD.w - 60, y)
    ctx.restore()
  })
}

function fmtShare(x: number): string {
  const r = Math.round(x * 10) / 10
  return x >= 10 ? String(r) : r.toFixed(1)
}
