// The title piece: the hero (the video's first photo when there is one, else the scene icon) rises as the video
// opens, and the title lands when the 2D intro's title words drop in.
import { INTRO_TITLE_START } from '../../motion/beats'
import { shortLabel } from '../labels'
import type { SetPiece, Vec3 } from '../types'
import { enter, framePiece, heroFor, labelActor, scenePhoto, type PieceContext } from './kit'

/** Only the title may run to this many words. */
const TITLE_WORDS = 8
/** The title label is set a little larger than its 88 px size. */
const TITLE_SCALE = 1.2
const HERO_AT: Vec3 = [0, 0.9, 0]
const TITLE_AT: Vec3 = [0, -1.5, 0]
/** The camera looks between the hero and the title. */
const AIM: Vec3 = [0, 0.2, 0]

/** The title as written when it is short enough, else cut to TITLE_WORDS words that still read as a name. */
export function titleText(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length <= TITLE_WORDS) return words.join(' ')
  return shortLabel(title, TITLE_WORDS) || words.slice(0, TITLE_WORDS).join(' ')
}

/** The first photo of the video that is available, if any. */
function leadPhoto(ctx: PieceContext): string | undefined {
  const ids = ctx.plan.storyboard.scenes.flatMap((s) => (s.visual.kind === 'image' ? [s.visual.imageId] : []))
  return ids.find((id) => ctx.hasImage(id))
}

export function introPiece(ctx: PieceContext): SetPiece {
  const shot = ctx.shots[0]
  const v = ctx.scene.visual
  const hero = heroFor(ctx, shot.icon, HERO_AT, shot.t0, scenePhoto(ctx) ?? leadPhoto(ctx))
  const text = titleText(v.kind === 'title' ? v.title : ctx.plan.storyboard.title)
  const title = text ? [labelActor(ctx, 'title', 0, text, 'title', TITLE_AT, [enter(shot.t0 + INTRO_TITLE_START)], TITLE_SCALE)] : []
  return framePiece(ctx, hero, title, AIM)
}
