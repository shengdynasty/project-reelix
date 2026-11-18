// The chart piece: the columns (or the line's ribbon) rise with the first bar pop, and the highlighted value lights up
// and gets its number on the chime while the camera leans in toward it, as the 2D chart's camera does.
import { formatValue } from '../../input/numbers'
import { BAR_START } from '../../motion/beats'
import { chartHighlightTime } from '../../motion/plan'
import { shortLabel } from '../labels'
import { HOLD_DISTANCE, WORLD_PER_PX } from '../layout'
import type { ActorSpec, Beat, CameraKey, SetPiece, Vec3 } from '../types'
import { actorId, enter, framePiece, genericPiece, holdSpan, labelActor, pieceKey, type PieceContext } from './kit'

/** At most this many categories show, like the sound plan's bar pops. */
const MAX_CATEGORIES = 10
/** Columns and markers sit this far apart and the largest value stands this high at scale 1 (three.js builders). */
const PITCH = 0.9
const MAX_HEIGHT = 3
/** The title floats above the tallest column; the camera looks at the middle of the piece, between the categories and the title. */
const TITLE_Y = 3.6
const AIM: Vec3 = [0, 1.3, 0]
/** The highlighted value's number floats this far above its column or marker, and never up into the title. */
const CALLOUT_RISE = 0.4
const CALLOUT_MAX_Y = TITLE_Y - 0.5
/** Half the width a callout may run, world units, kept inside the frame while the camera leans. */
const CALLOUT_HALF = 1
/** Half the frame's width at HOLD_DISTANCE, world units (a 1920 px wide 1080 frame). */
const HALF_WIDTH = WORLD_PER_PX * 960
/** The lean keeps the chart inside this share of the frame. */
const LEAN_MARGIN = 0.92
/** Entrances lead their sounds by this much. */
const LEAD = 60
const HIGHLIGHT_DUR = 600
/**
 * The lean toward the highlighted value starts on the chime and takes PUSH_MS: the target moves these fractions of the
 * way to the value along x and, only upward, along y (lowering it would push the title out at the top), the camera
 * comes in to PUSH_DISTANCE, PUSH_RISE above the target, and swings ORBIT_PER_UNIT degrees per unit of the value's x,
 * at most ORBIT_MAX, so the highlighted column turns toward the viewer. The shift and the swing shrink together to
 * the room the frame leaves beside the chart at that distance, so a wide chart leans little and its far column stays in.
 */
const PUSH_MS = 1000
const TARGET_X = 0.55
const TARGET_Y = 0.25
const PUSH_DISTANCE = HOLD_DISTANCE * 0.9
const PUSH_RISE = 0.5
const ORBIT_PER_UNIT = 6
const ORBIT_MAX = 14

/** Where value `i` of `values` reaches: at its pitch along x, its signed share of MAX_HEIGHT up (three.js builders). */
export function valuePoint(values: number[], i: number): Vec3 {
  const max = Math.max(...values.map(Math.abs), 0) || 1
  return [(i - (values.length - 1) / 2) * PITCH, (values[i] / max) * MAX_HEIGHT, 0]
}

/** Half the width a chart of `n` columns covers: half a pitch past its outer columns, which takes in a column and a category label no wider than its pitch. */
const chartHalfWidth = (n: number) => (n / 2) * PITCH

/** Half the frame's width at the lean's distance, less the margin. */
const leanHalfWidth = () => LEAN_MARGIN * HALF_WIDTH * (PUSH_DISTANCE / HOLD_DISTANCE)

/** The camera `deg` degrees around `target` from the front, `distance` away and PUSH_RISE above. */
function leanPosition(target: Vec3, deg: number, distance: number): Vec3 {
  const a = (deg * Math.PI) / 180
  return [target[0] + Math.sin(a) * distance, target[1] + PUSH_RISE, target[2] + Math.cos(a) * distance]
}

/**
 * The default keys with the lean added: the camera holds its arrival pose until the chime at `hlAt`, eases to a pose
 * turned toward `point` (a value of a chart `n` columns wide) by PUSH_MS later and drifts on to the departure from
 * there. The keys stay as they are when the hold is too short for the move.
 */
function withLean(ctx: PieceContext, keys: CameraKey[], point: Vec3, n: number, hlAt: number): CameraKey[] {
  const { holdStart, holdEnd } = holdSpan(ctx)
  if (keys.length < 2 || hlAt <= holdStart || hlAt + PUSH_MS >= holdEnd) return keys
  const [arrival, departure] = keys
  const shift = (point[0] - AIM[0]) * TARGET_X
  const room = Math.max(0, leanHalfWidth() - chartHalfWidth(n))
  const share = Math.abs(shift) > room ? room / Math.abs(shift) : 1
  const target: Vec3 = [AIM[0] + shift * share, AIM[1] + Math.max(0, point[1] - AIM[1]) * TARGET_Y, AIM[2]]
  const deg = Math.max(-ORBIT_MAX, Math.min(ORBIT_MAX, point[0] * ORBIT_PER_UNIT)) * share
  return [
    arrival,
    { ...arrival, t: hlAt, position: [...arrival.position], target: [...arrival.target] },
    pieceKey(ctx, hlAt + PUSH_MS, leanPosition(target, deg, PUSH_DISTANCE), target),
    departure,
  ]
}

export function chartPiece(ctx: PieceContext): SetPiece {
  const v = ctx.scene.visual
  if (v.kind !== 'chart') return genericPiece(ctx)
  const shot = ctx.shots[0]
  const t0 = shot.t0
  const d = v.data
  // The first series, like the ribbon and the pops; a pie shows its shares as columns.
  const values = d.series[0].values.slice(0, MAX_CATEGORIES)
  const categories = d.categories.slice(0, values.length)
  const highlight = v.highlight !== null && v.highlight >= 0 && v.highlight < values.length ? v.highlight : null
  const hlAt = chartHighlightTime(shot, ctx.words)
  const kind = d.chart === 'line' ? 'ribbon' : 'bars'
  const lit: Beat[] = highlight === null ? [] : [{ t: hlAt, dur: HIGHLIGHT_DUR, action: 'highlight' }]
  const hero: ActorSpec = { id: actorId(ctx, kind), at: [0, 0, 0], scale: 1, data: { kind, values, categories, highlight }, beats: [enter(t0 + BAR_START - LEAD), ...lit] }
  const title = shortLabel(d.title)
  const others = title ? [labelActor(ctx, 'title', 0, title, 'label', [0, TITLE_Y, 0], [enter(t0)])] : []
  if (highlight !== null) {
    // Over its column, drawn in toward the middle on a wide chart so it stays inside the frame while the camera leans.
    const top = valuePoint(values, highlight)
    const reach = leanHalfWidth() - CALLOUT_HALF
    const at: Vec3 = [Math.max(-reach, Math.min(reach, top[0])), Math.min(Math.max(0, top[1]) + CALLOUT_RISE, CALLOUT_MAX_Y), 0]
    others.push(labelActor(ctx, 'callout', 0, formatValue(values[highlight], d.unit), 'label', at, [enter(hlAt - LEAD)]))
  }
  const piece = framePiece(ctx, hero, others, AIM)
  if (highlight !== null) piece.camera = withLean(ctx, piece.camera, valuePoint(values, highlight), values.length, hlAt)
  return piece
}
