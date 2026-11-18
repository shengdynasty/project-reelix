export const SANS = '"Geist Variable", Geist, system-ui, -apple-system, sans-serif'
export const MONO = '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace'

export function font(ctx: CanvasRenderingContext2D, size: number, weight = 500, family = SANS) {
  ctx.font = `${weight} ${size}px ${family}`
}

export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width <= maxWidth || !line) line = test
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return balance(ctx, lines, maxWidth)
}

/** Avoids a single orphaned word on the last line by pulling a word down when it fits. */
function balance(ctx: CanvasRenderingContext2D, lines: string[], maxWidth: number): string[] {
  if (lines.length < 2) return lines
  const last = lines[lines.length - 1]
  if (last.includes(' ')) return lines
  const prev = lines[lines.length - 2].split(' ')
  if (prev.length < 3) return lines
  const moved = prev.pop()!
  const newLast = `${moved} ${last}`
  if (ctx.measureText(newLast).width > maxWidth) return lines
  return [...lines.slice(0, -2), prev.join(' '), newLast]
}

export interface Fitted {
  size: number
  lines: string[]
}

/** Largest size (stepping down) at which the text fits in maxLines; ellipsis as a last resort. */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  maxSize: number,
  minSize: number,
  weight = 500,
  family = SANS,
): Fitted {
  for (let size = maxSize; size >= minSize; size -= 2) {
    font(ctx, size, weight, family)
    const lines = wrapLines(ctx, text, maxWidth)
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) return { size, lines }
  }
  font(ctx, minSize, weight, family)
  const lines = wrapLines(ctx, text, maxWidth)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    let lastLine = kept[maxLines - 1]
    while (lastLine.length > 1 && ctx.measureText(lastLine + '…').width > maxWidth) lastLine = lastLine.slice(0, -1)
    kept[maxLines - 1] = lastLine.replace(/\s+\S*$/, '') + '…'
    return { size: minSize, lines: kept }
  }
  return { size: minSize, lines }
}

export function measure(ctx: CanvasRenderingContext2D, text: string, size: number, weight = 500, family = SANS): number {
  font(ctx, size, weight, family)
  return ctx.measureText(text).width
}

let fontsReady: Promise<void> | null = null
/** Canvas text needs the web fonts loaded first, or the first frames render in a fallback face. */
export function loadFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = Promise.all(
      ['400', '500', '600'].flatMap((w) => [document.fonts.load(`${w} 40px "Geist Variable"`), document.fonts.load(`${w} 40px "Geist Mono Variable"`)]),
    ).then(() => undefined, () => undefined)
  }
  return fontsReady
}
