// The image piece: the photo in its frame (or the scene icon when the photo is missing) enters with the shot, and a
// short caption enters under it on the pop; when the caption gives no label, the photo itself pulses on the pop.
import { labelFor } from '../labels'
import type { SetPiece, Vec3 } from '../types'
import { enter, framePiece, genericPiece, heroFor, labelActor, pictureHalfHeight, type PieceContext } from './kit'

const HERO_AT: Vec3 = [0, 0.35, 0]
/** The caption hangs this far under the hero. */
const CAPTION_GAP = 0.45
/** The pop sounds at t0 + 700; the caption enters 60 ms before it, or the photo pulses from then. */
const POP_AT = 700
const LEAD = 60
const PULSE_DUR = 400

export function imagePiece(ctx: PieceContext): SetPiece {
  const v = ctx.scene.visual
  if (v.kind !== 'image') return genericPiece(ctx)
  const shot = ctx.shots[0]
  const hero = heroFor(ctx, shot.icon, HERO_AT, shot.t0, ctx.hasImage(v.imageId) ? v.imageId : undefined)
  const caption = labelFor(v.caption, ctx.topicWords)
  const at: Vec3 = [0, HERO_AT[1] - pictureHalfHeight(hero) - CAPTION_GAP, 0]
  if (!caption) hero.beats.push({ t: shot.t0 + POP_AT - LEAD, dur: PULSE_DUR, action: 'pulse' })
  return framePiece(ctx, hero, caption ? [labelActor(ctx, 'caption', 0, caption, 'label', at, [enter(shot.t0 + POP_AT - LEAD)])] : [], [0, 0, 0])
}
