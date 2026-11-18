import { describe, expect, it } from 'vitest'
import { createDepthCache } from './depth'

const map = { width: 2, height: 1, data: new Uint8Array([1, 2]) }
const bitmap = {} as ImageBitmap

describe('createDepthCache', () => {
  it('answers from the cache without running the model', async () => {
    let runs = 0
    const depthFor = createDepthCache({ run: async () => (runs++, map), get: async () => map, put: async () => {} })
    expect(await depthFor('k', bitmap)).toEqual(map)
    expect(runs).toBe(0)
  })
  it('runs the model on a miss and keeps the result', async () => {
    const kept: string[] = []
    const depthFor = createDepthCache({ run: async () => map, get: async () => undefined, put: async (key) => void kept.push(key) })
    expect(await depthFor('k', bitmap)).toEqual(map)
    expect(kept).toEqual(['k'])
  })
  it('gives null when the model fails, and keeps nothing', async () => {
    const kept: string[] = []
    const depthFor = createDepthCache({
      run: async () => {
        throw new Error('no model')
      },
      get: async () => undefined,
      put: async (key) => void kept.push(key),
    })
    expect(await depthFor('k', bitmap)).toBeNull()
    expect(kept).toEqual([])
  })
  it('treats a cache that cannot be read or written as a miss', async () => {
    const depthFor = createDepthCache({
      run: async () => map,
      get: async () => {
        throw new Error('blocked')
      },
      put: async () => {
        throw new Error('blocked')
      },
    })
    expect(await depthFor('k', bitmap)).toEqual(map)
  })
})
