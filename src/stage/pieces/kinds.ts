// The kinds piece: the items stand on the stations of an open arc, each entering as it is named and glowing while it
// is talked about. The arc is there from the start, like the 2D bracket, so the camera arrives on something.
import { iconFor } from '../../motion/icons'
import { itemArrival } from '../../motion/plan'
import { shortLabel } from '../labels'
import { HOLD_DISTANCE } from '../layout'
import type { ActorSpec, Beat, CameraKey, SetPiece, Vec3 } from '../types'
import { actorId, enter, framePiece, genericPiece, holdSpan, iconActor, labelActor, pieceKey, type PieceContext } from './kit'
import { arcPosition } from './points'

/** The arc runs from x -ARC_HALF_WIDTH to ARC_HALF_WIDTH, narrower than the key points' so a wide name at either end stays inside the frame. */
const ARC_HALF_WIDTH = 3.4
const ICON_SCALE = 1.6
const ICON_Y = 0.6
/** The arc runs just under the icons; the names hang below it, neighbours in two rows on an arc of four or five. */
const ARC_Y = -0.15
const LABEL_Y = -0.8
const LABEL_ROW = 0.55
/** The camera arrives HOLD_DISTANCE in front of the arc's middle and pushes straight in a little by the time it leaves. */
const ARRIVE_RISE = 0.6
const LEAVE_RISE = 0.5
const LEAVE_DISTANCE = HOLD_DISTANCE * 0.96
/** A kind enters this long before its arrival (its pop follows the arrival by 30 ms) and glows for FOCUS_DUR from it. */
const KIND_LEAD = 200
const FOCUS_DUR = 1200
/** Kinds without a picture of their own get a puzzle piece, the scene icon's own fallback. */
const KIND_ICON = 'puzzle-piece'

/** The place of item `k` of `n` on the kinds arc at height `y`. */
export const kindPosition = (k: number, n: number, y: number): Vec3 => arcPosition(k, n, y, ARC_HALF_WIDTH)

/** A straight dolly: the camera arrives in front of `aim` and leaves a little closer, so the arc's ends stay in frame. */
function arcCamera(ctx: PieceContext, aim: Vec3): CameraKey[] {
  const { holdStart, holdEnd } = holdSpan(ctx)
  const keys = [pieceKey(ctx, holdStart, [aim[0], aim[1] + ARRIVE_RISE, aim[2] + HOLD_DISTANCE], aim)]
  if (holdEnd > holdStart) keys.push(pieceKey(ctx, holdEnd, [aim[0], aim[1] + LEAVE_RISE, aim[2] + LEAVE_DISTANCE], aim))
  return keys
}

export function kindsPiece(ctx: PieceContext): SetPiece {
  const v = ctx.scene.visual
  if (v.kind !== 'steps') return genericPiece(ctx)
  const shot = ctx.shots[0]
  const n = v.items.length
  const stations = v.items.map((_, k) => kindPosition(k, n, ARC_Y))
  const arc: ActorSpec = { id: actorId(ctx, 'path'), at: [0, 0, 0], scale: 1, data: { kind: 'path', points: stations, closed: false }, beats: [enter(shot.t0)] }
  const kinds = v.items.flatMap((item, k) => {
    const a = itemArrival(shot, k)
    const focus: Beat = { t: a, dur: FOCUS_DUR, action: 'focus' }
    const label = shortLabel(item)
    return [
      iconActor(ctx, 'icon', k, iconFor(item, KIND_ICON), kindPosition(k, n, ICON_Y), ICON_SCALE, [enter(a - KIND_LEAD), focus]),
      ...(label ? [labelActor(ctx, 'label', k, label, 'label', kindPosition(k, n, LABEL_Y - (n > 3 ? k % 2 : 0) * LABEL_ROW), [enter(a - KIND_LEAD)])] : []),
    ]
  })
  // The camera looks at the middle of the arc, at the mean depth of the items.
  const aim: Vec3 = [0, 0, stations.reduce((sum, p) => sum + p[2], 0) / n]
  return framePiece(ctx, arc, kinds, aim, arcCamera(ctx, aim))
}
