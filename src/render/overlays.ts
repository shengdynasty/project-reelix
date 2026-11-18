import type { MotionPlan } from '../motion/plan'
import { shotAt } from '../motion/plan'
import type { Theme } from './theme'
import { H, W } from './env'
import { fillRound } from './draw'
import { MONO, SANS, font } from './text'
import { clamp01, ease, spring } from './easing'

/** Shorts style captions: words land as they are spoken and the current word sits on an accent pill. */
export function drawCaptions(ctx: CanvasRenderingContext2D, theme: Theme, plan: MotionPlan, t: number) {
  const words = plan.captions
  if (!words.length) return
  let idx = -1
  for (let i = 0; i < words.length; i++) {
    if (words[i].start - 60 <= t) idx = i
    else break
  }
  if (idx < 0) return
  const chunkId = words[idx].chunk
  const chunk = words.filter((w) => w.chunk === chunkId)
  const last = chunk[chunk.length - 1]
  const next = words[words.indexOf(last) + 1]
  const hideAt = Math.min(last.end + 450, next ? next.start - 60 : Infinity)
  if (t > hideAt) return

  const size = 54
  font(ctx, size, 600, SANS)
  const space = ctx.measureText(' ').width
  const widths = chunk.map((w) => ctx.measureText(w.text).width)
  const total = widths.reduce((a, b) => a + b, 0) + space * (chunk.length - 1)
  const padX = 34
  const boxW = Math.min(W - 160, total + padX * 2)
  const boxH = size + 44
  const y = 978
  const x0 = (W - boxW) / 2
  const appear = ease(clamp01((t - chunk[0].start + 60) / 200))
  const fadeOut = clamp01((hideAt - t) / 160)

  ctx.save()
  ctx.globalAlpha = 0.8 * appear * fadeOut
  fillRound(ctx, x0, y - boxH / 2, boxW, boxH, 22, theme.bg)
  ctx.globalAlpha = fadeOut
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  let x = (W - total) / 2
  chunk.forEach((w, i) => {
    const k = clamp01((t - w.start + 60) / 220)
    if (k <= 0) {
      x += widths[i] + space
      return
    }
    const s = 0.7 + 0.3 * spring(k)
    const active = t >= w.start - 60 && (i === chunk.length - 1 ? t < w.end + 200 : t < chunk[i + 1].start - 60)
    ctx.save()
    ctx.translate(x + widths[i] / 2, y)
    ctx.scale(s, s)
    ctx.globalAlpha *= Math.min(1, k * 2)
    if (active) fillRound(ctx, -widths[i] / 2 - 12, -size / 2 - 6, widths[i] + 24, size + 12, 14, theme.accent)
    ctx.fillStyle = active ? theme.onAccent : theme.ink
    ctx.fillText(w.text, -widths[i] / 2, 2)
    ctx.restore()
    x += widths[i] + space
  })
  ctx.restore()
}

const CHAPTER: Record<string, string> = {
  point: 'Key point',
  stat: 'By the numbers',
  compare: 'Side by side',
  chart: 'The data',
  image: 'Take a look',
  definition: 'What it is',
  timeline: 'Timeline',
  steps: 'How it works',
  summary: 'In short',
}

/** Small section label, top left, that flips when the section changes. */
export function drawChapter(ctx: CanvasRenderingContext2D, theme: Theme, plan: MotionPlan, t: number) {
  const k = shotAt(plan, t)
  if (k < 0) return
  const s = plan.shots[k]
  const visual = plan.storyboard.scenes[s.scene].visual
  const label = s.kind === 'steps' && visual.kind === 'steps' && visual.style === 'kinds' ? 'Kinds' : CHAPTER[s.kind]
  if (!label) return
  // Animate from the first shot of this scene, so points of one scene share one label.
  let first = k
  while (first > 0 && plan.shots[first - 1].scene === s.scene) first--
  const since = t - plan.shots[first].start
  const a = ease(clamp01((since + 100) / 500))
  const text = s.kind === 'point' && s.itemCount > 1 ? `${label} ${s.item + 1} of ${s.itemCount}` : label
  font(ctx, 26, 500, MONO)
  const w = ctx.measureText(text).width + 84
  ctx.save()
  ctx.globalAlpha = a
  ctx.translate(72 - (1 - a) * 30, 60)
  fillRound(ctx, 0, 0, w, 56, 28, theme.surface)
  fillRound(ctx, 24, 20, 16, 16, 4, theme.accent)
  ctx.fillStyle = theme.inkSoft
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 56, 29)
  ctx.restore()
}

/** Fade to the background color over the last half second. */
export function drawFadeOut(ctx: CanvasRenderingContext2D, theme: Theme, plan: MotionPlan, t: number) {
  const k = clamp01((t - (plan.total - 600)) / 600)
  if (k <= 0) return
  ctx.save()
  ctx.globalAlpha = ease(k)
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
}
