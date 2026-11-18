import { describe, expect, it } from 'vitest'
import type { Storyboard } from '../model/storyboard'
import { addOnlineVisuals } from './onlineVisuals'

const sb = { title: 'T', planner: 'rule-based', scenes: [], sources: [] } as unknown as Storyboard
const opts = { article: 'T', searchScenes: true, exclude: [] }

describe('addOnlineVisuals', () => {
  it('keeps the video when the photos code cannot load', async () => {
    expect(await addOnlineVisuals(sb, opts, () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')))).toEqual({ storyboard: sb, images: [] })
  })
  it('keeps the video when finding photos fails', async () => {
    const load = async () => ({ attachMolecules: async (s: Storyboard) => s, attachPhotos: async () => Promise.reject(new Error('boom')) })
    expect(await addOnlineVisuals(sb, opts, load as never)).toEqual({ storyboard: sb, images: [] })
  })
  it('still stops when the video is canceled', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(addOnlineVisuals(sb, { ...opts, signal: ctrl.signal }, () => Promise.reject(new DOMException('Canceled', 'AbortError')))).rejects.toThrow()
  })
  it('asks PubChem nothing when the text came from your own files', async () => {
    let asked = 0
    const load = async () => ({ attachMolecules: async (s: Storyboard) => (asked++, s), attachPhotos: async (s: Storyboard) => ({ storyboard: s, images: [] }) })
    await addOnlineVisuals(sb, { ...opts, searchScenes: false }, load as never)
    expect(asked).toBe(0)
  })
})

