// Camera keys for the 3D stage: when the camera flies to a piece, how long it holds there and where it sits while it
// does. The keys are plain data; cameraPose reads the keys of all pieces as one timeline and gives the camera at any time.
import type { Shot } from '../motion/plan'
import { TRANSITION_LEAD } from '../motion/beats'
import { easeState, lerp } from '../render/easing'
import { FOV, HOLD_DISTANCE } from './layout'
import type { CameraKey, CameraPose, SetPiece, StageSet, Vec3 } from './types'

/** Camera offsets from the hero while the camera holds on a piece: it arrives at HOLD_IN and dollies to HOLD_OUT. */
const HOLD_IN: Vec3 = [0, 0.6, HOLD_DISTANCE]
const HOLD_OUT: Vec3 = [0.6, 0.5, HOLD_DISTANCE * 0.9]
/** Keys this close in time ease from one to the next, state to state; keys further apart run linearly, a slow dolly. */
const EASE_MAX_MS = 1000
/** A segment covering more than ARC_UNITS within ARC_MAX_MS is a flight between pieces: it lifts and banks at its middle. */
const ARC_UNITS = 6
const ARC_MAX_MS = 1200
/** The lift in world units and the roll in radians at the middle of a flight. */
const ARC_LIFT = 1.2
const ARC_ROLL = 0.03

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const mix = (a: Vec3, b: Vec3, k: number): Vec3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]

/** Global ms when the camera leaves the previous shot for `shot`: the start of the 2D camera move and its whoosh. */
export const flightStart = (shot: Shot) => shot.start - shot.transition * TRANSITION_LEAD
/** Global ms when the camera has arrived on `shot`: the end of that move. */
export const flightEnd = (shot: Shot) => flightStart(shot) + shot.transition

/**
 * When the camera holds on the piece made of `shots`: from its arrival on the first shot until it leaves for `next`,
 * the shot after the last one, or until the last shot ends when nothing follows.
 */
export function holdWindow(shots: Shot[], next: Shot | undefined): { holdStart: number; holdEnd: number } {
  return { holdStart: flightEnd(shots[0]), holdEnd: next ? flightStart(next) : shots[shots.length - 1].end }
}

/** A key at `t` with the camera at `position` looking at `target`, the stage's field of view and the focus on the target. */
export function cameraKey(t: number, position: Vec3, target: Vec3): CameraKey {
  return { t, position, target, fov: FOV, focus: dist(position, target) }
}

/**
 * The keys a piece gets unless its builder adds its own: at `holdStart` the camera sits HOLD_IN from the hero (`heroAt`
 * is relative to the piece origin) looking at it, and by `holdEnd` it has dollied to HOLD_OUT, a little closer and to
 * the side. Hold times outside the piece's window are clamped to it, and a hold with no length gives the first key only.
 */
export function defaultCameraKeys(piece: Pick<SetPiece, 'origin' | 'start' | 'end'>, heroAt: Vec3, holdStart: number, holdEnd: number): CameraKey[] {
  const hero = add(piece.origin, heroAt)
  const t0 = clamp(holdStart, piece.start, piece.end)
  const t1 = clamp(holdEnd, piece.start, piece.end)
  const keys = [cameraKey(t0, add(hero, HOLD_IN), hero)]
  if (t1 > t0) keys.push(cameraKey(t1, add(hero, HOLD_OUT), hero))
  return keys
}

export interface CameraPoseOptions {
  /** Flights between pieces lose their lift and roll and follow the keys as they are. */
  reducedMotion?: boolean
}

/** The camera held still on `key`, with fresh arrays so a caller can change the pose without touching the key. */
const holdAt = (key: CameraKey): CameraPose => ({ position: [...key.position], target: [...key.target], fov: key.fov, focus: key.focus, roll: 0 })

/**
 * The camera at global time `t` ms, from the keys of all pieces read as one timeline. Before the first key and after
 * the last the camera holds. Between two keys at most EASE_MAX_MS apart it eases from one to the other; further apart
 * it moves linearly, a slow dolly. A segment that covers more than ARC_UNITS within ARC_MAX_MS is a flight between
 * pieces: the path lifts by ARC_LIFT * sin(pi p) and the camera rolls by ARC_ROLL * sin(pi p), unless `reducedMotion`.
 * A segment with no length, such as a piece's last key and the next piece's copy of it, is a hold at its later key.
 * Pure: the same set and t always give the same pose, so preview and export can ask for any t in any order, and the
 * keys are only read. With no keys at all the camera holds HOLD_IN from the world origin.
 */
export function cameraPose(set: StageSet, t: number, opts: CameraPoseOptions = {}): CameraPose {
  const keys = set.pieces.flatMap((p) => p.camera)
  if (keys.length === 0) return holdAt(cameraKey(0, HOLD_IN, [0, 0, 0]))
  const i = keys.findLastIndex((k) => k.t <= t)
  if (i < 0) return holdAt(keys[0])
  if (i === keys.length - 1) return holdAt(keys[i])
  const a = keys[i]
  const b = keys[i + 1]
  const dt = b.t - a.t
  if (dt <= 0) return holdAt(b)
  const p = (t - a.t) / dt
  const k = dt <= EASE_MAX_MS ? easeState(p) : p
  const pose: CameraPose = { position: mix(a.position, b.position, k), target: mix(a.target, b.target, k), fov: lerp(a.fov, b.fov, k), focus: lerp(a.focus, b.focus, k), roll: 0 }
  if (!opts.reducedMotion && dt <= ARC_MAX_MS && dist(a.position, b.position) > ARC_UNITS) {
    const arc = Math.sin(Math.PI * p)
    pose.position[1] += ARC_LIFT * arc
    pose.roll = ARC_ROLL * arc
  }
  return pose
}
