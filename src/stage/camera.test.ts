import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { cameraKey, cameraPose } from './camera'
import { directVideo } from './director'
import { fixturePlan } from './__fixtures__/plan'
import { easeState } from '../render/easing'
import { FOV, HOLD_DISTANCE } from './layout'
import type { CameraKey, CameraPose, SetPiece, StageSet, Vec3 } from './types'

const plan = fixturePlan()
const set = directVideo(plan, { hasImage: () => true })
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('cameraPose', () => {
  it('never jumps between 16 ms samples', () => {
    for (let t = 0; t < plan.total; t += 16) expect(dist(cameraPose(set, t).position, cameraPose(set, t + 16).position)).toBeLessThan(1.5)
  })
  it('keeps the hero inside the frame while its first shot is on screen', () =>
    set.pieces.forEach((p) => {
      const hero = p.actors.find((a) => a.id === p.heroId)!
      const first = plan.shots.find((s) => s.scene === p.scene && (p.kind !== 'end' || s.kind === 'end'))!
      const c = cameraPose(set, (first.start + first.end) / 2)
      const cam = new PerspectiveCamera(c.fov, 16 / 9, 0.1, 500)
      cam.position.set(...c.position)
      cam.lookAt(...c.target)
      cam.updateMatrixWorld()
      const v = new Vector3(p.origin[0] + hero.at[0], p.origin[1] + hero.at[1], p.origin[2] + hero.at[2]).project(cam)
      expect(Math.abs(v.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(v.y)).toBeLessThanOrEqual(1)
    }))
  it('focuses on the target', () => {
    const c = cameraPose(set, plan.total / 2)
    expect(Math.abs(c.focus - dist(c.position, c.target)) / dist(c.position, c.target)).toBeLessThan(0.05)
  })
  it('does not roll with reduced motion', () => {
    for (let t = 0; t < plan.total; t += 250) expect(cameraPose(set, t, { reducedMotion: true }).roll).toBe(0)
  })
})

/** A piece holding only `camera`; the other fields do not matter to cameraPose. */
const pieceOf = (index: number, camera: CameraKey[]): SetPiece =>
  ({ index, scene: index, kind: 'point', origin: [0, 0, 0], start: 0, end: 0, actors: [], camera, heroId: '' })
const setOf = (...pieces: CameraKey[][]): StageSet => ({ pieces: pieces.map((camera, i) => pieceOf(i, camera)), total: 10000 })
/** easeState reads a float32 lookup table, so eased values carry about 1e-7 of noise: 5 places is as close as they come. */
const expectVec = (got: Vec3, want: Vec3) => want.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 5))
const finite = (pose: CameraPose) => [...pose.position, ...pose.target, pose.fov, pose.focus, pose.roll].every(Number.isFinite)
/** The pose of a camera held still on `key`. */
const held = ({ position, target, fov, focus }: CameraKey): CameraPose => ({ position, target, fov, focus, roll: 0 })

describe('cameraPose on a hand made timeline', () => {
  it('holds the first key before it and the last key after it', () => {
    const first = cameraKey(1000, [0, 1, 10], [0, 0, 0])
    const last = cameraKey(2000, [3, 1, 9], [3, 0, 0])
    const timeline = setOf([first, last])
    for (const t of [-500, 0, 1000]) expect(cameraPose(timeline, t)).toEqual(held(first))
    for (const t of [2000, 2001, 99999]) expect(cameraPose(timeline, t)).toEqual(held(last))
  })
  it('moves linearly between keys more than 1000 ms apart, a slow dolly', () => {
    const a = { ...cameraKey(0, [0, 0, 10], [0, 0, 0]), fov: 30, focus: 10 }
    const b = { ...cameraKey(4000, [4, 0, 6], [4, 0, 0]), fov: 50, focus: 6 }
    const timeline = setOf([a, b])
    for (const k of [0.25, 0.5, 0.75]) {
      const pose = cameraPose(timeline, 4000 * k)
      expectVec(pose.position, [4 * k, 0, 10 - 4 * k])
      expectVec(pose.target, [4 * k, 0, 0])
      expect(pose.fov).toBeCloseTo(30 + 20 * k, 6)
      expect(pose.focus).toBeCloseTo(10 - 4 * k, 6)
      expect(pose.roll).toBe(0)
    }
  })
  it('eases from state to state between keys 1000 ms apart or less', () => {
    const timeline = setOf([cameraKey(0, [0, 0, 10], [0, 0, 0]), cameraKey(1000, [4, 0, 10], [4, 0, 0])])
    expect(cameraPose(timeline, 250).position[0]).toBeCloseTo(4 * easeState(0.25), 5)
    expect(cameraPose(timeline, 250).position[0]).toBeLessThan(1)
    expect(cameraPose(timeline, 500).position[0]).toBeCloseTo(2, 5)
    expect(cameraPose(timeline, 250).target[0]).toBeCloseTo(4 * easeState(0.25), 5)
  })
  it('lifts and rolls through a flight: keys more than 6 units apart within 1200 ms', () => {
    const timeline = setOf([cameraKey(0, [0, 0, 10], [0, 0, 0]), cameraKey(800, [14, 0, 10], [14, 0, 0])])
    const mid = cameraPose(timeline, 400)
    expect(mid.position[1]).toBeCloseTo(1.2, 6)
    expect(mid.roll).toBeCloseTo(0.03, 6)
    expectVec(mid.target, [7, 0, 0])
    const quarter = cameraPose(timeline, 200)
    expect(quarter.position[1]).toBeCloseTo(1.2 * Math.sin(Math.PI / 4), 6)
    expect(quarter.roll).toBeCloseTo(0.03 * Math.sin(Math.PI / 4), 6)
    for (const t of [0, 800]) {
      expect(cameraPose(timeline, t).position[1]).toBeCloseTo(0, 6)
      expect(cameraPose(timeline, t).roll).toBeCloseTo(0, 6)
    }
  })
  it('keeps slow or short moves level', () => {
    const slow = setOf([cameraKey(0, [0, 0, 10], [0, 0, 0]), cameraKey(1201, [14, 0, 10], [14, 0, 0])])
    const short = setOf([cameraKey(0, [0, 0, 10], [0, 0, 0]), cameraKey(800, [6, 0, 10], [6, 0, 0])])
    const dolly = setOf([cameraKey(0, [0, 0.6, 10], [0, 0, 0]), cameraKey(500, [0.6, 0.5, 9], [0, 0, 0])])
    for (const timeline of [slow, short, dolly]) {
      const [a, b] = timeline.pieces[0].camera
      for (const k of [0.25, 0.5, 0.75]) {
        const pose = cameraPose(timeline, b.t * k)
        expect(pose.roll).toBe(0)
        expect(pose.position[1]).toBeGreaterThanOrEqual(Math.min(a.position[1], b.position[1]))
        expect(pose.position[1]).toBeLessThanOrEqual(Math.max(a.position[1], b.position[1]))
        expect(pose).toEqual(cameraPose(timeline, b.t * k, { reducedMotion: true }))
      }
    }
  })
  it('shortens and softens a flight under reduced motion: it holds through the first half, then eases level over the second', () => {
    const timeline = setOf([cameraKey(0, [0, 0, 10], [0, 0, 0]), cameraKey(800, [14, 0, 10], [14, 0, 0])])
    const at = (t: number) => cameraPose(timeline, t, { reducedMotion: true })
    for (const t of [0, 200, 400]) expectVec(at(t).position, [0, 0, 10])
    expectVec(at(600).position, [7, 0, 10])
    expectVec(at(500).position, [14 * easeState(0.25), 0, 10])
    expectVec(at(800).position, [14, 0, 10])
    for (const t of [100, 300, 500, 700]) expect(at(t).roll).toBe(0)
    expect(cameraPose(timeline, 400, { reducedMotion: false })).toEqual(cameraPose(timeline, 400))
  })
  it('treats a zero length segment as a hold, with no NaN and no jump', () => {
    const target: Vec3 = [0, 0, 0]
    const departure = cameraKey(3000, [0.6, 0.5, 9], target)
    const flight: CameraKey = { ...departure, position: [...departure.position], target }
    const timeline = setOf(
      [cameraKey(0, [0, 0.6, 10], target), departure],
      [flight, cameraKey(3780, [14, 0.6, 10], [14, 0, 0])],
    )
    expect(cameraPose(timeline, 3000)).toEqual(held(departure))
    expect(dist(cameraPose(timeline, 2999).position, cameraPose(timeline, 3000).position)).toBeLessThan(0.01)
    expect(dist(cameraPose(timeline, 3000).position, cameraPose(timeline, 3001).position)).toBeLessThan(0.01)
    for (let t = -100; t <= 4000; t += 16) expect(finite(cameraPose(timeline, t))).toBe(true)
  })
  it('settles on the later of two keys at one time', () => {
    const timeline = setOf([cameraKey(0, [0, 0, 10], [0, 0, 0]), cameraKey(1000, [2, 0, 10], [2, 0, 0])], [cameraKey(1000, [3, 0, 10], [3, 0, 0])])
    expectVec(cameraPose(timeline, 1000).position, [3, 0, 10])
    expectVec(cameraPose(timeline, 5000).position, [3, 0, 10])
    expect(finite(cameraPose(timeline, 1000))).toBe(true)
  })
  it('reads the keys without changing them and hands out fresh arrays', () => {
    const before = structuredClone(set)
    const poses = [0, 16, 2500, plan.total / 2, plan.total, plan.total + 5000].map((t) => cameraPose(set, t))
    poses.forEach((pose) => {
      pose.position[1] += 100
      pose.target[1] += 100
    })
    expect(set).toEqual(before)
  })
  it('gives the same pose for a time whatever order times are asked in', () => {
    const times = Array.from({ length: 200 }, (_, i) => (i * plan.total) / 200)
    const forward = times.map((t) => cameraPose(set, t))
    const backward = [...times].reverse().map((t) => cameraPose(set, t)).reverse()
    expect(backward).toEqual(forward)
  })
  it('sits at the default hold on the world origin when the set has no keys', () => {
    const pose = cameraPose({ pieces: [], total: 0 }, 0)
    expectVec(pose.position, [0, 0.6, HOLD_DISTANCE])
    expectVec(pose.target, [0, 0, 0])
    expect(pose.fov).toBe(FOV)
    expect(pose.roll).toBe(0)
  })
})
