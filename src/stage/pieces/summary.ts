// The summary piece: the heroes of earlier scenes come back as icons on a ring around the closing tags, the first of
// them with the chime; the camera arrives at the distance that shows every copy whole and pulls back a little more
// as the last one lands.
import { shortLabel } from '../labels'
import { HOLD_DISTANCE, WORLD_PER_PX } from '../layout'
import { groupShots } from '../timing'
import type { ActorSpec, CameraKey, SetPiece, Vec3 } from '../types'
import { ENTER, actorId, enter, framePiece, genericPiece, holdSpan, labelActor, pieceKey, type PieceContext } from './kit'

const MAX_COPIES = 6
const RADIUS = 2
/** The ring's middle sits this far above the camera's target, so the bottom copy stays clear of the captions. */
const RING_Y = 0.45
const COPY_SCALE = 1
/** The tags stack in the middle of the ring. */
const TAG_PITCH = 0.6
/** Copy k enters at t0 + COPY_IN + k * COPY_STAGGER (the chime is at t0 + 200); tag k at t0 + TAG_IN + k * TAG_STAGGER. */
const COPY_IN = 200
const COPY_STAGGER = 120
const TAG_IN = 600
const TAG_STAGGER = 150
/** The camera pulls back this much past the distance that frames every copy, as far as the hold band allows, and drifts this far aside before it leaves. */
const PULL_BACK = 1
const DRIFT = 0.5
/** The camera sits this far above its target, as on the default hold. */
const RISE = 0.6
/** The framing distance keeps this much spare room, and stays inside the hold distance band. */
const FRAME_MARGIN = 1.03
const NEAREST = HOLD_DISTANCE * 0.86
const FARTHEST = HOLD_DISTANCE * 1.04
/** Half the frame at HOLD_DISTANCE, world units (a 1920 by 1080 frame). */
const HALF_WIDTH = WORLD_PER_PX * 960
const HALF_HEIGHT = WORLD_PER_PX * 540

/** Up to MAX_COPIES of `heroes`: all of them, or that many spread evenly from the first to the last. */
export function pickHeroes<T>(heroes: T[], max = MAX_COPIES): T[] {
  if (heroes.length <= max) return heroes
  return Array.from({ length: max }, (_, i) => heroes[Math.round((i * (heroes.length - 1)) / (max - 1))])
}

/** Copy `k` of `m` on the ring: the first at the top, the rest clockwise. */
export function ringPosition(k: number, m: number): Vec3 {
  const a = Math.PI / 2 - (2 * Math.PI * k) / m
  return [RADIUS * Math.cos(a), RING_Y + RADIUS * Math.sin(a), 0]
}

/** The distance from which every copy's icon is whole inside the frame: the farthest any copy's extent needs, within the band. */
export function framingDistance(copies: ActorSpec[]): number {
  const half = COPY_SCALE / 2
  const need = Math.max(...copies.map((c) => Math.max((Math.abs(c.at[0]) + half) / HALF_WIDTH, (Math.abs(c.at[1]) + half) / HALF_HEIGHT))) * HOLD_DISTANCE
  return Math.min(FARTHEST, Math.max(NEAREST, need * FRAME_MARGIN))
}

/** The camera arrives framing every copy whole, pulls back as the last copy lands (`lastIn`) and drifts aside until it leaves. */
function ringCamera(ctx: PieceContext, copies: ActorSpec[], lastIn: number): CameraKey[] {
  const { holdStart, holdEnd } = holdSpan(ctx)
  const distance = framingDistance(copies)
  const pulled = Math.min(FARTHEST, distance + PULL_BACK)
  const target: Vec3 = [0, 0, 0]
  const keys = [pieceKey(ctx, holdStart, [0, RISE, distance], target)]
  if (lastIn > holdStart && lastIn < holdEnd) keys.push(pieceKey(ctx, lastIn, [0, RISE, pulled], target))
  if (holdEnd > holdStart) keys.push(pieceKey(ctx, holdEnd, [DRIFT, RISE, pulled], target))
  return keys
}

export function summaryPiece(ctx: PieceContext): SetPiece {
  const v = ctx.scene.visual
  if (v.kind !== 'outro' || !ctx.heroes.length) return genericPiece(ctx)
  const t0 = ctx.shots[0].t0
  const groups = groupShots(ctx.plan.shots)
  const heroes = pickHeroes(ctx.heroes)
  // The ring holds icons only: an earlier hero that is one, else the icon of that piece's first shot.
  const copies = heroes.map(({ piece, actor }, k): ActorSpec => ({
    id: actorId(ctx, 'copy', k),
    at: ringPosition(k, heroes.length),
    scale: COPY_SCALE,
    data: actor.data.kind === 'icon' ? { ...actor.data } : { kind: 'icon', icon: groups[piece][0].icon, accent: true },
    beats: [enter(t0 + COPY_IN + k * COPY_STAGGER)],
  }))
  const tags = v.tags.flatMap((tag) => {
    const text = shortLabel(tag)
    return text ? [text] : []
  })
  const labels = tags.map((text, k) => labelActor(ctx, 'tag', k, text, 'label', [0, RING_Y + ((tags.length - 1) / 2 - k) * TAG_PITCH, 0], [enter(t0 + TAG_IN + k * TAG_STAGGER)]))
  const lastIn = t0 + COPY_IN + (copies.length - 1) * COPY_STAGGER + ENTER
  return framePiece(ctx, copies[0], [...copies.slice(1), ...labels], [0, 0, 0], ringCamera(ctx, copies, lastIn))
}
