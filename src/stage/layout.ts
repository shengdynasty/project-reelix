import type { Vec3 } from './types'

/** World units between consecutive piece origins along x. */
export const PIECE_SPACING = 14
/** Camera distance from a piece's origin while the camera holds on that piece. */
export const HOLD_DISTANCE = 10
/** Vertical field of view, degrees. */
export const FOV = 35
/** World units covered by one pixel of a 1080 px tall frame seen from HOLD_DISTANCE. */
export const WORLD_PER_PX = (2 * HOLD_DISTANCE * Math.tan((FOV / 2) * (Math.PI / 180))) / 1080

// Fixed repeating offsets, like Y_PATTERN in src/motion/plan.ts, so consecutive pieces step up and down and
// nearer and farther instead of sitting on one line. Both start at 0 so piece 0 sits at the world origin.
const Y_PATTERN = [0, 2.2, -1.6, 1.4, -2.4, 0.8]
const Z_PATTERN = [0, -3, 2, -2, 3, -1]

/** World position of piece `index`: x advances PIECE_SPACING per piece, y and z follow the patterns. */
export function pieceOrigin(index: number): Vec3 {
  return [index * PIECE_SPACING, Y_PATTERN[index % Y_PATTERN.length], Z_PATTERN[index % Z_PATTERN.length]]
}
