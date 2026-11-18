import Papa from 'papaparse'
import type { ChartKind, DataSeries, Unit } from '../model/storyboard'
import { parseCell } from './numbers'
import { capitalize } from './parseText'

export type TableResult = { ok: true; data: DataSeries } | { ok: false; error: string }

const MONTHS = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(\s+'?\d{2,4})?$/i
const QUARTER = /^(q[1-4]|h[12])(\s*'?\d{2,4})?$|^\d{4}\s*[-/ ]?\s*(q[1-4]|h[12])$/i
const YEAR = /^(1[89]|20|21)\d{2}$/
const ISO_DATE = /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$/
const WEEKDAY = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i

function isTemporal(labels: string[]): boolean {
  if (labels.length < 3) return false
  const tests = [YEAR, MONTHS, QUARTER, ISO_DATE, WEEKDAY]
  if (tests.some((re) => labels.every((l) => re.test(l.trim())))) return true
  const nums = labels.map((l) => Number(l))
  return nums.every((n) => Number.isFinite(n)) && nums.every((n, i) => i === 0 || n > nums[i - 1])
}

function unitFromHeader(header: string): Partial<Unit> {
  const h = header.toLowerCase()
  const u: Partial<Unit> = {}
  if (/%|percent|share|rate\b/.test(h)) u.suffix = '%'
  if (/\$|usd|dollar/.test(h)) u.prefix = '$'
  else if (/€|eur\b|euro/.test(h)) u.prefix = '€'
  else if (/£|gbp|pound sterling/.test(h)) u.prefix = '£'
  return u
}

/** "Revenue ($)" -> "Revenue". The unit is kept separately. */
function cleanHeader(h: string): string {
  return h.replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

/** "Hours per week" -> "hours", "Rainfall (mm)" -> "mm", "Students (count)" -> "students". */
function unitWordFromHeader(h: string): string {
  const paren = h.match(/[([]\s*([A-Za-z°µ/²³]{1,8})\s*[)\]]/)
  if (paren && !/^(count|number|total|n|no|avg|average)$/i.test(paren[1])) return paren[1]
  const m = cleanHeader(h).toLowerCase().match(/^(hours|minutes|days|weeks|months|years|people|students|users|customers|members|visitors|tons|tonnes|kg|km|miles|liters|litres|gallons|calories|points|votes|downloads|views|orders|units|sales)\b/)
  return m ? m[1] : ''
}

function stripMarkdown(raw: string): string {
  return raw
    .split('\n')
    .filter((l) => !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l))
    .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, ''))
    .join('\n')
}

/**
 * Parses pasted CSV, TSV, semicolon, pipe or markdown tables.
 * First column = labels (categories); every mostly numeric column after it = one series.
 */
export function parseTable(raw: string, name = ''): TableResult {
  const text = stripMarkdown(raw.trim())
  if (!text) return { ok: false, error: 'This table is empty. Paste rows like "Year, Sales".' }
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy', delimitersToGuess: [',', '\t', '|', ';'] })
  return parseRows(parsed.data, name)
}

/** Builds a chart series from a grid of cells (CSV rows, a spreadsheet sheet, a table in a document). */
export function parseRows(grid: string[][], name = ''): TableResult {
  let rows = grid.map((r) => r.map((c) => (c ?? '').toString().trim())).filter((r) => r.some((c) => c))
  if (rows.length < 2 && !(rows.length === 1 && rows[0].length > 2)) {
    return { ok: false, error: 'Add at least two rows of data, for example "2021, 40" and "2022, 55".' }
  }
  const width = Math.max(...rows.map((r) => r.length))
  rows = rows.map((r) => [...r, ...Array(width - r.length).fill('')])

  const isNum = (c: string) => parseCell(c) !== null
  const first = rows[0]
  const hasHeader = first.slice(1).some((c) => c && !isNum(c)) || (!isNum(first[0]) && first.slice(1).every((c) => !isNum(c)))
  const headers = hasHeader ? first : first.map((_, i) => (i === 0 ? 'Label' : width > 2 ? `Series ${i}` : 'Value'))
  const body = hasHeader ? rows.slice(1) : rows
  if (body.length < 1) return { ok: false, error: 'Found a header row but no data rows under it.' }

  // Label column: the first column, unless every column is numeric and not ordered (then use row numbers).
  const numericCols: number[] = []
  for (let c = 0; c < width; c++) {
    const filled = body.filter((r) => r[c] !== '')
    const numeric = filled.filter((r) => isNum(r[c])).length
    if (filled.length && numeric / filled.length >= 0.8) numericCols.push(c)
  }
  let labelCol = 0
  let categories = body.map((r) => r[0])
  if (numericCols.includes(0)) {
    const looksLikeLabels = isTemporal(categories) || numericCols.length > 1
    if (!looksLikeLabels) {
      labelCol = -1
      categories = body.map((_, i) => String(i + 1))
    }
  }
  const valueCols = numericCols.filter((c) => c !== labelCol)
  if (!valueCols.length) {
    return { ok: false, error: 'No number columns found. Put labels in the first column and numbers after it.' }
  }

  const series = valueCols.slice(0, 5).map((c) => ({
    name: capitalize(cleanHeader(headers[c]) || 'Value'),
    values: body.map((r) => parseCell(r[c])?.value ?? 0),
  }))

  // Unit: from the first value column's header and cells.
  const firstCells = body.map((r) => parseCell(r[valueCols[0]])).filter((p) => p !== null)
  const fromHeader = unitFromHeader(headers[valueCols[0]] ?? '')
  const unit: Unit = {
    prefix: firstCells.find((p) => p.unit.prefix)?.unit.prefix ?? fromHeader.prefix ?? '',
    suffix: firstCells.find((p) => p.unit.suffix)?.unit.suffix ?? fromHeader.suffix ?? '',
    word: '',
  }
  if (!unit.prefix && !unit.suffix) unit.word = unitWordFromHeader(headers[valueCols[0]] ?? '')

  const temporal = isTemporal(categories)
  const values0 = series[0].values
  const sum = values0.reduce((a, b) => a + b, 0)
  const shareHeader = /share|percent|%|portion|breakdown|split|mix/i.test(headers[valueCols[0]] ?? '') || /share|breakdown|mix|split/i.test(name)
  let chart: ChartKind = 'bar'
  if (temporal) chart = 'line'
  else if (series.length === 1 && body.length >= 2 && body.length <= 8 && values0.every((v) => v >= 0) && (shareHeader || (unit.suffix === '%' && sum > 95 && sum < 105))) chart = 'pie'

  const title = name.trim() || (series.length === 1 ? series[0].name : `${series.map((s) => s.name).join(' vs ')}`)
  return {
    ok: true,
    data: {
      title: capitalize(title),
      xLabel: labelCol >= 0 ? capitalize(cleanHeader(headers[labelCol] || '')) : '',
      categories,
      series,
      unit,
      chart,
      temporal,
    },
  }
}

/** Keeps charts readable: at most 12 bars, 60 line points, 3 pie slices plus "Other". */
export function tidySeries(d: DataSeries): DataSeries {
  if (d.chart === 'pie') {
    const vals = d.series[0].values
    const idx = vals.map((_, i) => i).sort((a, b) => vals[b] - vals[a])
    if (idx.length <= 4) {
      return { ...d, categories: idx.map((i) => d.categories[i]), series: [{ ...d.series[0], values: idx.map((i) => vals[i]) }] }
    }
    const top = idx.slice(0, 3)
    const other = idx.slice(3).reduce((a, i) => a + vals[i], 0)
    return {
      ...d,
      categories: [...top.map((i) => d.categories[i]), 'Other'],
      series: [{ ...d.series[0], values: [...top.map((i) => vals[i]), other] }],
    }
  }
  if (d.chart === 'bar' && d.categories.length > 12) {
    const vals = d.series[0].values
    const keep = vals
      .map((_, i) => i)
      .sort((a, b) => vals[b] - vals[a])
      .slice(0, 10)
      .sort((a, b) => a - b)
    return { ...d, categories: keep.map((i) => d.categories[i]), series: d.series.map((s) => ({ ...s, values: keep.map((i) => s.values[i]) })) }
  }
  if (d.chart === 'line' && d.categories.length > 60) {
    const step = Math.ceil(d.categories.length / 60)
    const keep = d.categories.map((_, i) => i).filter((i) => i % step === 0 || i === d.categories.length - 1)
    return { ...d, categories: keep.map((i) => d.categories[i]), series: d.series.map((s) => ({ ...s, values: keep.map((i) => s.values[i]) })) }
  }
  return d
}
