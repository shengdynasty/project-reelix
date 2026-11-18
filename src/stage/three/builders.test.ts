// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Color, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Points, Vector3 } from 'three'
import { iconGeometry } from './icons3d'
import { applyPose, buildActor } from './actors'
import { labelMesh } from './labelMesh'
import { stagePalette } from './materials'
import { THEMES } from '../../render/theme'
import { WORLD_PER_PX } from '../layout'
import type { ActorSpec } from '../types'

const deps = { palette: stagePalette(THEMES.night), images: new Map() }

describe('three builders', () => {
  it('extrudes an icon into a unit sized solid', () => {
    const g = iconGeometry('drop')
    g.front.computeBoundingBox()
    const s = g.front.boundingBox!.getSize(new Vector3())
    expect(Math.max(s.x, s.y)).toBeCloseTo(1, 1)
    expect(s.z).toBeGreaterThan(0.1)
  })
  it('caches icon geometry', () => expect(iconGeometry('drop')).toBe(iconGeometry('drop')))
  it('falls back to an icon object when the photo is missing', () => {
    const o = buildActor({ id: '6:photo:0', at: [0, 0, 0], scale: 1, data: { kind: 'photo', imageId: 'nope', fallbackIcon: 'drop', aspect: 1.5 }, beats: [] }, deps)
    expect(o.userData.fallback).toBe(true)
  })
  it('builds a 100 cell pictogram', () => {
    const o = buildActor({ id: '3:pic:0', at: [0, 0, 0], scale: 1, data: { kind: 'pictogram', lit: 42, total: 100 }, beats: [] }, deps)
    let count = 0
    o.traverse((c) => { if (c instanceof InstancedMesh) count += c.count })
    expect(count).toBe(100)
  })
  it('places particles identically for the same seed', () => {
    const spec = { id: '0:fx:0', at: [0, 0, 0] as [number, number, number], scale: 1, data: { kind: 'particles' as const, count: 60, seed: 7, flow: 'stream' as const, extent: [8, 4, 4] as [number, number, number] }, beats: [] }
    const pos = (o: ReturnType<typeof buildActor>) => { let p: number[] = []; o.traverse((c) => { if (c instanceof Points) p = Array.from(c.geometry.attributes.position.array) }); return p }
    expect(pos(buildActor(spec, deps))).toEqual(pos(buildActor(spec, deps)))
  })
})

const actor = (id: string, data: ActorSpec['data']): ActorSpec => ({ id, at: [1, 2, 3], scale: 2, data, beats: [] })
const meshes = (o: ReturnType<typeof buildActor>) => { const out: Mesh[] = []; o.traverse((c) => { if (c instanceof Mesh) out.push(c) }); return out }
const textured = (o: ReturnType<typeof buildActor>) => meshes(o).filter((m) => (m.material as MeshBasicMaterial).map)
const hex = (css: string) => new Color(css).getHexString()
const photoOf = (image: HTMLCanvasElement) =>
  buildActor(actor('6:photo:0', { kind: 'photo', imageId: 'img1', fallbackIcon: 'drop', aspect: 1.5 }), { ...deps, images: new Map([['img1', image]]) })

describe('icon geometry', () => {
  it('uses sparkle for an unknown name', () => expect(iconGeometry('no-such-icon')).toBe(iconGeometry('sparkle')))
  it('puts the slab behind the front with the same footprint scale', () => {
    const g = iconGeometry('drop')
    g.front.computeBoundingBox()
    g.back!.computeBoundingBox()
    expect(g.back!.boundingBox!.max.z).toBeLessThan(g.front.boundingBox!.min.z)
    expect(g.back!.boundingBox!.max.x).toBeLessThanOrEqual(g.front.boundingBox!.max.x)
    expect(g.front.userData.shared).toBe(true)
  })
})

describe('actors', () => {
  it('keeps the spec id and starts at the spec pose', () => {
    const o = buildActor(actor('2:hero:0', { kind: 'icon', icon: 'drop', accent: true }), deps)
    expect(o.userData.actorId).toBe('2:hero:0')
    expect(o.position.toArray()).toEqual([1, 2, 3])
    expect(o.scale.x).toBe(2)
  })
  it('mutes the bars that are not highlighted', () => {
    const o = buildActor(actor('4:bars:0', { kind: 'bars', values: [3, 5, 2], categories: [], highlight: 1 }), deps)
    const colors = meshes(o).map((m) => (m.material as MeshStandardMaterial).color.getHexString())
    expect(colors).toEqual([hex(deps.palette.muted), hex(deps.palette.series[0]), hex(deps.palette.muted)])
    meshes(o).forEach((m, i) => expect(m.position.y).toBeCloseTo([0.9, 1.5, 0.6][i]))
  })
  it('stacks count copies of the icon in a tower', () => {
    const o = buildActor(actor('5:tower:0', { kind: 'tower', count: 7, icon: 'users-three' }), deps)
    const stacks: number[] = []
    o.traverse((c) => { if (c instanceof InstancedMesh) stacks.push(c.count) })
    expect(stacks).toEqual([7, 7])
  })
  it('draws a closed path as a segment per point with a station at each', () => {
    const points: [number, number, number][] = [[4, 0, 0], [0, 0, -4], [-4, 0, 0], [0, 0, 4]]
    expect(meshes(buildActor(actor('7:path:0', { kind: 'path', points, closed: true }), deps))).toHaveLength(8)
    expect(meshes(buildActor(actor('7:path:1', { kind: 'path', points, closed: false }), deps))).toHaveLength(7)
  })
  it('applies a pose to the object and its materials without compounding', () => {
    const o = buildActor(actor('2:hero:0', { kind: 'icon', icon: 'drop', accent: false }), deps)
    const pose = { position: [4, 5, 6] as [number, number, number], rotation: [0, 1, 0] as [number, number, number], scale: 3, opacity: 0.5, glow: 1, progress: 0 }
    applyPose(o, pose)
    applyPose(o, pose)
    expect(o.position.toArray()).toEqual([4, 5, 6])
    expect(o.rotation.y).toBe(1)
    expect(o.scale.toArray()).toEqual([3, 3, 3])
    const [front, slab] = meshes(o).map((m) => m.material as MeshStandardMaterial)
    expect(front.opacity).toBe(0.5)
    expect(slab.opacity).toBeCloseTo(0.35 * 0.5)
    expect(front.emissiveIntensity).toBe(0.8)
    expect(slab.emissiveIntensity).toBe(0.8)
    applyPose(o, { ...pose, opacity: 0, glow: 0 })
    expect(o.visible).toBe(false)
    expect(front.emissiveIntensity).toBe(0)
  })
  it('builds a blank label without a 2D canvas instead of throwing', () => {
    const m = labelMesh('Evaporation', 'label', deps.palette)
    expect(m.userData.textless).toBe(true)
    expect((m.material as MeshBasicMaterial).opacity).toBe(0)
  })
})

// happy-dom has no canvas 2D, so these tests stub it; the Task 11 lab checks real drawing.
describe('with a 2D canvas', () => {
  let tainted = false
  const context = {
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    measureText(text: string) { return { width: text.length * Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 0) * 0.55 } },
    fillText() {},
    scale() {},
    drawImage() {},
    getImageData() { if (tainted) throw new Error('SecurityError: tainted canvas') },
  }
  beforeAll(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as never) })
  afterAll(() => vi.restoreAllMocks())

  it('sizes a label plane in world units from the fitted text', () => {
    const m = labelMesh('Evaporation', 'label', deps.palette)
    expect(m.userData.labelPx).toBe(44)
    expect(m.userData.lines).toEqual(['Evaporation'])
    expect(m.userData.textless).toBeUndefined()
    const { width, height } = (m.geometry as PlaneGeometry).parameters
    expect(height).toBeCloseTo(Math.ceil(44 * 1.15 + 16) * WORLD_PER_PX)
    expect(width).toBeCloseTo(Math.ceil('Evaporation'.length * 44 * 0.55 + 16) * WORLD_PER_PX)
    const map = (m.material as MeshBasicMaterial).map!
    expect((map.image as HTMLCanvasElement).width).toBe(Math.ceil('Evaporation'.length * 44 * 0.55 + 16) * 2)
  })
  it('never sets a label under 34 px', () => {
    const m = labelMesh('One two three four five six seven eight nine ten eleven twelve', 'small', deps.palette)
    expect(m.userData.labelPx).toBe(34)
    expect(m.userData.truncated).toBe(true)
  })
  it('gives empty and blank text a finite blank plane', () => {
    for (const text of ['', '   ']) {
      const m = labelMesh(text, 'label', deps.palette)
      expect(m.userData.textless).toBe(true)
      const positions = Array.from(m.geometry.attributes.position.array as Float32Array)
      expect(positions.length).toBeGreaterThan(0)
      expect(positions.every((v) => Number.isFinite(v))).toBe(true)
    }
  })
  it('uploads a photo from a canvas copy, which three flips explicitly whatever the source', () => {
    const image = document.createElement('canvas')
    image.width = 1200
    image.height = 800
    const o = photoOf(image)
    expect(o.userData.fallback).toBeUndefined()
    const [photo] = textured(o)
    const copy = (photo.material as MeshBasicMaterial).map!.image as HTMLCanvasElement
    expect(copy).toBeInstanceOf(HTMLCanvasElement)
    expect(copy).not.toBe(image)
    expect([copy.width, copy.height]).toEqual([1200, 800])
    expect((photo.geometry as PlaneGeometry).parameters.width).toBeCloseTo(4.5)
  })
  it('keeps a portrait photo upright in its own aspect, fitted inside the frame box', () => {
    const image = document.createElement('canvas')
    image.width = 300
    image.height = 400
    const { width, height } = (textured(photoOf(image))[0].geometry as PlaneGeometry).parameters
    expect(width / height).toBeCloseTo(0.75)
    expect(height).toBeCloseTo(3)
  })
  it('fits a wide panorama to the frame box width', () => {
    const image = document.createElement('canvas')
    image.width = 1600
    image.height = 400
    const { width, height } = (textured(photoOf(image))[0].geometry as PlaneGeometry).parameters
    expect(width).toBeCloseTo(4.5)
    expect(height).toBeCloseTo(1.125)
  })
  it('falls back to the icon when the image would taint the canvas', () => {
    tainted = true
    const o = photoOf(document.createElement('canvas'))
    tainted = false
    expect(o.userData.fallback).toBe(true)
  })
  it('falls back to the icon when the image has no pixels', () => {
    const image = document.createElement('canvas')
    image.width = 0
    expect(photoOf(image).userData.fallback).toBe(true)
  })
  it('never splits a category into fragments and staggers neighbours instead', () => {
    const o = buildActor(actor('4:bars:0', { kind: 'bars', values: [3, 5, 2], categories: ['Electricity', 'Buildings', 'Agriculture'], highlight: null }), deps)
    const labels = textured(o)
    expect(labels.map((l) => l.userData.lines)).toEqual([['Electricity'], ['Buildings'], ['Agriculture']])
    expect(labels[1].position.y).toBeLessThan(labels[0].position.y)
    expect(labels[2].position.y).toBeCloseTo(labels[0].position.y)
  })
  it('drops a category that cannot be shown whole', () => {
    const o = buildActor(actor('4:bars:1', { kind: 'bars', values: [3, 5], categories: ['Electroencephalography', 'Buildings'], highlight: null }), deps)
    expect(textured(o).map((l) => l.userData.lines)).toEqual([['Buildings']])
  })
  it('stacks the card lines on a panel wide enough for them', () => {
    const o = buildActor(actor('9:card:0', { kind: 'card', lines: ['Why the sky is blue', 'Sources: Wikipedia', 'Made with Project Reelix'] }), deps)
    const labels = textured(o)
    expect(labels).toHaveLength(3)
    expect(labels[0].userData.labelPx).toBe(64)
    expect(labels[1].userData.labelPx).toBe(36)
    labels.slice(1).forEach((l, i) => expect(l.position.y).toBeLessThan(labels[i].position.y))
  })
})
