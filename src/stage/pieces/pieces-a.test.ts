import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { directVideo } from '../director'
import { fixturePlan, fixtureStoryboard } from '../__fixtures__/plan'
import { buildTimeline, estimateSpeechMs } from '../../model/timing'
import type { Scene, Storyboard } from '../../model/storyboard'
import { buildPlan } from '../../motion/plan'
import type { MotionPlan, ShotKind } from '../../motion/plan'
import { COMPARE_DELTA, COMPARE_POP, INTRO_TITLE_START, STAT_COUNT_START } from '../../motion/beats'
import type { ActorSpec, CameraKey, SetPiece, Vec3 } from '../types'
import { deltaText } from './compare'
import { arcPosition } from './points'

const plan = fixturePlan()
const set = directVideo(plan, { hasImage: (id) => id === 'img1' })
const piece = (kind: ShotKind) => set.pieces.find((p) => p.kind === kind)!

describe('set pieces A', () => {
  it('points: one icon and one label per item, each entering at its shot', () => {
    const p = piece('point')
    const shots = plan.shots.filter((s) => s.scene === p.scene)
    const icons = p.actors.filter((a) => a.data.kind === 'icon')
    expect(icons).toHaveLength(shots.length)
    icons.forEach((a, k) => expect(a.beats.find((b) => b.action === 'enter')!.t).toBe(shots[k].t0))
    expect(p.actors.filter((a) => a.data.kind === 'label').length).toBeLessThanOrEqual(shots.length)
  })
  it('labels stay short everywhere', () =>
    set.pieces.forEach((p) =>
      p.actors.forEach((a) => {
        if (a.data.kind !== 'label') return
        const limit = a.data.size === 'title' ? 8 : 4
        expect(a.data.text.split(/\s+/).length).toBeLessThanOrEqual(limit)
      })))
  it('stat: a percent lights 42 of 100 cells', () =>
    expect(piece('stat').actors.find((a) => a.data.kind === 'pictogram')!.data).toEqual({ kind: 'pictogram', lit: 42, total: 100 }))
  it('image: shows the photo when it exists', () => expect(piece('image').actors.some((a) => a.data.kind === 'photo')).toBe(true))
  it('image: falls back to an icon when the photo is missing', () => {
    const p = directVideo(plan, { hasImage: () => false }).pieces.find((x) => x.kind === 'image')!
    expect(p.actors.some((a) => a.data.kind === 'photo')).toBe(false)
    expect(p.actors.some((a) => a.data.kind === 'icon')).toBe(true)
  })
  it('definition: the term lands with the second pop', () => {
    const p = piece('definition')
    const shot = plan.shots.find((s) => s.scene === p.scene)!
    const term = p.actors.find((a) => a.data.kind === 'label' && a.data.size === 'term')!
    expect(term.beats[0].t).toBe(shot.t0 + 840)
  })
})

/** The shots of a piece: its scene's shots, the end card alone when the piece is the end card and without it otherwise. */
const shotsOf = (p: SetPiece, from: MotionPlan = plan) => from.shots.filter((s) => s.scene === p.scene && (s.kind === 'end') === (p.kind === 'end'))
const heroOf = (p: SetPiece) => p.actors.find((a) => a.id === p.heroId)!
const enterOf = (a: ActorSpec) => a.beats.find((b) => b.action === 'enter')!
const labels = (p: SetPiece) => p.actors.filter((a) => a.data.kind === 'label')
const texts = (p: SetPiece) => labels(p).map((a) => (a.data.kind === 'label' ? a.data.text : ''))
const sum = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

/** The fixture storyboard with scene `at` replaced, planned like the fixture. */
function planWith(scene: Scene, at = 1): MotionPlan {
  const sb: Storyboard = fixtureStoryboard()
  sb.scenes.splice(at, 1, scene)
  const tl = buildTimeline(sb, sb.scenes.map((s) => estimateSpeechMs(s.narration)))
  return buildPlan(sb, tl, [])
}
const pieceOf = (custom: MotionPlan, kind: ShotKind, hasImage: (id: string) => boolean = () => true) =>
  directVideo(custom, { hasImage }).pieces.find((p) => p.kind === kind)!

/** Whether `point` (world) projects inside a 16:9 frame seen from `key`. */
function inFrame(key: CameraKey, point: Vec3): boolean {
  const cam = new PerspectiveCamera(key.fov, 16 / 9, 0.1, 500)
  cam.position.set(...key.position)
  cam.lookAt(...key.target)
  cam.updateMatrixWorld()
  const v = new Vector3(...point).project(cam)
  return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1
}

describe('set pieces A: title', () => {
  const p = piece('intro')
  const shot = shotsOf(p)[0]
  it('uses the first image scene photo as the hero when it exists, entering at the start', () => {
    const hero = heroOf(p)
    expect(hero.data).toEqual({ kind: 'photo', imageId: 'img1', fallbackIcon: shot.icon, aspect: 16 / 9 })
    expect(enterOf(hero).t).toBe(shot.t0)
  })
  it('falls back to the scene icon when no photo is available', () => {
    const hero = heroOf(pieceOf(plan, 'intro', () => false))
    expect(hero.data).toEqual({ kind: 'icon', icon: shot.icon, accent: true })
  })
  it('shows the title as a title label landing with the title words', () => {
    const title = labels(p).find((a) => a.data.kind === 'label' && a.data.size === 'title')!
    expect(title.data).toEqual({ kind: 'label', text: 'Why is the sky blue?', size: 'title' })
    expect(enterOf(title).t).toBe(shot.t0 + INTRO_TITLE_START)
  })
  it('cuts a long title to eight words that still read as a name', () => {
    const scene = fixtureStoryboard().scenes[0]
    const custom = planWith({ ...scene, visual: { kind: 'title', title: 'The surprising reasons the daytime sky looks blue to all of us', subtitle: '' } }, 0)
    const title = labels(pieceOf(custom, 'intro')).find((a) => a.data.kind === 'label' && a.data.size === 'title')!
    expect(title.data).toMatchObject({ text: 'Surprising reasons the daytime sky looks blue' })
  })
})

describe('set pieces A: definition', () => {
  const p = piece('definition')
  const shot = shotsOf(p)[0]
  it('has the icon hero entering with the first pop', () => {
    expect(heroOf(p).data).toEqual({ kind: 'icon', icon: shot.icon, accent: true })
    expect(enterOf(heroOf(p)).t).toBe(shot.t0)
  })
  it('shortens the term and names what it is in a small label', () => {
    expect(texts(p)).toEqual(['Diffuse sky radiation', 'Sunlight'])
    const small = labels(p).find((a) => a.data.kind === 'label' && a.data.size === 'small')!
    expect(enterOf(small).t).toBe(shot.t0 + 1100)
  })
  it('leaves the small label out when the meaning gives none', () => {
    const custom = planWith({
      id: 'd',
      priority: 0.8,
      narration: 'It is what it is, and that is all there is to it, nothing more and nothing less to say.',
      visual: { kind: 'definition', term: 'It', link: 'is', meaning: 'it is' },
    })
    expect(labels(pieceOf(custom, 'definition')).map((a) => a.data.kind === 'label' && a.data.size)).toEqual(['term'])
  })
})

describe('set pieces A: points', () => {
  const p = piece('point')
  const shots = shotsOf(p)
  it('puts the items on an arc from x -4 to 4 that recedes at the ends, the first icon being the hero', () => {
    const icons = p.actors.filter((a) => a.data.kind === 'icon')
    expect(icons.map((a) => a.at[0])).toEqual([-4, 0, 4])
    expect(icons[0].at[2]).toBeLessThan(icons[1].at[2])
    expect(icons[2].at[2]).toBe(icons[0].at[2])
    expect(p.heroId).toBe(icons[0].id)
    expect(icons.map((a) => a.data.kind === 'icon' && a.data.icon)).toEqual(shots.map((s) => s.icon))
  })
  it('labels each item with labelFor and enters the label with its icon', () => {
    expect(texts(p)).toEqual(['Sunlight', 'Air scatters blue', 'Sunsets'])
    labels(p).forEach((a, k) => {
      expect(enterOf(a).t).toBe(shots[k].t0)
      expect(a.at[0]).toBe([-4, 0, 4][k])
    })
  })
  it('spreads two or four items evenly along the arc, the middle at depth 0 and never -0', () => {
    ;[-4, -4 / 3, 4 / 3, 4].forEach((x, k) => expect(arcPosition(k, 4, 0)[0]).toBeCloseTo(x, 6))
    expect(Array.from({ length: 2 }, (_, k) => arcPosition(k, 2, 0))).toEqual([[-4, 0, -2], [4, 0, -2]])
    expect(Object.is(arcPosition(1, 3, 0)[2], 0)).toBe(true)
    expect(arcPosition(1, 4, 0)[2]).toBeCloseTo(-2 / 9, 6)
  })
  it('skips the label of an item that gives none and centres a lone item', () => {
    const custom = planWith({
      id: 'p',
      priority: 0.7,
      narration: 'It is what it is, and that is all there is to it, nothing more and nothing less to say.',
      visual: { kind: 'bullets', eyebrow: '', heading: '', items: ['It is'], cues: [0] },
    })
    const lone = pieceOf(custom, 'point')
    expect(lone.actors.filter((a) => a.data.kind === 'icon').map((a) => a.at)).toEqual([[0, 0.6, 0]])
    expect(labels(lone)).toHaveLength(0)
  })
})

describe('set pieces A: stat', () => {
  const p = piece('stat')
  const shot = shotsOf(p)[0]
  const countEnd = shot.countEnd!
  it('counts from STAT_COUNT_START to the spoken number on the pictogram and the count label, then pulses', () => {
    const count = labels(p).find((a) => a.data.kind === 'label' && a.data.size === 'title')!
    expect(count.data).toEqual({ kind: 'label', text: '42%', size: 'title' })
    for (const a of [heroOf(p), count]) {
      expect(a.beats).toContainEqual({ t: shot.t0 + STAT_COUNT_START, dur: countEnd - shot.t0 - STAT_COUNT_START, action: 'count' })
      expect(a.beats.find((b) => b.action === 'pulse')!.t).toBe(countEnd - 120)
    }
    expect(heroOf(p).data.kind).toBe('pictogram')
  })
  it('captions the number with labelFor', () => {
    const caption = labels(p).find((a) => a.data.kind === 'label' && a.data.size === 'label')!
    expect(caption.data).toEqual({ kind: 'label', text: 'Sunlight', size: 'label' })
  })
  it('stacks a tower for a number that is not a percent', () => {
    const custom = planWith({
      id: 'hours',
      priority: 0.9,
      narration: 'Teenagers spend about 1,284 hours a year on their phones, which is more time than they spend in class.',
      visual: { kind: 'stat', value: 1284, decimals: 0, unit: { prefix: '', suffix: '', word: 'hours' }, label: 'spent on phones each year', from: null },
    })
    const tower = pieceOf(custom, 'stat')
    const hero = heroOf(tower)
    expect(hero.data).toEqual({ kind: 'tower', count: 6, icon: shotsOf(tower, custom)[0].icon })
    expect(hero.beats.some((b) => b.action === 'count')).toBe(true)
    expect(texts(tower)).toContain('1,284 hours')
  })
  it('clamps the tower between 3 and 9 icons', () => {
    const stat = (value: number): Scene => ({
      id: 's',
      priority: 0.9,
      narration: `The number is ${value}, and that is the whole of the story about it today, nothing else to add.`,
      visual: { kind: 'stat', value, decimals: 0, unit: { prefix: '', suffix: '', word: '' }, label: 'things', from: null },
    })
    const count = (value: number) => {
      const hero = heroOf(pieceOf(planWith(stat(value)), 'stat'))
      return hero.data.kind === 'tower' ? hero.data.count : null
    }
    expect(count(2)).toBe(3)
    expect(count(0)).toBe(3)
    expect(count(-40)).toBe(5)
    expect(count(3e9)).toBe(9)
  })
})

describe('set pieces A: compare', () => {
  const p = piece('compare')
  const shot = shotsOf(p)[0]
  const pillars = p.actors.filter((a) => a.data.kind === 'bars')
  it('stands two pillars scaled by value, each rising on its pop', () => {
    expect(pillars.map((a) => a.data)).toEqual([
      { kind: 'bars', values: [450], categories: [''], highlight: null },
      { kind: 'bars', values: [700], categories: [''], highlight: null },
    ])
    expect(pillars[0].scale / pillars[1].scale).toBeCloseTo(450 / 700, 6)
    pillars.forEach((a, k) => expect(enterOf(a).t).toBe(shot.t0 + COMPARE_POP[k] - 60))
    expect(p.heroId).toBe(pillars[0].id)
  })
  it('lights the bigger pillar as the difference lands', () => {
    expect(pillars[0].beats.map((b) => b.action)).toEqual(['enter'])
    expect(pillars[1].beats.map((b) => b.action)).toEqual(['enter', 'highlight'])
    expect(pillars[1].beats[1].t).toBe(shot.t0 + COMPARE_DELTA - 60)
  })
  it('writes the difference the way the 2D compare does, or not at all', () => {
    const nm = { prefix: '', suffix: '', word: 'nm' }
    expect(deltaText(450, 700, nm, 0)).toBe('+250 nm · +56%')
    expect(deltaText(4_200_000, 1_300_000, { prefix: '$', suffix: '', word: '' }, 1)).toBe('+$2.9M · 3.2×')
    expect(deltaText(12, 1, nm, 0)).toBe('+11 nm · 12×')
    expect(deltaText(0, 5, nm, 0)).toBeNull()
    expect(deltaText(5, 5, nm, 0)).toBeNull()
  })
  it('names and values each pillar, and shows the difference with the chime', () => {
    expect(texts(p)).toEqual(['450', 'Blue light', '700', 'Red light', '+250 nm · +56%'])
    const delta = labels(p).at(-1)!
    expect(enterOf(delta).t).toBe(shot.t0 + COMPARE_DELTA - 60)
    labels(p).slice(0, 4).forEach((a, i) => expect(enterOf(a).t).toBe(shot.t0 + COMPARE_POP[i >> 1] - 60))
  })
  it('orbits the camera 20 degrees around the pillars over the hold', () => {
    const [arrival, departure] = p.camera.slice(1)
    expect(departure.target).toEqual(arrival.target)
    const angle = (k: CameraKey) => Math.atan2(k.position[0] - k.target[0], k.position[2] - k.target[2])
    expect(((angle(departure) - angle(arrival)) * 180) / Math.PI).toBeCloseTo(20, 6)
    expect(departure.t).toBeGreaterThan(arrival.t)
  })
})

describe('set pieces A: image', () => {
  const p = piece('image')
  const shot = shotsOf(p)[0]
  it('frames the photo at 16:9 with the scene icon as its fallback, landing on the pop', () => {
    const hero = heroOf(p)
    expect(hero.data).toEqual({ kind: 'photo', imageId: 'img1', fallbackIcon: shot.icon, aspect: 16 / 9 })
    expect(hero.beats).toEqual([{ t: shot.t0, dur: 700, action: 'enter' }])
  })
  it('captions the photo with labelFor just before the pop', () => {
    const caption = labels(p)[0]
    expect(caption.data).toEqual({ kind: 'label', text: 'Clear afternoon sky', size: 'label' })
    expect(enterOf(caption).t).toBe(shot.t0 + 640)
  })
  it('pulses the photo on the pop when the caption gives no label', () => {
    const scenes = fixtureStoryboard().scenes
    const at = scenes.findIndex((x) => x.visual.kind === 'image')
    const scene = scenes[at]
    if (scene.visual.kind !== 'image') throw new Error('the fixture has an image scene')
    const custom = planWith({ ...scene, visual: { ...scene.visual, caption: 'It is what it is' } }, at)
    const q = pieceOf(custom, 'image')
    const s = shotsOf(q, custom)[0]
    expect(labels(q)).toHaveLength(0)
    expect(heroOf(q).beats).toEqual([{ t: s.t0, dur: 700, action: 'enter' }, { t: s.t0 + 640, dur: 400, action: 'pulse' }])
  })
})

describe('set pieces A: every piece', () => {
  it('keeps something alive with one stream of 60 particles seeded by the piece index', () =>
    set.pieces.forEach((p) => {
      const fx = p.actors.filter((a) => a.data.kind === 'particles')
      expect(fx).toHaveLength(1)
      expect(fx[0].data).toMatchObject({ kind: 'particles', count: 60, flow: 'stream', seed: p.index * 7919 })
    }))
  it('gives actors unique ids of the form piece:role:n and names a hero among them', () =>
    set.pieces.forEach((p) => {
      const ids = p.actors.map((a) => a.id)
      expect(new Set(ids).size).toBe(ids.length)
      ids.forEach((id) => expect(id).toMatch(new RegExp(`^${p.index}:[a-z]+:\\d+$`)))
      expect(ids).toContain(p.heroId)
    }))
  it('keeps every actor anchor inside the frame at every hold key', () =>
    set.pieces.forEach((p, i) =>
      p.camera.slice(i === 0 ? 0 : 1).forEach((key) => p.actors.forEach((a) => expect(inFrame(key, sum(p.origin, a.at))).toBe(true)))))
  it('gives every kind its own treatment, so no piece keeps the generic hero', () =>
    set.pieces.forEach((p) => expect(p.heroId).not.toBe(`${p.index}:hero:0`)))
})
