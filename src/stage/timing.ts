// When a piece can be on screen and which shots make a piece. Shared by the director and the piece builders, so that
// neither imports the other.
import type { Shot } from '../motion/plan'

/** A piece can stay on screen this long after its last shot ends, receding as the camera flies on. */
export const PIECE_TAIL = 3000

/**
 * The global ms window in which a piece made of `shots` can be on screen: from a transition before its first shot
 * starts building to PIECE_TAIL after its last shot ends, within the video.
 */
export function pieceWindow(shots: Shot[], total: number): { start: number; end: number } {
  const first = shots[0]
  const last = shots[shots.length - 1]
  return { start: Math.max(0, first.t0 - first.transition), end: Math.min(total, last.end + PIECE_TAIL) }
}

/** Groups the shots into pieces: the shots of one scene together, except that an end shot is a piece of its own. */
export function groupShots(shots: Shot[]): Shot[][] {
  const groups: Shot[][] = []
  for (const shot of shots) {
    const current = groups.at(-1)
    if (current && current[0].scene === shot.scene && current[0].kind !== 'end' && shot.kind !== 'end') current.push(shot)
    else groups.push([shot])
  }
  return groups
}
