import { BAR_STAGGER } from '../motion/beats'
import { clamp01, easeEnter, easeState, lerp } from '../render/easing'
import type { ActorPose, ActorSpec, Beat, Vec3 } from './types'

// The beat table from the 3D stage plan. Scale factors multiply the actor's `scale`, the lift is in world units
// and the focus times are ms.
const ENTER_SCALE_FROM = 0.6
const ENTER_LIFT = 0.6
const EXIT_SCALE_TO = 0.9
const PULSE_SWELL = 0.12
const FOCUS_RISE = 200
const FOCUS_FALL = 300

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const mix = (a: Vec3, b: Vec3, k: number): Vec3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]

/** Fraction 0..1 of a started beat that has elapsed at `t`. A beat with no duration is complete the moment it starts. */
const phase = (beat: Beat, t: number) => (beat.dur > 0 ? clamp01((t - beat.t) / beat.dur) : 1)

/** When column `i` of a bars actor starts to rise: BAR_STAGGER after the one before it from the actor's entrance, as the sound plan pops each bar. */
export const columnStart = (entrance: Beat, i: number) => entrance.t + i * BAR_STAGGER

/** How far column `i` of a bars actor has risen at `t`, 0..1: over the entrance's duration from its own start, with the entrance ease. */
export const columnRise = (entrance: Beat, i: number, t: number) => easeEnter(phase({ ...entrance, t: columnStart(entrance, i) }, t))

/** Index of the point of `path` nearest to `p`, the first one on a tie. */
function nearestStation(path: Vec3[], p: Vec3): number {
  let best = 0
  for (let i = 1; i < path.length; i++) if (dist(path[i], p) < dist(path[best], p)) best = i
  return best
}

/** The point the fraction `k` (0..1) of the way along the polyline `points`, by arc length. */
function alongPolyline(points: Vec3[], k: number): Vec3 {
  const lengths = points.slice(1).map((q, i) => dist(points[i], q))
  let d = k * lengths.reduce((sum, l) => sum + l, 0)
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i]) return lengths[i] > 0 ? mix(points[i], points[i + 1], d / lengths[i]) : points[i + 1]
    d -= lengths[i]
  }
  return points[points.length - 1]
}

/**
 * Where a travel beat has carried the actor: along `path` (relative to `at`), by way of every station between, to
 * station `index`. The journey starts at the station nearest the running position, so consecutive travels chain,
 * and an actor that starts off the path first glides straight to that station.
 */
function travel(beat: Beat, actor: ActorSpec, position: Vec3, k: number): Vec3 {
  const path = beat.path ?? []
  if (path.length === 0) return position
  const to = Math.min(Math.max(beat.index ?? path.length - 1, 0), path.length - 1)
  if (k >= 1) return add(actor.at, path[to])
  const here = sub(position, actor.at)
  const from = nearestStation(path, here)
  const stations = from <= to ? path.slice(from, to + 1) : path.slice(to, from + 1).reverse()
  return add(actor.at, alongPolyline([here, ...stations], k))
}

/** Applies one started beat to the running pose. Targets are relative to the actor's `at` and `scale`. */
function applyBeat(pose: ActorPose, actor: ActorSpec, beat: Beat, t: number): void {
  const p = phase(beat, t)
  switch (beat.action) {
    case 'enter': {
      // Reveal, with a swell from 60% and a lift from 0.6 below that both end on the pose earlier beats produced.
      const k = easeEnter(p)
      pose.opacity = k
      if (p < 1) {
        pose.scale *= lerp(ENTER_SCALE_FROM, 1, k)
        pose.position[1] -= ENTER_LIFT * (1 - k)
      }
      break
    }
    case 'exit': {
      const k = easeState(p)
      pose.opacity = lerp(pose.opacity, 0, k)
      pose.scale = lerp(pose.scale, EXIT_SCALE_TO * actor.scale, k)
      break
    }
    case 'pulse':
      if (p < 1) pose.scale *= 1 + PULSE_SWELL * Math.sin(Math.PI * p)
      break
    case 'focus': {
      // Up within FOCUS_RISE ms, held to the end of the beat, then back down to 0 over FOCUS_FALL ms.
      const u = t - beat.t
      const rise = Math.min(FOCUS_RISE, Math.max(beat.dur, 0))
      if (u < rise) pose.glow = lerp(pose.glow, 1, easeState(u / rise))
      else if (u < beat.dur) pose.glow = 1
      else pose.glow = 1 - easeState((u - beat.dur) / FOCUS_FALL)
      break
    }
    case 'highlight':
      pose.glow = lerp(pose.glow, 1, easeState(p))
      break
    case 'grow':
      pose.scale = lerp(pose.scale, (beat.to ?? 1) * actor.scale, easeState(p))
      break
    case 'travel':
      pose.position = travel(beat, actor, pose.position, easeState(p))
      break
    case 'count':
      pose.progress = p
      break
    case 'spin':
      pose.rotation[1] += 2 * Math.PI * p
      break
  }
}

/**
 * The pose of `actor` at global time `t` ms. A pure function of `t`, so frames can be drawn in any order and export
 * matches preview. Beats apply in time order, each reading the pose the earlier beats produced. Before its first
 * enter beat an actor has opacity 0; an actor with no enter beat is visible from the start.
 */
export function actorPose(actor: ActorSpec, t: number): ActorPose {
  const pose: ActorPose = {
    position: [actor.at[0], actor.at[1], actor.at[2]],
    rotation: [0, 0, 0],
    scale: actor.scale,
    opacity: actor.beats.some((b) => b.action === 'enter') ? 0 : 1,
    glow: 0,
    progress: 0,
  }
  const beats = [...actor.beats].sort((a, b) => a.t - b.t)
  for (const beat of beats) {
    if (beat.t > t) break
    applyBeat(pose, actor, beat, t)
  }
  return pose
}
