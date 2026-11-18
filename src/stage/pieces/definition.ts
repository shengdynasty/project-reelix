// The definition piece: the hero icon pops in, the term lands with the second pop and a small label names what it
// is; the full meaning stays in the captions.
import { labelFor, shortLabel } from '../labels'
import type { SetPiece, Vec3 } from '../types'
import { HERO_SCALE, enter, framePiece, genericPiece, iconActor, labelActor, type PieceContext } from './kit'

const HERO_AT: Vec3 = [0, 1, 0]
const TERM_AT: Vec3 = [0, -0.7, 0]
const MEANING_AT: Vec3 = [0, -1.55, 0]
/** The camera looks between the hero and its labels. */
const AIM: Vec3 = [0, 0.2, 0]
/** The term enters 60 ms before the second pop (t0 + 900); the small label follows it. */
const TERM_IN = 840
const MEANING_IN = 1100

export function definitionPiece(ctx: PieceContext): SetPiece {
  const v = ctx.scene.visual
  if (v.kind !== 'definition') return genericPiece(ctx)
  const shot = ctx.shots[0]
  const hero = iconActor(ctx, 'icon', 0, shot.icon, HERO_AT, HERO_SCALE, [enter(shot.t0)])
  const term = shortLabel(v.term)
  const meaning = labelFor(v.meaning, ctx.topicWords)
  return framePiece(
    ctx,
    hero,
    [
      ...(term ? [labelActor(ctx, 'term', 0, term, 'term', TERM_AT, [enter(shot.t0 + TERM_IN)])] : []),
      ...(meaning ? [labelActor(ctx, 'meaning', 0, meaning, 'small', MEANING_AT, [enter(shot.t0 + MEANING_IN)])] : []),
    ],
    AIM,
  )
}
