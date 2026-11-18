import type { DataSeries, Unit } from '../model/storyboard'
import { contentWords, STOPWORDS, capitalize } from './parseText'

export interface Stat {
  value: number
  decimals: number
  unit: Unit
  raw: string
  start: number
  end: number
  isYear: boolean
  /** A year mentioned in the same clause, if any. */
  year: number | null
  /** One end of a range ("1,000–2,000", "between 5 and 10"), which a single big number would misstate. */
  inRange: boolean
}

const UNIT_WORDS =
  'hours|hour|minutes|minute|seconds|days|day|weeks|week|months|month|years|year|people|persons|students|users|customers|employees|members|visitors|patients|cases|deaths|homes|households|countries|cities|species|trees|tons|tonnes|kilograms|kg|grams|pounds|lbs|kilometers|km|miles|meters|feet|liters|litres|gallons|calories|kcal|gw|mw|kw|kwh|twh|gwh|watts|degrees|points|votes|times|steps|books|cars|bikes|orders|sales|units|downloads|views|followers|likes|stars|servings|cups|hrs|mins'

const SCALE_WORDS: Record<string, number> = {
  thousand: 1e3, k: 1e3,
  million: 1e6, m: 1e6, mn: 1e6,
  billion: 1e9, b: 1e9, bn: 1e9,
  trillion: 1e12, t: 1e12, tn: 1e12,
}

const NUM_RE = new RegExp(
  String.raw`(?<![\w.])(?<![A-Za-z]-)(?<cur>[$€£¥])?\s?(?<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)` +
    String.raw`(?:\s?(?<scale>thousand|million|billion|trillion|bn|mn|[kKmMbBtT])(?![a-zA-Z]))?` +
    String.raw`(?:\s?(?<suffix>%|percent\b|per cent\b|percentage points?\b|°\s?[CF]\b|degrees? (?:celsius|fahrenheit)\b|x\b|×))?` +
    String.raw`(?:\s(?<word>${UNIT_WORDS})\b)?`,
  'gi',
)

function normSuffix(s: string | undefined): string {
  if (!s) return ''
  const l = s.toLowerCase().replace(/\s+/g, ' ')
  if (l === '%' || l.startsWith('percent') || l === 'per cent') return l.startsWith('percentage point') ? ' pts' : '%'
  if (l.includes('c')) return l.includes('f') ? '°F' : '°C'
  if (l.includes('f')) return '°F'
  if (l === 'x' || l === '×') return '×'
  return ''
}

const RANGE_FROM = /\b(?:var(?:y|ies|ied|ying)|rang(?:e|es|ed|ing)|span(?:s|ned|ning)?|anywhere)\s+(?:\w+\s+)?from\s+[$€£¥]?$/i

/** Finds numbers with their units in one sentence. Years are flagged, not dropped. */
export function findStats(sentence: string): Stat[] {
  const stats: Stat[] = []
  for (const m of sentence.matchAll(NUM_RE)) {
    const g = m.groups ?? {}
    const numText = g.num
    if (!numText) continue
    const after = sentence.slice((m.index ?? 0) + m[0].length)
    // Skip ordinals (1st, 2nd), decades (1990s) and list markers.
    if (/^(st|nd|rd|th|s)\b/i.test(after)) continue
    let value = Number(numText.replace(/,/g, ''))
    const decimals = numText.includes('.') ? numText.split('.')[1].length : 0
    const scaleKey = g.scale?.toLowerCase()
    // A lone capital letter after a number only counts as a scale with a currency sign ("$5M", not "5 M").
    const scale = scaleKey && (g.cur || scaleKey.length > 1 || /\d[kKmMbB]$/.test(m[0].trim())) ? SCALE_WORDS[scaleKey] : undefined
    if (scaleKey && !scale && scaleKey.length === 1) {
      // Not a scale; treat as plain number.
    } else if (scale) value *= scale
    const suffix = normSuffix(g.suffix)
    const word = g.word ? g.word.toLowerCase() : ''
    const plain = !g.cur && !suffix && !scale && !word && !numText.includes(',') && decimals === 0
    const before = sentence.slice(Math.max(0, (m.index ?? 0) - 14), m.index ?? 0)
    // 1800 to 2100 reads as a year anywhere; earlier years need a date word ("in 1721", "by 1066").
    const isYear =
      plain &&
      ((value >= 1800 && value <= 2100) ||
        (value >= 1000 && value < 1800 && /\b(in|by|since|from|until|till|to|around|circa|c\.|during|of|year|early|late|mid|before|after|between|and)\s*$/i.test(before)))
    const head = sentence.slice(0, m.index ?? 0)
    const dashAfter = /^\s?[–—-]\s?[$€£¥]?\d/.test(after)
    const dashBefore = /\d\s?[–—-]\s?[$€£¥]?$/.test(head)
    const between =
      /\bbetween\s+[$€£¥]?$/i.test(before) ||
      /\bbetween\s+[$€£¥]?[\d.,]+\s?\S*\s+and\s+[$€£¥]?$/i.test(head.slice(-40)) ||
      // "can vary from 0.1% to 8%" is a spread of values, not a change over time.
      RANGE_FROM.test(head.slice(-40)) ||
      new RegExp(`${RANGE_FROM.source.slice(0, -1)}[\\d.,]+\\s?\\S*\\s+to\\s+[$€£¥]?$`, 'i').test(head.slice(-70))
    const prev = stats[stats.length - 1]
    stats.push({
      value,
      decimals: scale && decimals === 0 && value >= 1e4 ? 1 : decimals,
      unit: { prefix: g.cur ?? '', suffix, word: word === 'times' ? '' : word },
      raw: m[0].trim(),
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
      // The far end of "1000–2000" is a year only when the near end is one too.
      isYear: dashBefore && prev ? isYear && prev.isYear : isYear,
      year: null,
      inRange: dashAfter || dashBefore || between,
    })
  }
  // Attach the nearest year in the same clause to each non year number.
  const clauses = clauseRanges(sentence)
  for (const s of stats) {
    if (s.isYear) continue
    const c = clauses.find((r) => s.start >= r[0] && s.start < r[1])
    const years = stats.filter((y) => y.isYear && c && y.start >= c[0] && y.start < c[1])
    if (years.length) {
      years.sort((a, b) => Math.abs(a.start - s.start) - Math.abs(b.start - s.start))
      s.year = years[0].value
    }
  }
  // "In 2023, 45% of teens..." puts the year in its own clause. With exactly one year, it covers the sentence.
  const allYears = stats.filter((y) => y.isYear)
  if (allYears.length === 1) for (const s of stats) if (!s.isYear && s.year === null) s.year = allYears[0].value
  return stats
}

function clauseRanges(sentence: string): [number, number][] {
  const out: [number, number][] = []
  let start = 0
  const re = /[,;:]\s+|\s+(?:while|whereas|but|compared (?:with|to)|versus|vs\.?|and then)\s+/gi
  for (const m of sentence.matchAll(re)) {
    out.push([start, m.index ?? 0])
    start = (m.index ?? 0) + m[0].length
  }
  out.push([start, sentence.length])
  return out
}

export function salientStats(sentence: string): Stat[] {
  return findStats(sentence).filter((s) => !s.isYear)
}

/** A number worth a big number scene: it has a unit, or it is large enough to matter on its own. */
export function meaningfulStats(sentence: string): Stat[] {
  return salientStats(sentence).filter(
    (s) => !s.inRange && (s.unit.prefix || s.unit.suffix || s.unit.word || Math.abs(s.value) >= 1000) && !(s.unit.suffix === '%' && (s.value === 100 || s.value === 0)),
  )
}

export interface ChangeStat {
  from: Stat
  to: Stat
}

/** "grew from $2M to $5M", "rose from 12% in 2010 to 31% in 2020". */
export function findChange(sentence: string): ChangeStat | null {
  const stats = salientStats(sentence)
  for (let i = 0; i + 1 < stats.length; i++) {
    const a = stats[i]
    const b = stats[i + 1]
    if (a.inRange || b.inRange) continue
    const before = sentence.slice(Math.max(0, a.start - 12), a.start).toLowerCase()
    const between = sentence.slice(a.end, b.start).toLowerCase()
    if (/\bfrom\s*$/.test(before) && /\bto\b/.test(between) && between.split(/\s+/).length <= 8) {
      const unit = b.unit.prefix || b.unit.suffix || b.unit.word ? b.unit : a.unit
      return { from: { ...a, unit }, to: { ...b, unit } }
    }
  }
  return null
}

export interface CompareStat {
  left: { label: string; stat: Stat }
  right: { label: string; stat: Stat }
}

const VERBISH =
  /^(is|are|was|were|be|been|has|have|had|earn|earns|earned|spend|spends|spent|make|makes|made|get|gets|got|grew|grow|grows|rose|rise|rises|fell|fall|falls|drop|drops|dropped|reach|reached|reaches|hit|hits|cost|costs|use|uses|used|take|takes|took|account|accounts|accounted|represent|represents|sleep|sleeps|average|averages|averaged|need|needs|scored|score|scores|own|owns|produce|produces|produced|hold|holds|held|contain|contains|cover|covers|covered)$/i

function subjectOf(clause: string): string {
  const ws = clause
    .replace(/^[\s,;:]*(?:while|whereas|but|and|compared (?:with|to)|versus|vs\.?|only|just|about|around|nearly|almost|roughly|over)\s+/i, '')
    .split(/\s+/)
  const out: string[] = []
  for (const w of ws) {
    const clean = w.replace(/[^A-Za-z'’-]/g, '')
    if (!clean || /\d/.test(w) || VERBISH.test(clean) || (out.length > 0 && STOPWORDS.has(clean.toLowerCase()))) break
    if (STOPWORDS.has(clean.toLowerCase()) && out.length === 0) continue
    out.push(clean)
    if (out.length >= 3) break
  }
  return out.join(' ')
}

const PREP_SKIP = /^(average|total|all|general|fact|addition|particular|comparison|contrast|turn|short|part)$/i

function prepContext(text: string): string {
  for (const m of text.matchAll(/\b(?:on|in|for|during|among|at|from)\s+([A-Za-z][\w’'-]*(?:\s+[A-Za-z][\w’'-]*){0,2})/gi)) {
    const ws: string[] = []
    for (const w of m[1].split(/\s+/)) {
      if (STOPWORDS.has(w.toLowerCase()) && !/^(the|a|an)$/i.test(w)) break
      if (/^(the|a|an)$/i.test(w)) continue
      ws.push(w)
    }
    if (ws.length && !PREP_SKIP.test(ws[0])) return capitalize(ws.join(' '))
  }
  return ''
}

/** "Men earn $50K while women earn $42K", "$2.10 per watt in 2010 compared with $0.30 in 2020". */
export function findCompare(sentence: string): CompareStat | null {
  const stats = salientStats(sentence)
  if (stats.length !== 2) return null
  const [a, b] = stats
  const sameUnit = a.unit.prefix === b.unit.prefix && a.unit.suffix === b.unit.suffix
  if (!sameUnit) return null
  const between = sentence.slice(a.end, b.start)
  const m = between.match(/(?:,\s*)?\b(while|whereas|but|compared (?:with|to)|versus|vs\.?|than)\b/i)
  if (!m) return null
  let leftLabel = a.year && b.year && a.year !== b.year ? String(a.year) : ''
  let rightLabel = leftLabel ? String(b.year) : ''
  if (!leftLabel) {
    // "4.6 hours on school days, compared with 7.3 hours on weekends"
    const leftCtx = prepContext(sentence.slice(a.end, a.end + (m.index ?? 0)))
    const rightCtx = prepContext(sentence.slice(b.end).split(/[,;.]/)[0])
    if (leftCtx && rightCtx) { leftLabel = leftCtx; rightLabel = rightCtx }
  }
  if (!leftLabel || !rightLabel) {
    leftLabel = subjectOf(sentence.slice(0, a.start).split(/[,;]/).pop() ?? '')
    rightLabel = subjectOf(between.slice((m.index ?? 0) + m[0].length))
  }
  if (!leftLabel || !rightLabel || leftLabel.toLowerCase() === rightLabel.toLowerCase()) return null
  const unit = a.unit.word || !b.unit.word ? a.unit : b.unit
  return {
    left: { label: capitalize(leftLabel), stat: { ...a, unit } },
    right: { label: capitalize(rightLabel), stat: { ...b, unit } },
  }
}

/**
 * Builds charts from numbers in prose:
 * - three or more values with the same unit, each tied to a different year, become a line chart
 * - three or more labelled values in one sentence ("solar 41%, wind 33%, hydro 26%") become a bar or pie chart
 */
export function seriesFromText(
  sentences: { text: string; order: number; para: number }[],
): { data: DataSeries; orders: number[] }[] {
  const out: { data: DataSeries; orders: number[] }[] = []

  // Year series, kept within one paragraph so unrelated numbers never merge into one line.
  const byUnit = new Map<string, { year: number; stat: Stat; order: number; text: string }[]>()
  for (const s of sentences) {
    for (const st of salientStats(s.text)) {
      if (st.year === null) continue
      const key = `${s.para}|${st.unit.prefix}|${st.unit.suffix}|${st.unit.word}`
      const list = byUnit.get(key) ?? []
      list.push({ year: st.year, stat: st, order: s.order, text: s.text })
      byUnit.set(key, list)
    }
  }
  for (const list of byUnit.values()) {
    const byYear = new Map<number, (typeof list)[number]>()
    for (const item of list) if (!byYear.has(item.year)) byYear.set(item.year, item)
    if (byYear.size < 3) continue
    const pts = [...byYear.values()].sort((a, b) => a.year - b.year)
    const topic = contentWords(pts.map((p) => p.text).join(' '))
    const name = topic.length ? capitalize(topic[0]) : 'Value'
    out.push({
      data: {
        title: `${name} over time`,
        xLabel: 'Year',
        categories: pts.map((p) => String(p.year)),
        series: [{ name, values: pts.map((p) => p.stat.value) }],
        unit: pts[0].stat.unit,
        chart: 'line',
        temporal: true,
      },
      orders: [...new Set(pts.map((p) => p.order))],
    })
  }

  // Labelled breakdowns inside one sentence.
  for (const s of sentences) {
    const stats = salientStats(s.text)
    if (stats.length < 3) continue
    const unitKey = (st: Stat) => `${st.unit.prefix}|${st.unit.suffix}|${st.unit.word}`
    if (new Set(stats.map(unitKey)).size !== 1) continue
    // Plain numbers ("1.4 billion light-years ... 30 and 35 times") are not a breakdown.
    if (!stats[0].unit.prefix && !stats[0].unit.suffix && !stats[0].unit.word) continue
    const frags = s.text.split(/,\s*|;\s*|\s+and\s+|:\s*/)
    const labels: string[] = []
    const values: number[] = []
    for (const f of frags) {
      const fs = salientStats(f)
      if (fs.length !== 1) continue
      const label = f
        .replace(fs[0].raw, ' ')
        .replace(/\b(at|with|about|around|nearly|roughly|almost|over|under|just|only|of|is|are|was|were|makes up|make up|accounts for|account for|account|accounts)\b/gi, ' ')
        .replace(/[^A-Za-z'’\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w && !STOPWORDS.has(w.toLowerCase()))
        .slice(-3)
        .join(' ')
      if (!label) continue
      labels.push(capitalize(label))
      values.push(fs[0].value)
    }
    if (labels.length < 3 || new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) continue
    const sum = values.reduce((a, b) => a + b, 0)
    const isShare = stats[0].unit.suffix === '%' && sum > 90 && sum < 110
    const topic = contentWords(s.text).find((w) => !labels.some((l) => l.toLowerCase().includes(w)))
    out.push({
      data: {
        title: topic ? `${capitalize(topic)} breakdown` : 'Breakdown',
        xLabel: '',
        categories: labels,
        series: [{ name: topic ? capitalize(topic) : 'Value', values }],
        unit: stats[0].unit,
        chart: isShare ? 'pie' : 'bar',
        temporal: false,
      },
      orders: [s.order],
    })
  }
  return out
}
