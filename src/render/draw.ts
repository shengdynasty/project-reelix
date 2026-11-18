import type { SceneEnv } from './env'
import { H, M, W } from './env'
import type { Theme } from './theme'
import { MONO, font, wrapLines } from './text'
import { clamp01, ease } from './easing'

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath()
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r)
}

export function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[], color: string) {
  if (w <= 0 || h <= 0) return
  ctx.fillStyle = color
  roundRect(ctx, x, y, w, h, r)
  ctx.fill()
}

/** Vertical bar: rounded data end, square at the baseline (dataviz mark spec, scaled for 1080p). */
export function columnBar(ctx: CanvasRenderingContext2D, x: number, baseline: number, w: number, h: number, color: string) {
  if (h <= 0.5) return
  const r = Math.min(12, w / 2, h)
  fillRound(ctx, x, baseline - h, w, h, [r, r, 0, 0], color)
}

/** Horizontal bar growing to the right from the baseline at x. */
export function rowBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  if (w <= 0.5) return
  const r = Math.min(12, h / 2, w)
  fillRound(ctx, x, y, w, h, [0, r, r, 0], color)
}

export function background(ctx: CanvasRenderingContext2D, theme: Theme, global: number) {
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, W, H)
  // Slow drifting dot grid keeps long holds alive without drawing attention.
  const gap = 48
  const off = (global * 0.006) % gap
  ctx.fillStyle = theme.dot
  for (let y = -gap + off; y < H + gap; y += gap) {
    for (let x = -gap + off * 0.5; x < W + gap; x += gap) {
      ctx.beginPath()
      ctx.arc(x, y, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

export function header(ctx: CanvasRenderingContext2D, theme: Theme, title: string, index: number, count: number, alpha: number) {
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha *= alpha
  font(ctx, 24, 500, MONO)
  ctx.fillStyle = theme.muted
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  let t = title
  while (t.length > 4 && ctx.measureText(t).width > W - 2 * M - 220) t = t.slice(0, -2)
  ctx.fillText(t === title ? title : t + '…', M, 92)
  ctx.textAlign = 'right'
  ctx.fillText(`${String(index).padStart(2, '0')} / ${String(count).padStart(2, '0')}`, W - M, 92)
  ctx.restore()
}

export function eyebrow(env: SceneEnv, text: string, y = 196) {
  const { ctx, theme, t } = env
  const k = ease(clamp01(t / 600))
  ctx.save()
  ctx.globalAlpha *= k
  fillRound(ctx, M, y - 18, 16, 16, 4, theme.accent)
  font(ctx, 28, 500, MONO)
  ctx.fillStyle = theme.inkSoft
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, M + 32 - (1 - k) * 12, y)
  ctx.restore()
}

export function progressBar(ctx: CanvasRenderingContext2D, theme: Theme, p: number) {
  ctx.fillStyle = theme.grid
  ctx.fillRect(0, H - 6, W, 6)
  ctx.fillStyle = theme.accent
  ctx.fillRect(0, H - 6, W * clamp01(p), 6)
}

export interface CaptionChunk {
  text: string
  start: number
  end: number
}

/** Splits narration into short caption chunks timed by character count across the speech. */
export function captionChunks(narration: string, speechStart: number, speechDur: number): CaptionChunk[] {
  const segments = narration
    .split(/(?<=[.!?;:])\s+|(?<=,)\s+(?=\S+\s+\S+\s+\S+)/)
    .flatMap((seg) => {
      const words = seg.split(/\s+/).filter(Boolean)
      if (words.length <= 11) return [seg]
      const parts = Math.ceil(words.length / 9)
      const per = Math.ceil(words.length / parts)
      const out: string[] = []
      for (let i = 0; i < words.length; i += per) out.push(words.slice(i, i + per).join(' '))
      return out
    })
    .filter((s) => s.trim())
  const total = segments.reduce((a, s) => a + s.length + 6, 0) || 1
  let acc = 0
  return segments.map((text) => {
    const start = speechStart + (acc / total) * speechDur
    acc += text.length + 6
    return { text, start, end: speechStart + (acc / total) * speechDur }
  })
}

export function drawCaption(ctx: CanvasRenderingContext2D, theme: Theme, chunks: CaptionChunk[], t: number) {
  const c = chunks.find((ch) => t >= ch.start && t < ch.end + 120)
  if (!c) return
  const fadeIn = clamp01((t - c.start) / 140)
  ctx.save()
  ctx.globalAlpha = fadeIn
  font(ctx, 40, 500)
  const lines = wrapLines(ctx, c.text, 1400).slice(0, 2)
  const lineH = 54
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 72
  const h = lines.length * lineH + 36
  const x = (W - w) / 2
  const y = 1012 - h
  ctx.globalAlpha = fadeIn * 0.92
  fillRound(ctx, x, y, w, h, 20, theme.surface)
  ctx.globalAlpha = fadeIn
  ctx.fillStyle = theme.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 18 + lineH * i + lineH / 2 + 2))
  ctx.restore()
}
