// Photo candidates from the three keyless sources the spec allows: the Wikipedia article's own images, a Commons file
// search, and Openverse. Every client answers [] when its source fails, so a video never waits on a broken source.
import { licenseOf, plainText, type PhotoCandidate } from './select'

const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php'
const COMMONS = 'https://commons.wikimedia.org/w/api.php'
const OPENVERSE = 'https://api.openverse.org/v1/images/'
/** Thumbnails this wide are sharp at 1080p and light to load. */
const THUMB_WIDTH = 1280
/** Openverse's thumbnail proxy serves at most about this width. */
const OPENVERSE_WIDTH = 1024
const PHOTO_MIME = /^image\/(jpeg|png|webp|tiff)$/
const PHOTO_TYPE = /^(jpe?g|png|webp)$/

interface ImageInfo {
  mime?: string
  width?: number
  height?: number
  url?: string
  thumburl?: string
  thumbwidth?: number
  thumbheight?: number
  descriptionurl?: string
  extmetadata?: Record<string, { value?: string } | undefined>
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  try {
    const res = await fetch(url, { signal })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

/** A file page from the MediaWiki API as a candidate, or null when it is not a freely licensed photo. */
function fromImageInfo(page: { title: string; imageinfo?: ImageInfo[] }, origin: PhotoCandidate['origin']): PhotoCandidate | null {
  const ii = page.imageinfo?.[0]
  if (!ii?.url || !ii.width || !ii.height || !PHOTO_MIME.test(ii.mime ?? '')) return null
  const meta = ii.extmetadata ?? {}
  const license = licenseOf(meta.LicenseShortName?.value ?? '')
  if (!license) return null
  // A picture smaller than the thumbnail asked for comes back as the original.
  const thumb = ii.thumburl && ii.thumburl !== ii.url && ii.thumbwidth && ii.thumbheight
  return {
    url: thumb ? ii.thumburl! : ii.url,
    width: thumb ? ii.thumbwidth! : ii.width,
    height: thumb ? ii.thumbheight! : ii.height,
    title: page.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' '),
    description: plainText(meta.ImageDescription?.value ?? ''),
    artist: plainText(meta.Artist?.value ?? '') || 'Wikimedia Commons',
    license,
    source: ii.descriptionurl ?? ii.url,
    origin,
  }
}

async function mediaWiki(api: string, params: Record<string, string>, origin: PhotoCandidate['origin'], signal?: AbortSignal): Promise<PhotoCandidate[]> {
  const query = new URLSearchParams({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription',
    iiurlwidth: String(THUMB_WIDTH),
    format: 'json',
    formatversion: '2',
    origin: '*',
    ...params,
  })
  const data = (await getJson(`${api}?${query}`, signal)) as { query?: { pages?: { title: string; imageinfo?: ImageInfo[] }[] } } | null
  return (data?.query?.pages ?? []).flatMap((p) => fromImageInfo(p, origin) ?? [])
}

/** The freely licensed photos used in the English Wikipedia article `title`. */
export function articlePhotos(title: string, signal?: AbortSignal): Promise<PhotoCandidate[]> {
  return mediaWiki(WIKIPEDIA, { generator: 'images', titles: title, gimlimit: '50' }, 'article', signal)
}

/** Freely licensed photos on Wikimedia Commons whose file page matches `phrase`. */
export function commonsPhotos(phrase: string, signal?: AbortSignal): Promise<PhotoCandidate[]> {
  return mediaWiki(COMMONS, { generator: 'search', gsrsearch: `${phrase} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '20' }, 'commons', signal)
}

interface OpenverseResult {
  id: string
  title?: string
  creator?: string
  license?: string
  license_version?: string
  width?: number | null
  height?: number | null
  filetype?: string | null
  foreign_landing_url?: string
}

/**
 * Freely licensed photos from Openverse (anonymous: 20 requests a minute, 200 a day). Pixels come only through its
 * thumbnail proxy, which sends CORS headers, never from the original host (NASA's sends none).
 */
export async function openversePhotos(phrase: string, signal?: AbortSignal): Promise<PhotoCandidate[]> {
  const query = new URLSearchParams({ q: phrase, license: 'pdm,cc0,by,by-sa', page_size: '20', mature: 'false' })
  const data = (await getJson(`${OPENVERSE}?${query}`, signal)) as { results?: OpenverseResult[] } | null
  return (data?.results ?? []).flatMap((r): PhotoCandidate[] => {
    const license = licenseOf(`${r.license ?? ''} ${r.license_version ?? ''}`)
    if (!license || !r.width || !r.height || (r.filetype && !PHOTO_TYPE.test(r.filetype))) return []
    const k = Math.min(1, OPENVERSE_WIDTH / r.width)
    return [
      {
        url: `${OPENVERSE}${encodeURIComponent(r.id)}/thumb/?full_size=true`,
        width: Math.round(r.width * k),
        height: Math.round(r.height * k),
        title: plainText(r.title ?? ''),
        description: '',
        artist: plainText(r.creator ?? '') || 'Openverse',
        license,
        source: r.foreign_landing_url ?? `https://openverse.org/image/${r.id}`,
        origin: 'openverse',
      },
    ]
  })
}
