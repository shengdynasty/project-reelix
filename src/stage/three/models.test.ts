import { describe, expect, it } from 'vitest'
import { Box3, Mesh, Vector3 } from 'three'
import { THEMES } from '../../render/theme'
import type { ModelName } from '../kits'
import { stagePalette } from './materials'
import { MODEL_NAMES, buildModel } from './models'

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
