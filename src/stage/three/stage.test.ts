// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Mesh } from 'three'
import { THEMES } from '../../render/theme'
import { fixturePlan } from '../__fixtures__/plan'
import { cueSkew } from '../accept'
import { directVideo } from '../director'
import { buildActor } from './actors'
import { stagePalette } from './materials'
import { countText, createStage, disposeObject } from './stage'

const deps = { palette: stagePalette(THEMES.night), images: new Map() }

describe('createStage', () => {
  it('gives null where WebGL2 is unavailable instead of throwing', () => {
    expect(createStage({ width: 64, height: 36, quality: 'preview' })).toBeNull()
  })
})

describe('countText', () => {
  it('scales the first number and keeps the rest of the text, its decimals and its grouping', () => {
    expect(countText('42%', 0.5)).toBe('21%')
    expect(countText('42%', 0)).toBe('0%')
    expect(countText('42%', 1)).toBe('42%')
    expect(countText('1,284 hours', 0.25)).toBe('321 hours')
    expect(countText('1,284 hours', 1)).toBe('1,284 hours')
    expect(countText('$4.2M', 0.5)).toBe('$2.1M')
    expect(countText('0.5%', 0)).toBe('0.0%')
    expect(countText('no number', 0.3)).toBe('no number')
  })
})

describe('disposeObject', () => {
  const meshesOf = (o: ReturnType<typeof buildActor>) => {
    const out: Mesh[] = []
    o.traverse((c) => {
      if (c instanceof Mesh) out.push(c)
    })
    return out
  }

  it('frees the materials of an icon but never its shared geometry', () => {
    const icon = buildActor({ id: '0:hero:0', at: [0, 0, 0], scale: 1, data: { kind: 'icon', icon: 'drop', accent: true }, beats: [] }, deps)
    const meshes = meshesOf(icon)
    expect(meshes.length).toBeGreaterThanOrEqual(2)
    let geometries = 0
    let materials = 0
    for (const m of meshes) {
      m.geometry.addEventListener('dispose', () => geometries++)
      ;(m.material as Mesh['material'] & { addEventListener: (type: 'dispose', fn: () => void) => void }).addEventListener('dispose', () => materials++)
    }
    disposeObject(icon)
    expect(geometries).toBe(0)
    expect(materials).toBe(meshes.length)
  })

  it('frees a label plane, which belongs to the actor', () => {
    const label = buildActor({ id: '0:label:0', at: [0, 0, 0], scale: 1, data: { kind: 'label', text: 'Sunlight', size: 'label' }, beats: [] }, deps)
    const [plane] = meshesOf(label)
    let geometries = 0
    plane.geometry.addEventListener('dispose', () => geometries++)
    disposeObject(label)
    expect(geometries).toBe(1)
  })
})

describe('cueSkew', () => {
  const plan = fixturePlan()
  const set = directVideo(plan, { hasImage: () => true })
  it('finds motion within 150 ms of every sound and named word of the fixture, each bar column from its own rise', () => {
    expect(cueSkew(plan, set)).toBeLessThanOrEqual(150)
  })
  it('catches a token that lands 400 ms after its pops', () => {
    const late = <B extends { t: number; action: string }>(b: B): B => (b.action === 'travel' || b.action === 'pulse' ? { ...b, t: b.t + 400 } : b)
    const shifted = { ...set, pieces: set.pieces.map((p) => (p.actors.some((a) => a.data.kind === 'token') ? { ...p, actors: p.actors.map((a) => ({ ...a, beats: a.beats.map(late) })) } : p)) }
    expect(cueSkew(plan, shifted)).toBeGreaterThan(150)
  })
  it('catches a whoosh in the middle of a hold, away from every camera move', () => {
    const keys = set.pieces.flatMap((p) => p.camera)
    const i = keys.findIndex((k, j) => j > 0 && k.t - keys[j - 1].t > 2000)
    const mid = (keys[i - 1].t + keys[i].t) / 2
    expect(cueSkew({ ...plan, sfx: [...plan.sfx, { t: mid, kind: 'whoosh', gain: 1, pan: 0 }] }, set)).toBeGreaterThan(150)
  })
})
