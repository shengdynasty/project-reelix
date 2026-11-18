import { describe, expect, it, vi } from 'vitest'
import type { Storyboard } from '../model/storyboard'
import { fixtureStoryboard } from '../stage/__fixtures__/plan'
import { attachPhotos } from './attach'
import type { PhotoCandidate } from './select'
import { articlePhotos, commonsPhotos, openversePhotos } from './source'

vi.mock('./source', () => ({ articlePhotos: vi.fn(), commonsPhotos: vi.fn(), openversePhotos: vi.fn() }))
const article = vi.mocked(articlePhotos)
const commons = vi.mocked(commonsPhotos)
const openverse = vi.mocked(openversePhotos)

const bitmap = {} as ImageBitmap
const load = async () => bitmap
const photo = (n: number, over: Partial<PhotoCandidate> = {}): PhotoCandidate => ({
  url: `https://upload.wikimedia.org/${n}.jpg`,
  width: 1600,
  height: 1000,
  title: `Diffuse sky radiation over the sea ${n}`,
  description: 'Sunlight scattered by molecules in the atmosphere makes the sky look blue',
  artist: `Artist ${n}`,
  license: 'CC BY-SA 4.0',
  source: `https://commons.wikimedia.org/wiki/File:${n}.jpg`,
  origin: 'article',
  ...over,
})
const sources = (a: PhotoCandidate[], c: PhotoCandidate[] = [], o: PhotoCandidate[] = []) => {
  article.mockReset().mockResolvedValue(a)
  commons.mockReset().mockResolvedValue(c)
  openverse.mockReset().mockResolvedValue(o)
}
const sceneOf = (sb: Storyboard, id: string) => sb.scenes.find((s) => s.id === id)!

describe('attachPhotos', () => {
  it('leaves the storyboard alone when no photo fits', async () => {
    sources([])
    const sb = fixtureStoryboard()
    const out = await attachPhotos(sb, { article: 'Diffuse sky radiation', searchScenes: true, load })
    expect(out.storyboard).toEqual(sb)
    expect(out.images).toEqual([])
  })
  it('puts a photo on the title and definition scenes with a credit line, and lists each credit in the sources', async () => {
    sources([photo(1), photo(2)])
    const sb = fixtureStoryboard()
    sb.title = 'Sunlight'
    const at = sb.scenes.findIndex((s) => s.id === 'definition')
    sb.scenes[at] = { ...sb.scenes[at], narration: 'Diffuse sky radiation is sunlight that reaches the ground from the whole sky, not straight from the sun.' }
    const out = await attachPhotos(sb, { article: 'Diffuse sky radiation', searchScenes: true, load })
    const def = sceneOf(out.storyboard, 'definition').photo!
    expect(def.credit).toMatch(/^Photo: Artist \d, CC BY-SA 4\.0$/)
    expect(sceneOf(out.storyboard, 'title').photo).toBeDefined()
    expect(sceneOf(out.storyboard, 'stat').photo).toBeUndefined()
    expect(out.images.map((i) => i.id).sort()).toEqual([def.imageId, sceneOf(out.storyboard, 'title').photo!.imageId].sort())
    expect(out.images.every((i) => i.bitmap === bitmap)).toBe(true)
    expect(out.storyboard.sources.filter((s) => s.label.startsWith('Photo: '))).toHaveLength(2)
    expect(out.storyboard.sources[0]).toEqual(fixtureStoryboard().sources[0])
  })
  it('gives the scene the next photo when the best one cannot be decoded', async () => {
    sources([photo(1, { title: 'Diffuse sky radiation sunlight scattered molecules atmosphere' }), photo(2)])
    const failing = async (url: string) => (url.endsWith('/1.jpg') ? Promise.reject(new Error('decode')) : bitmap)
    const out = await attachPhotos(fixtureStoryboard(), { article: 'Diffuse sky radiation', searchScenes: true, load: failing })
    const used = out.storyboard.sources.filter((s) => s.label.startsWith('Photo: ')).map((s) => s.url)
    expect(used).not.toContain('https://commons.wikimedia.org/wiki/File:1.jpg')
    expect(used).toContain('https://commons.wikimedia.org/wiki/File:2.jpg')
  })
  it('searches Commons, then Openverse, only for scenes still without a photo, and never when scene searches are off', async () => {
    sources([], [], [photo(3, { origin: 'openverse' })])
    const out = await attachPhotos(fixtureStoryboard(), { article: 'Diffuse sky radiation', searchScenes: true, load })
    expect(commons).toHaveBeenCalled()
    expect(openverse).toHaveBeenCalled()
    expect(out.images).toHaveLength(1)
    sources([], [photo(4)], [photo(5)])
    const off = await attachPhotos(fixtureStoryboard(), { article: 'Diffuse sky radiation', searchScenes: false, load })
    expect(commons).not.toHaveBeenCalled()
    expect(openverse).not.toHaveBeenCalled()
    expect(off.images).toEqual([])
  })
  it("leaves a definition its topic kit's model, and gives the title the photo", async () => {
    sources([photo(1), photo(2)])
    const out = await attachPhotos(fixtureStoryboard(), { article: 'Diffuse sky radiation', searchScenes: true, load })
    expect(sceneOf(out.storyboard, 'definition').photo).toBeUndefined()
    expect(sceneOf(out.storyboard, 'title').photo).toBeDefined()
  })
  it('leaves a scene that shows a molecule without a photo', async () => {
    sources([photo(1), photo(2)])
    const sb = fixtureStoryboard()
    const at = sb.scenes.findIndex((s) => s.id === 'definition')
    sb.scenes[at] = { ...sb.scenes[at], molecule: { atoms: [{ element: 'O', x: 0, y: 0, z: 0 }], bonds: [] } }
    const out = await attachPhotos(sb, { article: 'Diffuse sky radiation', searchScenes: true, load })
    expect(sceneOf(out.storyboard, 'definition').photo).toBeUndefined()
  })
  it('asks no source at all when no scene can show a photo', async () => {
    sources([photo(1)])
    const sb = fixtureStoryboard()
    sb.scenes = sb.scenes.filter((s) => s.visual.kind !== 'definition' && s.visual.kind !== 'title')
    await attachPhotos(sb, { article: 'Diffuse sky radiation', searchScenes: true, load })
    expect(article).not.toHaveBeenCalled()
  })
  it('never uses a picture the video already shows', async () => {
    sources([photo(1), photo(2)])
    const out = await attachPhotos(fixtureStoryboard(), { article: 'Diffuse sky radiation', searchScenes: true, load, exclude: [photo(1).url] })
    expect(out.storyboard.sources.map((s) => s.url)).not.toContain(photo(1).source)
  })
  it('stops searching and decoding at the deadline and closes pictures that arrive late', async () => {
    article.mockReset().mockResolvedValue([])
    commons.mockReset().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([]), 60)))
    openverse.mockReset().mockResolvedValue([])
    await attachPhotos(fixtureStoryboard(), { article: 'Diffuse sky radiation', searchScenes: true, load, timeoutMs: 20 })
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(openverse).not.toHaveBeenCalled()
    sources([photo(1)])
    let seen: AbortSignal | undefined
    let closed = 0
    const late = (_url: string, signal?: AbortSignal) => ((seen = signal), new Promise<ImageBitmap>((resolve) => setTimeout(() => resolve({ close: () => closed++ } as unknown as ImageBitmap), 60)))
    await attachPhotos(fixtureStoryboard(), { article: 'Diffuse sky radiation', searchScenes: true, load: late, timeoutMs: 20 })
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(seen?.aborted).toBe(true)
    expect(closed).toBe(1)
  })
  it('returns what was ready when the time runs out', async () => {
    sources([photo(1), photo(2)])
    const never = () => new Promise<ImageBitmap>(() => {})
    const out = await attachPhotos(fixtureStoryboard(), { article: 'Diffuse sky radiation', searchScenes: true, load: never, timeoutMs: 30 })
    expect(out.images).toEqual([])
    expect(out.storyboard).toEqual(fixtureStoryboard())
  })
})
