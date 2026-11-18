import type { Theme } from './theme'

export const W = 1920
export const H = 1080
/** Side margin. */
export const M = 144
/** Content must stay above this line; captions and the progress bar live below it. */
export const SAFE_BOTTOM = 850

export type ImageSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement

export interface SceneEnv {
  ctx: CanvasRenderingContext2D
  /** ms since the scene started. */
  t: number
  dur: number
  /** Narration window relative to the scene start. */
  speechStart: number
  speechDur: number
  theme: Theme
  images: Map<string, ImageSource>
  /** Global time in ms, for idle motion. */
  global: number
}

/** 0..1 through the narration. */
export function speechProgress(env: SceneEnv): number {
  if (env.speechDur <= 0) return 1
  return Math.min(1, Math.max(0, (env.t - env.speechStart) / env.speechDur))
}

/** Scene time (ms) at which the narration reaches fraction `f`. */
export function cueTime(env: SceneEnv, f: number): number {
  return env.speechStart + f * env.speechDur
}
