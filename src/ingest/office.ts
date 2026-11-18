// Office documents are zip files of XML. fflate unzips them and the browser's DOMParser reads the XML,
// which covers Word, PowerPoint and Excel (OOXML) plus their OpenDocument counterparts with no server.
import { strFromU8, unzipSync } from 'fflate'
import type { Unzipped } from 'fflate'
import type { Doc, Section } from './types'
import { cleanName, newSection } from './types'

export interface OfficeResult {
  docs: Doc[]
  grids: { name: string; rows: string[][] }[]
  media: { name: string; data: Uint8Array }[]
}

const MAX_MEDIA = 4
const MEDIA_RE = /\.(png|jpe?g|gif|webp)$/i

function unzip(buf: ArrayBuffer, keep: (name: string) => boolean): Unzipped {
  return unzipSync(new Uint8Array(buf), { filter: (f) => keep(f.name) && f.originalSize < 40_000_000 })
}

function xml(files: Unzipped, path: string): Document | null {
  const f = files[path]
  if (!f) return null
  return new DOMParser().parseFromString(strFromU8(f), 'application/xml')
}

/** All descendants with this local name, whatever the namespace prefix. */
function all(el: Element | Document, local: string): Element[] {
  return Array.from(el.getElementsByTagNameNS('*', local))
}

function kids(el: Element, local: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === local)
}

function text(el: Element, run = 't'): string {
  return all(el, run)
    .map((t) => t.textContent ?? '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickMedia(files: Unzipped, prefix: string): OfficeResult['media'] {
  return Object.keys(files)
    .filter((n) => n.startsWith(prefix) && MEDIA_RE.test(n))
    // Skip tiny files such as bullets and logos.
    .filter((n) => files[n].length > 15_000)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, MAX_MEDIA)
    .map((n) => ({ name: n.split('/').pop() ?? n, data: files[n] }))
}

// ---------- Word ----------

export function readDocx(name: string, buf: ArrayBuffer): OfficeResult {
  const files = unzip(buf, (n) => n === 'word/document.xml' || n.startsWith('word/media/'))
  const doc = xml(files, 'word/document.xml')
  if (!doc) throw new Error('This Word file has no document body.')
  const body = all(doc, 'body')[0]
  const sections: Section[] = [newSection('', 1)]
  const grids: OfficeResult['grids'] = []
  let title: string | undefined
  for (const el of Array.from(body?.children ?? [])) {
    if (el.localName === 'tbl') {
      const rows = all(el, 'tr').map((tr) => kids(tr, 'tc').map((tc) => text(tc)))
      if (rows.length >= 2) grids.push({ name: sections[sections.length - 1].heading || cleanName(name), rows })
      continue
    }
    if (el.localName !== 'p') continue
    const t = text(el)
    if (!t) continue
    const style = all(el, 'pStyle')[0]?.getAttribute('w:val') ?? all(el, 'pStyle')[0]?.getAttributeNS('*', 'val') ?? ''
    const heading = style.match(/^(?:heading|berschrift|titre|titulo)\s*(\d)/i)
    if (/^title$/i.test(style)) {
      if (!title) title = t
      continue
    }
    if (heading) {
      sections.push(newSection(t, Number(heading[1])))
      continue
    }
    const cur = sections[sections.length - 1]
    if (all(el, 'numPr').length || /list/i.test(style)) {
      cur.items.push(t)
      continue
    }
    cur.paragraphs.push(t)
  }
  return {
    docs: [{ name, kind: 'docx', title, sections: sections.filter((s) => s.heading || s.paragraphs.length || s.items.length) }],
    grids,
    media: pickMedia(files, 'word/media/'),
  }
}

// ---------- PowerPoint ----------

function relTargets(files: Unzipped, relPath: string): Map<string, string> {
  const rels = xml(files, relPath)
  const map = new Map<string, string>()
  if (!rels) return map
  for (const r of all(rels, 'Relationship')) map.set(r.getAttribute('Id') ?? '', r.getAttribute('Target') ?? '')
  return map
}

function resolve(base: string, target: string): string {
  const parts = base.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

export function readPptx(name: string, buf: ArrayBuffer): OfficeResult {
  const files = unzip(buf, (n) => /^ppt\/(slides|notesSlides)\/(_rels\/)?[^/]+\.xml(\.rels)?$/.test(n) || n === 'ppt/presentation.xml' || n === 'ppt/_rels/presentation.xml.rels' || n.startsWith('ppt/media/'))
  // Slide order comes from presentation.xml, not from file names.
  const pres = xml(files, 'ppt/presentation.xml')
  const presRels = relTargets(files, 'ppt/_rels/presentation.xml.rels')
  let order = pres ? all(pres, 'sldId').map((s) => resolve('ppt/presentation.xml', presRels.get(s.getAttribute('r:id') ?? s.getAttributeNS('*', 'id') ?? '') ?? '')) : []
  order = order.filter((p) => files[p])
  if (!order.length) {
    order = Object.keys(files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }
  const sections: Section[] = []
  const grids: OfficeResult['grids'] = []
  let title: string | undefined
  order.forEach((path, i) => {
    const slide = xml(files, path)
    if (!slide) return
    let heading = ''
    const items: string[] = []
    for (const sp of all(slide, 'sp')) {
      const ph = all(sp, 'ph')[0]
      const type = ph?.getAttribute('type') ?? ''
      const paras = all(sp, 'p').map((p) => text(p)).filter(Boolean)
      if (!paras.length || type === 'sldNum' || type === 'dt' || type === 'ftr') continue
      if ((type === 'title' || type === 'ctrTitle') && !heading) heading = paras.join(' ')
      else items.push(...paras)
    }
    for (const tbl of all(slide, 'tbl')) {
      const rows = all(tbl, 'tr').map((tr) => kids(tr, 'tc').map((tc) => text(tc)))
      if (rows.length >= 2) grids.push({ name: heading || `${cleanName(name)} slide ${i + 1}`, rows })
    }
    // Speaker notes often carry the full explanation behind terse bullets.
    const rels = relTargets(files, path.replace('slides/', 'slides/_rels/') + '.rels')
    const notesTarget = [...rels.values()].find((t) => t.includes('notesSlide'))
    const notes: string[] = []
    if (notesTarget) {
      const nd = xml(files, resolve(path, notesTarget))
      if (nd) {
        for (const sp of all(nd, 'sp')) {
          const type = all(sp, 'ph')[0]?.getAttribute('type') ?? ''
          if (type === 'sldImg' || type === 'sldNum') continue
          notes.push(...all(sp, 'p').map((p) => text(p)).filter((t) => t.length > 1))
        }
      }
    }
    if (i === 0 && heading && !title) title = heading
    const sec = newSection(heading || `Slide ${i + 1}`, 1)
    // Short lines are bullets; long ones read as sentences.
    for (const it of items) (it.split(/\s+/).length > 18 ? sec.paragraphs : sec.items).push(it)
    sec.paragraphs.push(...notes)
    if (sec.paragraphs.length || sec.items.length || heading) sections.push(sec)
  })
  return { docs: [{ name, kind: 'pptx', title, sections }], grids, media: pickMedia(files, 'ppt/media/') }
}

// ---------- Excel ----------

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export function readXlsx(name: string, buf: ArrayBuffer): OfficeResult {
  const files = unzip(buf, (n) => n.startsWith('xl/') && n.endsWith('.xml') || n === 'xl/_rels/workbook.xml.rels')
  const wb = xml(files, 'xl/workbook.xml')
  const rels = relTargets(files, 'xl/_rels/workbook.xml.rels')
  const shared = xml(files, 'xl/sharedStrings.xml')
  const strings = shared ? all(shared, 'si').map((si) => text(si)) : []
  const sheets = wb ? all(wb, 'sheet') : []
  const grids: OfficeResult['grids'] = []
  for (const sh of sheets.slice(0, 4)) {
    const target = rels.get(sh.getAttribute('r:id') ?? sh.getAttributeNS('*', 'id') ?? '')
    if (!target) continue
    const doc = xml(files, resolve('xl/workbook.xml', target))
    if (!doc) continue
    const rows: string[][] = []
    for (const row of all(doc, 'row').slice(0, 500)) {
      const cells: string[] = []
      for (const c of kids(row, 'c')) {
        const idx = colIndex(c.getAttribute('r') ?? '')
        if (idx > 40) continue
        const t = c.getAttribute('t')
        const v = kids(c, 'v')[0]?.textContent ?? ''
        cells[idx] = t === 's' ? strings[Number(v)] ?? '' : t === 'inlineStr' ? text(c) : v
      }
      if (cells.some((x) => x && x.trim())) rows.push(Array.from(cells, (x) => x ?? ''))
    }
    if (rows.length >= 2) grids.push({ name: sheets.length > 1 ? sh.getAttribute('name') ?? cleanName(name) : cleanName(name), rows })
  }
  return { docs: [], grids, media: [] }
}

// ---------- OpenDocument (odt, odp, ods) ----------

export function readOdf(name: string, buf: ArrayBuffer): OfficeResult {
  const files = unzip(buf, (n) => n === 'content.xml' || n.startsWith('Pictures/'))
  const doc = xml(files, 'content.xml')
  if (!doc) throw new Error('This OpenDocument file has no content.')
  const grids: OfficeResult['grids'] = []
  for (const table of all(doc, 'table')) {
    const rows = all(table, 'table-row')
      .slice(0, 500)
      .map((r) =>
        kids(r, 'table-cell').flatMap((c) => {
          const repeat = Math.min(Number(c.getAttribute('table:number-columns-repeated') ?? 1), 20)
          const value = c.getAttribute('office:value') ?? text(c, 'p')
          return Array(repeat).fill(value)
        }),
      )
      .filter((r) => r.some((x) => x))
    if (rows.length >= 2) grids.push({ name: table.getAttribute('table:name') ?? cleanName(name), rows })
  }
  const pages = all(doc, 'page')
  const sections: Section[] = []
  if (pages.length) {
    // Impress: one section per slide, titled by its title frame.
    pages.forEach((page, i) => {
      let heading = ''
      const sec = newSection('', 1)
      for (const frame of all(page, 'frame')) {
        const paras = all(frame, 'p').map((p) => p.textContent?.trim() ?? '').filter(Boolean)
        if (!paras.length) continue
        if (frame.getAttribute('presentation:class') === 'title' && !heading) heading = paras.join(' ')
        else sec.items.push(...paras)
      }
      sec.heading = heading || `Slide ${i + 1}`
      if (sec.items.length || heading) sections.push(sec)
    })
  } else {
    sections.push(newSection('', 1))
    const textRoot = all(doc, 'text')[0]
    for (const el of all(textRoot ?? doc, '*')) {
      if (el.localName === 'h') sections.push(newSection(el.textContent?.trim() ?? '', Number(el.getAttribute('text:outline-level') ?? 1)))
      else if (el.localName === 'p' && el.parentElement?.localName !== 'list-item' && el.parentElement?.localName !== 'table-cell') {
        const t = el.textContent?.trim()
        if (t) sections[sections.length - 1].paragraphs.push(t)
      } else if (el.localName === 'list-item') {
        const t = el.textContent?.trim()
        if (t) sections[sections.length - 1].items.push(t)
      }
    }
  }
  return {
    docs: sections.some((s) => s.paragraphs.length || s.items.length) ? [{ name, kind: 'odf', sections }] : [],
    grids,
    media: pickMedia(files, 'Pictures/'),
  }
}
