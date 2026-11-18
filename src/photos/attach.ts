// Gives a storyboard's single-hero scenes (definition, stat) online photos: candidates from the Wikipedia article the
// video already used, then Commons and Openverse searches for scenes still without one, assigned within the video's
// budget, decoded, and credited both on the scene and in the sources list.
import type { IngestedImage } from '../ingest/types'
import { contentWords } from '../input/parseText'
import type { Scene, Storyboard } from '../model/storyboard'
import { labelFor } from '../stage/labels'
import { assignPhotos, scorePhoto, type PhotoCandidate } from './select'
import { articlePhotos, commonsPhotos, openversePhotos } from './source'

/** Scenes whose 3D piece shows one hero object, which a photo can replace. */
const ELIGIBLE = new Set<Scene['visual']['kind']>(['definition', 'stat'])
/** Whatever is decoded by then is used; the video never waits longer for photos. */
const TIMEOUT_MS = 8000
/** Searches per source, so a long video stays well inside Openverse's 20 requests a minute. */
const MAX_SEARCHES = 3
/** Rounds of assigning again after decode failures. */
const ROUNDS = 3

export interface AttachOptions {
  /** The Wikipedia article title the video's text came from. */
  article: string
  /** Search Commons and Openverse with scene phrases; off when the text came from the user's files. */
  searchScenes: boolean
  signal?: AbortSignal
  timeoutMs?: number
  load?: (url: string) => Promise<ImageBitmap>
}

async function loadBitmap(url: string, signal?: AbortSignal): Promise<ImageBitmap> {
  const res = await fetch(url, { mode: 'cors', signal })
  if (!res.ok) throw new Error(`Photo answered ${res.status}`)
  return createImageBitmap(await res.blob())
}

/** What to search for a scene: the defined term, or the label its sentence would get. */
function phraseOf(scene: Scene, topicWords: string[]): string {
  const v = scene.visual
  if (v.kind === 'definition') return v.term
  return labelFor(scene.narration, topicWords) ?? (v.kind === 'stat' ? v.label : scene.narration)
}

export async function attachPhotos(sb: Storyboard, opts: AttachOptions): Promise<{ storyboard: Storyboard; images: IngestedImage[] }> {
  const unchanged = { storyboard: sb, images: [] }
  const eligible = sb.scenes.filter((s) => ELIGIBLE.has(s.visual.kind))
  if (!eligible.length) return unchanged
  const load = opts.load ?? ((url: string) => loadBitmap(url, opts.signal))
  const scenes = sb.scenes.map((s) => ({ id: s.id, sentence: s.narration, eligible: ELIGIBLE.has(s.visual.kind), place: false, people: [] }))
  const fits = (s: Scene, list: PhotoCandidate[]) => list.some((c) => scorePhoto(c, s.narration, { place: false, people: [] }) > 0)
  let picks = new Map<string, PhotoCandidate>()
  const loaded = new Map<string, ImageBitmap>()

  const work = (async () => {
    let candidates = await articlePhotos(opts.article, opts.signal)
    if (opts.searchScenes) {
      const topic = contentWords(sb.title)
      for (const search of [commonsPhotos, openversePhotos]) {
        for (const s of eligible.filter((e) => !fits(e, candidates)).slice(0, MAX_SEARCHES)) candidates = [...candidates, ...(await search(phraseOf(s, topic), opts.signal))]
      }
    }
    const failed = new Set<string>()
    for (let round = 0; round < ROUNDS; round++) {
      picks = assignPhotos(scenes, candidates.filter((c) => !failed.has(c.url)))
      const todo = [...picks.values()].filter((c) => !loaded.has(c.url))
      if (!todo.length) return
      await Promise.all(
        todo.map(async (c) => {
          try {
            loaded.set(c.url, await load(c.url))
          } catch {
            failed.add(c.url)
          }
        }),
      )
    }
  })().catch(() => {})

  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([work, new Promise((resolve) => (timer = setTimeout(resolve, opts.timeoutMs ?? TIMEOUT_MS)))])
  clearTimeout(timer)
  if (opts.signal?.aborted) throw new DOMException('Canceled', 'AbortError')

  const images: IngestedImage[] = []
  const photos = new Map<string, NonNullable<Scene['photo']>>()
  const credits: Storyboard['sources'] = []
  for (const [sceneId, c] of picks) {
    const bitmap = loaded.get(c.url)
    if (!bitmap) continue
    const imageId = `photo-${images.length + 1}`
    images.push({ id: imageId, name: c.title, caption: c.title, bitmap })
    photos.set(sceneId, { imageId, credit: `Photo: ${c.artist}, ${c.license}` })
    credits.push({ label: `Photo: ${c.title} by ${c.artist} (${c.license})`, url: c.source })
  }
  if (!images.length) return unchanged
  return {
    storyboard: { ...sb, scenes: sb.scenes.map((s) => (photos.has(s.id) ? { ...s, photo: photos.get(s.id) } : s)), sources: [...sb.sources, ...credits] },
    images,
  }
}
