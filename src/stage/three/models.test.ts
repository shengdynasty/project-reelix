import { describe, expect, it } from 'vitest'
import { Box3, Mesh, Vector3 } from 'three'
import { THEMES } from '../../render/theme'
import type { ModelName } from '../kits'
import { stagePalette } from './materials'
import { LIGHT, MODEL_NAMES, buildModel, buildMolecule, calmModelPose, moveModel } from './models'
import { actorPose } from '../pose'
import { prepare } from './stage'
import { MeshStandardMaterial } from 'three'

const palette = stagePalette(THEMES.night)
const meshes = (name: ModelName) => {
  const list: Mesh[] = []
  buildModel(name, palette).traverse((o) => o instanceof Mesh && list.push(o))
  return list
}

describe('buildModel', () => {
  it('has a builder for every model the kits can choose', () => expect(MODEL_NAMES.length).toBe(14))
  it.each(MODEL_NAMES)('builds %s from real meshes inside the unit box an icon fills', (name) => {
    const o = buildModel(name, palette)
    o.updateMatrixWorld(true)
    const box = new Box3().setFromObject(o)
    expect(meshes(name).length).toBeGreaterThan(0)
    expect(box.isEmpty()).toBe(false)
    for (const v of [box.min, box.max]) for (const c of v.toArray()) expect(Math.abs(c)).toBeLessThanOrEqual(0.56)
    expect(box.getSize(new Vector3()).length()).toBeGreaterThan(0.6)
  })
  it.each(MODEL_NAMES)('builds %s the same way every time', (name) => {
    const count = (n: ModelName) => meshes(n).map((m) => m.geometry.attributes.position.count)
    expect(count(name)).toEqual(count(name))
  })
})

describe('buildMolecule', () => {
  const water = {
    atoms: [
      { element: 'O', x: 0, y: 0, z: 0 },
      { element: 'H', x: 0.2774, y: 0.8929, z: 0.2544 },
      { element: 'H', x: 0.6068, y: -0.2383, z: -0.7169 },
    ],
    bonds: [
      { a: 0, b: 1, order: 1 },
      { a: 0, b: 2, order: 1 },
    ],
  }
  it('draws a ball per atom and a stick per bond, centred inside the unit box', () => {
    const o = buildMolecule(water, palette)
    o.updateMatrixWorld(true)
    const list: Mesh[] = []
    o.traverse((m) => m instanceof Mesh && list.push(m))
    expect(list).toHaveLength(5)
    const box = new Box3().setFromObject(o)
    for (const c of [...box.min.toArray(), ...box.max.toArray()]) expect(Math.abs(c)).toBeLessThanOrEqual(0.56)
    expect(box.getSize(new Vector3()).length()).toBeGreaterThan(0.6)
  })
})

describe('moveModel', () => {
  const state = (o: ReturnType<typeof buildModel>) => {
    const out: number[] = []
    o.traverse((c) => out.push(c.rotation.y, c.rotation.z, c.position.y))
    return out
  }
  it.each(MODEL_NAMES)('poses %s from t alone, so a frame is the same reached in order or directly', (name) => {
    const direct = buildModel(name, palette)
    moveModel(direct, 5000, false)
    const stepped = buildModel(name, palette)
    for (const t of [0, 1200, 3100, 5000]) moveModel(stepped, t, false)
    expect(state(stepped)).toEqual(state(direct))
  })
  it('moves something on a spinning model, less under reduced motion, and leaves its outer group to the stage', () => {
    const full = buildModel('black-hole', palette)
    const calm = buildModel('black-hole', palette)
    moveModel(full, 2000, false)
    moveModel(calm, 2000, true)
    const turn = (o: ReturnType<typeof buildModel>) => Math.max(...state(o).map(Math.abs))
    expect(turn(full)).toBeGreaterThan(turn(calm))
    expect(turn(calm)).toBeGreaterThan(0)
    expect([full.rotation.y, full.position.y]).toEqual([0, 0])
  })
})

describe('model fixes', () => {
  const standard = (o: ReturnType<typeof buildModel>) => {
    const list: Mesh[] = []
    o.traverse((m) => m instanceof Mesh && m.material instanceof MeshStandardMaterial && list.push(m))
    return list
  }
  it.each(MODEL_NAMES)('draws the see-through shells of %s last, without depth or shadow, so what is inside shows', (name) => {
    const o = buildModel(name, palette)
    prepare(o)
    for (const m of standard(o).filter((x) => (x.material as MeshStandardMaterial).userData.baseOpacity < 1)) {
      expect(m.castShadow).toBe(false)
      expect(m.renderOrder).toBeGreaterThanOrEqual(1)
      expect((m.material as MeshStandardMaterial).depthWrite).toBe(false)
    }
  })
  it('keeps the sun, lava, oceans and rain in their real colours on every theme', () => {
    const colours = (name: ModelName) => standard(buildModel(name, palette)).map((m) => '#' + (m.material as MeshStandardMaterial).color.getHexString())
    expect(colours('star')).toContain(LIGHT.sun)
    expect(colours('volcano')).toContain(LIGHT.lava)
    expect(colours('globe')).toContain(LIGHT.ocean)
    expect(colours('water-cycle')).toContain(LIGHT.ocean)
  })
  it('sizes atoms to the bonds, so a long molecule stays a ball and stick model, not a clump', () => {
    const chain = { atoms: Array.from({ length: 12 }, (_, i) => ({ element: 'C', x: i * 1.3, y: (i % 2) * 0.75, z: 0 })), bonds: Array.from({ length: 11 }, (_, i) => ({ a: i, b: i + 1, order: 1 })) }
    const o = buildMolecule(chain, palette)
    o.updateMatrixWorld(true)
    const balls = standard(o).filter((m) => m.geometry.type === 'SphereGeometry')
    const gap = balls[0].position.distanceTo(balls[1].position)
    for (const b of balls) expect((b.geometry as unknown as SphereGeometryLike).parameters.radius).toBeLessThanOrEqual(0.4 * gap)
  })
  it('calms the turns narration verbs add under reduced motion', () => {
    const spec = { id: '1:model:0', at: [0, 0, 0] as [number, number, number], scale: 2, data: { kind: 'model' as const, model: 'planet' as const }, beats: [{ t: 0, dur: 0, action: 'enter' as const }, { t: 1000, dur: 1200, action: 'spin' as const }] }
    expect(calmModelPose(actorPose(spec, 1600)).rotation[1]).toBeLessThanOrEqual(0.3 * Math.PI + 1e-9)
  })
})
type SphereGeometryLike = { parameters: { radius: number } }

