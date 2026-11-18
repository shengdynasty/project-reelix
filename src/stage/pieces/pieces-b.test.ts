import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { directVideo } from '../director'
import { fixturePlan, fixtureStoryboard } from '../__fixtures__/plan'
import { buildTimeline, estimateSpeechMs } from '../../model/timing'
import type { Scene, Storyboard } from '../../model/storyboard'
import { buildPlan, chartHighlightTime, itemArrival } from '../../motion/plan'
import type { MotionPlan, ShotKind } from '../../motion/plan'
import { BAR_START } from '../../motion/beats'
import { holdWindow } from '../camera'
import { LABEL_MAX_WIDTH_PX, LABEL_PX } from '../labels'
import { WORLD_PER_PX } from '../layout'
import type { ActorSpec, CameraKey, SetPiece, Vec3 } from '../types'
import { valuePoint } from './chart'
import { cardLines, shortTokens } from './end'
import { ringStation, tokenTravels } from './steps'
import { framingDistance, pickHeroes, ringPosition } from './summary'
import { labelRow, railStation, railTracking } from './timeline'

const plan = fixturePlan()
const set = directVideo(plan, { hasImage: () => true })

describe('set pieces B', () => {
  it('steps: the token reaches each station 30 ms before its pop', () => {
    const p = set.pieces.find((x) => x.kind === 'steps' && x.actors.some((a) => a.data.kind === 'token'))!
    const token = p.actors.find((a) => a.data.kind === 'token')!
    const arrivals = token.beats.filter((b) => b.action === 'travel').map((b) => b.t + b.dur)
    const shot = plan.shots.find((s) => s.scene === p.scene)!
    const pops = plan.sfx.filter((e) => e.kind === 'pop' && e.t >= shot.t0).map((e) => e.t).sort((x, y) => x - y).slice(0, 4)
    expect(arrivals).toHaveLength(4)
    arrivals.forEach((a, j) => expect(a).toBe(pops[j] - 30))
  })
  it('timeline: one plaque per event', () => {
    const p = set.pieces.find((x) => x.kind === 'timeline')!
    expect(p.actors.filter((a) => a.data.kind === 'label' && a.data.size === 'term')).toHaveLength(4)
  })
  it('chart: the highlight beat lands at chartHighlightTime', () => {
    const p = set.pieces.find((x) => x.kind === 'chart')!
    const bars = p.actors.find((a) => a.data.kind === 'bars')!
    expect(bars.beats.some((b) => b.action === 'highlight')).toBe(true)
  })
  it('summary: brings back earlier heroes', () => {
    const p = set.pieces.find((x) => x.kind === 'summary')!
    expect(p.actors.filter((a) => a.id.includes(':copy:')).length).toBeGreaterThanOrEqual(3)
  })
  it('end: a card that names the sources', () => {
    const p = set.pieces.find((x) => x.kind === 'end')!
    expect(p).toBeDefined()
    const card = p.actors.find((a) => a.data.kind === 'card')
    expect(card && card.data.kind === 'card' && card.data.lines.some((l) => l.startsWith('Sources'))).toBe(true)
  })
})

/** The shots of a piece: its scene's shots, the end card alone when the piece is the end card and without it otherwise. */
const shotsOf = (p: SetPiece, from: MotionPlan = plan) => from.shots.filter((s) => s.scene === p.scene && (s.kind === 'end') === (p.kind === 'end'))
const piece = (kind: ShotKind) => set.pieces.find((p) => p.kind === kind)!
const heroOf = (p: SetPiece) => p.actors.find((a) => a.id === p.heroId)!
const enterOf = (a: ActorSpec) => a.beats.find((b) => b.action === 'enter')!
const labels = (p: SetPiece) => p.actors.filter((a) => a.data.kind === 'label')
const texts = (p: SetPiece) => labels(p).map((a) => (a.data.kind === 'label' ? a.data.text : ''))
const sum = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
/** The camera's angle around its target from the front, degrees. */
const angleOf = (k: CameraKey) => (Math.atan2(k.position[0] - k.target[0], k.position[2] - k.target[2]) * 180) / Math.PI
const expectVec = (got: Vec3, want: Vec3) => want.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 6))

/** The fixture storyboard with scene `at` replaced, planned like the fixture. */
function planWith(scene: Scene, at: number): MotionPlan {
  const sb: Storyboard = fixtureStoryboard()
  sb.scenes.splice(at, 1, scene)
  const tl = buildTimeline(sb, sb.scenes.map((s) => estimateSpeechMs(s.narration)))
  return buildPlan(sb, tl, [])
}
const sceneIndex = (kind: Scene['visual']['kind']) => fixtureStoryboard().scenes.findIndex((s) => s.visual.kind === kind)
const pieceOf = (custom: MotionPlan, kind: ShotKind) => directVideo(custom, { hasImage: () => true }).pieces.find((p) => p.kind === kind)!

/** Whether `point` (world) projects inside a 16:9 frame seen from `key`. */
function inFrame(key: CameraKey, point: Vec3): boolean {
  const cam = new PerspectiveCamera(key.fov, 16 / 9, 0.1, 500)
  cam.position.set(...key.position)
  cam.lookAt(...key.target)
  cam.updateMatrixWorld()
  const v = new Vector3(...point).project(cam)
  return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1
}

const chartScene = fixtureStoryboard().scenes[sceneIndex('chart')]
const chartData = chartScene.visual.kind === 'chart' ? chartScene.visual.data : null!

describe('set pieces B: chart', () => {
  const p = piece('chart')
  const shot = shotsOf(p)[0]
  const hlAt = chartHighlightTime(shot, plan.words[shot.scene])
  it('stands the data as columns that rise just before the first bar pop, the highlighted one lit on the chime', () => {
    const hero = heroOf(p)
    expect(hero.data).toEqual({ kind: 'bars', values: [1, 1.6, 2.3, 3.6, 5.5], categories: ['Red', 'Yellow', 'Green', 'Blue', 'Violet'], highlight: 2 })
    expect(hero.at).toEqual([0, 0, 0])
    expect(hero.beats).toEqual([
      { t: shot.t0 + BAR_START - 60, dur: 700, action: 'enter' },
      { t: hlAt, dur: 600, action: 'highlight' },
    ])
    expect(enterOf(hero).t).toBeLessThanOrEqual(shot.start)
  })
  it('titles the chart as the shot builds and calls out the highlighted value with the chime', () => {
    expect(texts(p)).toEqual(['Scattering by color', '2.3'])
    const [title, callout] = labels(p)
    expect(enterOf(title).t).toBe(shot.t0)
    expect(title.at).toEqual([0, 3.6, 0])
    expect(enterOf(callout).t).toBe(hlAt - 60)
    expectVec(callout.at, [0, (2.3 / 5.5) * 3 + 0.4, 0])
  })
  it('leans the camera toward the highlighted value over the second after the chime, never lowering its target, then drifts on to leave', () => {
    const [, arrival, hold, lean, departure] = p.camera
    expect(p.camera).toHaveLength(5)
    expect(hold).toEqual({ ...arrival, t: hlAt })
    expect(lean.t).toBe(hlAt + 1000)
    expect(dist(lean.position, lean.target)).toBeCloseTo(Math.hypot(9, 0.5), 6)
    expect((2.3 / 5.5) * 3).toBeLessThan(1.3)
    expectVec(lean.target, sum(p.origin, [0, 1.3, 0]))
    expect(angleOf(lean)).toBeCloseTo(0, 6)
    expect(departure.t).toBeGreaterThan(lean.t)
  })
  it('swings toward a tall column off the middle, 6 degrees per unit, raising its target a quarter of the way', () => {
    const custom = planWith({ ...chartScene, visual: { kind: 'chart', data: chartData, highlight: 4 } }, sceneIndex('chart'))
    const tall = pieceOf(custom, 'chart')
    const lean = tall.camera[3]
    expect(angleOf(lean)).toBeCloseTo(1.8 * 6, 6)
    expectVec(lean.target, sum(tall.origin, [1.8 * 0.55, 1.3 + (3 - 1.3) * 0.25, 0]))
    expect(texts(tall)).toEqual(['Scattering by color', '5.5'])
    expect(labels(tall)[1].at).toEqual([1.8, 3.1, 0])
  })
  it('leans by the room beside a wide chart: barely on ten columns, with the callout drawn in', () => {
    const data = { ...chartData, categories: Array.from({ length: 10 }, (_, i) => `Group ${i + 1}`), series: [{ name: 'Series', values: Array.from({ length: 10 }, (_, i) => 10 - i * 0.5) }] }
    const wide = pieceOf(planWith({ ...chartScene, visual: { kind: 'chart', data, highlight: 0 } }, sceneIndex('chart')), 'chart')
    const lean = wide.camera[3]
    expect(angleOf(lean)).toBeLessThan(0)
    expect(angleOf(lean)).toBeGreaterThan(-1.5)
    expect(wide.origin[0] - lean.target[0]).toBeLessThan(0.2)
    expect(lean.target[1] - wide.origin[1]).toBeCloseTo(1.3 + (3 - 1.3) * 0.25, 6)
    const callout = labels(wide)[1]
    expect(callout.at[0]).toBeGreaterThan(-4.05)
    expect(callout.at[0]).toBeLessThan(-3)
  })
  it('draws a line chart as a ribbon, and without a highlight neither lights, calls out nor leans', () => {
    const custom = planWith({ ...chartScene, visual: { kind: 'chart', data: { ...chartData, chart: 'line' }, highlight: null } }, sceneIndex('chart'))
    const line = pieceOf(custom, 'chart')
    const hero = heroOf(line)
    expect(hero.data).toMatchObject({ kind: 'ribbon', highlight: null })
    expect(hero.beats.map((b) => b.action)).toEqual(['enter'])
    expect(texts(line)).toEqual(['Scattering by color'])
    expect(line.camera).toHaveLength(3)
  })
  it('shows at most ten categories, like the bar pops', () => {
    const data = { ...chartData, categories: Array.from({ length: 12 }, (_, i) => `C${i + 1}`), series: [{ name: 'Series', values: Array.from({ length: 12 }, (_, i) => i + 1) }] }
    const hero = heroOf(pieceOf(planWith({ ...chartScene, visual: { kind: 'chart', data, highlight: 11 } }, sceneIndex('chart')), 'chart'))
    expect(hero.data).toMatchObject({ values: Array.from({ length: 10 }, (_, i) => i + 1), highlight: null })
    expect(hero.data.kind === 'bars' && hero.data.categories).toHaveLength(10)
  })
  it('places a value at its pitch along x and its signed share of the full height', () => {
    expect(valuePoint([1, 1.6, 2.3, 3.6, 5.5], 4)).toEqual([1.8, 3, 0])
    expectVec(valuePoint([2, -4], 1), [0.45, -3, 0])
  })
})

describe('set pieces B: timeline', () => {
  const p = piece('timeline')
  const shot = shotsOf(p)[0]
  const arrivals = [0, 1, 2, 3].map((j) => itemArrival(shot, j))
  it('lays a rail of four stations receding from the front left to the back right, the rail being the hero', () => {
    const rail = heroOf(p)
    expect(rail.data).toMatchObject({ kind: 'path', closed: false })
    const points = rail.data.kind === 'path' ? rail.data.points : []
    expect(points).toHaveLength(4)
    ;[[-2.4, 0, 1.8], [-0.8, 0, 0.6], [0.8, 0, -0.6], [2.4, 0, -1.8]].forEach((want, j) => expectVec(points[j], want as Vec3))
    expect(rail.beats).toEqual([{ t: shot.t0, dur: 700, action: 'enter' }])
  })
  it('raises a plaque per event 200 ms before its arrival: the year over an icon on the rail, the event under it in alternate rows', () => {
    const years = labels(p).filter((a) => a.data.kind === 'label' && a.data.size === 'term')
    const events = labels(p).filter((a) => a.data.kind === 'label' && a.data.size === 'small')
    const icons = p.actors.filter((a) => a.data.kind === 'icon')
    expect(years.map((a) => a.data.kind === 'label' && a.data.text)).toEqual(['1869', '1871', '1899', '1908'])
    expect(events.map((a) => a.data.kind === 'label' && a.data.text)).toEqual(['Tyndall lights up particles', 'Rayleigh explains the blue', 'Molecules get the credit', 'Mie adds droplets'])
    expect(icons).toHaveLength(4)
    ;[0, 1, 2, 3].forEach((j) => {
      const x = -2.4 + 1.6 * j
      expectVec(years[j].at, [x, 1.6, -x * 0.75])
      expectVec(icons[j].at, [x, 0.8, -x * 0.75])
      expect(icons[j].scale).toBe(0.9)
      expect(events[j].at[1]).toBe(j % 2 ? -1.15 : -0.6)
      for (const a of [years[j], events[j], icons[j]]) expect(a.beats).toEqual([{ t: arrivals[j] - 200, dur: 700, action: 'enter' }])
    })
  })
  it('flies the camera along the rail with one key per plaque, then leaves looking at the whole rail from straight in front', () => {
    const [arrival, ...rest] = p.camera.slice(1)
    expect(rest).toHaveLength(4)
    const plaques = [arrival, ...rest.slice(0, 3)]
    rest.slice(0, 3).forEach((k, i) => expect(k.t).toBe(arrivals[i + 1]))
    const track = railTracking(4)
    plaques.forEach((k, j) => {
      expectVec(k.target, sum(p.origin, [railStation(j, 4)[0] * track, 0.3, railStation(j, 4)[2] * track]))
      expect(k.position[2] - k.target[2]).toBeCloseTo(10, 6)
    })
    plaques.slice(1).forEach((k, i) => expect(k.target[0]).toBeGreaterThan(plaques[i].target[0]))
    const departure = rest[3]
    expectVec(departure.target, sum(p.origin, [0, 0.3, 0]))
    expectVec(departure.position, sum(p.origin, [0, 0.9, 10]))
    expect(departure.t).toBeGreaterThan(rest[2].t)
  })
  it('spaces plaques 1.6 apart up to four, then closer so the rail stays 5.4 wide, receding 0.75 per unit, and tracks by the room the labels leave', () => {
    expectVec(railStation(0, 2), [-0.8, 0, 0.6])
    expect(Object.is(railStation(1, 3)[2], 0)).toBe(true)
    expectVec(railStation(5, 6), [2.7, 0, -2.025])
    expect(railTracking(2)).toBe(0.5)
    expect(railTracking(3)).toBe(0.5)
    expect(railTracking(4)).toBeGreaterThan(0.1)
    expect(railTracking(4)).toBeLessThan(0.2)
    expect(railTracking(6)).toBeGreaterThanOrEqual(0)
    expect(railTracking(6)).toBeLessThan(railTracking(4))
    expect([0, 1, 2, 3, 4, 5].map((j) => labelRow(j, 6))).toEqual([0, 1, 2, 0, 1, 2])
    expect([0, 1, 2, 3].map((j) => labelRow(j, 4))).toEqual([0, 1, 0, 1])
    expect([0, 1].map((j) => labelRow(j, 2))).toEqual([0, 0])
  })
  it('keeps every plaque of a six event rail inside the frame at every key', () => {
    const scene = fixtureStoryboard().scenes[sceneIndex('timeline')]
    const events = [1600, 1610, 1620, 1630, 1640, 1650].map((y, i) => ({ when: String(y), label: ['First idea', 'Early test', 'Public lecture', 'Printed proof', 'Wide acceptance', 'Final word'][i] }))
    const custom = planWith(
      {
        ...scene,
        narration: 'Six moments mark the story, each a decade apart, from the first idea to the final word that settled the question.',
        visual: { kind: 'timeline', heading: 'Six moments', events, cues: events.map((_, i) => i / 6) },
      },
      sceneIndex('timeline'),
    )
    const six = pieceOf(custom, 'timeline')
    expect(six.actors.filter((a) => a.data.kind === 'icon')).toHaveLength(6)
    six.camera.slice(1).forEach((key) => six.actors.forEach((a) => expect(inFrame(key, sum(six.origin, a.at))).toBe(true)))
  })
})

describe('set pieces B: steps', () => {
  const p = set.pieces.find((x) => x.kind === 'steps' && x.actors.some((a) => a.data.kind === 'token'))!
  const shot = shotsOf(p)[0]
  const arrivals = [0, 1, 2, 3].map((j) => itemArrival(shot, j))
  const stations = [0, 1, 2, 3].map((j) => ringStation(j, 4))
  it('rings four stations of radius 4 on the floor from the front left, the ring being the hero', () => {
    const ring = heroOf(p)
    expect(ring.data).toEqual({ kind: 'path', closed: true, points: stations })
    stations.forEach((s) => {
      expect(Math.hypot(s[0], s[2])).toBeCloseTo(4, 6)
      expect(s[1]).toBe(0)
    })
    expect(stations[0][0]).toBeLessThan(0)
    expect(stations[0][2]).toBeGreaterThan(0)
    expect(ring.beats).toEqual([{ t: shot.t0, dur: 700, action: 'enter' }])
  })
  it('posts an icon at every station and its name a little in toward the middle from the start, both pulsing as the step is named', () => {
    const icons = p.actors.filter((a) => a.data.kind === 'icon')
    expect(texts(p)).toEqual(['Evaporation', 'Condensation', 'Precipitation', 'Collection'])
    icons.forEach((icon, j) => {
      expect(icon.at).toEqual(sum(stations[j], [0, 1.45, 0]))
      expect(icon.scale).toBe(1.2)
      expectVec(labels(p)[j].at, [stations[j][0] * 0.75, 0.5, stations[j][2] * 0.75])
      for (const a of [icon, labels(p)[j]]) expect(a.beats).toEqual([{ t: shot.t0, dur: 700, action: 'enter' }, { t: arrivals[j], dur: 400, action: 'pulse' }])
    })
  })
  it('starts the token on the first station and runs it forward, 450 ms to each station, never two travels at once', () => {
    const token = p.actors.find((a) => a.data.kind === 'token')!
    expect(token.at).toEqual(stations[0])
    expect(enterOf(token).t).toBe(shot.t0)
    const travels = token.beats.filter((b) => b.action === 'travel')
    expect(travels.map((b) => b.index)).toEqual([0, 1, 2, 3])
    travels.forEach((b, j) => {
      expect(b).toMatchObject({ t: arrivals[j] - 450, dur: 450 })
      expect(b.path![0]).toEqual([0, 0, 0])
      expect(b.path![j]).toEqual(stations[j].map((c, i) => c - stations[0][i]))
    })
    travels.slice(1).forEach((b, i) => expect(b.t).toBeGreaterThanOrEqual(travels[i].t + travels[i].dur))
  })
  it('shortens a travel when the step before landed less than 450 ms earlier', () => {
    const route: Vec3[] = [[0, 0, 0], [4, 0, 0], [4, 4, 0]]
    expect(tokenTravels([1000, 1300, 2000], route)).toEqual([
      { t: 550, dur: 450, action: 'travel', path: route, index: 0 },
      { t: 1000, dur: 300, action: 'travel', path: route, index: 1 },
      { t: 1550, dur: 450, action: 'travel', path: route, index: 2 },
    ])
  })
  it('looks down onto the ring from 22 degrees above the front and leaves 8 degrees around it at the same distance', () => {
    const [arrival, departure] = p.camera.slice(1)
    expect(p.camera).toHaveLength(3)
    expectVec(arrival.target, sum(p.origin, [0, 0.45, 0]))
    expect(arrival.position[1] - arrival.target[1]).toBeCloseTo(10 * Math.sin((22 * Math.PI) / 180), 6)
    expect(angleOf(arrival)).toBeCloseTo(0, 6)
    expect(angleOf(departure)).toBeCloseTo(8, 6)
    expect(departure.target).toEqual(arrival.target)
    expect(dist(departure.position, departure.target)).toBeCloseTo(10, 6)
  })
})

describe('set pieces B: kinds', () => {
  const p = set.pieces.find((x) => x.kind === 'steps' && !x.actors.some((a) => a.data.kind === 'token'))!
  const shot = shotsOf(p)[0]
  const arrivals = [0, 1, 2].map((j) => itemArrival(shot, j))
  it('stands an open arc of stations from -3.4 to 3.4 from the start, the arc being the hero', () => {
    const arc = heroOf(p)
    expect(arc.data).toEqual({ kind: 'path', closed: false, points: [[-3.4, -0.15, -2], [0, -0.15, 0], [3.4, -0.15, -2]] })
    expect(arc.beats).toEqual([{ t: shot.t0, dur: 700, action: 'enter' }])
  })
  it('dollies straight in a little over the hold, so the ends of the arc stay in frame', () => {
    const [arrival, departure] = p.camera.slice(1)
    expect(p.camera).toHaveLength(3)
    expect(departure.target).toEqual(arrival.target)
    expectVec(arrival.position, sum(arrival.target, [0, 0.6, 10]))
    expectVec(departure.position, sum(departure.target, [0, 0.5, 9.6]))
  })
  it('brings each kind in 200 ms before it is named and makes it glow for 1200 ms from its arrival', () => {
    const icons = p.actors.filter((a) => a.data.kind === 'icon')
    expect(icons.map((a) => a.at)).toEqual([[-3.4, 0.6, -2], [0, 0.6, 0], [3.4, 0.6, -2]])
    icons.forEach((a, k) => {
      expect(a.scale).toBe(1.6)
      expect(a.beats).toEqual([{ t: arrivals[k] - 200, dur: 700, action: 'enter' }, { t: arrivals[k], dur: 1200, action: 'focus' }])
    })
    expect(texts(p)).toEqual(['Clouds', 'Haze', 'Dust'])
    labels(p).forEach((a, k) => {
      expect(a.at).toEqual([[-3.4, -0.8, -2], [0, -0.8, 0], [3.4, -0.8, -2]][k])
      expect(a.beats).toEqual([{ t: arrivals[k] - 200, dur: 700, action: 'enter' }])
    })
  })
})

describe('set pieces B: summary', () => {
  const p = piece('summary')
  const shot = shotsOf(p)[0]
  const copies = p.actors.filter((a) => a.id.includes(':copy:'))
  /** The icon the summary should show for an earlier piece: its hero when that is an icon, else its first shot's icon. */
  const iconOf = (i: number) => {
    const hero = heroOf(set.pieces[i])
    return hero.data.kind === 'icon' ? hero.data.icon : shotsOf(set.pieces[i])[0].icon
  }
  it('rings six of the ten earlier heroes as icons, spread from the first piece to the last, the first copy at the top being the hero', () => {
    expect(copies.map((a) => a.id)).toEqual([0, 1, 2, 3, 4, 5].map((k) => `${p.index}:copy:${k}`))
    expect(p.heroId).toBe(copies[0].id)
    expect(copies.map((a) => a.data)).toEqual([0, 2, 4, 5, 7, 9].map((i) => ({ kind: 'icon', icon: iconOf(i), accent: true })))
    expect(set.pieces.slice(0, 6).some((x) => heroOf(x).data.kind !== 'icon')).toBe(true)
    copies.forEach((a, k) => {
      expectVec(a.at, ringPosition(k, 6))
      expect(a.scale).toBe(1)
    })
    expectVec(copies[0].at, [0, 2.45, 0])
  })
  it('enters the copies from the chime on and the tags after them, stacked in the middle of the ring', () => {
    copies.forEach((a, k) => expect(a.beats).toEqual([{ t: shot.t0 + 200 + 120 * k, dur: 700, action: 'enter' }]))
    expect(plan.sfx.some((e) => e.kind === 'chime' && e.t === enterOf(copies[0]).t)).toBe(true)
    expect(texts(p)).toEqual(['Scattering', 'Sunlight', 'Wavelength'])
    labels(p).forEach((a, k) => {
      expect(a.beats).toEqual([{ t: shot.t0 + 600 + 150 * k, dur: 700, action: 'enter' }])
      expectVec(a.at, [0, 1.05 - 0.6 * k, 0])
    })
  })
  it('arrives at the distance that shows every copy whole and pulls back as far as the hold band allows as the last copy lands', () => {
    const [arrival, pulled, departure] = p.camera.slice(1)
    expect(p.camera).toHaveLength(4)
    expect(pulled.t).toBe(shot.t0 + 200 + 120 * 5 + 700)
    expect(pulled.target).toEqual(arrival.target)
    expect(dist(arrival.position, arrival.target)).toBeCloseTo(Math.hypot(framingDistance(copies), 0.6), 6)
    expect(pulled.position[2] - arrival.position[2]).toBeGreaterThan(0.7)
    expect(dist(pulled.position, pulled.target)).toBeLessThan(10.5)
    const corners = (a: ActorSpec) => [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([dx, dy]) => sum(p.origin, sum(a.at, [dx, dy, 0])))
    for (const key of [arrival, pulled, departure]) copies.forEach((a) => corners(a).forEach((c) => expect(inFrame(key, c)).toBe(true)))
    expect(corners(copies[0]).some((c) => !inFrame({ ...arrival, position: [arrival.position[0], arrival.position[1], arrival.position[2] - 1] }, c))).toBe(true)
    expect(departure.t).toBeGreaterThan(pulled.t)
  })
  it('takes all the heroes when there are six or fewer, else six spread evenly', () => {
    expect(pickHeroes([1, 2, 3])).toEqual([1, 2, 3])
    expect(pickHeroes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([0, 2, 4, 5, 7, 9])
    expect(pickHeroes([0, 1, 2, 3, 4, 5, 6])).toEqual([0, 1, 2, 4, 5, 6])
  })
  it('frames the ring from a distance inside the hold band that fits the top copy', () => {
    const d = framingDistance(copies)
    expect(d).toBeGreaterThan(9.5)
    expect(d).toBeLessThan(10)
    expect(framingDistance(copies.slice(1, 3))).toBeLessThan(d)
    expect(framingDistance(copies.slice(1, 3))).toBeGreaterThanOrEqual(8.6)
  })
})

describe('set pieces B: end', () => {
  const p = piece('end')
  const shot = shotsOf(p)[0]
  it('puts the title, the sources and the maker\'s mark on one card, the hero, under the video icon, both entering as the card builds', () => {
    const card = heroOf(p)
    expect(card.data).toEqual({ kind: 'card', lines: ['Why is the sky blue?', 'Sources: Wikipedia: Diffuse sky radiation', 'Made with Project Reelix'] })
    expect(card.at).toEqual([0, -0.2, 0])
    expect(card.beats).toEqual([{ t: shot.t0, dur: 700, action: 'enter' }])
    const icon = p.actors.find((a) => a.data.kind === 'icon')!
    expect(icon.data).toEqual({ kind: 'icon', icon: shot.icon, accent: true })
    expect(icon.at).toEqual([0, 2.3, 0])
    expect(enterOf(icon).t).toBe(shot.t0)
  })
  it('names the sources once each without URLs, leaves the line out without sources and keeps every token under 60 characters', () => {
    expect(cardLines('T', [])).toEqual(['T', 'Made with Project Reelix'])
    expect(cardLines('T', [{ label: 'Wikipedia: Black hole', url: 'https://en.wikipedia.org/wiki/Black_hole' }, { label: 'Wikipedia: Black hole' }, { label: 'notes.md' }])).toEqual([
      'T',
      'Sources: Wikipedia: Black hole · notes.md',
      'Made with Project Reelix',
    ])
    const long = shortTokens(`Sources: ${'x'.repeat(70)}.docx`)
    long.split(' ').forEach((w) => expect(w.length).toBeLessThan(60))
    expect(long.endsWith('…')).toBe(true)
    expect(cardLines('', [])).toEqual(['Made with Project Reelix'])
  })
  it('orbits the camera 14 degrees around the card from its arrival to the end of the video', () => {
    const [arrival, departure] = p.camera.slice(1)
    expect(p.camera).toHaveLength(3)
    expect(departure.target).toEqual(arrival.target)
    expectVec(arrival.target, sum(p.origin, [0, 0.4, 0]))
    expect(angleOf(departure) - angleOf(arrival)).toBeCloseTo(14, 6)
    expect(angleOf(arrival)).toBeCloseTo(-7, 6)
    expect(departure.t).toBe(shot.end)
    expect(dist(arrival.position, arrival.target)).toBeCloseTo(Math.hypot(9.6, 0.5), 6)
  })
})

describe('set pieces B: every piece', () => {
  it('keeps the camera keys of all pieces in one nondecreasing timeline', () => {
    const keys = set.pieces.flatMap((p) => p.camera)
    keys.slice(1).forEach((k, i) => expect(k.t).toBeGreaterThanOrEqual(keys[i].t))
  })
  it('adds no camera key after the hold end, where the next piece\'s flight begins', () =>
    set.pieces.forEach((p) => {
      const shots = shotsOf(p)
      const { holdEnd } = holdWindow(shots, plan.shots[shots[shots.length - 1].index + 1])
      p.camera.forEach((k) => expect(k.t).toBeLessThanOrEqual(holdEnd))
    }))
  it('never runs two travels of one actor at once', () =>
    set.pieces.forEach((p) =>
      p.actors.forEach((a) => {
        const travels = a.beats.filter((b) => b.action === 'travel').sort((x, y) => x.t - y.t)
        travels.slice(1).forEach((b, i) => expect(b.t).toBeGreaterThanOrEqual(travels[i].t + travels[i].dur))
      })))
  it('lands every timeline, steps and kinds entrance ahead of its pop', () =>
    set.pieces
      .filter((p) => p.kind === 'timeline' || p.kind === 'steps')
      .forEach((p) => {
        const shot = shotsOf(p)[0]
        p.actors.forEach((a) => {
          if (a.data.kind === 'particles') return
          const t = enterOf(a).t
          const pop = plan.sfx.find((e) => e.kind === 'pop' && e.t >= t && e.t <= t + 700)
          expect(t <= shot.t0 || pop !== undefined).toBe(true)
        })
      }))
})

// Extents: what an actor shows reaches past its anchor. A label is its plane at the width its size allows (its text
// at 0.6 em per character, up to the size's limit, plus the 16 px pad; two lines when the text runs past the limit),
// an icon a square of its scale, the card its panel; the stations of a path count too. Nothing of it may leave the
// frame at any key the camera holds on.
/** Widest each size runs on a 1080 canvas (labelMesh). */
const MAX_WIDTH_PX = { title: 1200, term: 760, label: LABEL_MAX_WIDTH_PX, small: LABEL_MAX_WIDTH_PX }
const PAD_PX = 8
const CARD_HALF: Vec3 = [(1200 * WORLD_PER_PX) / 2 + 0.5, 1.5, 0]

function labelHalf(text: string, size: keyof typeof MAX_WIDTH_PX): [number, number] {
  const estimate = text.length * LABEL_PX[size] * 0.6
  const lines = estimate > MAX_WIDTH_PX[size] ? 2 : 1
  const widthPx = Math.min(MAX_WIDTH_PX[size], estimate) + 2 * PAD_PX
  const heightPx = lines * LABEL_PX[size] * 1.15 + 2 * PAD_PX
  return [(widthPx / 2) * WORLD_PER_PX, (heightPx / 2) * WORLD_PER_PX]
}

const box = (centre: Vec3, hw: number, hh: number): Vec3[] => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => sum(centre, [sx * hw, sy * hh, 0]))

/** The world points of a piece that must stay inside the frame, named for the failure message. */
function framePoints(p: SetPiece): { name: string; at: Vec3 }[] {
  return p.actors.flatMap((a) => {
    const at = sum(p.origin, a.at)
    const corners = (hw: number, hh: number) => box(at, hw * a.scale, hh * a.scale).map((c, i) => ({ name: `${a.id}#${i}`, at: c }))
    switch (a.data.kind) {
      case 'label': return [{ name: a.id, at }, ...corners(...labelHalf(a.data.text, a.data.size))]
      case 'icon': return [{ name: a.id, at }, ...corners(0.5, 0.5)]
      case 'card': return [{ name: a.id, at }, ...corners(CARD_HALF[0], CARD_HALF[1])]
      case 'token': return [{ name: a.id, at }, ...corners(0.22, 0.22)]
      case 'path': return [{ name: a.id, at }, ...a.data.points.map((pt, i) => ({ name: `${a.id}@${i}`, at: sum(at, pt) }))]
      case 'particles': return []
      default: return [{ name: a.id, at }]
    }
  })
}

/** The points of `points` (default: the piece's frame points) outside the frame at any key the camera holds on, as messages. */
function outside(p: SetPiece, points = framePoints(p)): string[] {
  const out: string[] = []
  p.camera.slice(1).forEach((key) => {
    const cam = new PerspectiveCamera(key.fov, 16 / 9, 0.1, 500)
    cam.position.set(...key.position)
    cam.lookAt(...key.target)
    cam.updateMatrixWorld()
    for (const { name, at } of points) {
      const v = new Vector3(...at).project(cam)
      if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) out.push(`key t=${Math.round(key.t)}: ${name} (${v.x.toFixed(3)}, ${v.y.toFixed(3)})`)
    }
  })
  return out
}

/** The columns or markers of a chart piece, with half a column's width around each, as frame points. */
function columnPoints(p: SetPiece): { name: string; at: Vec3 }[] {
  const hero = heroOf(p)
  if (hero.data.kind !== 'bars' && hero.data.kind !== 'ribbon') return []
  const values = hero.data.values
  return values.flatMap((_, i) => {
    const top = sum(p.origin, sum(hero.at, valuePoint(values, i)))
    return [{ name: `column ${i}`, at: top }, ...box(top, 0.3, 0).map((c, k) => ({ name: `column ${i}#${k}`, at: c }))]
  })
}

/** A scene with four word item names as wide as a label runs. */
const wideItems = (n: number) => ['Gather the dry ingredients', 'Measure every liquid twice', 'Combine them without hurry', 'Rest the finished batter', 'Bake until golden brown'].slice(0, n)

describe('set pieces B: framing with label extents', () => {
  it('keeps every label, icon and station of every piece inside the frame at every key', () =>
    set.pieces.filter((p) => ['chart', 'timeline', 'steps', 'summary', 'end', 'point', 'stat', 'compare', 'definition', 'intro', 'image'].includes(p.kind)).forEach((p) => expect(outside(p)).toEqual([])))
  it('chart: keeps the title, the callout and every column in frame however low the highlighted value', () => {
    for (const highlight of [0, 2, 4]) {
      const p = pieceOf(planWith({ ...chartScene, visual: { kind: 'chart', data: chartData, highlight } }, sceneIndex('chart')), 'chart')
      expect(outside(p, [...framePoints(p), ...columnPoints(p)])).toEqual([])
    }
  })
  it('chart: leans little on a ten column chart, so the far column and its labels stay in frame', () => {
    const data = { ...chartData, categories: Array.from({ length: 10 }, (_, i) => `Group ${i + 1}`), series: [{ name: 'Series', values: Array.from({ length: 10 }, (_, i) => 10 - i * 0.5) }] }
    for (const highlight of [0, 9]) {
      const p = pieceOf(planWith({ ...chartScene, visual: { kind: 'chart', data, highlight } }, sceneIndex('chart')), 'chart')
      expect(outside(p, [...framePoints(p), ...columnPoints(p)])).toEqual([])
    }
  })
  it('timeline: keeps every plaque with its labels in frame at every key, on the fixture and on a six event rail', () => {
    expect(outside(piece('timeline'))).toEqual([])
    const scene = fixtureStoryboard().scenes[sceneIndex('timeline')]
    const events = [1600, 1610, 1620, 1630, 1640, 1650].map((y, i) => ({ when: String(y), label: wideItems(5).concat('Settle the final argument')[i] }))
    const six = pieceOf(planWith({ ...scene, narration: 'Six moments mark the story, each a decade apart, from the first idea to the final word that settled the question.', visual: { kind: 'timeline', heading: 'Six moments', events, cues: events.map((_, i) => i / 6) } }, sceneIndex('timeline')), 'timeline')
    expect(outside(six)).toEqual([])
  })
  it('steps: keeps four word station names as wide as a label runs inside the frame, for two to five steps', () => {
    const scene = fixtureStoryboard().scenes[sceneIndex('steps')]
    for (const n of [2, 3, 4, 5]) {
      const custom = planWith({ ...scene, visual: { kind: 'steps', heading: 'Baking', items: wideItems(n), style: 'steps', cues: wideItems(n).map((_, i) => i / n) } }, sceneIndex('steps'))
      const p = directVideo(custom, { hasImage: () => true }).pieces.find((x) => x.kind === 'steps' && x.actors.some((a) => a.data.kind === 'token'))!
      expect(texts(p).every((t) => t.split(' ').length === 4)).toBe(true)
      expect(outside(p)).toEqual([])
    }
  })
  it('kinds: keeps the end labels of a wide arc inside the frame at every key', () => {
    const scene = fixtureStoryboard().scenes[sceneIndex('steps')]
    for (const n of [2, 5]) {
      const custom = planWith({ ...scene, visual: { kind: 'steps', heading: 'Kinds of bread', items: wideItems(n), style: 'kinds', cues: wideItems(n).map((_, i) => i / n) } }, sceneIndex('steps'))
      const p = directVideo(custom, { hasImage: () => true }).pieces.find((x) => x.kind === 'steps' && !x.actors.some((a) => a.data.kind === 'token'))!
      expect(outside(p)).toEqual([])
    }
  })
  it('points: keeps labels as wide as a label runs inside the frame at every key, for two to five items', () => {
    const scene = fixtureStoryboard().scenes[sceneIndex('bullets')]
    const items = ['Supermassive black holes anchor galaxies', 'Merging black holes send gravitational waves', 'Spaghettification stretches infalling matter', 'Hawking radiation slowly evaporates them', 'Quasars outshine whole galaxies']
    for (const n of [2, 3, 4, 5]) {
      const custom = planWith({ ...scene, visual: { kind: 'bullets', eyebrow: 'Key points', heading: 'What we see', items: items.slice(0, n), cues: items.slice(0, n).map((_, i) => i / n) } }, sceneIndex('bullets'))
      const p = pieceOf(custom, 'point')
      expect(Math.max(...texts(p).map((t) => t.length))).toBeGreaterThanOrEqual(16)
      expect(outside(p)).toEqual([])
    }
  })
})
