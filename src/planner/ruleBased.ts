import type { DataSeries, Scene, Storyboard, Visual } from '../model/storyboard'
import { countWords, sceneId } from '../model/storyboard'
import { contentWords, wordFreq, compress, shortPhrase, capitalize, ensurePeriod, topKeywords, stripLead, splitSentences, stripAsides, leanText, STOPWORDS } from '../input/parseText'
import { tidySeries } from '../input/parseTable'
import { findChange, findCompare, findStats, meaningfulStats, salientStats, seriesFromText } from '../input/extractNumbers'
import type { Stat } from '../input/extractNumbers'
import { formatValue, pctChange, round } from '../input/numbers'
import type { Corpus, Doc, Section, Source } from '../ingest/types'
import { definedSubject } from '../ingest/types'
import { describeSeries } from './describe'

export type Detail = 'quick' | 'standard' | 'deep'

export interface ImageInput {
  id: string
  caption: string
}

export interface PlannerInput {
  /** What the user typed; short prompts become the title and decide the opening line. */
  prompt: string
  corpus: Corpus
  detail: Detail
}

/** Spoken words and body scenes per detail level. Kokoro reads about 2.6 words a second. */
export const BUDGET: Record<Detail, { words: number; scenes: number; stats: number }> = {
  quick: { words: 85, scenes: 4, stats: 1 },
  standard: { words: 170, scenes: 7, stats: 2 },
  deep: { words: 340, scenes: 13, stats: 4 },
}

interface Sent {
  text: string
  order: number
  doc: number
  section: number
  /** Index of the paragraph in the whole corpus, and position in it. */
  para: number
  pos: number
  heading: string
}

interface Candidate {
  order: number
  priority: number
  words: number
  kind: 'definition' | 'chart' | 'image' | 'stat' | 'point' | 'list' | 'steps' | 'timeline' | 'derived'
  sentence?: Sent
  /** Sentences this scene speaks, so nothing is said twice. */
  uses: number[]
  build: () => Scene
  /** Another way to narrate the same visual when its sentence is already spoken elsewhere. */
  alt?: { words: number; build: () => Scene }
}

const GENERIC_GROUP = /^(types?|kinds?|classifications?|varieties|forms|categories|subtypes|classes|groups|families|species)$/i
const PROCESS_HEAD = /\b(how (it|they) works?|process|mechanism|procedure|steps?|stages?|phases?|life ?cycle|method|workflow|pathway|cycle)\b/i
const HISTORY_HEAD = /\b(history|timeline|background|origins?|development|chronology|discovery|evolution)\b/i
const ORDINAL = /^(first(ly)?|second(ly)?|third(ly)?|fourth|then|next|after (that|this)|afterwards|finally|lastly|step \d+|in the (first|second|third|final) (step|stage))\b/i
const DEFINITION = /^(?:(?:The|An?)\s+)?(.{2,70}?)\s+(is|are|was|were|refers to|describes|means|is defined as)\s+(?:(an?|the|one of the)\s+)?(.+)$/i
const GENERIC_TAG = /^(direct|total|major|minor|higher|lower|greater|small|smaller|larger|several|various|certain|specific|particular|typically|usually|generally|possible|however|including|include|includes|known|called|often|years|first|several|different|important|example|examples|using|based|people|world|united|states|number|large|small|general|common|according|became|although|other|might|would|could|which|their|there|these|those|while|within|between|during|early|later|since|until|after|before|without|because|through|around|among|another)$/
const QUESTION = /\?$|^(how|why|what|when|where|who|which|can|could|does|do|did|is|are|should|will|would)\b/i

/** A sentence placed after "In short, ": its first word lowercased, unless it is a name ("Freud wrote..."). */
function midSentence(text: string, sents: Sent[]): string {
  const first = text.match(/^[A-Z][a-z'’-]*/)?.[0]
  if (!first) return text
  const lower = first.toLowerCase()
  const common = STOPWORDS.has(lower) || new RegExp(`\\b${lower.replace(/[^a-z]/g, '')}\\b`).test(sents.map((x) => x.text).join(' ').replace(/(^|[.!?]\s+)[A-Z]\w*/g, ''))
  return common ? lower + text.slice(first.length) : text
}

function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s
}

/** Lowercases a list item for use mid sentence, unless it is a name ("World Health Organization", "RNA"). */
function naturalCase(item: string, lowerVocab: Set<string>): string {
  const words = item.split(/\s+/)
  if (words.some((w) => /^[A-Z]{2,}/.test(w))) return item
  const first = words[0].toLowerCase()
  return lowerVocab.has(first) ? first + item.slice(words[0].length) : item
}

const STEP_VERB = /^(is|are|was|were|has|have|turns?|cools?|returns?|gathers?|forms?|runs?|collapses?|rises?|melts?|builds?|forces?|bursts?|collects?|becomes?|moves?|makes?|uses?|takes?|gets?|goes?|falls?|flows?|changes?|creates?|produces?|releases?|absorbs?|enters?|leaves?|starts?|begins?|ends?|travels?|binds?|splits?|joins?|grows?|breaks?|carries?|sends?|stores?|converts?|happens?|occurs?|causes?|triggers?|remains?|can|will|may|must)$/i

/**
 * Short labels for step circles: "Evaporation turns liquid water into vapor" -> "Evaporation" when each step
 * has its own subject; otherwise a short phrase ("Magma collects", "Pressure forces magma up").
 */
function stepLabels(items: string[]): string[] {
  const cleaned = items.map((item) => stripLead(item.replace(/^(step\s*\d+[:.)]?|\d+[.)])\s*/i, '')).replace(/^(a|an|the)\s+/i, ''))
  const subjects = cleaned.map((c) => {
    // "What remains is a black hole" is labeled by what it names, not by "What".
    const named = c.match(/^what\s+(?:\w+\s+){1,2}?(?:is|are|was|were)\s+(?:a|an|the)?\s*(.+)$/i)
    if (named) return capitalize(shortPhrase(named[1], 3))
    const words = c.split(/\s+/)
    if (/^(what|which|who|this|these|that|those|it|they|there|here)$/i.test(words[0])) return ''
    const k = words.findIndex((w, i) => i >= 1 && i <= 3 && STEP_VERB.test(w.replace(/[^A-Za-z]/g, '')))
    return k >= 1 ? capitalize(words.slice(0, k).join(' ').replace(/[,;:]$/, '')) : ''
  })
  const labels = subjects.map((x, i) => x || shortPhrase(cleaned[i], 4))
  const distinct = new Set(labels.map((x) => x.toLowerCase())).size === labels.length
  return distinct ? labels : cleaned.map((c) => shortPhrase(c, 4))
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function overlap(a: string[], b: string[]): number {
  const set = new Set(a)
  return b.filter((w) => set.has(w)).length
}

function cuesFor(parts: string[], lead = 0): number[] {
  const counts = parts.map(countWords)
  const total = counts.reduce((a, b) => a + b, 0) + lead || 1
  let acc = lead
  return counts.map((c) => {
    const at = acc / total
    acc += c
    return Math.min(0.95, at)
  })
}

/** Flattens every document into ordered sentences that remember their section. */
function flatten(docs: Doc[]): { sents: Sent[]; sections: { doc: number; idx: number; sec: Section }[] } {
  const sents: Sent[] = []
  const sections: { doc: number; idx: number; sec: Section }[] = []
  let para = 0
  docs.forEach((d, di) => {
    d.sections.forEach((sec, si) => {
      sections.push({ doc: di, idx: si, sec })
      for (const p of sec.paragraphs) {
        splitSentences(stripAsides(p)).forEach((raw, pos) => {
          const text = raw.replace(/\s+/g, ' ').replace(/^([^,]{2,60}),\s+(is|are|was|were)\b/, '$1 $2').replace(/\s+,/g, ',').trim()
          if (!usableSentence(text)) return
          sents.push({ text, order: sents.length, doc: di, section: si, para, pos, heading: sec.heading })
        })
        para++
      }
    })
  })
  return { sents, sections }
}

/** Whole, readable sentences only: no fragments, formulas, symbol lists or links. */
function usableSentence(text: string): boolean {
  const n = countWords(text)
  if (n < 5 || n > 60) return false
  if (/[{}\\]|https?:|\u2061|\u2062/.test(text)) return false
  if (/^[a-z]/.test(text)) return false
  // "Hb is the beam irradiance, Rb is the tilt factor..." reads as symbols.
  if ((text.match(/\b[A-Z][a-z]?\b/g) ?? []).filter((t) => !/^(A|I|In|It|On|At|As|An|If|Of|Or|To|By|So|No|We|He|Be|Do|Is|Us|My)$/.test(t)).length >= 3) return false
  if ((text.match(/[=<>±×÷∑∫√]/g) ?? []).length >= 2) return false
  // "The overall equation is." lost its formula; "...as follows." lost its list.
  if (/\b(is|are|was|were|as follows|the following|given by|written as|include|includes|including|such as|namely|like|listed below|below)\s*[.:]?$/i.test(text)) return false
  return true
}

/** Sections that rarely explain the topic itself. */
const LOW_VALUE = /\b(market|industry|companies|business|licen[cs]ing|nomenclature|etymology|naming|regulation|legal|law|economics|society and culture|culture|controversy|controversies|criticism|research|trademark|brand names?|manufactur|production|cost|price|sales|marketing|terminology|references?|statistics|records?|awards?|list of|veterinary|other animals|in fiction)\w*/i

/** Sentences that lean on the one before ("This causes...", "Examples include...") confuse when shown alone. */
const ANAPHORIC = /^(this|these|that|those|it|its|they|their|them|such|hence|thus|therefore|however|examples?|for example|for instance|also|in addition|furthermore|moreover|he|she|his|her|the latter|the former|both|another|other|in contrast|by contrast|on the other hand|instead|similarly|likewise|meanwhile|consequently|as a result|in turn|nevertheless|nonetheless|conversely|additionally|accordingly|even so|otherwise|in this|in these|at this|at that|specifically|in particular|in fact|indeed|notably)\b/i
/** "About 90% of this energy..." leans on the sentence before it as much as "This energy..." does. */
const LEANS_BACK = /^(?:\S+\s+){1,4}(?:this|these|those)\s+[a-z]+/i
const dependsOnContext = (text: string) => ANAPHORIC.test(text) || LEANS_BACK.test(text)
/** Words that explain how something works, for "how" questions. */
const MECHANISM = /\b(by|through|stimulat\w*|trigger\w*|convert\w*|produc\w*|allow\w*|enabl\w*|works?|binds?|absorb\w*|releas\w*|transform\w*|leads? to|results? in|so that|recogni[sz]\w*|form(s|ed)? when|collaps\w*|uses?|turns?)\b/i
/** Words that give reasons, for "why" questions. */
/** Words that give a reason (not a consequence: "results in" says what something causes, not why it happens). */
const WHY_ANSWER = /\b(because|due to|caused by|the reasons?|reasons?|so that|in order to|purpose|serves? to|helps? to|scatter\w*|as a result of)\b/i
const CAUSE = /\b(because|due to|caused by|causes?|as a result|reason|scatter\w*|so that|leads? to|results? in|therefore)\b/i

function score(sents: Sent[], focus: string[], docs: Doc[], intent: 'how' | 'why' | 'what', asked: string[] = []): number[] {
  const askedStems = asked.map((w) => w.slice(0, 5))
  const freq = wordFreq(sents.map((s) => s.text))
  const maxF = Math.max(1, ...freq.values())
  const raw = sents.map((s) => {
    // Unique words, so repeating the topic word does not inflate a sentence.
    const cw = [...new Set(contentWords(s.text))]
    if (!cw.length) return 0
    let sc = cw.reduce((a, w) => a + (freq.get(w) ?? 0) / maxF, 0) / Math.sqrt(cw.length)
    if (salientStats(s.text).length) sc += 0.15
    if (s.pos === 0) sc += 0.1
    // The lead section of an article is its best summary; earlier sections are more general.
    const total = Math.max(1, docs[s.doc].sections.length)
    if (s.section === 0) sc += 0.55
    else sc += 0.2 * (1 - s.section / total)
    if (LOW_VALUE.test(s.heading)) sc = sc * 0.4 - 0.3
    // Sentences about what was asked count more.
    sc += Math.min(0.75, overlap(focus, cw) * 0.25)
    if (intent === 'how' && MECHANISM.test(s.text)) sc += 0.25
    if (intent === 'why' && CAUSE.test(s.text)) sc += 0.35
    // A reason that uses the question's own words ("blue" in "Why is the sky blue?") is the answer itself.
    if (intent === 'why' && WHY_ANSWER.test(s.text) && overlap(askedStems, cw.map((w) => w.slice(0, 5)))) sc += 0.6
    if (dependsOnContext(s.text)) sc -= 0.35
    const n = countWords(s.text)
    if (n < 7) sc -= 0.2
    // Long lead sentences are still worth it; narration trims them at a clause break.
    if (n > 35) sc -= s.section === 0 ? 0.08 : 0.25
    return sc
  })
  const hi = Math.max(...raw, 0.0001)
  const lo = Math.min(...raw, 0)
  return raw.map((r) => (r - lo) / (hi - lo || 1))
}

function inferTitle(prompt: string, docs: Doc[], tables: DataSeries[], images: ImageInput[]): string {
  const p = prompt.trim().replace(/\s+/g, ' ')
  if (p && countWords(p) <= 12) return capitalize(p)
  // The user's own material names the topic before Wikipedia does.
  const own = docs.filter((d) => d.kind !== 'wiki')
  const titled = own.find((d) => d.title && countWords(d.title) <= 14)
  if (titled?.title) return titled.title
  const subject = own.map(definedSubject).find(Boolean)
  if (subject) return capitalize(subject)
  const wiki = docs.find((d) => d.kind === 'wiki')
  if (wiki?.title) return wiki.title
  const text = docs.flatMap((d) => d.sections.flatMap((s) => s.paragraphs)).join(' ')
  // A name the text opens with ("Maple Street Bakery opened in 2019...") says what it is about.
  const name = splitSentences(text)
    .slice(0, 3)
    .flatMap((x) => x.match(/\b[A-Z][a-z]+(?:\s+(?:of\s+|the\s+|and\s+)?[A-Z][a-z]+){1,3}\b/g) ?? [])
    .map((x) => x.replace(/^(The|A|An|In|On|At|This|These|Our|My|Its|When|After|Before|During)\s+/, ''))
    .find((x) => x.split(/\s+/).length >= 2)
  if (name) return name
  if (tables[0]?.title && countWords(tables[0].title) >= 2) return tables[0].title
  const kw = topKeywords([text], 2)
  if (kw.length) return capitalize(kw.join(' and '))
  return tables[0]?.title ?? images[0]?.caption ?? 'Your topic'
}

interface Definition {
  term: string
  /** "A", "An", "The" or "" as written, so narration reads "a vaccine is", not "vaccine is". */
  article: string
  link: string
  meaning: string
}

/** "A vaccine is a biological preparation that..." -> term, link, meaning. */
function definitionOf(s: string, topicWords: string[]): Definition | null {
  const lead = stripLead(s)
  const m = lead.match(DEFINITION)
  if (!m) return null
  const article = lead.match(/^(the|an?)\s/i)?.[1] ?? ''
  const term = m[1].replace(/,.*$/, '').trim()
  if (countWords(term) > 6 || /^(it|this|that|these|they|there|he|she|which)$/i.test(term)) return null
  if (/^(because|if|when|while|although|though|since|as|after|before|unless|so|once|until|whether|where|why|how|what|in|on|at|by|for|with|from|to|of)\b/i.test(term)) return null
  const termWords = contentWords(term)
  if (topicWords.length && !overlap(topicWords, termWords) && !topicWords.some((w) => term.toLowerCase().includes(w.slice(0, 5)))) return null
  // "Cinnamon rolls are the best seller" ranks something; it does not say what it is.
  const rest = `${m[3] ? `${m[3]} ` : ''}${m[4]}`.trim()
  if (/^(the\s+)?(best|worst|most|least|largest|biggest|smallest|first|last|only|main|top|leading|highest|lowest|favou?rite|same)\b/i.test(rest)) return null
  if (/^(more|less|better|worse|bigger|smaller|very|so|too|also|not|now|still|often|usually|here|there)\b/i.test(rest)) return null
  return { term: capitalize(term), article: article.toLowerCase(), link: m[2].toLowerCase(), meaning: shortPhrase(`${m[3] ? `${m[3]} ` : ''}${m[4]}`, 16).replace(/^./, (c) => c.toLowerCase()) }
}

function bestStat(stats: Stat[]): Stat {
  const rank = (s: Stat) => (s.unit.suffix ? 3 : 0) + (s.unit.prefix ? 3 : 0) + (s.unit.word ? 2 : 0) + Math.log10(Math.abs(s.value) + 1) * 0.1
  return [...stats].sort((a, b) => rank(b) - rank(a))[0]
}

function statLabel(sentence: string, stat: Stat): string {
  let phrase = shortPhrase(sentence, 14)
  if (!phrase.includes(stat.raw)) {
    // The number sits in a later clause ("..., while liver cells have 2,000 of them"): label from that clause.
    const clause = sentence.split(/[,;:]\s+|\s+(?:while|whereas|but|although)\s+/i).find((c) => c.includes(stat.raw))
    if (clause && countWords(clause) >= 3) phrase = shortPhrase(capitalize(clause.trim()), 14)
  }
  const idx = phrase.indexOf(stat.raw)
  if (idx >= 0) {
    const before = phrase.slice(0, idx).trim()
    if (/^(only|just|about|around|nearly|almost|roughly|over|more than|less than|some)?$/i.test(before)) {
      const rest = phrase.slice(idx + stat.raw.length).trim()
      if (rest.split(/\s+/).length >= 2) return rest
    }
  }
  return phrase
}

const CHANGE_VERB = /\s+(went|grew|rose|fell|dropped|increased|decreased|jumped|climbed|declined|moved|changed|shrank|soared|surged|slid|sank)$/i

function changeLabel(sentence: string, from: Stat, to: Stat): string {
  const before = stripLead(sentence.slice(0, from.start).replace(/\bfrom\s*$/i, '').trim())
  let subject = before.replace(CHANGE_VERB, '').trim()
  if (!subject || subject.split(/\s+/).length > 8) subject = shortPhrase(sentence, 6)
  if (from.year && to.year && from.year !== to.year) return `${capitalize(subject)}, ${from.year} to ${to.year}`
  return capitalize(subject)
}

export function statVisual(sentence: string): Visual | null {
  const change = findChange(sentence)
  if (change) {
    return {
      kind: 'stat',
      value: change.to.value,
      decimals: Math.max(change.to.decimals, change.from.decimals),
      unit: change.to.unit,
      label: changeLabel(sentence, change.from, change.to),
      from: change.from.value,
    }
  }
  const cmp = findCompare(sentence)
  if (cmp) {
    return {
      kind: 'compare',
      unit: cmp.left.stat.unit,
      decimals: Math.max(cmp.left.stat.decimals, cmp.right.stat.decimals),
      left: { label: cmp.left.label, value: cmp.left.stat.value },
      right: { label: cmp.right.label, value: cmp.right.stat.value },
    }
  }
  const stats = meaningfulStats(sentence)
  if (!stats.length) return null
  const st = bestStat(stats)
  return { kind: 'stat', value: st.value, decimals: st.decimals, unit: st.unit, label: statLabel(sentence, st), from: null }
}

function matchesData(sentence: string, d: DataSeries): boolean {
  const stats = salientStats(sentence)
  if (!stats.length) return false
  const all = d.series.flatMap((s) => s.values)
  const hits = stats.filter((st) => all.some((v) => Math.abs(v - st.value) <= Math.max(1e-9, Math.abs(v) * 0.005))).length
  return hits >= 2 || (hits === 1 && stats.length === 1 && d.categories.length <= 4)
}

function decimalsOf(x: number): number {
  const t = String(x)
  return t.includes('.') ? Math.min(2, t.split('.')[1].length) : 0
}

/** A second figure from a table: overall change or the gap between top and bottom. */
/** "a month" for Jan to Dec, "a year" for 2019 to 2024, so an average reads naturally. */
function perPeriod(categories: string[]): string {
  if (categories.every((c) => /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(c))) return ' a month'
  if (categories.every((c) => /^(19|20)\d\d$/.test(c.trim()))) return ' a year'
  if (categories.every((c) => /^q[1-4]\b/i.test(c.trim()))) return ' a quarter'
  if (categories.every((c) => /^(mon|tue|wed|thu|fri|sat|sun)/i.test(c))) return ' a day'
  return ''
}

/** Second figures a table offers, best first: the overall change, then the average. */
function derivedScenes(d: DataSeries): Scene[] {
  const v = d.series[0].values
  const c = d.categories
  if (v.length < 2) return []
  if (d.chart === 'line' && d.series.length === 1) {
    const out: Scene[] = []
    const ch = pctChange(v[0], v[v.length - 1])
    if (ch !== null && Math.abs(ch) >= 1 && d.unit.suffix !== '%') {
      const up = ch > 0
      out.push({
        id: sceneId(),
        priority: 0.3,
        narration: `Overall, that is a ${Math.round(Math.abs(ch))}% ${up ? 'increase' : 'decrease'} since ${c[0]}.`,
        visual: { kind: 'stat', value: round(Math.abs(ch), 0), decimals: 0, unit: { prefix: '', suffix: '%', word: '' }, label: `${up ? 'growth' : 'decline'} in ${lowerFirst(d.series[0].name)} since ${c[0]}`, from: null },
      })
    }
    const avg = v.reduce((a, b) => a + b, 0) / v.length
    const decimals = Math.abs(avg) >= 10 ? 0 : 1
    const per = perPeriod(c)
    out.push({
      id: sceneId(),
      priority: 0.3,
      narration: `The average was ${formatValue(round(avg, decimals), d.unit, decimals)}${per}.`,
      visual: { kind: 'stat', value: round(avg, decimals), decimals, unit: d.unit, label: `average ${lowerFirst(d.series[0].name)}${per ? ` per ${per.slice(3)}` : ''}`, from: null },
    })
    return out
  }
  const one = derivedBar(d)
  return one ? [one] : []
}

function derivedBar(d: DataSeries): Scene | null {
  const v = d.series[0].values
  const c = d.categories
  if (d.chart === 'bar' && d.series.length === 1) {
    const order = v.map((_, i) => i).sort((a, b) => v[b] - v[a])
    const top = order[0]
    const bottom = order[order.length - 1]
    if (v[bottom] <= 0) return null
    const ratio = v[top] / v[bottom]
    return {
      id: sceneId(),
      priority: 0.3,
      narration: ratio >= 1.5 ? `${c[top]} is about ${round(ratio, 1)} times ${c[bottom]}.` : `The gap between ${c[top]} and ${c[bottom]} is ${formatValue(v[top] - v[bottom], d.unit)}.`,
      visual: { kind: 'compare', unit: d.unit, decimals: Math.max(decimalsOf(v[top]), decimalsOf(v[bottom])), left: { label: c[bottom], value: v[bottom] }, right: { label: c[top], value: v[top] } },
    }
  }
  return null
}

/** The year a sentence is about, if it names one. */
function yearOf(s: string): { when: string; value: number; raw: string } | null {
  const decade = s.match(/\b(?:the\s+)?((1[0-9]|20)\d0)s\b/)
  const stats = findStats(s).filter((st) => st.isYear)
  if (stats.length) return { when: String(stats[0].value), value: stats[0].value, raw: stats[0].raw }
  if (decade) return { when: `${decade[1]}s`, value: Number(decade[1]), raw: decade[0] }
  const bc = s.match(/\b(\d{2,4})\s?(BC|BCE)\b/)
  if (bc) return { when: `${bc[1]} ${bc[2]}`, value: -Number(bc[1]), raw: bc[0] }
  return null
}

function eventLabel(s: string, raw: string): string {
  const cut = s
    .replace(new RegExp(`\\b(in|by|during|around|from|until|since|circa|c\\.)?\\s*(the\\s+)?${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,?`, 'i'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return shortPhrase(cut, 7)
}

export function planRuleBased(input: PlannerInput): Storyboard {
  const { corpus, detail } = input
  const budget = BUDGET[detail]
  const docs = corpus.docs
  const images: ImageInput[] = corpus.images.map((i) => ({ id: i.id, caption: i.caption }))
  const tables = corpus.tables.map(tidySeries)
  const { sents, sections } = flatten(docs)
  const prompt = input.prompt.trim()
  const title = inferTitle(prompt, docs, tables, images)
  const wiki = docs.find((d) => d.kind === 'wiki')
  const topicWords = contentWords(`${title} ${wiki?.title ?? ''}`)
  const focus = contentWords(prompt).concat(topicWords)
  const intent: 'how' | 'why' | 'what' = /^why\b/i.test(prompt) ? 'why' : /^how\b/i.test(prompt) ? 'how' : 'what'
  const scores = score(sents, focus, docs, intent, contentWords(prompt))
  const consumed = new Set<number>()
  const candidates: Candidate[] = []
  const lastOrder = Math.max(1, sents.length)
  const lowerVocab = new Set((sents.map((s) => s.text).join(' ').match(/\b[a-z][a-z-]+\b/g) ?? []))

  /** Where a section sits in reading order, even when it holds only a list and no sentences. */
  const sectionOrder = (doc: number, idx: number): number => {
    const inside = sents.find((x) => x.doc === doc && x.section === idx)
    if (inside) return inside.order - 0.2
    const before = [...sents].reverse().find((x) => x.doc === doc && x.section < idx)
    if (before) return before.order + 0.5
    const next = sents.find((x) => x.doc > doc)
    return next ? next.order - 0.5 : lastOrder
  }

  const placeByKeywords = (keys: string[], fallback: number) => {
    let best = -1
    let bestScore = 0
    sents.forEach((s, i) => {
      const o = overlap(keys, contentWords(s.text))
      if (o > bestScore) { bestScore = o; best = i }
    })
    return best >= 0 ? sents[best].order + 0.5 : fallback
  }

  // 1. Definition: "X is a ..." near the start, about the topic.
  let definition: (Definition & { sent: Sent }) | null = null
  for (const s of sents.slice(0, 12)) {
    const d = definitionOf(s.text, topicWords)
    if (d) { definition = { ...d, sent: s }; break }
  }
  // No definition of the topic itself: take the first plain definition near the start of the main document.
  if (!definition) {
    for (const s of sents.slice(0, 6)) {
      const d = definitionOf(s.text, [])
      if (d && s.doc === 0) { definition = { ...d, sent: s }; break }
    }
  }
  if (definition) {
    const def = definition
    consumed.add(def.sent.order)
    // Another source defining the same thing (Wikipedia beside the user's notes) would say it twice.
    for (const s of sents) {
      if (s.order === def.sent.order) continue
      const other = definitionOf(s.text, [])
      if (other && other.term.toLowerCase() === def.term.toLowerCase()) consumed.add(s.order)
    }
    const narration = compress(def.sent.text, 28)
    candidates.push({
      kind: 'definition',
      order: -1,
      priority: 1.2,
      words: countWords(narration),
      uses: [def.sent.order],
      build: () => ({ id: sceneId(), narration, priority: 1, visual: { kind: 'definition', term: def.term, link: def.link, meaning: def.meaning } }),
    })
  }

  // Sections whose list already became a scene.
  const listUsed = new Set<Section>()

  // 2. Groups: a section whose subsections name kinds of the topic (Wikipedia's "Types"), or a list of short items.
  sections.forEach((entry, k) => {
    const { sec } = entry
    const children: string[] = []
    for (let j = k + 1; j < sections.length && sections[j].doc === entry.doc && sections[j].sec.level > sec.level; j++) {
      if (sections[j].sec.level === sec.level + 1 && countWords(sections[j].sec.heading) <= 4) children.push(sections[j].sec.heading)
    }
    const listItems = sec.items.filter((i) => countWords(i) <= 7)
    const ordered = sec.ordered || PROCESS_HEAD.test(sec.heading)
    const names = children.length >= 3 ? children : !ordered && listItems.length >= 3 ? listItems.map((i) => shortPhrase(i, 6)) : []
    if (!names.length || !sec.heading || LOW_VALUE.test(sec.heading)) return
    const generic = GENERIC_GROUP.test(sec.heading)
    // A plural noun phrase ("Rocks", "Main causes"), not a clause or question ("What goes in").
    // The head noun is the word before "of" when there is one: "Function of autumn colors" names one thing.
    const headNoun = (sec.heading.split(/\s+of\s+/i)[0].split(/\s+/).pop() ?? '')
    const plural = /[^s]s$/i.test(headNoun) && !/(us|is)$/i.test(headNoun) && !/^(what|why|how|when|where|who|which)\b/i.test(sec.heading) && countWords(sec.heading) <= 4
    // "There are several types of vaccine: ..." reads well; "There are several what goes in" does not.
    if (!generic && !plural) return
    const items = names.slice(0, 5)
    if (children.length < 3) listUsed.add(sec)
    const topic = (wiki?.title ?? title).replace(/\?$/, '')
    const heading = generic ? `${capitalize(sec.heading)} of ${lowerFirst(topic)}` : capitalize(sec.heading)
    const intro = sents.find((s) => s.doc === entry.doc && s.section === entry.idx && !consumed.has(s.order))
    const lead = `There are several ${lowerFirst(heading)}, including ${joinList(items.map((i) => naturalCase(i, lowerVocab)))}.`
    const narration = intro && countWords(intro.text) <= 30 ? `${lead} ${compress(intro.text, 22)}` : lead
    const firstSent = sents.find((s) => s.doc === entry.doc && s.section >= entry.idx)
    const priority = (generic ? 0.8 : 0.6) + (overlap(focus, contentWords(sec.heading)) ? 0.1 : 0)
    candidates.push({
      kind: 'list',
      order: firstSent ? firstSent.order - 0.2 : sectionOrder(entry.doc, entry.idx),
      priority,
      words: countWords(narration),
      uses: intro && narration.length > lead.length ? [intro.order] : [],
      build: () => ({
        id: sceneId(),
        narration,
        priority,
        visual: { kind: 'steps', heading, items: items.map((i) => shortPhrase(i, 5)), style: 'kinds', cues: items.map((_, i) => Math.min(0.9, (i + 1) * (0.7 / items.length))) },
      }),
    })
  })

  // Slides and documents with bulleted sections: one scene per section, narrated from notes or the bullets.
  const bulletSections = () => sections.forEach((entry) => {
    const { sec } = entry
    const d = docs[entry.doc]
    if (listUsed.has(sec) || d.kind === 'wiki') return
    if (d.kind !== 'pptx' && d.kind !== 'odf' && sec.items.length < 2) return
    const items = sec.items.slice(0, 4).map((i) => shortPhrase(i, 8))
    if (!items.length || !sec.heading) return
    const notes = sents.filter((s) => s.doc === entry.doc && s.section === entry.idx).slice(0, 2)
    const narration = notes.length ? notes.map((n) => compress(n.text, 24)).join(' ') : `${ensurePeriod(sec.heading)} ${items.map((i) => ensurePeriod(i)).join(' ')}`
    const parts = notes.length ? notes.map((n) => n.text) : items
    const firstSent = notes[0]
    const priority = 0.7
    candidates.push({
      kind: 'list',
      order: firstSent ? firstSent.order - 0.1 : sectionOrder(entry.doc, entry.idx),
      priority,
      words: countWords(narration),
      uses: notes.map((n) => n.order),
      build: () => ({
        id: sceneId(),
        narration,
        priority,
        visual: { kind: 'bullets', eyebrow: 'Key points', heading: shortPhrase(sec.heading, 7), items, cues: cuesFor(parts) },
      }),
    })
  })

  // 3. Steps: numbered lists, process sections, or "first... then... finally" runs of sentences.
  const stepRuns: Sent[][] = []
  sections.forEach((entry) => {
    const { sec } = entry
    if ((sec.ordered || PROCESS_HEAD.test(sec.heading)) && sec.items.length >= 3) {
      listUsed.add(sec)
      const items = sec.items.slice(0, 5)
      const parts = items.map((i) => compress(i, 16))
      const narration = parts.join(' ')
      candidates.push({
        kind: 'steps',
        order: sectionOrder(entry.doc, entry.idx),
        priority: 0.85,
        words: countWords(narration),
        uses: [],
        build: () => ({ id: sceneId(), narration, priority: 0.85, visual: { kind: 'steps', heading: sec.heading ? shortPhrase(sec.heading, 6) : 'Step by step', items: stepLabels(items), style: 'steps', cues: cuesFor(parts) } }),
      })
    }
    // Plain sentences under a process heading count as steps only in the user's own material: encyclopedia
    // prose under "...cycle" or "Mechanism" explains, it does not list steps.
    if (PROCESS_HEAD.test(sec.heading) && docs[entry.doc].kind !== 'wiki') {
      const run = sents.filter((s) => s.doc === entry.doc && s.section === entry.idx && countWords(s.text) <= 32).slice(0, 4)
      if (run.length >= 3) stepRuns.push(run)
    }
  })
  for (let i = 0; i < sents.length; i++) {
    if (!ORDINAL.test(sents[i].text)) continue
    const run = [sents[i]]
    for (let j = i + 1; j < sents.length && run.length < 5 && sents[j].section === sents[i].section && sents[j].doc === sents[i].doc && sents[j].para - sents[j - 1].para <= 1; j++) {
      run.push(sents[j])
      if (/^(finally|lastly)\b/i.test(sents[j].text)) break
    }
    if (run.filter((r) => ORDINAL.test(r.text)).length >= 2 && run.length >= 3) {
      stepRuns.push(run)
      i += run.length - 1
    }
  }
  for (const run of stepRuns) {
    const parts = run.map((r) => compress(r.text, 18))
    const items = stepLabels(run.map((r) => r.text))
    const narration = parts.join(' ')
    candidates.push({
      kind: 'steps',
      order: run[0].order,
      priority: 0.85,
      words: countWords(narration),
      uses: run.map((r) => r.order),
      build: () => ({ id: sceneId(), narration, priority: 0.85, visual: { kind: 'steps', heading: run[0].heading ? shortPhrase(run[0].heading, 6) : 'How it works', items, style: 'steps', cues: cuesFor(parts) } }),
    })
  }

  bulletSections()

  // 4. Timeline: three or more dated sentences, preferring history sections.
  const dated = sents
    .map((s) => ({ s, y: yearOf(s.text) }))
    .filter((x): x is { s: Sent; y: NonNullable<ReturnType<typeof yearOf>> } => !!x.y && countWords(x.s.text) <= 28 && x.y.value > -5000)
  // History sections first; otherwise three or more dated sentences in one section of a document (not
  // facts scattered across a long article, which do not make a story).
  let history = dated.filter((x) => HISTORY_HEAD.test(x.s.heading) || HISTORY_HEAD.test(docs[x.s.doc].title ?? ''))
  if (history.length < 3) {
    const bySection = new Map<string, typeof dated>()
    for (const x of dated) {
      if (docs[x.s.doc].kind === 'wiki') continue
      const key = `${x.s.doc}:${x.s.section}`
      bySection.set(key, [...(bySection.get(key) ?? []), x])
    }
    history = [...bySection.values()].find((list) => new Set(list.map((x) => x.y.when)).size >= 3) ?? []
  }
  if (history.length >= 3) {
    const pool = history
    const byYear = new Map<string, (typeof pool)[number]>()
    for (const x of [...pool].sort((a, b) => scores[b.s.order] - scores[a.s.order])) if (!byYear.has(x.y.when)) byYear.set(x.y.when, x)
    const events = [...byYear.values()].slice(0, detail === 'quick' ? 3 : detail === 'standard' ? 4 : 5).sort((a, b) => a.y.value - b.y.value)
    if (events.length >= 3) {
      const parts = events.map((e) => compress(e.s.text, 28))
      const narration = parts.join(' ')
      const heading = HISTORY_HEAD.test(events[0].s.heading) ? capitalize(events[0].s.heading) : 'Key moments'
      candidates.push({
        kind: 'timeline',
        order: Math.min(...events.map((e) => e.s.order)),
        priority: 0.8,
        words: countWords(narration),
        uses: events.map((e) => e.s.order),
        build: () => ({
          id: sceneId(),
          narration,
          priority: 0.8,
          visual: { kind: 'timeline', heading, events: events.map((e) => ({ when: e.y.when, label: eventLabel(e.s.text, e.y.raw) })), cues: cuesFor(parts) },
        }),
      })
    }
  }

  // 5. Tables become charts, narrated by sentences that state their numbers when there are any.
  tables.forEach((data, i) => {
    const described = describeSeries(data)
    const keys = contentWords([data.title, ...data.series.map((s) => s.name), ...data.categories].join(' '))
    const matched = sents.filter((s) => matchesData(s.text, data)).slice(0, 2)
    const narration = matched.length ? matched.map((s) => compress(s.text, 26)).join(' ') : described.narration
    const order = matched.length ? matched[0].order : placeByKeywords(keys, 0.6 + i * 0.01)
    candidates.push({
      kind: 'chart',
      order,
      priority: 1,
      words: countWords(narration),
      uses: matched.map((s) => s.order),
      build: () => ({ id: sceneId(), narration, priority: 1, visual: { kind: 'chart', data, highlight: described.highlight } }),
    })
    // The first second figure the chart's narration has not already said ("a drop of 62%").
    const derived = derivedScenes(data).find((x) => !(x.narration.match(/\d+(?:\.\d+)?%?/g) ?? []).every((n) => narration.includes(n)))
    if (derived) candidates.push({ kind: 'derived', order: order + 0.01, priority: 0.3, words: countWords(derived.narration), uses: [], build: () => derived })
  })
  for (const { data, orders } of seriesFromText(sents.map((s) => ({ text: s.text, order: s.order, para: s.para })))) {
    if (tables.some((t) => t.series[0].values.filter((v) => data.series[0].values.includes(v)).length >= 2)) continue
    const tidy = tidySeries(data)
    const described = describeSeries(tidy)
    const narration = orders.length === 1 ? compress(sents[orders[0]].text, 30) : described.narration
    candidates.push({
      kind: 'chart',
      order: Math.min(...orders) + 0.1,
      priority: 0.9,
      words: countWords(narration),
      uses: orders,
      build: () => ({ id: sceneId(), narration, priority: 0.9, visual: { kind: 'chart', data: tidy, highlight: described.highlight } }),
    })
  }

  // 6. Images: narrated by a sentence that mentions what they show, or simply introduced.
  images.forEach((img, k) => {
    const keys = contentWords(img.caption)
    const ref = keys.length ? sents.find((s) => overlap(keys, contentWords(s.text)) >= Math.min(2, keys.length) && countWords(s.text) <= 30) : undefined
    // "This picture shows a black hole": the article comes from how the definition names the thing.
    const named = definition && img.caption.toLowerCase() === definition.term.toLowerCase() ? `${definition.article ? `${definition.article.toLowerCase()} ` : ''}${midSentence(definition.term, sents)}` : midSentence(img.caption, sents)
    const plain = ensurePeriod(`This picture shows ${named}`)
    const narration = ref ? compress(ref.text, 26) : plain
    const isLead = docs.some((d) => d.kind === 'wiki') && k === images.length - 1 && img.caption && corpus.sources.some((s) => s.url)
    const visual: Visual = { kind: 'image', imageId: img.id, caption: img.caption }
    candidates.push({
      kind: 'image',
      order: isLead ? -0.5 : ref ? ref.order : ((k + 1) / (images.length + 1)) * lastOrder,
      priority: 0.95,
      words: countWords(narration),
      uses: ref ? [ref.order] : [],
      build: () => ({ id: sceneId(), narration, priority: 0.95, visual }),
      alt: ref ? { words: countWords(plain), build: () => ({ id: sceneId(), narration: plain, priority: 0.95, visual }) } : undefined,
    })
  })

  // 7. Numbers: big number and comparison scenes.
  sents
    .filter((s) => (meaningfulStats(s.text).length || findChange(s.text) || findCompare(s.text)) && countWords(s.text) <= 40 && scores[s.order] >= 0.35 && !dependsOnContext(s.text))
    .sort((a, b) => scores[b.order] - scores[a.order])
    .slice(0, budget.stats + 1)
    .forEach((s) => {
      const visual = statVisual(s.text)
      if (!visual) return
      const narration = compress(s.text, 28)
      const priority = Math.min(0.95, scores[s.order] + 0.15)
      candidates.push({ kind: 'stat', order: s.order, priority, words: countWords(narration), sentence: s, uses: [s.order], build: () => ({ id: sceneId(), narration, priority, visual }) })
    })

  // 8. Everything else competes as key points.
  for (const s of sents) {
    if (countWords(s.text) < 5) continue
    candidates.push({ kind: 'point', order: s.order, priority: scores[s.order] * 0.8, words: countWords(compress(s.text, 24)), sentence: s, uses: [s.order], build: () => { throw new Error('points are grouped') } })
  }

  // Select by priority within the word budget, never saying the same sentence twice.
  const titleNarration = openingLine(title, prompt, definition, !sents.length && tables.length > 0)
  let wordsLeft = budget.words - countWords(titleNarration) - 14
  const chosen: Candidate[] = []
  let bodyScenes = 0
  let pointWords = 0
  let stats = 0
  // Two sentences with mostly the same words ("Under an overcast sky there is no direct sunlight..." twice)
  // would say one thing twice.
  const stemCache = new Map<number, Set<string>>()
  const stemsOf = (i: number) => {
    let set = stemCache.get(i)
    if (!set) stemCache.set(i, (set = new Set(contentWords(sents[i].text).map((w) => w.slice(0, 5)))))
    return set
  }
  const similar = (a: number, b: number) => {
    const x = stemsOf(a)
    const y = stemsOf(b)
    const shared = [...x].filter((w) => y.has(w)).length
    return shared / Math.max(1, x.size + y.size - shared) >= 0.5
  }
  for (const original of [...candidates].sort((a, b) => b.priority - a.priority)) {
    let c = original
    if (c.kind === 'derived') continue
    if (c.kind !== 'definition' && c.uses.some((u) => [...consumed].some((k) => k !== u && similar(u, k)))) continue
    if (c.uses.some((u) => consumed.has(u)) && c.kind !== 'definition') {
      if (!c.alt) continue
      // Its sentence is already spoken elsewhere: keep the visual with its other narration.
      c = { ...c, words: c.alt.words, uses: [], build: c.alt.build, alt: undefined }
    }
    if (c.kind === 'stat' && stats >= budget.stats) continue
    const must = c.kind === 'definition' || (c.kind === 'chart' && c.priority >= 1) || (c.kind === 'image' && bodyScenes < 2)
    if (c.words > wordsLeft && !(must && c.words <= wordsLeft + 30)) continue
    if (c.kind === 'point') {
      const projected = bodyScenes + Math.ceil((pointWords + c.words) / 42) - Math.ceil(pointWords / 42)
      if (projected > budget.scenes) continue
      pointWords += c.words
    } else {
      if (bodyScenes >= budget.scenes) continue
      bodyScenes++
    }
    if (c.kind === 'stat') stats++
    chosen.push(c)
    wordsLeft -= c.words
    c.uses.forEach((u) => consumed.add(u))
  }
  // Short scripts get the follow up figures.
  if (wordsLeft > budget.words * 0.3) {
    for (const c of candidates.filter((x) => x.kind === 'derived')) {
      if (c.words <= wordsLeft && bodyScenes < budget.scenes) {
        chosen.push(c)
        wordsLeft -= c.words
        bodyScenes++
      }
    }
  }
  chosen.sort((a, b) => a.order - b.order)

  // Group consecutive points into scenes of up to three.
  const body: Scene[] = []
  let group: Candidate[] = []
  const flush = () => {
    if (!group.length) return
    const parts = group.map((g) => compress(g.sentence!.text, 24))
    const items = group.map((g) => shortPhrase(g.sentence!.text, group.length === 1 ? 24 : 9))
    const priority = group.reduce((a, g) => a + g.priority, 0) / group.length
    const heading = group[0].sentence!.heading
    body.push({
      id: sceneId(),
      narration: parts.join(' '),
      priority,
      visual: { kind: 'bullets', eyebrow: items.length > 1 ? 'Key points' : 'Key point', heading: heading && countWords(heading) <= 5 && group.length > 1 ? capitalize(heading) : '', items, cues: cuesFor(parts) },
    })
    group = []
  }
  for (const c of chosen) {
    if (c.kind === 'point') {
      const words = group.reduce((a, g) => a + g.words, 0)
      const sameSection = !group.length || (group[0].sentence!.section === c.sentence!.section && group[0].sentence!.doc === c.sentence!.doc)
      if (group.length >= 3 || words + c.words > 46 || !sameSection) flush()
      group.push(c)
    } else {
      flush()
      body.push(c.build())
    }
  }
  flush()

  if (!body.length && sents.length) {
    const s = sents[0]
    body.push({ id: sceneId(), narration: compress(s.text, 30), priority: 0.5, visual: { kind: 'bullets', eyebrow: 'Key point', heading: '', items: [shortPhrase(s.text, 24)], cues: [0] } })
  }

  const sources: Source[] = corpus.sources
  const scenes: Scene[] = [
    { id: sceneId(), narration: titleNarration, priority: 1, visual: { kind: 'title', title, subtitle: subtitleFor(sources) } },
    ...body,
  ]
  const outro = closingScene(definition, sents, scores, consumed, topicWords, body, intent, contentWords(prompt))
  if (outro) scenes.push(outro)
  return { title, planner: 'rule-based', scenes, sources }
}

/** The opening line: the user's question, "What is a vaccine?", or the title. */
function openingLine(title: string, prompt: string, def: Definition | null, dataOnly = false): string {
  const p = prompt.trim().replace(/\s+/g, ' ')
  if (p && countWords(p) <= 14 && QUESTION.test(p)) return capitalize(p).replace(/[.!]?$/, '?').replace(/\?+$/, '?')
  if (def && countWords(def.term) <= 5) {
    const verb = ['are', 'was', 'were'].includes(def.link) ? def.link : 'is'
    return `What ${verb} ${def.article ? `${def.article} ` : ''}${lowerFirst(def.term)}?`
  }
  if (dataOnly) return 'Here is what the numbers show.'
  return `${ensurePeriod(title)} Here is the idea in brief.`
}

function subtitleFor(sources: Source[]): string {
  if (!sources.length) return 'A visual explainer'
  const wiki = sources.find((s) => s.label.startsWith('Wikipedia'))
  const files = sources.filter((s) => s !== wiki && s.label !== 'Your notes')
  if (files.length === 1) return `Based on ${files[0].label}${wiki ? ' and Wikipedia' : ''}`
  if (files.length > 1) return `Based on ${files.length} files${wiki ? ' and Wikipedia' : ''}`
  if (wiki) return sources.some((s) => s.label === 'Your notes') ? 'Based on your notes and Wikipedia' : 'Based on Wikipedia'
  return 'Based on your notes'
}

/**
 * "X is a [thing]" without the clause that follows ("A volcano is a vent in the crust of a planet", from "...
 * that allows lava to escape"), for when the full definition is too long to close on. Result clauses ("so
 * compact that") are never split.
 */
function definitionCore(text: string): string {
  const re = /,?\s+(?:that|which|who|whose|where|by which|in which|through which|concerned with|used (?:to|for|in)|consisting of|resulting in)\s/gi
  for (const m of text.matchAll(re)) {
    const head = text.slice(0, m.index)
    if (/\b(so|such|too)\s+\S+$/i.test(head)) continue
    const n = countWords(head)
    if (n >= 8 && n <= 18) return head
    if (n > 18) break
  }
  return ''
}

/** One closing sentence and up to three tags. Short on purpose: a few seconds, not a recap of every scene. */
function closingScene(
  def: (Definition & { sent: Sent }) | null,
  sents: Sent[],
  scores: number[],
  consumed: Set<number>,
  topicWords: string[],
  body: Scene[],
  intent: 'how' | 'why' | 'what',
  asked: string[],
): Scene | null {
  if (body.length < 2) return null
  // Kept short so the ending takes a few seconds; no summary beats a garbled one.
  let summary = ''
  let fromData = false
  const leanDef = def ? leanText(def.sent.text).replace(/[.!?]+$/, '') : ''
  const coreDef = leanDef ? definitionCore(leanDef) : ''
  // A short statement about the topic, preferring the opening section; for a "why" question, the answer.
  // For "why", the sentence that uses the question's own words ("blue" in "Why is the sky blue?") is the answer.
  const stems = (ws: string[]) => ws.map((w) => w.slice(0, 5))
  const askedStems = stems(asked)
  const rank = (x: Sent) =>
    scores[x.order] + (intent === 'why' ? 0.4 * overlap(askedStems, stems(contentWords(x.text))) : x.section === 0 ? 0.3 : 0)
  const best = [...sents]
    .filter((x) => countWords(x.text) <= 22 && !dependsOnContext(x.text) && !/\bhowever\b/i.test(x.text) && overlap(stems([...topicWords, ...asked]), stems(contentWords(x.text))) > 0)
    .filter((x) => (intent === 'why' ? WHY_ANSWER.test(x.text) : !consumed.has(x.order)))
    .sort((a, b) => rank(b) - rank(a))[0]
  const answer = best && scores[best.order] >= 0.4 ? leanText(best.text).replace(/[.!?]+$/, '') : ''
  const chart = body.find((b) => b.visual.kind === 'chart')
  // A "why" question closes on its answer; anything else on what the thing is.
  if (intent === 'why' && answer) summary = answer
  else if (def && countWords(leanDef) <= 26) summary = leanDef
  else if (coreDef) summary = coreDef
  else if (answer) summary = answer
  else if (chart && chart.visual.kind === 'chart') {
    summary = describeSeries(chart.visual.data).takeaway
    fromData = true
  } else return null
  summary = summary.replace(/[.,;:]+$/, '')
  // An unmatched quote mark reads as an error on screen.
  if ((summary.match(/["“”]/g) ?? []).length % 2) summary = summary.replace(/["“”]/g, '')
  // Tags: frequent real words, shown as they are written in the text.
  const text = sents.map((s) => s.text).join(' ')
  const surface = new Map<string, string>()
  for (const w of text.match(/[A-Za-z][A-Za-z'-]{4,}/g) ?? []) if (!surface.has(w.toLowerCase())) surface.set(w.toLowerCase(), w)
  const tags = topKeywords([text], 14)
    .filter((w) => w.length >= 5 && !topicWords.some((t) => w.startsWith(t.slice(0, 5))) && !STOPWORDS.has(w) && !GENERIC_TAG.test(w))
    .map((w) => surface.get(w) ?? w)
    .filter((w) => !/^[A-Z]{2,}s?$/.test(w))
    .slice(0, 3)
    .map((w) => (/^[a-z]/.test(w) ? capitalize(w) : w))
  return {
    id: sceneId(),
    // A takeaway from the data stands on its own: "In short, Revenue rose..." would capitalize a column name mid sentence.
    narration: ensurePeriod(fromData ? summary : `In short, ${midSentence(summary, sents)}`),
    priority: 1,
    visual: { kind: 'outro', summary: capitalize(summary), tags },
  }
}
