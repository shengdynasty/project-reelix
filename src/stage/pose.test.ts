import { describe, expect, it } from 'vitest'
import { BAR_STAGGER } from '../motion/beats'
import { actorPose, columnRise, columnStart } from './pose'
import type { ActorSpec, Beat, Vec3 } from './types'

const actor: ActorSpec = {
  id: '0:hero:0',
  at: [1, 2, 3],
  scale: 1,
  data: { kind: 'icon', icon: 'drop', accent: false },
  beats: [
    { t: 1000, dur: 600, action: 'enter' },
    { t: 3000, dur: 400, action: 'pulse' },
  ],
}

describe('actorPose', () => {
  it('is invisible before it enters', () => expect(actorPose(actor, 999).opacity).toBe(0))
  it('is fully in place after its entrance', () => {
    const p = actorPose(actor, 1600)
    expect(p.opacity).toBe(1)
    expect(p.scale).toBeCloseTo(1)
    expect(p.position).toEqual([1, 2, 3])
  })
  it('swells mid pulse and returns to base after', () => {
    expect(actorPose(actor, 3200).scale).toBeGreaterThan(1.05)
    expect(actorPose(actor, 3400).scale).toBeCloseTo(1)
  })
  it('travels to a station and stays there', () => {
    const path: Vec3[] = [[0, 0, 0], [4, 0, 0], [4, 4, 0]]
    const token: ActorSpec = { ...actor, beats: [{ t: 0, dur: 1, action: 'enter' }, { t: 1000, dur: 500, action: 'travel', path, index: 2 }] }
    expect(actorPose(token, 1500).position).toEqual([5, 6, 3])
    expect(actorPose(token, 9000).position).toEqual([5, 6, 3])
  })
  it('is a pure function of t', () => expect(actorPose(actor, 1234)).toEqual(actorPose(actor, 1234)))
})

describe('actorPose beats', () => {
  const big: ActorSpec = { ...actor, scale: 2 }
  const withBeats = (beats: Beat[], base = actor): ActorSpec => ({ ...base, beats })
  const path: Vec3[] = [[0, 0, 0], [4, 0, 0], [4, 4, 0]]

  it('is visible from the start without an enter beat', () => {
    expect(actorPose(withBeats([]), 0).opacity).toBe(1)
    expect(actorPose(withBeats([{ t: 500, dur: 400, action: 'pulse' }]), 0).opacity).toBe(1)
  })
  it('enters from 60% size and 0.6 below, relative to its own scale and position', () => {
    const a = withBeats([{ t: 1000, dur: 600, action: 'enter' }], big)
    const start = actorPose(a, 1000)
    expect(start.opacity).toBe(0)
    expect(start.scale).toBeCloseTo(1.2)
    expect(start.position[0]).toBe(1)
    expect(start.position[1]).toBeCloseTo(1.4)
    expect(start.position[2]).toBe(3)
    const mid = actorPose(a, 1300)
    expect(mid.opacity).toBeGreaterThan(0)
    expect(mid.opacity).toBeLessThan(1)
    expect(mid.scale).toBeGreaterThan(1.2)
    expect(mid.scale).toBeLessThan(2)
    expect(mid.position[1]).toBeGreaterThan(1.4)
    expect(mid.position[1]).toBeLessThan(2)
    expect(actorPose(a, 1600).scale).toBe(2)
    expect(actorPose(a, 1600).position).toEqual([1, 2, 3])
  })
  it('fades out through an exit, shrinking to 90%, and stays gone', () => {
    const a = withBeats([{ t: 2000, dur: 400, action: 'exit' }], big)
    expect(actorPose(a, 1999).opacity).toBe(1)
    const mid = actorPose(a, 2200)
    expect(mid.opacity).toBeGreaterThan(0)
    expect(mid.opacity).toBeLessThan(1)
    expect(mid.scale).toBeGreaterThan(1.8)
    expect(mid.scale).toBeLessThan(2)
    expect(actorPose(a, 2400).opacity).toBe(0)
    expect(actorPose(a, 2400).scale).toBeCloseTo(1.8)
    expect(actorPose(a, 60000).opacity).toBe(0)
  })
  it('focus glows within 200 ms, holds, and fades over 300 ms after dur', () => {
    const a = withBeats([{ t: 1000, dur: 1000, action: 'focus' }])
    expect(actorPose(a, 999).glow).toBe(0)
    const rising = actorPose(a, 1100).glow
    expect(rising).toBeGreaterThan(0)
    expect(rising).toBeLessThan(1)
    expect(actorPose(a, 1200).glow).toBe(1)
    expect(actorPose(a, 1999).glow).toBe(1)
    const falling = actorPose(a, 2150).glow
    expect(falling).toBeGreaterThan(0)
    expect(falling).toBeLessThan(1)
    expect(actorPose(a, 2300).glow).toBe(0)
    expect(actorPose(a, 9000).glow).toBe(0)
  })
  it('highlight raises the glow and keeps it', () => {
    const a = withBeats([{ t: 1000, dur: 300, action: 'highlight' }])
    const mid = actorPose(a, 1150).glow
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(actorPose(a, 1300).glow).toBe(1)
    expect(actorPose(a, 9000).glow).toBe(1)
  })
  it('grows to a multiplier of its own scale and holds', () => {
    const a = withBeats([{ t: 1000, dur: 500, action: 'grow', to: 1.5 }], big)
    expect(actorPose(a, 1000).scale).toBe(2)
    const mid = actorPose(a, 1250).scale
    expect(mid).toBeGreaterThan(2)
    expect(mid).toBeLessThan(3)
    expect(actorPose(a, 1500).scale).toBeCloseTo(3)
    expect(actorPose(a, 9000).scale).toBeCloseTo(3)
  })
  it('counts up linearly and ends at 1', () => {
    const a = withBeats([{ t: 1000, dur: 1000, action: 'count' }])
    expect(actorPose(a, 999).progress).toBe(0)
    expect(actorPose(a, 1250).progress).toBeCloseTo(0.25)
    expect(actorPose(a, 1500).progress).toBeCloseTo(0.5)
    expect(actorPose(a, 5000).progress).toBe(1)
  })
  it('spins one full turn about y and holds', () => {
    const a = withBeats([{ t: 1000, dur: 1000, action: 'spin' }])
    expect(actorPose(a, 1500).rotation).toEqual([0, Math.PI, 0])
    expect(actorPose(a, 5000).rotation).toEqual([0, 2 * Math.PI, 0])
  })
  it('travels along the path through intermediate stations', () => {
    // Station 0 to 2 is 8 units with the bend at station 1, so halfway along the token sits on the corner.
    const a = withBeats([{ t: 1000, dur: 1000, action: 'travel', path, index: 2 }])
    const corner = actorPose(a, 1500).position
    expect(corner[0]).toBeCloseTo(5)
    expect(corner[1]).toBeCloseTo(2)
    expect(corner[2]).toBe(3)
  })
  it('chains travels from the station it last reached', () => {
    const a = withBeats([
      { t: 1000, dur: 500, action: 'travel', path, index: 1 },
      { t: 2000, dur: 500, action: 'travel', path, index: 2 },
    ])
    const mid1 = actorPose(a, 1250).position
    expect(mid1[0]).toBeGreaterThan(1)
    expect(mid1[0]).toBeLessThan(5)
    expect(mid1[1]).toBeCloseTo(2)
    expect(actorPose(a, 1500).position).toEqual([5, 2, 3])
    const mid2 = actorPose(a, 2250).position
    expect(mid2[0]).toBeCloseTo(5)
    expect(mid2[1]).toBeGreaterThan(2)
    expect(mid2[1]).toBeLessThan(6)
    expect(actorPose(a, 2500).position).toEqual([5, 6, 3])
  })
  it('later beats read the pose earlier beats produced', () => {
    const a = withBeats([
      { t: 1000, dur: 500, action: 'grow', to: 2 },
      { t: 3000, dur: 400, action: 'pulse' },
    ])
    expect(actorPose(a, 3200).scale).toBeCloseTo(2 * 1.12)
  })
  it('applies beats in time order however they are listed', () => {
    const sorted = withBeats([{ t: 1000, dur: 500, action: 'grow', to: 2 }, { t: 3000, dur: 400, action: 'pulse' }])
    const shuffled = withBeats([{ t: 3000, dur: 400, action: 'pulse' }, { t: 1000, dur: 500, action: 'grow', to: 2 }])
    for (const t of [500, 1250, 3200, 5000]) expect(actorPose(shuffled, t)).toEqual(actorPose(sorted, t))
  })
  it('does not mutate the actor', () => {
    const beats: Beat[] = [{ t: 3000, dur: 400, action: 'pulse' }, { t: 1000, dur: 600, action: 'enter' }]
    const a = withBeats(beats)
    actorPose(a, 1300)
    expect(a.beats.map((b) => b.t)).toEqual([3000, 1000])
    expect(a.at).toEqual([1, 2, 3])
  })
})

describe('columnRise', () => {
  const entrance: Beat = { t: 1000, dur: 700, action: 'enter' }
  it('raises bar column i from BAR_STAGGER x i after the entrance, over its duration, so each column lands with its pop', () => {
    expect(columnStart(entrance, 0)).toBe(1000)
    expect(columnStart(entrance, 3)).toBe(1000 + 3 * BAR_STAGGER)
    expect(columnRise(entrance, 0, 900)).toBe(0)
    expect(columnRise(entrance, 3, columnStart(entrance, 3))).toBe(0)
    expect(columnRise(entrance, 3, columnStart(entrance, 3) + 150)).toBeGreaterThan(0.5)
    expect(columnRise(entrance, 3, columnStart(entrance, 3) + 700)).toBe(1)
  })
})
