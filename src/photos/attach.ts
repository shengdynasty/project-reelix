// Gives a storyboard's single-hero scenes (the title and definitions) online photos: candidates from the Wikipedia article the
// video already used, then Commons and Openverse searches for scenes still without one, assigned within the video's
// budget, decoded, and credited both on the scene and in the sources list.
import type { IngestedImage } from '../ingest/types'
import { contentWords } from '../input/parseText'
import type { Scene, Storyboard } from '../model/storyboard'
import { kitModel } from '../stage/kits'
import { labelFor } from '../stage/labels'
import { assignPhotos, plainText, scorePhoto, type PhotoCandidate } from './select'
import { articlePhotos, commonsPhotos, openversePhotos } from './source'

/** Scenes whose 3D piece shows one hero object, which a photo can replace. */
const ELIGIBLE = new Set<Scene['visual']['kind']>(['title', 'definition'])
/** Whatever is decoded by then is used; the video never waits longer for photos. */
const TIMEOUT_MS = 8000
/** Searches per source, so a long video stays well inside Openverse's 20 requests a minute. */
const MAX_SEARCHES = 3
/** Rounds of assigning again after decode failures. */
const ROUNDS = 3
/** The end card's photo line keeps each artist this short, so every credit fits. */
const SHORT_ARTIST = 32

export interface AttachOptions {
  /** The Wikipedia article title the video's text came from. */
  article: string
  /** Search Commons and Openverse with scene phrases; off when the text came from the user's files. */
  searchScenes: boolean
  signal?: AbortSignal
  timeoutMs?: number
  load?: (url: string, signal?: AbortSignal) => Promise<ImageBitmap>
  /** Pixel URLs the video already shows (the article's lead image), never used again. */
  exclude?: string[]
}

async function loadBitmap(url: string, signal?: AbortSignal): Promise<ImageBitmap> {
  const res = await fetch(url, { mode: 'cors', signal })
  if (!res.ok) throw new Error(`Photo answered ${res.status}`)
  return createImageBitmap(await res.blob())
}

/** What to search for a scene: the defined term, the title, or the label its sentence would get. */
function phraseOf(scene: Scene, topicWords: string[]): string {
  const v = scene.visual
  if (v.kind === 'definition') return v.term
  if (v.kind === 'title') return v.title
  return labelFor(scene.narration, topicWords) ?? scene.narration
}

export async function attachPhotos(sb: Storyboard, opts: AttachOptions): Promise<{ storyboard: Storyboard; images: IngestedImage[] }> {
  const unchanged = { storyboard: sb, images: [] }
  // A scene showing a molecule keeps it, and a definition keeps its topic kit's model (the title takes the photo);
  // a photo there would be credited without being seen.
  const kitted = (s: Scene) => s.visual.kind === 'definition' && kitModel({ topic: sb.title, sentence: s.narration, term: s.visual.term }) !== null
  const canShow = (s: Scene) => ELIGIBLE.has(s.visual.kind) && !s.molecule && !kitted(s)
  const eligible = sb.scenes.filter(canShow)
  if (!eligible.length) return unchanged
  // The deadline stops the work, not just the wait: searches and decodes after it are canceled.
  const ctrl = new AbortController()
  const stop = () => ctrl.abort()
  opts.signal?.addEventListener('abort', stop)
  const load = opts.load ?? loadBitmap
  const skip = new Set(opts.exclude ?? [])
  const scenes = sb.scenes.map((s) => ({ id: s.id, sentence: s.narration, eligible: canShow(s), place: false, people: [] }))
  const fits = (s: Scene, list: PhotoCandidate[]) => list.some((c) => scorePhoto(c, s.narration, { place: false, people: [] }) > 0)
  let picks = new Map<string, PhotoCandidate>()
  const loaded = new Map<string, ImageBitmap>()

  const work = (async () => {
    const usable = (list: PhotoCandidate[]) => list.filter((c) => !skip.has(c.url))
    let candidates = usable(await articlePhotos(opts.article, ctrl.signal))
    if (opts.searchScenes) {
      const topic = contentWords(sb.title)
      for (const search of [commonsPhotos, openversePhotos]) {
        for (const s of eligible.filter((e) => !fits(e, candidates)).slice(0, MAX_SEARCHES)) {
          if (ctrl.signal.aborted) return
          candidates = [...candidates, ...usable(await search(phraseOf(s, topic), ctrl.signal))]
        }
      }
    }
    const failed = new Set<string>()
    for (let round = 0; round < ROUNDS; round++) {
      if (ctrl.signal.aborted) return
      picks = assignPhotos(scenes, candidates.filter((c) => !failed.has(c.url)))
      const todo = [...picks.values()].filter((c) => !loaded.has(c.url))
      if (!todo.length) return
      await Promise.all(
        todo.map(async (c) => {
          try {
            const bitmap = await load(c.url, ctrl.signal)
            // A picture decoded after the deadline is never shown: give its memory back.
            if (ctrl.signal.aborted) bitmap.close?.()
            else loaded.set(c.url, bitmap)
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
  stop()
  opts.signal?.removeEventListener('abort', stop)
  if (opts.signal?.aborted) throw new DOMException('Canceled', 'AbortError')

  const images: IngestedImage[] = []
  const photos = new Map<string, NonNullable<Scene['photo']>>()
  const credits: Storyboard['sources'] = []
  for (const [sceneId, c] of picks) {
    const bitmap = loaded.get(c.url)
    if (!bitmap) continue
    const imageId = `photo-${images.length + 1}`
    images.push({ id: imageId, name: c.title, caption: c.title, bitmap, url: c.url })
    photos.set(sceneId, { imageId, credit: `Photo: ${c.artist}, ${c.license}` })
    credits.push({ label: `Photo: ${c.title} by ${c.artist} (${c.license})`, url: c.source, credit: `${plainText(c.artist, SHORT_ARTIST)} (${c.license})` })
  }
  // Pictures decoded for a pick that a later round replaced are never shown either.
  const shown = new Set([...picks.values()].map((c) => c.url))
  for (const [url, bitmap] of loaded) if (!shown.has(url)) bitmap.close?.()
  if (!images.length) return unchanged
  return {
    storyboard: { ...sb, scenes: sb.scenes.map((s) => (photos.has(s.id) ? { ...s, photo: photos.get(s.id) } : s)), sources: [...sb.sources, ...credits] },
    images,
  }
}
