import type { Doc, DocKind, Section } from './types'
import { newSection } from './types'
import { cleanInline } from '../input/parseText'

const TABLE_LINE = /^\s*\|.*\|\s*$/

/**
 * Plain text, markdown or Wikipedia style text to sections. Understands "# Heading", "== Heading ==",
 * bulleted and numbered lists, and blank line paragraphs. Pipe tables are returned separately.
 */
export function textToDoc(name: string, raw: string, kind: DocKind = 'text'): { doc: Doc; tables: string[] } {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const sections: Section[] = [newSection('', 1)]
  const tables: string[] = []
  let title: string | undefined
  let para: string[] = []
  let tableBuf: string[] = []
  const cur = () => sections[sections.length - 1]
  const flushPara = () => {
    const text = cleanInline(para.join(' '))
    if (text) cur().paragraphs.push(text)
    para = []
  }
  const flushTable = () => {
    if (tableBuf.length >= 2) tables.push(tableBuf.join('\n'))
    else para.push(...tableBuf)
    tableBuf = []
  }
  for (const line of lines) {
    if (TABLE_LINE.test(line)) {
      flushPara()
      tableBuf.push(line)
      continue
    }
    flushTable()
    const md = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/)
    const wiki = line.match(/^\s*(={2,6})\s*(.+?)\s*\1\s*$/)
    if (md || wiki) {
      flushPara()
      const level = md ? md[1].length : wiki![1].length - 1
      const heading = cleanInline((md ? md[2] : wiki![2]) ?? '')
      if (md && level === 1 && !title && !cur().paragraphs.length) {
        title = heading
        continue
      }
      sections.push(newSection(heading, level))
      continue
    }
    const bullet = line.match(/^\s*(?:[-*•▪◦–]|(\d{1,2})[.)])\s+(.+)$/)
    if (bullet) {
      flushPara()
      cur().items.push(cleanInline(bullet[2]))
      if (bullet[1]) cur().ordered = true
      continue
    }
    if (!line.trim()) {
      flushPara()
      continue
    }
    para.push(line.trim())
  }
  flushTable()
  flushPara()
  // A short first line without end punctuation reads as a title.
  const first = sections[0]
  if (!title && first.paragraphs.length > 1 && first.paragraphs[0].split(/\s+/).length <= 12 && !/[.!?:;]$/.test(first.paragraphs[0])) {
    title = first.paragraphs.shift()
  }
  return { doc: { name, kind, title, sections: sections.filter((s) => s.heading || s.paragraphs.length || s.items.length) }, tables }
}

/** Visible text of an HTML file, keeping headings and lists. */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, nav, footer, noscript').forEach((n) => n.remove())
  const out: string[] = []
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase()
      if (/^h[1-6]$/.test(tag)) out.push(`${'#'.repeat(Number(tag[1]))} ${child.textContent?.trim() ?? ''}`, '')
      else if (tag === 'li') out.push(`- ${child.textContent?.trim() ?? ''}`)
      else if (tag === 'p') out.push(child.textContent?.trim() ?? '', '')
      else if (tag === 'tr') out.push(`| ${Array.from(child.children).map((c) => c.textContent?.trim() ?? '').join(' | ')} |`)
      else walk(child)
    }
  }
  walk(doc.body)
  return out.join('\n')
}

/** Strips RTF control words; good enough for the text of simple documents. */
export function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\{\\\*[^{}]*\}/g, '')
    .replace(/\\'[0-9a-f]{2}/gi, '')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
}
