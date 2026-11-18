// Which set pieces the stage renderer has built at time t. Pieces far from t are disposed, so GPU memory stays bounded
// however long the video is. Pure: the same set and t always give the same indices.
import type { SetPiece, StageSet } from './types'

/** The most pieces built at once. */
export const MAX_ACTIVE = 4
/** How far beyond its window a piece stays built by default: it exists before it appears and outlives its last frame. */
const DEFAULT_MARGIN = 3000
/** The piece before the current one stays built this long into the current piece, as long as the director's PIECE_TAIL. */
const PREVIOUS_KEEP = 3000

/** How far t is from the piece's window: 0 inside it, otherwise the ms to its nearer edge. */
const distance = (p: SetPiece, t: number) => Math.max(0, p.start - t, t - p.end)

/**
 * Indices into `set.pieces` of the pieces to have built at `t`, sorted ascending: those whose window widened by
 * `marginMs` contains t, always with the piece on screen (the first whose window contains t) and, during that piece's
 * first PREVIOUS_KEEP ms, the piece before it. At most MAX_ACTIVE: the pieces nearest t are kept when trimming, and of
 * two equidistant pieces the upcoming one, which is needed soonest.
 */
export function activePieces(set: StageSet, t: number, marginMs = DEFAULT_MARGIN): number[] {
  const { pieces } = set
  const keep = new Set<number>()
  const current = pieces.findIndex((p) => distance(p, t) === 0)
  if (current >= 0) {
    keep.add(current)
    if (current > 0 && t < pieces[current].start + PREVIOUS_KEEP) keep.add(current - 1)
  }
  const nearest = [...pieces.keys()]
    .filter((i) => !keep.has(i) && distance(pieces[i], t) <= marginMs)
    .sort((a, b) => distance(pieces[a], t) - distance(pieces[b], t) || b - a)
  for (const i of nearest) {
    if (keep.size >= MAX_ACTIVE) break
    keep.add(i)
  }
  return [...keep].sort((a, b) => a - b)
}
