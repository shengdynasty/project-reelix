// The key points piece: an icon and a short label per item on a shallow arc that recedes at its ends, each pair
// entering as its shot begins (its pop follows 60 ms later). The first item's icon is the hero.
import { labelFor } from '../labels'
import type { SetPiece, Vec3 } from '../types'
import { enter, framePiece, genericPiece, iconActor, labelActor, type PieceContext } from './kit'

/** The arc runs from x -ARC_HALF_WIDTH to ARC_HALF_WIDTH. */
const ARC_HALF_WIDTH = 4
/** How far the ends of the arc sit behind its middle, so the items read as a curve in depth. */
const ARC_SAG = 2
const ICON_SCALE = 1.6
const ICON_Y = 0.6
const LABEL_Y = -0.8

/** Where item `k` of `n` sits at height `y`: evenly along x over `halfWidth` each way, receding with the square of x; a lone item at the middle. */
export function arcPosition(k: number, n: number, y: number, halfWidth = ARC_HALF_WIDTH): Vec3 {
  const x = n > 1 ? -halfWidth + (2 * halfWidth * k) / (n - 1) : 0
  const depth = ARC_SAG * (x / halfWidth) ** 2
  return [x, y, depth > 0 ? -depth : 0]
}

export function pointsPiece(ctx: PieceContext): SetPiece {
  const v = ctx.scene.visual
  if (v.kind !== 'bullets') return genericPiece(ctx)
  const { shots } = ctx
  const n = shots.length
  const icons = shots.map((shot, k) => iconActor(ctx, 'icon', k, shot.icon, arcPosition(k, n, ICON_Y), ICON_SCALE, [enter(shot.t0)]))
  const labels = shots.flatMap((shot, k) => {
    const text = labelFor(v.items[shot.item] ?? v.items[0], ctx.topicWords)
    return text ? [labelActor(ctx, 'label', k, text, 'label', arcPosition(k, n, LABEL_Y), [enter(shot.t0)])] : []
  })
  // The camera looks at the middle of the arc, at the mean depth of the items.
  const depth = icons.reduce((sum, a) => sum + a.at[2], 0) / n
  return framePiece(ctx, icons[0], [...icons.slice(1), ...labels], [0, 0, depth])
}
