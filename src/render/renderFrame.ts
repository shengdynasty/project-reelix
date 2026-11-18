import type { MotionPlan, Shot } from '../motion/plan'
import type { StageHandle } from '../stage/handle'
import type { ImageSource } from './env'
import { H, W } from './env'
import type { Theme } from './theme'
import { cameraAt } from './camera'
import { drawBackground } from './background'
import { drawCaptions, drawChapter, drawCredit, drawFadeOut } from './overlays'
import type { ShotEnv } from './shots/env'
import { drawIntro } from './shots/intro'
import { drawPoint } from './shots/point'
import { drawStat } from './shots/stat'
import { drawCompare } from './shots/compare'
import { drawChartShot } from './shots/chart'
import { drawImageShot } from './shots/image'
import { drawDefinition } from './shots/definition'
import { drawTimeline } from './shots/timeline'
import { drawSteps } from './shots/steps'
import { drawSummary } from './shots/summary'
import { drawEnd } from './shots/end'

export interface RenderOptions {
  theme: Theme
  images: Map<string, ImageSource>
  captions: boolean
  /** The 3D stage. When it draws a frame, the 2D world is skipped; the chapter pill, captions and fade still draw. */
  stage?: StageHandle | null
}

function drawShot(env: ShotEnv) {
  switch (env.shot.kind) {
    case 'intro': return drawIntro(env)
    case 'point': return drawPoint(env)
    case 'stat': return drawStat(env)
    case 'compare': return drawCompare(env)
    case 'chart': return drawChartShot(env)
    case 'image': return drawImageShot(env)
    case 'definition': return drawDefinition(env)
    case 'timeline': return drawTimeline(env)
    case 'steps': return drawSteps(env)
    case 'summary': return drawSummary(env)
    case 'end': return drawEnd(env)
  }
}

/** Shutter for motion blur: sub frames spread over this many ms before the frame time. */
const SHUTTER_MS = 14
/** Sub frames are spaced at most this many pixels apart, so the smear reads as blur rather than copies. */
const BLUR_STEP_PX = 9
const MAX_SAMPLES = 12
/** Camera speed (px per ms) above which frames get motion blur. */
const BLUR_SPEED = 1.2

let blurBuffer: HTMLCanvasElement | null = null
function buffer(w: number, h: number): CanvasRenderingContext2D {
  if (!blurBuffer) blurBuffer = document.createElement('canvas')
  if (blurBuffer.width !== w || blurBuffer.height !== h) {
    blurBuffer.width = w
    blurBuffer.height = h
  }
  return blurBuffer.getContext('2d', { alpha: false })!
}

/**
 * Draws the frame at time t (ms). Pure: the same plan and time always give the same pixels. With a 3D stage in the
 * options the world comes from it (`samples` sub frames averaged for motion blur), else from the 2D renderer.
 */
export function renderFrame(ctx: CanvasRenderingContext2D, plan: MotionPlan, t: number, opts: RenderOptions, samples = 1) {
  const drew3d = !!opts.stage?.draw(ctx, plan, t, opts, samples)
  if (!drew3d) drawWorldBlurred(ctx, plan, t, opts)

  ctx.save()
  ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.height / H, 0, 0)
  drawChapter(ctx, opts.theme, plan, t)
  // Online photos only show on the 3D stage, so their credit does too.
  if (drew3d) drawCredit(ctx, opts.theme, plan, t, opts.images)
  if (opts.captions) drawCaptions(ctx, opts.theme, plan, t)
  drawFadeOut(ctx, opts.theme, plan, t)
  ctx.restore()
}

/** The 2D world at t, with motion blur on whip pans. */
function drawWorldBlurred(ctx: CanvasRenderingContext2D, plan: MotionPlan, t: number, opts: RenderOptions) {
  const a = cameraAt(plan, t)
  const b = cameraAt(plan, t - SHUTTER_MS)
  const speed = Math.hypot(a.x - b.x, a.y - b.y) / SHUTTER_MS
  if (speed > BLUR_SPEED) {
    // Whip pans: average a few sub frames along the camera path, like a real shutter.
    const sub = buffer(ctx.canvas.width, ctx.canvas.height)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const samples = Math.min(MAX_SAMPLES, Math.max(3, Math.ceil((speed * SHUTTER_MS) / BLUR_STEP_PX)))
    for (let k = 0; k < samples; k++) {
      const tk = t - (SHUTTER_MS * k) / (samples - 1)
      drawWorld(sub, plan, tk, opts)
      ctx.globalAlpha = 1 / (k + 1)
      ctx.drawImage(sub.canvas, 0, 0)
    }
    ctx.restore()
  } else drawWorld(ctx, plan, t, opts)
}

/** Background and shots, as seen by the camera at time t. */
function drawWorld(ctx: CanvasRenderingContext2D, plan: MotionPlan, t: number, opts: RenderOptions) {
  const { theme } = opts
  ctx.save()
  ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.height / H, 0, 0)
  const cam = cameraAt(plan, t)
  drawBackground(ctx, theme, cam, t)

  // World: every shot lives at its own spot; the camera flies between them.
  ctx.save()
  ctx.translate(W / 2, H / 2)
  ctx.rotate(cam.r)
  ctx.scale(cam.z, cam.z)
  ctx.translate(-cam.x, -cam.y)
  const halfW = W / 2 / cam.z + 1000
  const halfH = H / 2 / cam.z + 700
  for (const shot of plan.shots) {
    if (Math.abs(shot.x - cam.x) > halfW || Math.abs(shot.y - cam.y) > halfH) continue
    // Shots more than a few seconds away from now are not on screen anyway.
    if (t < shot.start - 2500 || t > shot.end + 2500) continue
    ctx.save()
    ctx.translate(shot.x, shot.y)
    drawShot(envFor(ctx, plan, shot, t, opts))
    ctx.restore()
  }
  ctx.restore()
  ctx.restore()
}

function envFor(ctx: CanvasRenderingContext2D, plan: MotionPlan, shot: Shot, t: number, opts: RenderOptions): ShotEnv {
  return {
    ctx,
    t: Math.min(t - shot.t0, shot.end - shot.t0 + 1500),
    dur: shot.end - shot.t0,
    shot,
    scene: plan.storyboard.scenes[shot.scene],
    plan,
    theme: opts.theme,
    images: opts.images,
    global: t,
  }
}
