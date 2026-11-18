import type { Unit } from '../model/storyboard'
import { NO_UNIT } from '../model/storyboard'

const SCALE: Record<string, number> = {
  k: 1e3, thousand: 1e3,
  m: 1e6, mn: 1e6, mm: 1e6, million: 1e6,
  b: 1e9, bn: 1e9, billion: 1e9,
  t: 1e12, tn: 1e12, trillion: 1e12,
}

export interface ParsedCell {
  value: number
  unit: Unit
  decimals: number
}

/** Parses a table cell such as "$4.2M", "12%", "(3,400)", "1.5k", "-7". Returns null for text. */
export function parseCell(input: string): ParsedCell | null {
  let s = input.trim()
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim() }
  if (/^[-−–]/.test(s)) { negative = true; s = s.slice(1).trim() }
  let prefix = ''
  const cur = s.match(/^([$€£¥])\s*/)
  if (cur) { prefix = cur[1]; s = s.slice(cur[0].length) }
  let suffix = ''
  if (/%$/.test(s)) { suffix = '%'; s = s.slice(0, -1).trim() }
  const m = s.match(/^(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(k|m|mn|mm|b|bn|t|tn|thousand|million|billion|trillion)?$/i)
  if (!m) return null
  const decimals = m[2] ? m[2].length - 1 : 0
  let value = Number(m[1].replace(/,/g, '') + (m[2] ?? ''))
  if (m[3]) value *= SCALE[m[3].toLowerCase()]
  if (!Number.isFinite(value)) return null
  return { value: negative ? -value : value, unit: { prefix, suffix, word: '' }, decimals }
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/** 1284 -> "1,284", 12900 -> "12.9K", 4200000 -> "4.2M". */
export function compactNumber(value: number, maxDecimals = 1): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1e12) return sign + trimZeros((abs / 1e12).toFixed(maxDecimals)) + 'T'
  if (abs >= 1e9) return sign + trimZeros((abs / 1e9).toFixed(maxDecimals)) + 'B'
  if (abs >= 1e6) return sign + trimZeros((abs / 1e6).toFixed(maxDecimals)) + 'M'
  if (abs >= 1e4) return sign + trimZeros((abs / 1e3).toFixed(maxDecimals)) + 'K'
  return sign + abs.toLocaleString('en-US', { maximumFractionDigits: Math.max(maxDecimals, 0) })
}

/** Fixed decimals so a counting number does not jitter in width. Large values compact. */
export function fixedNumber(value: number, decimals: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e4) return compactNumber(value, Math.max(1, decimals))
  const sign = value < 0 ? '−' : ''
  return sign + abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatValue(value: number, unit: Unit = NO_UNIT, decimals?: number): string {
  const body = decimals === undefined ? compactNumber(value, 1) : fixedNumber(value, decimals)
  const neg = body.startsWith('−')
  const core = neg ? body.slice(1) : body
  return (neg ? '−' : '') + unit.prefix + core + unit.suffix + (unit.word ? ' ' + unit.word : '')
}

/** Clean axis ticks: 0, 250, 500, 750... */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min)
  const hi = max <= lo ? lo + 1 : max
  const span = hi - lo
  const rough = span / count
  const pow = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow
  const start = Math.floor(lo / step) * step
  const ticks: number[] = []
  for (let v = start; v <= hi + step * 0.999; v += step) ticks.push(Number(v.toFixed(10)))
  if (ticks[ticks.length - 1] < hi) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

export function pctChange(from: number, to: number): number | null {
  if (from === 0) return null
  return ((to - from) / Math.abs(from)) * 100
}

export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}
