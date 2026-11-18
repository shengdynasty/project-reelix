// The timeline piece: a rail receding into depth with a plaque per event (the year over an icon on the rail, the event
// under it), each landing as its year is spoken, while the camera tracks along the rail toward the plaque being named.
import { iconFor } from '../../motion/icons'
import { itemArrival } from '../../motion/plan'
import { defaultCameraKeys } from '../camera'
import { LABEL_MAX_WIDTH_PX, shortLabel } from '../labels'
import { HOLD_DISTANCE, WORLD_PER_PX } from '../layout'
import type { ActorSpec, CameraKey, SetPiece, Vec3 } from '../types'
import { actorId, enter, framePiece, genericPiece, holdSpan, iconActor, labelActor, pieceFrame, type PieceContext } from './kit'

/** Plaques sit at most STEP apart along x, closer when the rail would otherwise run wider than RAIL_WIDTH (the most that keeps the near end's labels in frame). */
const STEP = 1.6
const RAIL_WIDTH = 5.4
/** The rail recedes this much in z per unit of x, from the front left to the back right. */
const RECEDE = 0.75
const ICON_Y = 0.8
const ICON_SCALE = 0.9
const YEAR_Y = 1.6
/** Event labels hang under the rail, neighbours in two rows (three on a rail of five or six) so they never touch. */
const LABEL_Y = -0.6
const LABEL_ROW = 0.55
/** The camera looks a little above the rail. */
const AIM_Y = 0.3
/** A plaque enters this long before its arrival (its pop follows the arrival by 30 ms). */
const PLAQUE_LEAD = 200
/** Events without a picture of their own get a calendar. */
const EVENT_ICON = 'calendar'
/** The camera follows the named plaque by at most this fraction of its offset from the rail's middle. */
const TRACK_MAX = 0.5
/** Plaques and their labels stay inside this share of the frame's width at every key. */
const TRACK_MARGIN = 0.97
/** Half the frame's width at HOLD_DISTANCE, world units (a 1920 px wide 1080 frame), and half the width a label can run. */
const HALF_WIDTH = WORLD_PER_PX * 960
const LABEL_HALF = (LABEL_MAX_WIDTH_PX / 2) * WORLD_PER_PX

/** Where plaque `j` of `n` stands: evenly along x, receding in z, the rail's middle at the origin. */
export function railStation(j: number, n: number): Vec3 {
  const step = Math.min(STEP, RAIL_WIDTH / Math.max(1, n - 1))
  const x = (j - (n - 1) / 2) * step
  const z = -x * RECEDE
  return [x, 0, z === 0 ? 0 : z]
}

/**
 * How far the camera follows the named plaque, as a fraction of the plaque's offset from the rail's middle: the most
 * that keeps the far end of the rail, its label at full width included, inside TRACK_MARGIN of the frame while the
 * camera is on the near end, at most TRACK_MAX. With the camera HOLD_DISTANCE in front of its target, the far plaque
 * is then `(1 + f)` half rails away along x and that much nearer in z, and its label stays in frame while the plaque's
 * x offset plus the label's half width is under the frame's half width at the plaque's depth.
 */
export function railTracking(n: number): number {
  const [x, , z] = railStation(n - 1, n)
  if (x === 0) return TRACK_MAX
  const tanHalf = HALF_WIDTH / HOLD_DISTANCE
  const f = (TRACK_MARGIN * HALF_WIDTH - LABEL_HALF) / (x + tanHalf * Math.abs(z)) - 1
  return Math.max(0, Math.min(TRACK_MAX, f))
}

/** The row an event label takes under the rail: neighbours alternate between two rows, or three on a rail of five or six. */
export const labelRow = (j: number, n: number) => j % (n > 4 ? 3 : n > 2 ? 2 : 1)

/** The year as written when it is short enough, else cut to four words that still read as a name. */
function yearText(when: string): string {
  const words = when.trim().split(/\s+/).filter(Boolean)
  return words.length <= 4 ? words.join(' ') : shortLabel(when)
}

/**
 * One key per plaque: the camera arrives following the first plaque, moves on to each one as it arrives and leaves
 * looking at the whole rail from straight in front, where the near end's labels still fit. Keys that would fall
 * outside the hold are left out.
 */
function railCamera(ctx: PieceContext, stations: Vec3[], arrivals: number[]): CameraKey[] {
  const { holdStart, holdEnd } = holdSpan(ctx)
  const frame = pieceFrame(ctx)
  const track = railTracking(stations.length)
  const aimAt = (j: number): Vec3 => [stations[j][0] * track, AIM_Y, stations[j][2] * track]
  const keys = [defaultCameraKeys(frame, aimAt(0), holdStart, holdStart)[0]]
  arrivals.forEach((t, j) => {
    if (j > 0 && t > keys[keys.length - 1].t && t < holdEnd) keys.push(defaultCameraKeys(frame, aimAt(j), t, t)[0])
  })
  if (holdEnd > keys[keys.length - 1].t) keys.push(defaultCameraKeys(frame, [0, AIM_Y, 0], holdEnd, holdEnd)[0])
  return keys
}

export function timelinePiece(ctx: PieceContext): SetPiece {
  const v = ctx.scene.visual
  if (v.kind !== 'timeline') return genericPiece(ctx)
  const shot = ctx.shots[0]
  const n = v.events.length
  const stations = v.events.map((_, j) => railStation(j, n))
  const arrivals = v.events.map((_, j) => itemArrival(shot, j))
  const rail: ActorSpec = { id: actorId(ctx, 'path'), at: [0, 0, 0], scale: 1, data: { kind: 'path', points: stations, closed: false }, beats: [enter(shot.t0)] }
  const plaques = v.events.flatMap((e, j) => {
    const [x, , z] = stations[j]
    const t = arrivals[j] - PLAQUE_LEAD
    const year = yearText(e.when)
    const label = shortLabel(e.label)
    return [
      iconActor(ctx, 'icon', j, iconFor(e.label, EVENT_ICON), [x, ICON_Y, z], ICON_SCALE, [enter(t)]),
      ...(year ? [labelActor(ctx, 'year', j, year, 'term', [x, YEAR_Y, z], [enter(t)])] : []),
      ...(label ? [labelActor(ctx, 'label', j, label, 'small', [x, LABEL_Y - labelRow(j, n) * LABEL_ROW, z], [enter(t)])] : []),
    ]
  })
  return framePiece(ctx, rail, plaques, [0, AIM_Y, 0], railCamera(ctx, stations, arrivals))
}
