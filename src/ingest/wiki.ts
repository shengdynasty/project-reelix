// Fills in short topics ("black holes", "how do vaccines work?") from Wikipedia. The MediaWiki API is free,
// needs no key, and allows browser requests (origin=*). Text is CC BY-SA, so the article is credited.
import type { Doc, Section } from './types'
import { newSection } from './types'

const API = 'https://en.wikipedia.org/w/api.php'

/** Sections that list links or references rather than explain anything. */
const SKIP = /^(references|see also|external links|further reading|notes|bibliography|sources|citations|footnotes|explanatory notes|gallery|in popular culture|popular culture|works cited|literature|selected works|filmography|discography)$/i

export interface WikiResult {
  doc: Doc
  title: string
  url: string
  image: { bitmap: ImageBitmap; caption: string } | null
}

async function api(params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const url = `${API}?${new URLSearchParams({ format: 'json', origin: '*', formatversion: '2', ...params })}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`)
  return res.json()
}

interface Page {
  title: string
  extract?: string
  fullurl?: string
  thumbnail?: { source: string }
  pageimage?: string
  pageprops?: { disambiguation?: string }
}

/** "How do vaccines work?" -> "vaccines". Questions confuse full text search; the subject finds the main article. */
export function coreTopic(query: string): string {
  return query
    .replace(/[?!.]+$/, '')
    .replace(/^(please\s+)?(explain|describe|tell me about|teach me about|what about)\s+/i, '')
    .replace(/^(how|why|what|when|where|who|which)\s+(do|does|did|is|are|was|were|can|could|would|will|should|has|have)\s+/i, '')
    .replace(/^(what|who)\s+(is|are|was|were)\s+/i, '')
    .replace(/^(how|why)\s+/i, '')
    .replace(/^(we|you|i|they|people|humans)\s+/i, '')
    .replace(/\s+(work|works|function|functions|happen|happens|mean|means|matter|matters|form|forms|exist|exists)$/i, '')
    .replace(/^(a|an|the)\s+/i, '')
    .trim()
}

/** Best matching article for a topic or question, skipping disambiguation pages. */
export async function lookupTopic(query: string, signal?: AbortSignal): Promise<WikiResult | null> {
  const q = query.replace(/[?!.]+$/, '').trim()
  if (!q) return null
  const core = coreTopic(q)
  const search = (await api({ action: 'query', list: 'search', srsearch: core || q, srlimit: '4', srprop: '' }, signal)) as {
    query?: { search?: { title: string }[] }
  }
  // An exact title (with redirects, so "vaccines" finds "Vaccine") beats a full text match, except for "why"
  // questions, whose subject ("the sky blue") is not the thing to look up.
  const why = /^why\b/i.test(q)
  // A search hit must share a word with the topic: "Why do we dream?" must not land on an album called "...So Why Can't We?".
  const stem = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)
  const coreStems = core.split(/\s+/).filter((w) => w.length >= 3).map(stem)
  const relevant = (title: string) => !coreStems.length || title.split(/[\s,()–-]+/).some((w) => w.length >= 3 && coreStems.includes(stem(w)))
  const hits = (search.query?.search ?? []).map((r) => r.title).filter(relevant)
  const titles = why ? [] : [...new Set([core, ...hits].filter(Boolean))]
  if (core !== q) {
    const full = (await api({ action: 'query', list: 'search', srsearch: q, srlimit: '3', srprop: '' }, signal)) as { query?: { search?: { title: string }[] } }
    const extra = (full.query?.search ?? []).map((r) => r.title).filter(relevant)
    if (why) titles.push(...extra, core, ...hits)
    else for (const t of extra) if (!titles.includes(t)) titles.push(t)
  }
  for (const title of titles.slice(0, 4)) {
    const data = (await api(
      {
        action: 'query',
        prop: 'extracts|pageimages|info|pageprops',
        explaintext: '1',
        exsectionformat: 'wiki',
        redirects: '1',
        titles: title,
        pithumbsize: '1280',
        inprop: 'url',
        ppprop: 'disambiguation',
      },
      signal,
    )) as { query?: { pages?: Page[] } }
    const page = data.query?.pages?.[0]
    if (!page?.extract || page.pageprops?.disambiguation !== undefined || /may refer to:/.test(page.extract.slice(0, 300))) continue
    const doc = extractToDoc(page.title, page.extract)
    if (!doc.sections.length) continue
    let image: WikiResult['image'] = null
    if (page.thumbnail?.source) {
      try {
        const res = await fetch(page.thumbnail.source, { signal, mode: 'cors' })
        if (res.ok) {
          const bitmap = await createImageBitmap(await res.blob())
          // The file name only makes a caption when it is descriptive ("Smallpox vaccine", not "Figure 38 04 02").
          const fromFile = (page.pageimage ?? '')
            .replace(/\.[a-z]+$/i, '')
            .replace(/_/g, ' ')
            .replace(/\s*\(.*?\)\s*/g, ' ')
            .replace(/\b(en|svg|png|jpg|jpeg)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          const titleWords = page.title.toLowerCase().split(/\s+/)
          const descriptive = fromFile && !/\d{2,}|\b(figure|fig|img|dsc|image|file|diagram|chart)\b/i.test(fromFile) && titleWords.some((w) => fromFile.toLowerCase().includes(w.slice(0, 5)))
          image = { bitmap, caption: descriptive ? fromFile : page.title }
        }
      } catch {
        // The article still works without its picture.
      }
    }
    return { doc, title: page.title, url: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`, image }
  }
  return null
}

/** Plain text extract with "== Heading ==" markers to sections, keeping the intro and explanatory sections. */
export function extractToDoc(title: string, extract: string, maxWords = 9000, perSection = 450): Doc {
  const sections: Section[] = [newSection('', 1)]
  let words = 0
  let sectionWords = 0
  let skipLevel = 0
  for (const raw of extract.split('\n')) {
    const line = raw.trim()
    const h = line.match(/^(={2,6})\s*(.+?)\s*\1$/)
    if (h) {
      const level = h[1].length - 1
      if (skipLevel && level > skipLevel) continue
      skipLevel = SKIP.test(h[2]) ? level : 0
      if (!skipLevel) sections.push(newSection(h[2], level))
      sectionWords = 0
      continue
    }
    if (!line || skipLevel || words > maxWords || sectionWords > perSection) continue
    // Drop formula residue and stub lines.
    if (/\\displaystyle|\{\\|\^\{|_\{/.test(line) || line.split(/\s+/).length < 4) continue
    sections[sections.length - 1].paragraphs.push(line)
    const n = line.split(/\s+/).length
    words += n
    sectionWords += n
  }
  return { name: `Wikipedia: ${title}`, kind: 'wiki', title, sections: sections.filter((s) => s.paragraphs.length || s.heading) }
}
