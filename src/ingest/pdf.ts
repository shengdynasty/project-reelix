import type { Doc, Section } from './types'
import { newSection } from './types'

export interface PdfResult {
  doc: Doc
  /** Rendered pages, for slide decks saved as PDF. */
  pages: ImageBitmap[]
  /** Pages with almost no text layer (scans), rendered for OCR. */
  scans: ImageBitmap[]
}

const MAX_PAGES = 40

/** Text of a PDF by page, with short standalone lines treated as headings. pdf.js loads only when needed. */
export async function readPdf(name: string, buf: ArrayBuffer): Promise<PdfResult> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) })
  const pdf = await task.promise
  const sections: Section[] = [newSection('', 1)]
  const pages: ImageBitmap[] = []
  const scans: ImageBitmap[] = []
  let title: string | undefined
  let landscape = false
  const n = Math.min(pdf.numPages, MAX_PAGES)
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p)
    const view = page.getViewport({ scale: 1 })
    if (p === 1) landscape = view.width > view.height * 1.15
    const content = await page.getTextContent()
    // Rebuild lines from text items using their end of line flags and vertical position.
    const lines: { text: string; size: number }[] = []
    let line = ''
    let size = 0
    let lastY: number | null = null
    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = item.transform[5]
      const h = Math.abs(item.transform[3]) || item.height || 10
      if (lastY !== null && Math.abs(y - lastY) > h * 0.6 && line) {
        lines.push({ text: line.trim(), size })
        line = ''
        size = 0
      }
      line += (line && !line.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str
      size = Math.max(size, h)
      lastY = y
      if (item.hasEOL) {
        lines.push({ text: line.trim(), size })
        line = ''
        size = 0
        lastY = null
      }
    }
    if (line.trim()) lines.push({ text: line.trim(), size })
    const body = lines.filter((l) => l.text)
    const pageWords = body.reduce((a, l) => a + l.text.split(/\s+/).length, 0)
    const typical = median(body.map((l) => l.size)) || 10
    let para: string[] = []
    const flush = () => {
      const t = para.join(' ').replace(/(\w)- (\w)/g, '$1$2').replace(/\s+/g, ' ').trim()
      if (t) sections[sections.length - 1].paragraphs.push(t)
      para = []
    }
    for (const l of body) {
      const words = l.text.split(/\s+/).length
      const big = l.size > typical * 1.18
      if ((big || (words <= 8 && !/[.,;:!?]$/.test(l.text) && /^[A-Z0-9]/.test(l.text))) && words <= 12 && !/^\d+$/.test(l.text)) {
        flush()
        // The first heading before any text is the title, whatever its size.
        if (p === 1 && !title && (big || !sections.some((x) => x.paragraphs.length || x.heading))) {
          title = l.text
          continue
        }
        sections.push(newSection(l.text, big ? 1 : 2))
        continue
      }
      if (/^[•▪◦\-–]\s+/.test(l.text)) {
        flush()
        sections[sections.length - 1].items.push(l.text.replace(/^[•▪◦\-–]\s+/, ''))
        continue
      }
      para.push(l.text)
      if (/[.!?]["”']?$/.test(l.text) && l.text.length < 60) flush()
    }
    flush()
    const needScan = pageWords < 12 && p <= 3
    const needPage = landscape && p <= 3
    if (needScan || needPage) {
      const bmp = await renderPage(page, needScan ? 2 : 1.4)
      if (bmp) (needScan ? scans : pages).push(bmp)
    }
  }
  await task.destroy()
  return { doc: { name, kind: 'pdf', title, sections: sections.filter((s) => s.paragraphs.length || s.items.length) }, pages, scans }
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

async function renderPage(page: import('pdfjs-dist').PDFPageProxy, scale: number): Promise<ImageBitmap | null> {
  try {
    const vp = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(vp.width)
    canvas.height = Math.ceil(vp.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise
    return await createImageBitmap(canvas)
  } catch {
    return null
  }
}
