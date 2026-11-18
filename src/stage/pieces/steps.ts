// The steps piece: the items stand at the stations of a ring on the floor and a glowing token runs the ring to each
// station as its step is named, the station pulsing when it lands; the camera looks down onto the ring from the front.
import { iconFor } from '../../motion/icons'
import { itemArrival } from '../../motion/plan'
import { shortLabel } from '../labels'
import { HOLD_DISTANCE } from '../layout'
import type { ActorSpec, Beat, CameraKey, SetPiece, Vec3 } from '../types'
import { actorId, enter, framePiece, genericPiece, holdSpan, iconActor, labelActor, pieceKey, type PieceContext } from './kit'

const RADIUS = 4
/** Each station carries its icon above it and its name just above the ring, drawn in toward the ring's middle so a wide name at a near station stays inside the frame. */
const LABEL_Y = 0.5
const LABEL_INSET = 0.75
const ICON_Y = 1.45
const ICON_SCALE = 1.2
/** Steps without a picture of their own get a flag, a waypoint on the route. */
const STEP_ICON = 'flag'
/** The token runs to a station over this long, landing as the step is named; the station pulses when it does. */
const TRAVEL = 450
const PULSE_DUR = 400
/** The camera looks at the ring's middle from ELEVATION degrees above the floor at HOLD_DISTANCE, and leaves a little around it. */
const AIM: Vec3 = [0, 0.45, 0]
const ELEVATION = 22
const DEPART_ORBIT = 8

/** Station `j` of `n`: a regular polygon of radius RADIUS on the floor, starting at the front left and running across the front, then round the back. */
export function ringStation(j: number, n: number): Vec3 {
  const a = -Math.PI / n + (2 * Math.PI * j) / n
  return [RADIUS * Math.sin(a), 0, RADIUS * Math.cos(a)]
}

/**
 * The token's travels: to station `j` of `route`, landing at `arrivals[j]`, TRAVEL long unless the previous landing is
 * nearer than that, so no two travels overlap. The first lands on the station the token starts at.
 */
export function tokenTravels(arrivals: number[], route: Vec3[]): Beat[] {
  return arrivals.map((a, j) => {
    const t = Math.max(a - TRAVEL, j > 0 ? arrivals[j - 1] : a - TRAVEL)
    return { t, dur: a - t, action: 'travel', path: route, index: j }
  })
}

/** The camera `deg` degrees around the ring's middle from the front, `distance` away, ELEVATION degrees above the floor. */
function viewPosition(deg: number, distance: number): Vec3 {
  const e = (ELEVATION * Math.PI) / 180
  const a = (deg * Math.PI) / 180
  const flat = Math.cos(e) * distance
  return [AIM[0] + Math.sin(a) * flat, AIM[1] + Math.sin(e) * distance, AIM[2] + Math.cos(a) * flat]
}

function ringCamera(ctx: PieceContext): CameraKey[] {
  const { holdStart, holdEnd } = holdSpan(ctx)
  const keys = [pieceKey(ctx, holdStart, viewPosition(0, HOLD_DISTANCE), AIM)]
  if (holdEnd > holdStart) keys.push(pieceKey(ctx, holdEnd, viewPosition(DEPART_ORBIT, HOLD_DISTANCE), AIM))
  return keys
}

export function stepsPiece(ctx: PieceContext): SetPiece {
  const v = ctx.scene.visual
  if (v.kind !== 'steps') return genericPiece(ctx)
  const shot = ctx.shots[0]
  const t0 = shot.t0
  const n = v.items.length
  const stations = v.items.map((_, j) => ringStation(j, n))
  const arrivals = v.items.map((_, j) => itemArrival(shot, j))
  const ring: ActorSpec = { id: actorId(ctx, 'path'), at: [0, 0, 0], scale: 1, data: { kind: 'path', points: stations, closed: true }, beats: [enter(t0)] }
  const pulse = (j: number): Beat => ({ t: arrivals[j], dur: PULSE_DUR, action: 'pulse' })
  const posts = v.items.flatMap((item, j) => {
    const [x, , z] = stations[j]
    const label = shortLabel(item)
    return [
      iconActor(ctx, 'icon', j, iconFor(item, STEP_ICON), [x, ICON_Y, z], ICON_SCALE, [enter(t0), pulse(j)]),
      ...(label ? [labelActor(ctx, 'label', j, label, 'label', [x * LABEL_INSET, LABEL_Y, z * LABEL_INSET], [enter(t0), pulse(j)])] : []),
    ]
  })
  // The token starts on the first station; its route is the ring relative to that.
  const [first] = stations
  const route = stations.map((s): Vec3 => [s[0] - first[0], s[1] - first[1], s[2] - first[2]])
  const token: ActorSpec = { id: actorId(ctx, 'token'), at: [...first], scale: 1, data: { kind: 'token' }, beats: [enter(t0), ...tokenTravels(arrivals, route)] }
  return framePiece(ctx, ring, [...posts, token], AIM, ringCamera(ctx))
}
