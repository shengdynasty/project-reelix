import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { directVideo } from './director'
import { fixturePlan } from './__fixtures__/plan'
import { pieceOrigin, FOV, HOLD_DISTANCE } from './layout'
import { defaultCameraKeys } from './camera'
import { TRANSITION_LEAD } from '../motion/beats'
import type { CameraKey, SetPiece, Vec3 } from './types'

const plan = fixturePlan()
const set = directVideo(plan, { hasImage: () => true })

describe('directVideo', () => {
  it('makes one piece per scene with shots, plus one for the end card', () => {
    const endCard = plan.shots.some((s) => s.kind === 'end') ? 1 : 0
    expect(set.pieces.length).toBe(new Set(plan.shots.map((s) => s.scene)).size + endCard)
  })
  it('covers the whole video with overlapping windows', () => {
    expect(set.pieces[0].start).toBeLessThanOrEqual(0)
    expect(set.pieces.at(-1)!.end).toBeGreaterThanOrEqual(plan.total)
    set.pieces.slice(1).forEach((p, i) => expect(p.start).toBeLessThanOrEqual(set.pieces[i].end))
  })
  it('places pieces with pieceOrigin', () => set.pieces.forEach((p, i) => expect(p.origin).toEqual(pieceOrigin(i))))
  it('gives every piece a hero that enters by its first shot', () =>
    set.pieces.forEach((p) => {
      const hero = p.actors.find((a) => a.id === p.heroId)!
      const first = plan.shots.find((s) => s.scene === p.scene && (p.kind !== 'end' || s.kind === 'end'))!
      expect(hero.beats.find((b) => b.action === 'enter')!.t).toBeLessThanOrEqual(first.start)
    }))
  it('keeps camera keys sorted in time', () =>
    set.pieces.forEach((p) => p.camera.slice(1).forEach((k, i) => expect(k.t).toBeGreaterThanOrEqual(p.camera[i].t))))
  it('is deterministic', () => expect(directVideo(plan, { hasImage: () => true })).toEqual(set))
})

/** The shots of a piece: its scene's shots, the end card alone when the piece is the end card and without it otherwise. */
const shotsOf = (p: SetPiece) => plan.shots.filter((s) => s.scene === p.scene && (s.kind === 'end') === (p.kind === 'end'))
const heroOf = (p: SetPiece) => p.actors.find((a) => a.id === p.heroId)!
const sum = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const expectVec = (got: Vec3, want: Vec3) => want.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 6))

/** Whether `point` (world) projects inside a 16:9 frame seen from `key`. */
function inFrame(key: CameraKey, point: Vec3): boolean {
  const cam = new PerspectiveCamera(key.fov, 16 / 9, 0.1, 500)
  cam.position.set(...key.position)
  cam.lookAt(...key.target)
  cam.updateMatrixWorld()
  const v = new Vector3(...point).project(cam)
  return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1
}

describe('directVideo skeleton rules', () => {
  it('gives the end card its own piece after the summary, in the same scene', () => {
    const [summary, end] = set.pieces.slice(-2)
    expect(summary.kind).toBe('summary')
    expect(end.kind).toBe('end')
    expect(end.scene).toBe(summary.scene)
  })
  it('opens a window a transition before the first shot builds and closes it 3 s after the last shot, within the video', () =>
    set.pieces.forEach((p) => {
      const shots = shotsOf(p)
      const first = shots[0]
      const last = shots.at(-1)!
      expect(p.start).toBe(Math.max(0, first.t0 - first.transition))
      expect(p.end).toBe(Math.min(plan.total, last.end + 3000))
    }))
  it('flies from the previous piece in the window of the 2D camera move and its whoosh', () =>
    set.pieces.slice(1).forEach((p, i) => {
      const first = shotsOf(p)[0]
      const from = set.pieces[i].camera.at(-1)!
      const [flight, arrival] = p.camera
      expect(flight.t).toBeCloseTo(first.start - first.transition * TRANSITION_LEAD, 6)
      expect(flight).toEqual({ ...from, t: flight.t })
      expect(arrival.t).toBeCloseTo(first.start + first.transition * (1 - TRANSITION_LEAD), 6)
    }))
  it('holds about HOLD_DISTANCE from what it looks at, with the hero in frame at every hold key, and leaves after it arrives', () =>
    set.pieces.forEach((p, i) => {
      const hero = sum(p.origin, heroOf(p).at)
      const [arrival, ...rest] = p.camera.slice(i === 0 ? 0 : 1)
      for (const key of [arrival, ...rest]) {
        const d = dist(key.position, key.target)
        expect(d).toBeGreaterThan(HOLD_DISTANCE * 0.85)
        expect(d).toBeLessThan(HOLD_DISTANCE * 1.05)
        expect(key.fov).toBe(FOV)
        expect(key.focus).toBeCloseTo(d, 6)
        expect(inFrame(key, hero)).toBe(true)
      }
      expect(rest.length).toBeGreaterThan(0)
      expect(rest.at(-1)!.t).toBeGreaterThan(arrival.t)
    }))
  it('keeps the keys of all pieces in order as one timeline', () => {
    const keys = set.pieces.flatMap((p) => p.camera)
    keys.slice(1).forEach((k, i) => expect(k.t).toBeGreaterThanOrEqual(keys[i].t))
  })
  it('never gives an actor two enter beats', () =>
    set.pieces.forEach((p) => p.actors.forEach((a) => expect(a.beats.filter((b) => b.action === 'enter').length).toBeLessThanOrEqual(1))))
})

describe('defaultCameraKeys', () => {
  const piece = { origin: [14, 2.2, -3] as Vec3, start: 1000, end: 9000 }
  it('gives one key when the hold has no length', () => {
    const keys = defaultCameraKeys(piece, [0, 0, 0], 2000, 2000)
    expect(keys).toHaveLength(1)
    expect(keys[0].t).toBe(2000)
  })
  it('keeps the hold inside the piece window', () => {
    const [a, b] = defaultCameraKeys(piece, [0, 1, 0], 500, 12000)
    expect(a.t).toBe(1000)
    expect(b.t).toBe(9000)
    expectVec(a.target, [14, 3.2, -3])
  })
})
