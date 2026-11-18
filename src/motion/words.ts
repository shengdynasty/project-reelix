// Word level timing for kinetic captions. Kokoro gives no timestamps, so each word gets a share of the clip
// proportional to its spoken syllables, then sentence and comma boundaries snap to pauses found in the audio.

export interface WordTiming {
  text: string
  /** ms relative to the start of the narration clip. */
  start: number
  end: number
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function below1000(n: number): string[] {
  const out: string[] = []
  if (n >= 100) { out.push(ONES[Math.floor(n / 100)], 'hundred'); n %= 100 }
  if (n >= 20) { out.push(TENS[Math.floor(n / 10)]); n %= 10; if (n) out.push(ONES[n]) }
  else if (n > 0 || !out.length) out.push(ONES[n])
  return out
}

export function numberWords(n: number): string[] {
  if (!Number.isFinite(n)) return ['number']
  if (n < 0) return ['minus', ...numberWords(-n)]
  const int = Math.floor(n)
  const frac = String(n).split('.')[1]
  const out: string[] = []
  // Years read as pairs: 2019 -> twenty nineteen.
  if (int >= 1100 && int <= 2099 && !frac && int % 100 !== 0 && int % 1000 >= 10) {
    out.push(...below1000(Math.floor(int / 100)), ...below1000(int % 100))
  } else {
    const scales: [number, string][] = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]
    let rest = int
    for (const [v, w] of scales) if (rest >= v) { out.push(...below1000(Math.floor(rest / v)), w); rest %= v }
    if (rest || !out.length) out.push(...below1000(rest))
  }
  if (frac) out.push('point', ...frac.split('').map((d) => ONES[Number(d)]))
  return out
}

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

/** Spoken length of a displayed token, in syllables. "$131,700" is a dozen syllables, not one. */
export function spokenSyllables(token: string): number {
  const m = token.match(/([$€£¥])?(\d[\d,]*(?:\.\d+)?)\s*([kKmMbB]\b)?(%|°[CF])?/)
  if (!m) return token.split(/[-–—/]/).reduce((a, part) => a + syllables(part), 0) || 1
  const value = Number(m[2].replace(/,/g, ''))
  let count = numberWords(value).reduce((a, w) => a + syllables(w), 0)
  if (m[1]) count += 2
  if (m[3]) count += 2
  if (m[4]) count += m[4] === '%' ? 2 : 4
  const rest = token.replace(m[0], '')
  return count + (rest ? syllables(rest) : 0)
}

function pauseWeight(token: string): number {
  if (/[.!?]["”')]*$/.test(token)) return 2.4
  if (/[;:—–]["”')]*$/.test(token)) return 1.6
  if (/,["”')]*$/.test(token)) return 1.1
  return 0
}

interface Pause { start: number; end: number }

/** Silent stretches of at least 90 ms, from a 10 ms RMS envelope. */
function findPauses(samples: Float32Array, rate: number): { pauses: Pause[]; onset: number; offset: number } {
  const hop = Math.round(rate * 0.01)
  const env: number[] = []
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let s = 0
    for (let j = i; j < i + hop; j++) s += samples[j] * samples[j]
    env.push(Math.sqrt(s / hop))
  }
  const sorted = [...env].sort((a, b) => a - b)
  const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0
  const thr = Math.max(0.006, p90 * 0.06)
  const voiced = env.map((e) => e > thr)
  const onsetIdx = voiced.indexOf(true)
  const offsetIdx = voiced.lastIndexOf(true)
  const pauses: Pause[] = []
  let runStart = -1
  for (let i = Math.max(0, onsetIdx); i <= offsetIdx; i++) {
    if (!voiced[i]) { if (runStart < 0) runStart = i }
    else if (runStart >= 0) {
      if (i - runStart >= 9) pauses.push({ start: runStart * 10, end: i * 10 })
      runStart = -1
    }
  }
  return { pauses, onset: Math.max(0, onsetIdx) * 10, offset: Math.max(onsetIdx, offsetIdx + 1) * 10 }
}

export function wordTimings(text: string, durationMs: number, audio?: { samples: Float32Array; sampleRate: number }): WordTiming[] {
  const tokens = text.split(/\s+/).filter(Boolean)
  if (!tokens.length) return []
  const sy = tokens.map(spokenSyllables)
  const pw = tokens.map(pauseWeight)
  let onset = 0
  let offset = durationMs
  let pauses: Pause[] = []
  if (audio && audio.samples.length) {
    const found = findPauses(audio.samples, audio.sampleRate)
    onset = found.onset
    offset = Math.min(durationMs, found.offset)
    pauses = found.pauses
  }
  // Cumulative weight positions: word i spans [w0, w0 + sy], then its trailing pause.
  const starts: number[] = []
  const ends: number[] = []
  let acc = 0
  tokens.forEach((_, i) => {
    starts.push(acc)
    acc += sy[i]
    ends.push(acc)
    if (i < tokens.length - 1) acc += pw[i]
  })
  const total = acc || 1
  // Anchors (weight -> ms), starting with a linear map, then snapped to detected pauses.
  const anchors: [number, number][] = [[0, onset], [total, offset]]
  const toMs = (w: number) => {
    for (let k = 0; k < anchors.length - 1; k++) {
      const [w0, t0] = anchors[k]
      const [w1, t1] = anchors[k + 1]
      if (w <= w1) return t0 + ((w - w0) / (w1 - w0 || 1)) * (t1 - t0)
    }
    return anchors[anchors.length - 1][1]
  }
  if (pauses.length) {
    const used = new Set<number>()
    const boundaries = tokens.map((_, i) => i).filter((i) => i < tokens.length - 1 && pw[i] > 0)
    for (const i of boundaries) {
      const estEnd = toMs(ends[i])
      const window = Math.max(350, (offset - onset) * 0.12)
      let best = -1
      let bestDist = Infinity
      pauses.forEach((p, k) => {
        if (used.has(k)) return
        const d = Math.abs(p.start - estEnd)
        if (d < window && d < bestDist) { best = k; bestDist = d }
      })
      if (best < 0) continue
      used.add(best)
      const p = pauses[best]
      const next = starts[i + 1]
      // Keep anchors ordered.
      const prev = anchors.filter((a) => a[0] < ends[i])
      const after = anchors.filter((a) => a[0] > next)
      if (prev.length && prev[prev.length - 1][1] >= p.start) continue
      if (after.length && after[0][1] <= p.end) continue
      anchors.splice(prev.length, anchors.length - prev.length - after.length, [ends[i], p.start], [next, p.end])
    }
  }
  return tokens.map((text, i) => ({ text, start: toMs(starts[i]), end: toMs(ends[i]) }))
}
