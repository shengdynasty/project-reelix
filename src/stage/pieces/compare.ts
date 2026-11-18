// The compare piece: two pillars scaled by value rise one after the other on the pops, their values on top and their
// names below; the difference lands with the chime, when the bigger pillar lights up, while the camera orbits the pair.
import { formatValue } from '../../input/numbers'
import type { Unit } from '../../model/storyboard'
import { COMPARE_DELTA, COMPARE_POP } from '../../motion/beats'
import { cameraKey } from '../camera'
import { shortLabel } from '../labels'
import { HOLD_DISTANCE } from '../layout'
import type { ActorSpec, Beat, SetPiece, Vec3 } from '../types'
import { actorId, enter, framePiece, genericPiece, labelActor, type PieceContext } from './kit'

/** The pillars stand at x -PILLAR_X and PILLAR_X. */
const PILLAR_X = 2
/** A lone bar is this tall at scale 1 (three.js builders); the taller pillar stands at scale 1. */
const BAR_HEIGHT = 3
/** The shorter pillar keeps at least this share of the taller one's scale, so it never becomes a sliver. */
const PILLAR_MIN = 0.2
/** A value label floats this far above its pillar; the names hang under the base line; the difference tops the piece. */
const VALUE_RISE = 0.35
const NAME_Y = -0.5
const DELTA_Y = BAR_HEIGHT + 1.1
/** The camera looks at the middle of the piece, from its names to the difference. */
const AIM: Vec3 = [0, 1.7, 0]
/** Entrances lead their sounds by this much. */
const LEAD = 60
const HIGHLIGHT_DUR = 600
/** Over the hold the camera orbits this far around the pillars, ending a little closer, instead of the default dolly. */
const ORBIT_DEG = 20
const ORBIT_DISTANCE = HOLD_DISTANCE * 0.9
const ORBIT_RISE = 0.5

/** The difference as the 2D compare shows it ("+250 nm · +56%", "+4.2M · 3.1×"), or null when a value is 0 or they match. */
export function deltaText(left: number, right: number, unit: Unit, decimals: number): string | null {
  const lo = Math.min(Math.abs(left), Math.abs(right))
  const hi = Math.max(Math.abs(left), Math.abs(right))
  if (lo <= 0 || hi === lo) return null
  const ratio = hi / lo
  const rel = ratio >= 2 ? `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}×` : `+${Math.round((ratio - 1) * 100)}%`
  return `+${formatValue(hi - lo, unit, decimals)} · ${rel}`
}

/** The camera `deg` degrees around `aim` from the default hold direction, `distance` away and ORBIT_RISE above. */
function orbitPosition(aim: Vec3, deg: number, distance: number): Vec3 {
  const a = (deg * Math.PI) / 180
  return [aim[0] + Math.sin(a) * distance, aim[1] + ORBIT_RISE, aim[2] + Math.cos(a) * distance]
}

export function comparePiece(ctx: PieceContext): SetPiece {
  const v = ctx.scene.visual
  if (v.kind !== 'compare') return genericPiece(ctx)
  const shot = ctx.shots[0]
  const t0 = shot.t0
  const sides = [v.left, v.right]
  const max = Math.max(...sides.map((s) => Math.abs(s.value))) || 1
  const bigger = Math.abs(v.right.value) >= Math.abs(v.left.value) ? 1 : 0
  // The bigger pillar lights up as the difference lands, like the 2D compare's emphasis.
  const highlight: Beat = { t: t0 + COMPARE_DELTA - LEAD, dur: HIGHLIGHT_DUR, action: 'highlight' }
  const pillars = sides.map(
    (side, k): ActorSpec => ({
      id: actorId(ctx, 'bars', k),
      at: [k === 0 ? -PILLAR_X : PILLAR_X, 0, 0],
      scale: Math.max(PILLAR_MIN, Math.abs(side.value) / max),
      data: { kind: 'bars', values: [side.value], categories: [''], highlight: null },
      beats: [enter(t0 + COMPARE_POP[k] - LEAD), ...(k === bigger ? [highlight] : [])],
    }),
  )
  const labels = sides.flatMap((side, k) => {
    const x = pillars[k].at[0]
    const t = t0 + COMPARE_POP[k] - LEAD
    const name = shortLabel(side.label)
    return [
      labelActor(ctx, 'value', k, formatValue(side.value, { ...v.unit, word: '' }, v.decimals), 'label', [x, BAR_HEIGHT * pillars[k].scale + VALUE_RISE, 0], [enter(t)]),
      ...(name ? [labelActor(ctx, 'name', k, name, 'label', [x, NAME_Y, 0], [enter(t)])] : []),
    ]
  })
  const delta = deltaText(v.left.value, v.right.value, v.unit, v.decimals)
  const piece = framePiece(
    ctx,
    pillars[0],
    [pillars[1], ...labels, ...(delta ? [labelActor(ctx, 'delta', 0, delta, 'label', [0, DELTA_Y, 0], [enter(t0 + COMPARE_DELTA - LEAD)])] : [])],
    AIM,
  )
  // The departure key, when the hold has length, orbits instead of dollying.
  const last = piece.camera.length - 1
  if (last > 0) {
    const aim: Vec3 = [...piece.camera[0].target]
    piece.camera[last] = cameraKey(piece.camera[last].t, orbitPosition(aim, ORBIT_DEG, ORBIT_DISTANCE), aim)
  }
  return piece
}
