// The stat piece: a percent lights a 10 by 10 pictogram cell by cell as its number counts up; any other number counts
// up over a tower of stacked icons whose count says its magnitude. Both land on the spoken number with a pulse, on
// the impact sound.
import { formatValue } from '../../input/numbers'
import type { VisualOf } from '../../model/storyboard'
import { STAT_COUNT_DUR, STAT_COUNT_START } from '../../motion/beats'
import { labelFor } from '../labels'
import type { ActorSpec, Beat, SetPiece, Vec3 } from '../types'
import { actorId, enter, framePiece, genericPiece, labelActor, type PieceContext } from './kit'

/** The 100 cells span 4.2 units at scale 1 (three.js builders); this leaves room for the number and the caption. */
const PICTOGRAM_SCALE = 0.75
/** A tower keeps about the height of this many icons whatever its count: more icons, each smaller, for bigger numbers. */
const TOWER_ICONS_TALL = 4
const TOWER_MIN = 3
const TOWER_MAX = 9
const TOWER_AT: Vec3 = [0, -1.5, 0]
const COUNT_AT: Vec3 = [0, 2.1, 0]
/** The number is set at twice its 88 px size. */
const COUNT_SCALE = 2
const CAPTION_AT: Vec3 = [0, -2.1, 0]
/** The number appears a little after the shot starts and the caption after it, as in the 2D stat. */
const COUNT_IN = 120
const COUNT_IN_DUR = 500
const CAPTION_IN = 650
/** The pulse starts with the impact sound, this long before the count lands. */
const PULSE_LEAD = 120
const PULSE_DUR = 400

/** A percent between 0 and 100 lights a pictogram; anything else stacks a tower. */
export const isPercent = (v: VisualOf<'stat'>) => v.unit.suffix === '%' && v.value >= 0 && v.value <= 100

/** Icons in the tower for `value`: one more per power of ten, between TOWER_MIN and TOWER_MAX. */
export function towerCount(value: number): number {
  const count = Math.round(Math.log10(Math.abs(value))) + 3
  return Number.isFinite(count) ? Math.min(TOWER_MAX, Math.max(TOWER_MIN, count)) : TOWER_MIN
}

export function statPiece(ctx: PieceContext): SetPiece {
  const v = ctx.scene.visual
  if (v.kind !== 'stat') return genericPiece(ctx)
  const shot = ctx.shots[0]
  const t0 = shot.t0
  const countStart = t0 + STAT_COUNT_START
  const countEnd = shot.countEnd ?? countStart + STAT_COUNT_DUR
  // The hero and the number share the count and the pulse, so the cells and the digits land together.
  const landing = (): Beat[] => [
    { t: countStart, dur: Math.max(0, countEnd - countStart), action: 'count' },
    { t: countEnd - PULSE_LEAD, dur: PULSE_DUR, action: 'pulse' },
  ]
  const count = towerCount(v.value)
  const hero: ActorSpec = isPercent(v)
    ? { id: actorId(ctx, 'pictogram'), at: [0, 0, 0], scale: PICTOGRAM_SCALE, data: { kind: 'pictogram', lit: Math.round(v.value), total: 100 }, beats: [enter(t0), ...landing()] }
    : { id: actorId(ctx, 'tower'), at: TOWER_AT, scale: TOWER_ICONS_TALL / count, data: { kind: 'tower', count, icon: shot.icon }, beats: [enter(t0), ...landing()] }
  const number = labelActor(ctx, 'count', 0, formatValue(v.value, v.unit, v.decimals), 'title', COUNT_AT, [enter(t0 + COUNT_IN, COUNT_IN_DUR), ...landing()], COUNT_SCALE)
  const caption = labelFor(v.label, ctx.topicWords)
  return framePiece(ctx, hero, [number, ...(caption ? [labelActor(ctx, 'caption', 0, caption, 'label', CAPTION_AT, [enter(t0 + CAPTION_IN, CAPTION_IN)])] : [])], [0, 0, 0])
}
