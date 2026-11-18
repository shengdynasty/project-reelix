import { describe, expect, it } from 'vitest'
import { activePieces } from './window'
import { directVideo } from './director'
import { fixturePlan } from './__fixtures__/plan'
import type { SetPiece, StageSet } from './types'

const plan = fixturePlan({ extraPoints: 4 })
const set = directVideo(plan, { hasImage: () => true })

describe('activePieces', () => {
  it('builds at most 4 pieces at any time of a long video', () => {
    expect(set.pieces.length).toBeGreaterThanOrEqual(13)
    for (let t = 0; t <= plan.total; t += 100) expect(activePieces(set, t).length).toBeLessThanOrEqual(4)
  })
  it('always includes the piece on screen', () => {
    for (let t = 0; t <= plan.total; t += 100) {
      const on = set.pieces.findIndex((p) => t >= p.start && t <= p.end)
      expect(activePieces(set, t)).toContain(on)
    }
  })
  it('is sorted', () => {
    const a = activePieces(set, plan.total / 2)
    expect([...a].sort((x, y) => x - y)).toEqual(a)
  })
})

/** A piece with only a window, for the rules the fixture's long, lightly overlapping pieces never trigger. */
const piece = (index: number, start: number, end: number): SetPiece => ({
  index,
  scene: index,
  kind: 'point',
  origin: [0, 0, 0],
  start,
  end,
  actors: [],
  camera: [],
  heroId: `${index}:hero:0`,
})
/** Eight pieces of 3000 ms, one starting every `step` ms. */
const every = (step: number): StageSet => ({ pieces: Array.from({ length: 8 }, (_, i) => piece(i, i * step, i * step + 3000)), total: 7 * step + 3000 })

describe('activePieces rules', () => {
  it('keeps the piece before the current one during its first 3000 ms, whatever the margin', () => {
    const s = every(4000)
    expect(activePieces(s, 7000, 0)).toEqual([1])
    expect(activePieces(s, 8000, 0)).toEqual([1, 2])
    expect(activePieces(s, 10999, 0)).toEqual([1, 2])
    expect(activePieces(s, 11000, 0)).toEqual([2])
  })
  it('widens every window by the margin, edges included', () => {
    const s = every(8000)
    expect(activePieces(s, 13000, 0)).toEqual([])
    expect(activePieces(s, 13000, 2000)).toEqual([1])
    expect(activePieces(s, 13000, 3000)).toEqual([1, 2])
  })
  it('keeps the 4 nearest when more are within the margin, the upcoming one of two equidistant pieces first', () => {
    expect(activePieces(every(1500), 7500)).toEqual([3, 4, 5, 6])
  })
  it('keeps the previous piece over nearer upcoming ones while the current piece is young', () => {
    expect(activePieces(every(1000), 6500)).toEqual([3, 4, 5, 6])
  })
  it('gives nothing for an empty set, and only the pieces within the margin outside the video', () => {
    expect(activePieces({ pieces: [], total: 0 }, 0)).toEqual([])
    expect(activePieces(every(4000), -2000)).toEqual([0])
    expect(activePieces(every(4000), 40000)).toEqual([])
  })
})
