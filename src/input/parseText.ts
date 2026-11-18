export const STOPWORDS = new Set(
  `a about above after again against all almost also although always am among an and another any are around as at
  be because been before being below between both but by can could did do does doing down during each either else
  even ever every few for from further had has have having he her here hers herself him himself his how however i if
  in into is it its itself just least less like made make makes many may me might more most much must my myself near
  nearly neither no nor not now of off often on once one only or other others our ours ourselves out over own per
  perhaps quite rather really said same say says see seen several she should since so some still such than that the
  their theirs them themselves then there these they this those though through thus to too toward under until up upon
  us use used uses using very via was we were what when where whether which while who whom whose why will with within
  without would yet you your yours yourself yourselves percent per cent new also around roughly approximately about
  including include includes based according get gets got going let lets there's it's that's`.split(/\s+/),
)

const LEAD_MARKERS =
  /^(however|moreover|in addition|additionally|also|meanwhile|furthermore|for example|for instance|in fact|overall|in contrast|as a result|therefore|thus|still|yet|but|and|so|today|now|first(ly)?|second(ly)?|third(ly)?|then|next|after that|afterwards|finally|lastly|in short|in total|altogether|importantly|notably|surprisingly)\b[,:]?\s+/i

export interface Sentence {
  text: string
  para: number
  /** Index of the sentence within its paragraph. */
  pos: number
  /** Global order. */
  order: number
}

export interface ParsedText {
  title: string | null
  sentences: Sentence[]
  /** Markdown or pipe tables found in the text, as raw text for parseTable. */
  tables: string[]
  /** Items from bulleted or numbered lists. */
  listItems: string[]
}

function isTableLine(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line) || (line.split('|').length >= 3 && !/[.!?]\s*$/.test(line))
}

/** Splits raw text into a title, sentences, embedded tables and list items. */
export function parseText(raw: string): ParsedText {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const tables: string[] = []
  const listItems: string[] = []
  const prose: string[] = []
  let title: string | null = null
  let tableBuf: string[] = []
  const flushTable = () => {
    if (tableBuf.length >= 2) tables.push(tableBuf.join('\n'))
    else if (tableBuf.length) prose.push(...tableBuf)
    tableBuf = []
  }
  for (const line of lines) {
    if (isTableLine(line)) { tableBuf.push(line); continue }
    flushTable()
    const heading = line.match(/^\s*#{1,6}\s+(.+)$/)
    if (heading) {
      if (!title) title = cleanInline(heading[1])
      prose.push('')
      continue
    }
    const item = line.match(/^\s*(?:[-*•▪◦]|\d{1,2}[.)])\s+(.+)$/)
    if (item) {
      listItems.push(cleanInline(item[1]))
      continue
    }
    prose.push(line)
  }
  flushTable()

  // A short first line without end punctuation reads as a title.
  const firstIdx = prose.findIndex((l) => l.trim().length > 0)
  if (!title && firstIdx >= 0) {
    const first = prose[firstIdx].trim()
    const words = first.split(/\s+/).length
    if (words <= 12 && !/[.!?;:]$/.test(first) && prose.slice(firstIdx + 1).some((l) => l.trim())) {
      title = cleanInline(first)
      prose[firstIdx] = ''
    }
  }

  const paragraphs = prose
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => cleanInline(p.replace(/\n/g, ' ')))
    .filter(Boolean)

  const sentences: Sentence[] = []
  paragraphs.forEach((p, para) => {
    splitSentences(p).forEach((text, pos) => {
      sentences.push({ text, para, pos, order: sentences.length })
    })
  })
  return { title, sentences, tables, listItems }
}

export function cleanInline(s: string): string {
  return s
    .replace(/\*\*|__|`/g, '')
    .replace(/\[(\d+|citation needed)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function splitSentences(paragraph: string): string[] {
  const out: string[] = []
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Seg) {
    const seg = new Seg('en', { granularity: 'sentence' })
    let carry = ''
    for (const { segment } of seg.segment(paragraph)) {
      const s = (carry + segment).trim()
      // Keep abbreviations such as "U.S." or "Dr." attached to the next segment.
      if (/\b(?:[A-Z]\.|Mr|Mrs|Ms|Dr|St|vs|etc|e\.g|i\.e|approx|No)\.$/.test(s) && s.length < 400) {
        carry = s + ' '
        continue
      }
      carry = ''
      if (s) out.push(s)
    }
    if (carry.trim()) out.push(carry.trim())
  } else {
    out.push(...paragraph.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).map((s) => s.trim()).filter(Boolean))
  }
  return out.filter((s) => /[A-Za-z]/.test(s))
}

export function words(s: string): string[] {
  return s.match(/[A-Za-z0-9$€£%][A-Za-z0-9$€£%.,'’°-]*/g)?.map((w) => w.replace(/[.,]+$/, '')) ?? []
}

export function contentWords(s: string): string[] {
  return words(s.toLowerCase())
    .map((w) => w.replace(/[’']s$/, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d/.test(w) && !/[$€£%]/.test(w))
}

export function wordFreq(sentences: string[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const s of sentences) for (const w of contentWords(s)) freq.set(w, (freq.get(w) ?? 0) + 1)
  return freq
}

export function topKeywords(sentences: string[], n: number): string[] {
  return [...wordFreq(sentences).entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, n)
    .map(([w]) => w)
}

const TRAILING_WEAK = new Set(
  'a an the of to and or in on at for with by from as that which who is are was were be been than its their our your his her this these those into about over under per'.split(
    ' ',
  ),
)

const CONNECTOR = /^(however|therefore|thus|hence|moreover|furthermore|meanwhile|instead|nevertheless|nonetheless|consequently|also|and|but|or|yet|so|which|while|whereas|although|though|because|including|especially|namely)$/i

function trimWeakTail(ws: string[]): string[] {
  const out = [...ws]
  const bare = (w: string) => w.toLowerCase().replace(/[^a-z]/g, '')
  while (out.length > 1 && (TRAILING_WEAK.has(bare(out[out.length - 1])) || CONNECTOR.test(bare(out[out.length - 1])))) out.pop()
  return out
}

export function stripLead(s: string): string {
  let out = s.trim()
  for (let i = 0; i < 3; i++) {
    const next = out.replace(LEAD_MARKERS, '')
    if (next === out) break
    out = next
  }
  return out
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Removes parentheticals and brackets, which read badly aloud. */
export function stripAsides(s: string): string {
  return s.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s+([,.;:!?])/g, '$1').trim()
}

const ASIDE_LEAD = String.raw`(?:such as|including|like|especially|notably|for example|for instance|e\.g\.|i\.e\.|typically|usually|often|mainly|mostly|primarily)`
const LIST_ASIDE = new RegExp(String.raw`,\s*${ASIDE_LEAD}\s+[^,]{1,40}(?:,\s*[^,]{1,40})*?,?\s+(?:and|or)\s+[^,]{1,40},\s*`, 'gi')
const SIMPLE_ASIDE = new RegExp(String.raw`,\s*${ASIDE_LEAD}\s+[^,]{1,60},\s*`, 'gi')

/**
 * The sentence without its side remarks, still whole: brackets, dash asides ("— typically from sunlight —")
 * and example lists (", such as most plants, algae and cyanobacteria,").
 */
export function leanText(sentence: string): string {
  return stripAsides(sentence)
    .replace(/\s+[—–]\s+[^—–]{1,80}?\s+[—–]\s+/g, ' ')
    .replace(/\s*—[^—]{1,80}?—\s*/g, ' ')
    .replace(LIST_ASIDE, ' ')
    .replace(SIMPLE_ASIDE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim()
}

/** Words that open a new clause after a comma, where a sentence can end cleanly. */
const CLAUSE_START = /^(which|while|whereas|but|although|though|because|so|yet|making|leading|resulting|allowing|meaning|where|thereby)$/

/**
 * Shortens a sentence for narration to about `max` words. Side remarks go first; then it ends at a real clause
 * break, never at a comma inside a list. With no clean break a whole sentence a little over the limit is kept,
 * since a long sentence is easier to follow than a broken one.
 */
export function compress(sentence: string, max: number): string {
  const s = stripAsides(sentence).replace(/\s+/g, ' ').trim()
  if (s.split(' ').length <= max) return ensurePeriod(s)
  const lean = leanText(s)
  const soft = Math.round(max * 1.3)
  const tokens = lean.split(' ')
  if (tokens.length <= soft) return ensurePeriod(lean)
  let best = -1
  const bare = (w: string | undefined) => (w ?? '').toLowerCase().replace(/[^a-z]/g, '')
  for (let i = Math.floor(max * 0.5); i < Math.min(soft, tokens.length - 1); i++) {
    const t = tokens[i]
    const next = bare(tokens[i + 1])
    if (CONNECTOR.test(t.replace(/[,;:—–]+$/, ''))) continue
    if (/[;:—–]$/.test(t)) best = i
    else if (/,$/.test(t) && (CLAUSE_START.test(next) || (next === 'and' && /^(thus|so|therefore|hence|then|it|they|this|these)$/.test(bare(tokens[i + 2]))))) best = i
  }
  if (best >= 0) return ensurePeriod(trimWeakTail(tokens.slice(0, best + 1)).join(' ').replace(/[,;:—–]+$/, ''))
  if (tokens.length <= max * 1.6) return ensurePeriod(lean)
  return ensurePeriod(trimWeakTail(tokens.slice(0, soft)).join(' ').replace(/[,;:—–]+$/, ''))
}

export function ensurePeriod(s: string): string {
  const t = s.trim()
  return /[.!?]["”']?$/.test(t) ? t : t.replace(/[,;:]+$/, '') + '.'
}

const BOUNDARY = new Set(
  'about at in on with for to that which who whom whose after before because since while when where whereas although though if unless until during among across through into from by as than so but and or like including especially'.split(
    ' ',
  ),
)

/**
 * Short on screen phrase of at most about `max` words, no end punctuation.
 * Cuts before a preposition or conjunction so the phrase still reads as a whole thought.
 */
export function shortPhrase(sentence: string, max = 8): string {
  let s = stripLead(leanText(sentence))
  // "Because magma is lighter than rock, it rises" shows its main clause with the subject put back ("Magma
  // rises..."), not the "Because..." half on its own.
  const sub = s.split(/\s+/).length > max + 2 && s.match(/^(because|since|although|though|when|whenever|while|if|as|after|before|once|until)\s+(.+?),\s+(.+)$/i)
  const subj = sub && sub[2].match(/^((?:the|a|an)\s+)?([\w'’-]+(?:\s+[\w'’-]+)?)\s+(?:is|are|was|were|has|have|had|can|could|will|would|do|does|did|[a-z]+(?:s|ed))\b/i)
  if (sub && subj) {
    const noun = `${subj[1] ?? ''}${subj[2]}`
    const main = sub[3]
      .replace(/^(it|they)\b/i, noun)
      .replace(/^its\s/i, `${noun}'s `)
      .replace(/^their\s/i, /s$/i.test(noun) ? `${noun}' ` : `${noun}'s `)
    if (!/^(this|these|that|those|it|they|its|their|his|her)\b/i.test(main) && main.split(/\s+/).length >= 3) s = main
  }
  const clause = s.split(/\s*[;:—–]\s*|,\s+(?=(?:which|who|while|whereas|although|though|but|because|so|and then|meaning)\b)/i)[0]
  if (clause && clause.split(' ').length >= 3) s = clause
  let ws = s.replace(/[.!?]+$/, '').split(/\s+/)
  // A couple of extra words beat a broken phrase.
  if (ws.length > max + 2) {
    const minKeep = Math.max(3, Math.ceil(max * 0.45))
    let cut = -1
    for (let i = Math.min(ws.length - 1, max + 2); i >= minKeep; i--) {
      const prev = ws[i - 1]
      const w = ws[i].toLowerCase().replace(/[^a-z]/g, '')
      // Never split "20 to 30" or "5 or 6".
      if (/\d[,.]?$/.test(prev) && /^[$€£¥]?\d/.test(ws[i + 1] ?? '')) continue
      if (/,$/.test(prev) || BOUNDARY.has(w)) { cut = i; break }
    }
    if (cut > 0) ws = ws.slice(0, cut)
    else {
      // A hard cut finishes a number range ("20 to 30 vibrations") instead of stopping inside it.
      const link = /^(to|or|and|[–-])$/i
      let end = max
      while (end < ws.length && end < max + 4 && ((/\d[,.]?$/.test(ws[end - 1]) && link.test(ws[end])) || (link.test(ws[end - 1]) && /^[$€£¥]?\d/.test(ws[end])))) end++
      if (end > max && end < ws.length && /^[a-z]+$/i.test(ws[end]) && !BOUNDARY.has(ws[end].toLowerCase())) end++
      ws = ws.slice(0, end)
    }
    ws = trimWeakTail(ws.map((w, i, arr) => (i === arr.length - 1 ? w.replace(/,$/, '') : w)))
  }
  return capitalize(ws.join(' ').replace(/[,;:]$/, ''))
}

export function sentenceCase(s: string): string {
  const t = s.trim()
  if (!t) return t
  // Leave acronyms and proper nouns alone, only lift the first letter.
  return t[0].toUpperCase() + t.slice(1)
}
