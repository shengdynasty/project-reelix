import type { DataSeries } from '../model/storyboard'
import { parseRows, parseTable } from '../input/parseTable'
import type { Corpus, Doc, IngestedImage } from './types'
import { cleanName, corpusWords, definedSubject, docWords } from './types'
import { htmlToText, rtfToText, textToDoc } from './text'
import { readDocx, readOdf, readPptx, readXlsx } from './office'
import type { OfficeResult } from './office'
import { lookupTopic } from './wiki'

export type { Corpus } from './types'

/** Below this many words the input is "limited", and the app fills in the topic from Wikipedia. */
export const THIN_WORDS = 80

export const ACCEPT =
  '.pdf,.docx,.pptx,.xlsx,.csv,.tsv,.txt,.md,.markdown,.rtf,.html,.htm,.json,.odt,.odp,.ods,image/png,image/jpeg,image/webp,image/gif'

export interface BuildOptions {
  text: string
  files: File[]
  lookup: boolean
  onStatus: (message: string) => void
  signal?: AbortSignal
}

let imageCounter = 0
const imgId = () => `img${Date.now().toString(36)}${++imageCounter}`

function ext(name: string): string {
  return name.toLowerCase().split('.').pop() ?? ''
}

/** A plain, friendly name for what kind of file it is, for status lines and warnings. */
export function fileKind(file: File): string {
  const e = ext(file.name)
  if (file.type.startsWith('image/')) return 'image'
  if (e === 'pdf') return 'PDF'
  if (e === 'docx' || e === 'odt' || e === 'rtf' || e === 'txt' || e === 'md' || e === 'markdown' || e === 'html' || e === 'htm') return 'document'
  if (e === 'pptx' || e === 'odp') return 'slides'
  if (e === 'xlsx' || e === 'ods' || e === 'csv' || e === 'tsv' || e === 'json') return 'spreadsheet'
  return 'file'
}

async function bitmapFrom(data: Uint8Array | Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(data instanceof Blob ? data : new Blob([data as Uint8Array<ArrayBuffer>]))
  } catch {
    return null
  }
}

function addGrids(grids: OfficeResult['grids'], tables: DataSeries[], warnings: string[], file: string) {
  for (const g of grids) {
    const r = parseRows(g.rows, g.name)
    if (r.ok) tables.push(r.data)
    else if (grids.length === 1) warnings.push(`${file}: ${r.error}`)
  }
}

function jsonToRows(value: unknown): string[][] | null {
  const arr = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value).find(Array.isArray) : null
  if (!arr || !arr.length || typeof arr[0] !== 'object' || arr[0] === null) return null
  const keys = Object.keys(arr[0] as object).slice(0, 8)
  return [keys, ...arr.slice(0, 200).map((o) => keys.map((k) => String((o as Record<string, unknown>)[k] ?? '')))]
}

/**
 * Turns the prompt and any uploads into one corpus. When there is very little to go on (a topic, a question,
 * a picture with no text), it reads text out of images and looks the topic up on Wikipedia.
 */
export async function buildCorpus(opts: BuildOptions): Promise<Corpus> {
  const corpus: Corpus = { docs: [], tables: [], images: [], sources: [], warnings: [] }
  const text = opts.text.trim()
  // A short prompt ("black holes", "how do vaccines work?") is a topic to look up, not notes to explain.
  const isTopic = !!text && text.split(/\s+/).length <= 14 && opts.lookup
  if (text && !isTopic) {
    const { doc, tables } = textToDoc('Your notes', text, 'notes')
    if (docWords(doc)) corpus.docs.push(doc)
    for (const t of tables) {
      const r = parseTable(t)
      if (r.ok) corpus.tables.push(r.data)
    }
  }

  const scans: { bitmap: ImageBitmap; name: string }[] = []
  for (const file of opts.files) {
    if (opts.signal?.aborted) throw new DOMException('Canceled', 'AbortError')
    const e = ext(file.name)
    opts.onStatus(`Reading ${file.name}`)
    try {
      if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(e)) {
        const bitmap = await bitmapFrom(file)
        if (!bitmap) throw new Error('could not be opened as an image')
        corpus.images.push({ id: imgId(), name: file.name, caption: cleanName(file.name), bitmap })
        scans.push({ bitmap, name: file.name })
      } else if (e === 'pdf') {
        const { readPdf } = await import('./pdf')
        const res = await readPdf(file.name, await file.arrayBuffer())
        if (docWords(res.doc)) corpus.docs.push(res.doc)
        res.pages.forEach((bitmap, i) => corpus.images.push({ id: imgId(), name: file.name, caption: `${res.doc.title ?? cleanName(file.name)}, page ${i + 1}`, bitmap }))
        res.scans.forEach((bitmap) => scans.push({ bitmap, name: file.name }))
      } else if (e === 'docx' || e === 'pptx' || e === 'xlsx' || e === 'odt' || e === 'odp' || e === 'ods') {
        const buf = await file.arrayBuffer()
        const res = e === 'docx' ? readDocx(file.name, buf) : e === 'pptx' ? readPptx(file.name, buf) : e === 'xlsx' ? readXlsx(file.name, buf) : readOdf(file.name, buf)
        corpus.docs.push(...res.docs.filter((d) => docWords(d)))
        addGrids(res.grids, corpus.tables, corpus.warnings, file.name)
        for (const m of res.media) {
          const bitmap = await bitmapFrom(m.data)
          if (bitmap && bitmap.width >= 320 && bitmap.height >= 200) corpus.images.push({ id: imgId(), name: m.name, caption: res.docs[0]?.title ?? cleanName(file.name), bitmap })
        }
      } else if (e === 'csv' || e === 'tsv') {
        const r = parseTable(await file.text(), cleanName(file.name))
        if (r.ok) corpus.tables.push(r.data)
        else corpus.warnings.push(`${file.name}: ${r.error}`)
      } else if (e === 'json') {
        const rows = jsonToRows(JSON.parse(await file.text()))
        const r = rows ? parseRows(rows, cleanName(file.name)) : null
        if (r?.ok) corpus.tables.push(r.data)
        else corpus.warnings.push(`${file.name}: no list of records to chart.`)
      } else if (['txt', 'md', 'markdown', 'html', 'htm', 'rtf'].includes(e)) {
        const raw = await file.text()
        const plain = e === 'html' || e === 'htm' ? htmlToText(raw) : e === 'rtf' ? rtfToText(raw) : raw
        const { doc, tables } = textToDoc(file.name, plain, 'text')
        if (docWords(doc)) corpus.docs.push(doc)
        for (const t of tables) {
          const r = parseTable(t)
          if (r.ok) corpus.tables.push(r.data)
        }
      } else if (['doc', 'ppt', 'xls', 'key', 'pages', 'numbers'].includes(e)) {
        corpus.warnings.push(`${file.name}: this older or Apple format cannot be read in the browser. Save it as PDF, DOCX, PPTX or XLSX and upload that.`)
        continue
      } else {
        corpus.warnings.push(`${file.name}: this file type is not supported.`)
        continue
      }
      corpus.sources.push({ label: file.name })
    } catch (err) {
      corpus.warnings.push(`${file.name} could not be read (${err instanceof Error ? err.message : 'unknown error'}).`)
    }
  }

  // Images and scans with little else to go on: read the text in them.
  if (scans.length && corpusWords(corpus) < THIN_WORDS) {
    opts.onStatus('Reading text in your images')
    try {
      const { ocrImages } = await import('./ocr')
      const texts = await ocrImages(scans.slice(0, 4).map((s) => s.bitmap), (d, t) => opts.onStatus(`Reading text in your images, ${Math.min(d + 1, t)} of ${t}`))
      texts.forEach((t, i) => {
        if (!t.trim()) return
        const { doc } = textToDoc(scans[i].name, t, 'image')
        if (docWords(doc) >= 6) corpus.docs.push(doc)
      })
    } catch {
      corpus.warnings.push('Text in the images could not be read.')
    }
  }

  // Still thin: look the topic up, unless the input is only data, which speaks for itself.
  const onlyData = !text && !corpus.docs.length && !corpus.images.length && corpus.tables.length > 0
  if (opts.lookup && !onlyData && corpusWords(corpus) < THIN_WORDS) {
    const query = topicQuery(text, opts.files, corpus)
    if (query) {
      opts.onStatus(`Looking up “${query}”`)
      try {
        const wiki = await lookupTopic(query, opts.signal)
        if (wiki) {
          corpus.docs.push(wiki.doc)
          corpus.sources.push({ label: `Wikipedia: ${wiki.title}`, url: wiki.url })
          corpus.article = wiki.title
          // Your own pictures come first; the article's lead image is only added when there are none.
          if (wiki.image && !corpus.images.length) corpus.images.push({ id: imgId(), name: wiki.image.caption, caption: wiki.image.caption, bitmap: wiki.image.bitmap, url: wiki.image.url })
        } else if (!corpusWords(corpus) && !corpus.tables.length) {
          corpus.warnings.push(`Nothing was found for “${query}”. Try other words, or paste some notes.`)
        }
      } catch (err) {
        if (opts.signal?.aborted) throw err
        corpus.warnings.push('Wikipedia could not be reached, so only your own input was used.')
      }
    }
  }
  if (corpus.docs.some((d) => d.kind === 'notes') && !corpus.sources.some((s) => s.label === 'Your notes')) corpus.sources.unshift({ label: 'Your notes' })
  return corpus
}

/** What to search for: the prompt if it is short, otherwise the main words of whatever there is. */
export function topicQuery(text: string, files: File[], corpus: Corpus): string {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length && words.length <= 14) return text.replace(/\s+/g, ' ')
  // What the material itself is about: a title, or the subject of an opening definition.
  const fromDocs = corpus.docs.map((d: Doc) => d.title).find(Boolean) ?? corpus.docs.map(definedSubject).find(Boolean)
  if (fromDocs && !words.length) return fromDocs
  if (!words.length && files.length) {
    const name = cleanName(files[0].name)
    // Camera and screenshot names say nothing about the topic.
    if (/^(img|dsc|dcim|pxl|screenshot|screen shot|photo|image|scan|untitled|document|file)\b/i.test(name) || !/[a-z]{3,}/i.test(name.replace(/\d+/g, ''))) return ''
    return name
  }
  return words.slice(0, 14).join(' ')
}

export type { IngestedImage }
