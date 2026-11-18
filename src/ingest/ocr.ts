// Reads text out of images (screenshots, photos of notes, scanned pages) with Tesseract, entirely in the
// browser. The engine and English data come from public CDNs on first use and are cached by the browser.
type Source = ImageBitmap | HTMLCanvasElement

function toCanvas(src: Source): HTMLCanvasElement {
  if (src instanceof HTMLCanvasElement) return src
  const c = document.createElement('canvas')
  // Upscale small images; Tesseract reads text best at roughly 30 px letter height.
  const scale = Math.min(3, Math.max(1, 1600 / Math.max(src.width, src.height)))
  c.width = Math.round(src.width * scale)
  c.height = Math.round(src.height * scale)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}

/** Text found in each image, with low confidence lines dropped. */
export async function ocrImages(images: Source[], onProgress?: (done: number, total: number) => void): Promise<string[]> {
  if (!images.length) return []
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  const out: string[] = []
  try {
    for (let i = 0; i < images.length; i++) {
      onProgress?.(i, images.length)
      const { data } = await worker.recognize(toCanvas(images[i]))
      const lines = data.text
        .split('\n')
        .map((l) => l.replace(/\s+/g, ' ').trim())
        // Keep lines that look like words, not noise from chart marks.
        .filter((l) => (l.match(/[A-Za-z]{3,}/g) ?? []).length >= 2)
      out.push(data.confidence >= 45 ? lines.join('\n') : '')
    }
  } finally {
    await worker.terminate()
  }
  onProgress?.(images.length, images.length)
  return out
}
