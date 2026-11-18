// Acceptance measures that need no WebGL, used by the lab's accept(): how far each sound and each named word sits
// from the motion on the stage that should carry it.
import type { MotionPlan } from '../motion/plan'
import { isQuickMove } from './camera'
import { columnStart } from './pose'
import type { Beat, StageSet } from './types'

/** How long an entrance or a change takes to show: the entrance ease covers about 95% of its way in its first 300 ms. */
export const SHOW_MS = 300

type Span = [number, number]

/** When a beat visibly happens: a travel or a count as it lands, anything else as it starts. */
function shows(b: Beat): Span {
  const end = b.t + Math.max(0, b.dur)
  if (b.action === 'travel') return [end, end + SHOW_MS]
  if (b.action === 'count') return [Math.max(b.t, end - SHOW_MS), end]
  return [b.t, b.t + Math.min(Math.max(0, b.dur), SHOW_MS)]
}


/** Distance in ms from `t` to the nearest span, 0 inside one, Infinity with none. */
const gap = (t: number, spans: Span[]) => spans.reduce((best, [a, b]) => Math.min(best, t < a ? a - t : t > b ? t - b : 0), Infinity)

/**
 * The largest distance in ms between a sound or a named word and the motion that carries it: pops, chimes, impacts,
 * the sting, item cues and count landings against the moments beats show (each bar column from its own rise), ticks
 * against the counts they run through, whooshes against quick camera moves (flights and nudges). At most 150 passes the plan's acceptance;
 * Infinity means some sound has nothing at all to go with.
 */
export function cueSkew(plan: MotionPlan, set: StageSet): number {
  const moments: Span[] = []
  const counts: Span[] = []
  for (const p of set.pieces) {
    for (const a of p.actors) {
      for (const b of a.beats) {
        moments.push(shows(b))
        if (b.action === 'count') counts.push([b.t, b.t + b.dur])
        if (b.action === 'enter' && a.data.kind === 'bars') for (let i = 1; i < a.data.values.length; i++) moments.push(shows({ ...b, t: columnStart(b, i) }))
      }
    }
  }
  // Every piece's keys in order form the camera's one timeline (cameraPose reads them so).
  const keys = set.pieces.flatMap((p) => p.camera)
  // A whoosh goes with a quick camera move (a flight or a nudge); a hold's slow dolly would excuse a whoosh anywhere.
  const moves: Span[] = []
  for (let i = 1; i < keys.length; i++) if (isQuickMove(keys[i - 1], keys[i])) moves.push([keys[i - 1].t, keys[i].t])
  const skews = plan.sfx.map((e) => gap(e.t, e.kind === 'tick' ? counts : e.kind === 'whoosh' ? moves : moments))
  for (const s of plan.shots) {
    for (const c of s.cues) skews.push(gap(c, moments))
    if (s.countEnd !== null) skews.push(gap(s.countEnd, moments))
  }
  return Math.max(0, ...skews)
}
