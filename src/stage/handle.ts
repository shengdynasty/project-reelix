// The 3D stage as the frame renderer sees it: draws frame t of a plan into the 2D canvas from a three.js stage that
// loads on first use. One StageSet is built per plan and kept while the plan lives; photos come from the render
// options' images.
import type { MotionPlan } from '../motion/plan'
import type { RenderOptions } from '../render/renderFrame'
import type { Theme } from '../render/theme'
import type { StagePalette } from './three/materials'
import { supportsWebGL2 } from './support'
import type { Tier } from './tiers'
import type { StageSet, Vec3 } from './types'

export interface StageHandle {
  /** Draws frame t over the whole canvas, averaging `samples` sub frames over the shutter; false when it cannot (the context is lost). */
  draw(ctx: CanvasRenderingContext2D, plan: MotionPlan, t: number, opts: RenderOptions, samples?: number): boolean
  /** How many sub frames a saved video averages at t: one while the camera holds, up to MAX_SAMPLES while it flies. */
  samplesAt(plan: MotionPlan, t: number, opts: RenderOptions): number
  dispose(): void
  readonly lost: boolean
  /** Drops the graphics context, to check the fallbacks. */
  loseContextForTest(): void
}

/** Motion blur shutter, ms, as the 2D renderer's. */
const SHUTTER_MS = 14
/** Sub frames sit at most this far apart along the camera path, world units, so the smear reads as blur. */
const BLUR_STEP = 0.15
const MAX_SAMPLES = 6
/** The medium tier previews at this size, without depth of field. */
const MEDIUM_PREVIEW = { width: 960, height: 540 }

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * A stage for `quality` at `size` (the medium tier previews at 960x540), or null when WebGL2 is missing or the stage
 * cannot be created. The three.js modules load here, with a dynamic import.
 */
export async function createStageHandle(
  quality: 'preview' | 'export',
  size: { width: number; height: number },
  opts: { reducedMotion?: boolean; tier?: Tier } = {},
): Promise<StageHandle | null> {
  if (!supportsWebGL2()) return null
  const engine = await import('./engine')
  const medium = opts.tier === 'medium'
  const { width, height } = quality === 'preview' && medium ? MEDIUM_PREVIEW : size
  const stage = engine.createStage({ width, height, quality, reducedMotion: opts.reducedMotion, depthOfField: !medium })
  if (!stage) return null
  const reducedMotion = opts.reducedMotion ?? false
  const sets = new WeakMap<MotionPlan, { images: RenderOptions['images']; set: StageSet }>()
  const palettes = new Map<Theme, StagePalette>()
  let disposed = false

  const setFor = (plan: MotionPlan, images: RenderOptions['images']): StageSet => {
    const hit = sets.get(plan)
    if (hit && hit.images === images) return hit.set
    const set = engine.directVideo(plan, { hasImage: (id) => images.has(id) })
    sets.set(plan, { images, set })
    return set
  }
  const paletteFor = (theme: Theme): StagePalette => {
    let palette = palettes.get(theme)
    if (!palette) {
      palette = engine.stagePalette(theme)
      palettes.set(theme, palette)
    }
    return palette
  }

  return {
    draw(ctx, plan, t, ro, samples = 1) {
      if (disposed || stage.lost) return false
      const set = setFor(plan, ro.images)
      const deps = { palette: paletteFor(ro.theme), images: ro.images }
      const n = Math.max(1, Math.floor(samples))
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      try {
        for (let k = 0; k < n; k++) {
          const frame = stage.render(set, n > 1 ? t - (SHUTTER_MS * k) / (n - 1) : t, deps)
          if (!frame) return false
          // A running average: sub frame k joins with weight 1 / (k + 1), so every sub frame counts the same.
          ctx.globalAlpha = 1 / (k + 1)
          ctx.drawImage(frame, 0, 0, ctx.canvas.width, ctx.canvas.height)
        }
      } finally {
        ctx.restore()
      }
      return true
    },
    samplesAt(plan, t, ro) {
      const set = setFor(plan, ro.images)
      const moved = dist(engine.cameraPose(set, t, { reducedMotion }).position, engine.cameraPose(set, t - SHUTTER_MS, { reducedMotion }).position)
      return Math.min(MAX_SAMPLES, Math.max(1, Math.ceil(moved / BLUR_STEP)))
    },
    dispose() {
      if (disposed) return
      disposed = true
      stage.dispose()
    },
    get lost() {
      return disposed || stage.lost
    },
    loseContextForTest: () => stage.loseContextForTest(),
  }
}
