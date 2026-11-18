import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import { font, measure } from '../../render/text'
import { LABEL_MAX_WIDTH_PX, LABEL_PX, fitLabel } from '../labels'
import { WORLD_PER_PX } from '../layout'
import type { LabelSize } from '../types'
import type { StagePalette } from './materials'

/** Widest each size runs on a 1080 canvas before it wraps or shrinks: titles (up to 8 words) and terms get more room than the 4 word labels. */
const MAX_WIDTH_PX: Record<LabelSize, number> = { title: 1200, term: 760, label: LABEL_MAX_WIDTH_PX, small: LABEL_MAX_WIDTH_PX }
const WEIGHT: Record<LabelSize, number> = { title: 600, term: 600, label: 500, small: 500 }
/** Smallest a label is ever set, px on a 1080 canvas. */
const MIN_PX = 34
const MAX_LINES = 2
const LINE_HEIGHT = 1.15
const PAD_PX = 8
/** Texture pixels per 1080 canvas pixel, so labels stay crisp when the camera comes close. */
const OVERSAMPLE = 2

export interface LabelOptions {
  /** Replaces the size's own width limit (chart categories under a bar, lines of the end card). */
  maxWidthPx?: number
}

/**
 * An invisible plane in place of a label that cannot be shown: no 2D canvas, nothing to say, or a word too wide
 * for its box (no label rather than a fragment). It keeps a label's footprint so a stack of lines still spaces.
 */
function blankLabel(size: LabelSize, maxWidth: number): Mesh {
  const material = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  material.userData.baseOpacity = 0
  const mesh = new Mesh(new PlaneGeometry(maxWidth * WORLD_PER_PX, LABEL_PX[size] * LINE_HEIGHT * WORLD_PER_PX), material)
  mesh.userData.textless = true
  mesh.userData.lines = []
  return mesh
}

/** Whether every line is made of whole words of `text`; `fitLabel` cuts a word wider than its box into chunks. */
function wholeWords(lines: string[], text: string): boolean {
  const words = new Set(text.trim().split(/\s+/))
  return lines.every((line) => line.replace(/…$/, '').split(' ').every((w) => words.has(w) || words.has(w + '…')))
}

/**
 * A plane carrying `text` in Geist, sized so that from HOLD_DISTANCE it reads at LABEL_PX[size] px on a 1080
 * frame: fitted with `fitLabel` (never under 34 px, at most 2 lines), drawn at 2x onto a CanvasTexture and scaled
 * to world units with WORLD_PER_PX. Small labels use the muted colour, the rest the ink. The lines drawn are kept
 * in `userData.lines`. Empty text, a word that fits no line whole, or a missing 2D canvas give a blank plane with
 * `userData.textless`, so a video never fails over a label and never shows a fragment.
 */
export function labelMesh(text: string, size: LabelSize, palette: StagePalette, opts: LabelOptions = {}): Mesh {
  const maxWidth = opts.maxWidthPx ?? MAX_WIDTH_PX[size]
  const weight = WEIGHT[size]
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return blankLabel(size, maxWidth)
  const fit = fitLabel(text, maxWidth, (s, px) => measure(ctx, s, px, weight), {
    maxSize: LABEL_PX[size],
    minSize: Math.min(MIN_PX, LABEL_PX[size]),
    maxLines: MAX_LINES,
  })
  if (!fit.lines.length || !wholeWords(fit.lines, text)) return blankLabel(size, maxWidth)
  const lineHeight = fit.size * LINE_HEIGHT
  const widthPx = Math.ceil(Math.max(...fit.lines.map((l) => measure(ctx, l, fit.size, weight))) + 2 * PAD_PX)
  const heightPx = Math.ceil(fit.lines.length * lineHeight + 2 * PAD_PX)
  canvas.width = widthPx * OVERSAMPLE
  canvas.height = heightPx * OVERSAMPLE
  // Resizing the canvas reset the context, so the font is set again after.
  ctx.scale(OVERSAMPLE, OVERSAMPLE)
  font(ctx, fit.size, weight)
  ctx.fillStyle = size === 'small' ? palette.muted : palette.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fit.lines.forEach((line, i) => ctx.fillText(line, widthPx / 2, PAD_PX + lineHeight * (i + 0.5)))

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  // Unlit and not tone mapped, so the text keeps the theme's exact colour under the stage's lighting and film look.
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })
  const mesh = new Mesh(new PlaneGeometry(widthPx * WORLD_PER_PX, heightPx * WORLD_PER_PX), material)
  mesh.userData.labelPx = fit.size
  mesh.userData.lines = fit.lines
  mesh.userData.truncated = fit.truncated
  return mesh
}
