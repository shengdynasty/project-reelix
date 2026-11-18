import { capitalize, contentWords } from '../input/parseText'
import { topicalWord } from '../motion/icons'
import type { LabelSize } from './types'

/** Font size in px on a 1080 canvas for each label size. */
export const LABEL_PX: Record<LabelSize, number> = { title: 88, term: 64, label: 44, small: 36 }
/** Widest a label runs on a 1080 canvas before it wraps or shrinks. */
export const LABEL_MAX_WIDTH_PX = 520

/** Width in px of `text` set at `sizePx`: canvas measureText in the app, a fixed width stand in for tests. */
export type Measure = (text: string, sizePx: number) => number

// Words a label must not end on, so "The core collapses under its" ends at "collapses".
const WEAK_TAIL = new Set(
  'a an the of in on at to for from by with under over into onto than as and or but nor so its their his her our your this that these those which who whom whose is are was were be been'.split(
    ' ',
  ),
)

const TRAILING_PUNCT = /[,.;:!?]+$/
/** An ordinal or linking word that opens a sentence ("First,", "Next", "Finally,"): it orders the item, it never names it. */
const LEAD_LINK = /^(first|firstly|second|secondly|third|then|next|finally|lastly|also|however|meanwhile)\b,?\s+/i
/** A token ending in closing punctuation is cut off from the word after it ("1905," before "Einstein"). */
const CLOSES = /[,.;:!?)\]"”]$/

const bare = (w: string) => w.toLowerCase().replace(/[^a-z]/g, '')
/** A token as it reads on screen, without the quotes, brackets or sentence punctuation around it. */
const clean = (t: string) => t.replace(/^["“([]+/, '').replace(/[,.;:!?)\]"”]+$/, '')

/**
 * At most `maxWords` words that still read as a name: no leading article, no weak word at the end, no end
 * punctuation, first letter capitalized. Returns '' when nothing worth showing is left.
 */
export function shortLabel(text: string, maxWords = 4): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length && /^(a|an|the)$/i.test(words[0])) words.shift()
  words.splice(maxWords)
  while (words.length && WEAK_TAIL.has(bare(words[words.length - 1]))) words.pop()
  if (!words.length) return ''
  words[words.length - 1] = words[words.length - 1].replace(TRAILING_PUNCT, '')
  return capitalize(words.join(' '))
}

/** The single content word in a token, lowercased, or '' for a stop word, a number or a symbol. */
function wordOf(token: string): string {
  const words = contentWords(token)
  return words.length === 1 ? words[0] : ''
}

/** Words a verb follows: "can escape", "to run". */
const VERB_LEAD = new Set('can could will would may might must should shall to do does did'.split(' '))

/** A token that names an action rather than a thing: "-ing" or "-ed" with at least 5 letters, or right after a modal or "to". */
function verbLike(tokens: string[], i: number): boolean {
  const w = wordOf(tokens[i])
  return (bare(w).length >= 5 && /(?:ing|ed)$/.test(w)) || (i > 0 && VERB_LEAD.has(bare(tokens[i - 1])))
}

/** Indices of the token at `end` and up to two content words right before it, stopping at a stop word, a number or punctuation. */
function phraseEndingAt(tokens: string[], end: number): number[] {
  const out = [end]
  for (let i = end - 1; i >= 0 && out.length < 3; i--) {
    if (CLOSES.test(tokens[i]) || !wordOf(tokens[i])) break
    out.unshift(i)
  }
  return out
}

/**
 * The label for the object a sentence shows: the word that chose its icon with up to two words before it ("General
 * relativity"). When that phrase is only the topic itself ("black holes" in a black hole video), the last content
 * word that is neither the topic nor verb-like is used instead ("Relativistic jets", not "Escape"). Null when
 * nothing is left, so the object carries no label and the captions do the work.
 */
export function labelFor(sentence: string, topicWords: string[]): string | null {
  sentence = sentence.trim().replace(LEAD_LINK, '')
  const tokens = sentence.split(/\s+/)
  const topics = topicWords.map((w) => w.toLowerCase())
  const isTopic = (w: string) => topics.some((t) => w === t || (w.startsWith(t) && t.length >= 4) || (t.startsWith(w) && w.length >= 4))
  const head = topicalWord(sentence)
  let at = head ? tokens.findIndex((t) => t.replace(TRAILING_PUNCT, '') === head) : -1
  let phrase = at >= 0 ? phraseEndingAt(tokens, at) : []
  if (!phrase.length || phrase.every((i) => isTopic(wordOf(tokens[i])))) {
    at = tokens.findLastIndex((t, i) => {
      const w = wordOf(t)
      return w !== '' && !isTopic(w) && !verbLike(tokens, i)
    })
    phrase = at >= 0 ? phraseEndingAt(tokens, at) : []
  }
  if (!phrase.length) return null
  return shortLabel(phrase.map((i) => clean(tokens[i])).join(' ')) || null
}

/** A word, or one chunk of a word too wide for a line; `ends` marks the unit that completes a word. */
interface Unit {
  text: string
  ends: boolean
}

const joinLine = (units: Unit[]) => units.map((u) => u.text).join(' ')

/**
 * Greedy wrap at spaces. A word wider than the line breaks into chunks that fit, except that a token with a digit
 * ("1,234,567,890") is never split: it stays whole on its own line and overflows instead.
 */
function wrap(words: string[], size: number, maxWidth: number, measure: Measure): Unit[][] {
  const lines: Unit[][] = []
  let line: Unit[] = []
  for (const word of words) {
    const unit = { text: word, ends: true }
    if (measure(word, size) <= maxWidth) {
      if (line.length && measure(joinLine([...line, unit]), size) > maxWidth) {
        lines.push(line)
        line = []
      }
      line.push(unit)
      continue
    }
    if (line.length) {
      lines.push(line)
      line = []
    }
    if (/\d/.test(word)) {
      lines.push([unit])
      continue
    }
    let chunk = ''
    for (const ch of word) {
      if (chunk && measure(chunk + ch, size) > maxWidth) {
        lines.push([{ text: chunk, ends: false }])
        chunk = ''
      }
      chunk += ch
    }
    line = [{ text: chunk, ends: true }]
  }
  if (line.length) lines.push(line)
  return lines
}

/**
 * Ends the last of the kept lines at a word boundary with an ellipsis that still fits, dropping words from the end
 * until it does. A line of one word keeps its ellipsis even when that overflows a little, rather than vanish.
 */
function ellipsize(kept: Unit[][], size: number, maxWidth: number, measure: Measure): string[] {
  const lines = kept.map((l) => [...l])
  while (lines.length) {
    const last = lines[lines.length - 1]
    const unit = last[last.length - 1]
    if (!unit) {
      lines.pop()
      continue
    }
    if (unit.ends) {
      const text = joinLine(last) + '…'
      if (last.length === 1 || measure(text, size) <= maxWidth) return [...lines.slice(0, -1).map(joinLine), text]
    }
    last.pop()
  }
  // Nothing but chunks of one long word: end at a chunk, shortened so the ellipsis still fits.
  let chunk = joinLine(kept[kept.length - 1])
  while (chunk.length > 1 && measure(chunk + '…', size) > maxWidth) chunk = chunk.slice(0, -1)
  return [...kept.slice(0, -1).map(joinLine), chunk + '…']
}

/**
 * Lines and font size that set a label inside `maxWidth`: the largest size from `maxSize` down to `minSize` in
 * 2 px steps at which the text wraps into at most `maxLines` lines with every word whole. When even `minSize`
 * is not enough, the text is set at `minSize`, cut to `maxLines` lines and ends at a word boundary with "…".
 */
export function fitLabel(
  text: string,
  maxWidth: number,
  measure: Measure,
  opts: { maxSize?: number; minSize?: number; maxLines?: number } = {},
): { lines: string[]; size: number; truncated: boolean } {
  const { maxSize = 72, minSize = 34, maxLines = 2 } = opts
  const words = text.trim().split(/\s+/).filter(Boolean)
  const sizes: number[] = []
  for (let size = maxSize; size > minSize; size -= 2) sizes.push(size)
  sizes.push(minSize)
  for (const size of sizes) {
    if (words.some((w) => measure(w, size) > maxWidth)) continue
    const lines = wrap(words, size, maxWidth, measure)
    if (lines.length <= maxLines) return { lines: lines.map(joinLine), size, truncated: false }
  }
  const lines = wrap(words, minSize, maxWidth, measure)
  if (lines.length <= maxLines) return { lines: lines.map(joinLine), size: minSize, truncated: false }
  return { lines: ellipsize(lines.slice(0, maxLines), minSize, maxWidth, measure), size: minSize, truncated: true }
}
