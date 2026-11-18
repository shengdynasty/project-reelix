// The definition piece: the hero (the scene's photo, its kit's model or its icon) pops in, the term lands with the second pop and a small label names what it
// is; the full meaning stays in the captions.
import { labelFor, shortLabel } from '../labels'
import type { SetPiece, Vec3 } from '../types'
import { enter, framePiece, genericPiece, heroFor, labelActor, pictureHalfHeight, type PieceContext } from './kit'

const HERO_AT: Vec3 = [0, 1, 0]
/** The term hangs this far under the hero's bottom edge, and the small label this far under the term. */
const TERM_GAP = 0.7
const MEANING_DROP = 0.85
/** The camera looks between the hero and its labels. */
const AIM: Vec3 = [0, 0.2, 0]
/** The term enters 60 ms before the second pop (t0 + 900); the small label follows it. */
const TERM_IN = 840
const MEANING_IN = 1100

export function definitionPiece(ctx: PieceContext): SetPiece {
  const v = ctx.scene.visual
  if (v.kind !== 'definition') return genericPiece(ctx)
  const shot = ctx.shots[0]
  const hero = heroFor(ctx, shot.icon, HERO_AT, shot.t0)
  const termY = HERO_AT[1] - pictureHalfHeight(hero) - TERM_GAP
  const term = shortLabel(v.term)
  const meaning = labelFor(v.meaning, ctx.topicWords)
  return framePiece(
    ctx,
    hero,
    [
      ...(term ? [labelActor(ctx, 'term', 0, term, 'term', [0, termY, 0], [enter(shot.t0 + TERM_IN)])] : []),
      ...(meaning ? [labelActor(ctx, 'meaning', 0, meaning, 'small', [0, termY - MEANING_DROP, 0], [enter(shot.t0 + MEANING_IN)])] : []),
    ],
    AIM,
  )
}
