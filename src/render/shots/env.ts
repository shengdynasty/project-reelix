import type { MotionPlan, Shot } from '../../motion/plan'
import type { Scene } from '../../model/storyboard'
import type { Theme } from '../theme'
import type { ImageSource } from '../env'

/** Everything a shot needs to draw itself in its own coordinates (origin at the shot center, 1920 by 1080 frame). */
export interface ShotEnv {
  ctx: CanvasRenderingContext2D
  /** ms since the shot started; negative while the camera is still flying in. */
  t: number
  dur: number
  shot: Shot
  scene: Scene
  plan: MotionPlan
  theme: Theme
  images: Map<string, ImageSource>
  global: number
}

/** Content stays inside this box so it never sits under the captions. */
export const BOX = { left: -860, right: 860, top: -430, bottom: 330 }
