import { describe, expect, it } from 'vitest'
import { Box3, Mesh, Vector3 } from 'three'
import { THEMES } from '../../render/theme'
import type { ModelName } from '../kits'
import { stagePalette } from './materials'
import { MODEL_NAMES, buildModel, buildMolecule } from './models'

const palette = stagePalette(THEMES.night)
const meshes = (name: ModelName) => {
  const list: Mesh[] = []
  buildModel(name, palette).traverse((o) => o instanceof Mesh && list.push(o))
  return list
}

describe('buildModel', () => {
  it('has a builder for every model the kits can choose', () => expect(MODEL_NAMES.length).toBe(13))
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

