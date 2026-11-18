// The director turns the motion plan into a StageSet: one set piece per scene placed along the world, each with its
// actors and camera keys. It is pure data from pure functions, so the same plan always gives the same set.
import { contentWords } from '../input/parseText'
import type { MotionPlan } from '../motion/plan'
import { flightStart, nudgeKeys } from './camera'
import { pieceOrigin } from './layout'
import { buildPiece, type PieceContext } from './pieces'
import { groupShots } from './timing'
import type { SetPiece, StageSet } from './types'

// The window and grouping rules live in timing.ts so the piece builders can share them without importing the director
// (the summary piece reads the first shot of each earlier piece); they stay available here for callers of the
// skeleton's interface.
export { PIECE_TAIL, groupShots, pieceWindow } from './timing'

export interface DirectOptions {
  /** Whether the photo with this id is available, for pieces that can show one. */
  hasImage: (imageId: string) => boolean
  /** Not read here: the camera pose takes the preference directly. */
  reducedMotion?: boolean
}

/**
 * Turns a motion plan into set pieces placed along the world, each built by its kind's builder. Every piece after
 * the first opens with a copy of the previous piece's last key at its first shot's flight start, so the flight between
 * pieces happens in the window of the 2D camera move and its whoosh. Builders get the heroes of the pieces before
 * theirs, for pieces that bring them back, and the title's content words, so labels do not repeat the topic.
 */
export function directVideo(plan: MotionPlan, opts: DirectOptions): StageSet {
  const groups = groupShots(plan.shots)
  const topicWords = contentWords(plan.storyboard.title)
  const heroes: PieceContext['heroes'] = []
  const pieces: SetPiece[] = []
  groups.forEach((shots, index) => {
    const scene = shots[0].scene
    const piece = buildPiece({
      plan,
      scene: plan.storyboard.scenes[scene],
      index,
      shots,
      words: plan.words[scene],
      origin: pieceOrigin(index),
      hasImage: opts.hasImage,
      heroes: [...heroes],
      topicWords,
    })
    piece.camera = nudgeKeys(piece.camera, shots)
    const from = pieces.at(-1)?.camera.at(-1)
    if (from) piece.camera.unshift({ ...from, t: flightStart(shots[0]), position: [...from.position], target: [...from.target] })
    pieces.push(piece)
    const hero = piece.actors.find((a) => a.id === piece.heroId)
    if (hero) heroes.push({ piece: index, actor: hero })
  })
  return { pieces, total: plan.total }
}
