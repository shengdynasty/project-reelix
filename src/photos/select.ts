// Which online photos may be used and where: licences, scores against a scene's sentence, and the assignment of at
// most one photo per scene within the video's budget. Pure, so it is tested without the network.
import { contentWords } from '../input/parseText'

/** A licence the app may use, as credits show it: "Public domain", "CC0", "CC BY 2.0", "CC BY-SA 4.0". */
export type License = string

export interface PhotoCandidate {
  /** Pixels to load (a CORS readable thumbnail at most about 1280 px wide). */
  url: string
  width: number
  height: number
  title: string
  description: string
  artist: string
  license: License
  /** The page that credits the photo. */
  source: string
  origin: 'article' | 'commons' | 'openverse'
}

/** At most this many photos per video, and always fewer than half of its scenes. */
const MAX_PHOTOS = 8
/** Narrower than portrait 4:5 or wider than 2.2:1 crops badly in the 16:9 frame. */
const MIN_ASPECT = 0.8
const MAX_ASPECT = 2.2
/** Narrower than this looks soft at 1080p. */
const MIN_WIDTH = 640
const SHARP_WIDTH = 1200
const PENALTY = 1.5
const CREDIT_CHARS = 80

const NOT_FREE = /(^|[\s-])(nc|nd)([\s-]|$)|non.?commercial|no.?deriv|fair use/
const DRAWING = /\b(diagram|chart|graph|schematic|infographic|icon|plot)\b/i

/** The licence in `raw` (Commons LicenseShortName, or Openverse licence and version), or null unless PD, CC0, CC BY or CC BY-SA. */
export function licenseOf(raw: string): License | null {
  const s = raw.trim().toLowerCase().replace(/_/g, ' ')
  if (!s || NOT_FREE.test(s)) return null
  if (/^(pd\b|pd-|pdm\b|public domain)/.test(s)) return 'Public domain'
  if (/^cc[\s-]?(0|zero)\b/.test(s)) return 'CC0'
  const sa = s.match(/^(?:cc[\s-])?by[\s-]sa(?:[\s-](\d+(?:\.\d+)?))?/)
  if (sa) return sa[1] ? `CC BY-SA ${sa[1]}` : 'CC BY-SA'
  const by = s.match(/^(?:cc[\s-])?by(?:[\s-](\d+(?:\.\d+)?))?$/)
  if (by) return by[1] ? `CC BY ${by[1]}` : 'CC BY'
  return null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/** Metadata HTML as a credit can show it: no tags, entities decoded, one line, at most 80 characters cut at a word. */
export function plainText(html: string): string {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|[a-z]+|#39);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) : m))
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= CREDIT_CHARS) return text
  const cut = text.slice(0, CREDIT_CHARS + 1).lastIndexOf(' ')
  return text.slice(0, cut > 0 ? cut : CREDIT_CHARS)
}

/**
 * How well `c` shows `sentence`: two points per content word they share, one for a sharp picture, less 1.5 for a
 * flag, a logo, a map (unless the scene is about a place) or a portrait of someone the scene does not name, and
 * twice that for a PNG.
 * -Infinity when it cannot be used at all: an odd shape, too small, a drawing, or nothing in common with the sentence.
 */
export function scorePhoto(c: PhotoCandidate, sentence: string, opts: { place: boolean; people: string[] }): number {
  const aspect = c.width / c.height
  if (!(aspect >= MIN_ASPECT && aspect <= MAX_ASPECT) || c.width < MIN_WIDTH) return -Infinity
  if (DRAWING.test(c.title) || /\.svg\b/i.test(c.url)) return -Infinity
  const said = new Set(contentWords(sentence))
  const overlap = new Set(contentWords(`${c.title} ${c.description}`).filter((w) => said.has(w))).size
  if (!overlap) return -Infinity
  const title = c.title.toLowerCase()
  let penalties = 0
  if (/\bflag\b/.test(title)) penalties++
  if (/\blogo\b/.test(title)) penalties++
  if (/\bmap\b/.test(title) && !opts.place) penalties++
  if (/\b(portrait|headshot)\b/.test(title) && !opts.people.some((p) => title.includes(p.toLowerCase()))) penalties++
  // A PNG is most often a labelled drawing or a screenshot; a real photo of the same thing should win.
  if (/\.png(\?|$)/i.test(c.url)) penalties += 2
  return overlap * 2 + (c.width >= SHARP_WIDTH ? 1 : 0) - penalties * PENALTY
}

/**
 * At most one photo per eligible scene, best pairs first, each photo used once, at most MAX_PHOTOS and fewer than
 * half of all scenes. Keys are scene ids in the order they were given a photo.
 */
export function assignPhotos(
  scenes: { id: string; sentence: string; eligible: boolean; place: boolean; people: string[] }[],
  candidates: PhotoCandidate[],
): Map<string, PhotoCandidate> {
  const cap = Math.min(MAX_PHOTOS, Math.ceil(scenes.length / 2) - 1)
  const unique = candidates.filter((c, i) => candidates.findIndex((d) => d.url === c.url) === i)
  const pairs = scenes
    .filter((s) => s.eligible)
    .flatMap((s) => unique.map((c) => ({ s, c, score: scorePhoto(c, s.sentence, s) })))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
  const out = new Map<string, PhotoCandidate>()
  const used = new Set<string>()
  for (const { s, c } of pairs) {
    if (out.size >= cap) break
    if (out.has(s.id) || used.has(c.url)) continue
    out.set(s.id, c)
    used.add(c.url)
  }
  return out
}
