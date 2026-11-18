import type { MotionPlan, Shot } from '../motion/plan'
import { shotAt } from '../motion/plan'
import { TRANSITION_LEAD, TRANSITION_SCENE } from '../motion/beats'
import { easeInOutCubic, ease, progress, lerp } from './easing'
import { chartFocus } from './shots/chart'

export interface Camera {
  x: number
  y: number
  z: number
  /** Rotation in radians. */
  r: number
}

/** Where the camera sits while a shot is on screen: a slow push in, a little drift, and chart specific moves. */
function hold(plan: MotionPlan, s: Shot, t: number): Camera {
  const tl = t - s.start
  const dur = Math.max(1, s.end - s.start)
  const p = progress(tl, 0, dur)
  const cam: Camera = {
    x: s.x + Math.sin(t / 3100) * 18,
    y: s.y + Math.cos(t / 3700) * 10,
    z: 1 + 0.05 * p,
    r: 0,
  }
  if (s.kind === 'intro') cam.z = 1.06 - 0.06 * ease(progress(tl, 0, 2400)) + 0.03 * p
  if (s.kind === 'end') cam.z = 1 + 0.08 * ease(p)
  if (s.kind === 'chart') {
    const focus = chartFocus(plan, s)
    cam.z = 0.94 + 0.02 * p
    if (focus) {
      const k = ease(progress(t, focus.t, 1100))
      // Lean toward the highlight without pushing the axis labels down under the captions.
      cam.x = lerp(cam.x, s.x + focus.x * 0.55, k)
      cam.y = lerp(cam.y, s.y + Math.min(0, focus.y) * 0.25, k)
      cam.z = lerp(cam.z, 1.16, k)
    }
  }
  return cam
}

export function cameraAt(plan: MotionPlan, t: number): Camera {
  const shots = plan.shots
  if (!shots.length) return { x: 0, y: 0, z: 1, r: 0 }
  // Inside a transition window, glide from the previous hold to the next one.
  for (let k = 1; k < shots.length; k++) {
    const s = shots[k]
    const a = s.start - s.transition * TRANSITION_LEAD
    const b = a + s.transition
    if (t >= a && t < b) {
      const from = hold(plan, shots[k - 1], a)
      const to = hold(plan, s, b)
      const p = (t - a) / s.transition
      const e = easeInOutCubic(p)
      const scene = s.transition >= TRANSITION_SCENE
      const arc = Math.sin(Math.PI * p)
      return {
        x: lerp(from.x, to.x, e),
        y: lerp(from.y, to.y, e),
        // Pull back mid move so the trip reads as travel through one world.
        z: lerp(from.z, to.z, e) * (1 - (scene ? 0.2 : 0.07) * arc),
        r: (to.x >= from.x ? 1 : -1) * (scene ? 0.03 : 0.012) * arc,
      }
    }
    if (t < a) break
  }
  return hold(plan, shots[Math.max(0, shotAt(plan, t))], t)
}
