import type { DataSeries } from '../model/storyboard'
import { formatValue, pctChange, round } from '../input/numbers'

function lower(s: string): string {
  return /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+[A-Z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s
}

/** One or two spoken sentences that state what the chart shows, using the real numbers. */
export function describeSeries(d: DataSeries): { narration: string; highlight: number | null; takeaway: string } {
  const s0 = d.series[0]
  const v = s0.values
  const c = d.categories
  const fmt = (x: number) => formatValue(x, d.unit)
  const subject = lower(d.series.length === 1 ? (s0.name !== 'Value' ? s0.name : d.title) : d.title)
  const maxI = v.indexOf(Math.max(...v))

  if (d.chart === 'line') {
    const first = v[0]
    const last = v[v.length - 1]
    const change = pctChange(first, last)
    if (d.series.length > 1) {
      const ends = d.series.map((s) => ({ name: s.name, last: s.values[s.values.length - 1] })).sort((a, b) => b.last - a.last)
      const lead = ends[0]
      const second = ends[1]
      return {
        narration: `By ${c[c.length - 1]}, ${lower(lead.name)} leads at ${fmt(lead.last)}, ahead of ${lower(second.name)} at ${fmt(second.last)}.`,
        highlight: null,
        takeaway: `${capitalizeFirst(lead.name)} leads by ${c[c.length - 1]}`,
      }
    }
    const dir = last > first ? 'rose' : last < first ? 'fell' : 'held steady'
    let line =
      dir === 'held steady'
        ? `Between ${c[0]} and ${c[c.length - 1]}, ${subject} held steady at about ${fmt(first)}.`
        : `${capitalizeFirst(subject)} ${dir} from ${fmt(first)} in ${c[0]} to ${fmt(last)} in ${c[c.length - 1]}`
    if (dir !== 'held steady') {
      if (change !== null && Math.abs(change) >= 1 && d.unit.suffix !== '%') {
        line += `, ${dir === 'rose' ? 'an increase' : 'a drop'} of ${Math.round(Math.abs(change))}%.`
      } else if (d.unit.suffix === '%') {
        line += `, a change of ${round(Math.abs(last - first), 1)} points.`
      } else line += '.'
    }
    if (maxI !== v.length - 1 && maxI !== 0) line += ` It peaked at ${fmt(v[maxI])} in ${c[maxI]}.`
    const takeaway =
      dir === 'held steady'
        ? `${capitalizeFirst(subject)} held steady since ${c[0]}`
        : `${capitalizeFirst(subject)} ${dir} from ${fmt(first)} to ${fmt(last)}`
    return { narration: line, highlight: maxI, takeaway }
  }

  if (d.chart === 'pie') {
    const total = v.reduce((a, b) => a + b, 0) || 1
    const share = (x: number) => (d.unit.suffix === '%' && Math.abs(total - 100) < 5 ? x : (x / total) * 100)
    const order = v.map((_, i) => i).sort((a, b) => v[b] - v[a])
    const [a, b] = order
    let line = `The largest share is ${lower(c[a])}, at ${round(share(v[a]), 1)}%`
    line += b !== undefined ? `, followed by ${lower(c[b])} at ${round(share(v[b]), 1)}%.` : '.'
    return { narration: line, highlight: a, takeaway: `${c[a]}: the largest share at ${round(share(v[a]), 1)}%` }
  }

  // Bar
  if (d.series.length > 1) {
    const totals = d.series.map((s) => ({ name: s.name, sum: s.values.reduce((x, y) => x + y, 0) })).sort((x, y) => y.sum - x.sum)
    return {
      narration: `Across ${c.length === 2 ? 'both' : `all ${c.length}`} groups, ${lower(totals[0].name)} comes out ahead of ${lower(totals[1].name)}. The biggest single value is ${c[maxI]} at ${fmt(v[maxI])}.`,
      highlight: null,
      takeaway: `${capitalizeFirst(totals[0].name)} comes out ahead`,
    }
  }
  const order = v.map((_, i) => i).sort((x, y) => v[y] - v[x])
  const top = order[0]
  const second = order[1]
  const bottom = order[order.length - 1]
  let line = `${c[top]} leads with ${fmt(v[top])}`
  if (second !== undefined) line += `, followed by ${c[second]} at ${fmt(v[second])}`
  line += '.'
  if (order.length >= 3) line += ` ${c[bottom]} comes last at ${fmt(v[bottom])}.`
  return { narration: line, highlight: top, takeaway: `${c[top]} leads at ${fmt(v[top])}` }
}

function capitalizeFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}
