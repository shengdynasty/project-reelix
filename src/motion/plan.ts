import type { Scene, Storyboard } from '../model/storyboard'
import type { Timeline } from '../model/timing'
import type { WordTiming } from './words'
import { wordTimings } from './words'
import { anchorTimes } from './anchors'
import { iconFor, unitIcon } from './icons'
import { fixedNumber } from '../input/numbers'
import {
  BAR_START, BAR_STAGGER, CHART_HIGHLIGHT_MIN, COMPARE_DELTA, COMPARE_POP, STAT_COUNT_DUR, STAT_COUNT_START,
  TRANSITION_ITEM, TRANSITION_LEAD, TRANSITION_SCENE,
} from './beats'

export type ShotKind = 'intro' | 'point' | 'stat' | 'compare' | 'chart' | 'image' | 'definition' | 'timeline' | 'steps' | 'summary' | 'end'

export interface Shot {
  index: number
  scene: number
  kind: ShotKind
  /** Global ms. The camera settles on the shot around `start` and leaves around `end`. */
  start: number
  end: number
  /** World position of the shot's center. */
  x: number
  y: number
  item: number
  itemCount: number
  icon: string
  /** Length of the camera move that brings this shot in. */
  transition: number
  /** Animation origin: entrances start partway through the incoming camera move, so the shot builds as it arrives. */
  t0: number
  /** Global ms at which the narration names each item of a timeline or steps shot; empty for other kinds. */
  cues: number[]
  /** Stat shots: global ms at which the count up lands, on the spoken number when it is said; null for other kinds. */
  countEnd: number | null
}

export interface CaptionWord {
  text: string
  start: number
  end: number
  chunk: number
}

export type SfxKind = 'whoosh' | 'pop' | 'impact' | 'tick' | 'sting' | 'chime'
export interface SfxEvent {
  t: number
  kind: SfxKind
  gain: number
  pan: number
}

export interface MotionPlan {
  storyboard: Storyboard
  timeline: Timeline
  shots: Shot[]
  captions: CaptionWord[]
  sfx: SfxEvent[]
  /** Global speech windows, for ducking the music. */
  speech: { start: number; end: number }[]
  /** Word timings per scene, in global ms. */
  words: WordTiming[][]
  total: number
}

const Y_PATTERN = [0, 380, -300, 260, -420, 160, -220, 340, -120]
/** Fraction of the incoming move during which the next shot already animates. */
const ENTRANCE_EARLY = 0.42
/** A stat's count runs at least this long, and lands at least this long before the shot ends. */
const STAT_COUNT_MIN = 900
const STAT_COUNT_TAIL = 400
/** Fallback that marks a number nobody says. */
const UNSPOKEN = -1
/** Items land in order, at least this far apart, even when one of them is never named. */
const CUE_GAP = 300

/** Global time at which the narration of a scene reaches fraction `f` of its words. */
export function cueAt(words: WordTiming[], f: number, fallback: number): number {
  if (!words.length) return fallback
  const k = Math.min(words.length - 1, Math.max(0, Math.round(f * words.length)))
  return words[k].start
}

/** Global time at which a stat's number is spoken, as written ("131,700") or compact ("$131.7K"), else UNSPOKEN. */
function spokenNumberAt(words: WordTiming[], value: number, decimals: number): number {
  const forms = [...new Set([String(value), fixedNumber(value, decimals)])]
  const found = forms.map((f) => anchorTimes(words, [f], [UNSPOKEN])[0]).filter((t) => t !== UNSPOKEN)
  return found.length ? Math.min(...found) : UNSPOKEN
}

function sceneIcon(scene: Scene, title: string): string {
  const v = scene.visual
  switch (v.kind) {
    case 'title': return iconFor(`${v.title} ${title}`, 'sparkle')
    case 'bullets': return iconFor(v.items.join(' ') + ' ' + scene.narration)
    case 'stat': return unitIcon(v.unit, `${v.label} ${scene.narration}`)
    case 'compare': return unitIcon(v.unit, `${v.left.label} ${v.right.label} ${scene.narration}`)
    case 'chart': return iconFor(`${v.data.title} ${v.data.series.map((s) => s.name).join(' ')}`, v.data.chart === 'pie' ? 'chart-pie' : v.data.chart === 'line' ? 'chart-line-up' : 'chart-bar')
    case 'image': return iconFor(v.caption, 'image')
    case 'definition': return iconFor(`${v.term} ${title} ${v.meaning}`, 'book-open')
    case 'timeline': return 'hourglass'
    case 'steps': return iconFor(`${v.heading} ${v.items.join(' ')}`, v.style === 'steps' ? 'arrows-clockwise' : 'puzzle-piece')
    case 'outro': return 'lightbulb'
  }
}

export interface ClipLike {
  samples: Float32Array
  sampleRate: number
  durationMs: number
}

export function buildPlan(sb: Storyboard, tl: Timeline, clips: (ClipLike | undefined)[]): MotionPlan {
  const shots: Shot[] = []
  const words: WordTiming[][] = []
  const speech: { start: number; end: number }[] = []

  sb.scenes.forEach((scene, i) => {
    const st = tl.scenes[i]
    const clip = clips[i]
    const rel = wordTimings(scene.narration, st.speechDur, clip ? { samples: clip.samples, sampleRate: clip.sampleRate } : undefined)
    const global = rel.map((w) => ({ text: w.text, start: st.speechStart + w.start, end: st.speechStart + w.end }))
    words.push(global)
    if (!st.included) return
    if (global.length) speech.push({ start: global[0].start, end: global[global.length - 1].end })

    const v = scene.visual
    const icon = sceneIcon(scene, sb.title)
    const push = (kind: ShotKind, start: number, end: number, item = 0, itemCount = 1, shotIcon = icon) =>
      shots.push({ index: shots.length, scene: i, kind, start, end, x: 0, y: 0, item, itemCount, icon: shotIcon, transition: 0, t0: start, cues: [], countEnd: null })
    const sEnd = st.start + st.dur

    if (v.kind === 'title') push('intro', st.start, sEnd)
    else if (v.kind === 'bullets' && v.items.length > 1) {
      // One shot per point, cut on the sentence that introduces it.
      const starts = v.items.map((_, k) => (k === 0 ? st.start : cueAt(global, v.cues[k] ?? k / v.items.length, st.start + (k * st.dur) / v.items.length)))
      v.items.forEach((item, k) => push('point', starts[k], k + 1 < v.items.length ? starts[k + 1] : sEnd, k, v.items.length, iconFor(item, icon)))
    } else if (v.kind === 'bullets') push('point', st.start, sEnd)
    else if (v.kind === 'stat') push('stat', st.start, sEnd)
    else if (v.kind === 'compare') push('compare', st.start, sEnd)
    else if (v.kind === 'chart') push('chart', st.start, sEnd)
    else if (v.kind === 'image') push('image', st.start, sEnd)
    else if (v.kind === 'definition') push('definition', st.start, sEnd)
    else if (v.kind === 'timeline') push('timeline', st.start, sEnd, 0, v.events.length)
    else if (v.kind === 'steps') push('steps', st.start, sEnd, 0, v.items.length)
    else if (v.kind === 'outro') {
      // A short "in short" line, then a brief closing card.
      const lineEnd = global.length ? global[global.length - 1].end + 600 : sEnd - 1500
      if (sEnd - lineEnd >= 1200) {
        push('summary', st.start, lineEnd)
        push('end', lineEnd, sEnd, 0, 1, iconFor(sb.title, 'sparkle'))
      } else push('summary', st.start, sEnd)
    }
  })

  // Lay shots out across one large world. Points of the same scene slide sideways; new scenes travel further.
  let x = 0
  let y = 0
  let sceneOrdinal = 0
  shots.forEach((s, k) => {
    if (k > 0) {
      const sameScene = shots[k - 1].scene === s.scene
      if (!sameScene) sceneOrdinal++
      x += sameScene ? 2300 : 2900
      y = sameScene ? y : Y_PATTERN[sceneOrdinal % Y_PATTERN.length]
      s.transition = sameScene ? TRANSITION_ITEM : TRANSITION_SCENE
    }
    s.x = x
    s.y = y
    s.t0 = s.start - s.transition * ENTRANCE_EARLY
  })

  // Word-anchored cues: items land on the words that name them, and a count lands on its spoken number.
  shots.forEach((s) => {
    const v = sb.scenes[s.scene].visual
    const sceneWords = words[s.scene]
    if (v.kind === 'timeline' || v.kind === 'steps') {
      const items = v.kind === 'timeline' ? v.events.map((e) => `${e.when} ${e.label}`) : v.items
      const fallbacks = items.map((_, j) => cueAt(sceneWords, v.cues[j] ?? j / items.length, s.start))
      const cues = anchorTimes(sceneWords, items, fallbacks)
      for (let j = 1; j < cues.length; j++) cues[j] = Math.max(cues[j], cues[j - 1] + CUE_GAP)
      s.cues = cues
    } else if (v.kind === 'stat') {
      const spoken = spokenNumberAt(sceneWords, v.value, v.decimals)
      s.countEnd = spoken === UNSPOKEN ? s.t0 + STAT_COUNT_START + STAT_COUNT_DUR : Math.min(Math.max(spoken, s.t0 + STAT_COUNT_MIN), s.end - STAT_COUNT_TAIL)
    }
  })

  // Sound effects, timed to the same beats the renderer uses.
  const sfx: SfxEvent[] = []
  const add = (t: number, kind: SfxKind, gain: number, pan = 0) => t >= 0 && sfx.push({ t, kind, gain, pan })
  shots.forEach((s, k) => {
    const scene = sb.scenes[s.scene]
    const v = scene.visual
    if (k === 0 && s.kind === 'intro') add(0, 'sting', 0.9)
    if (k > 0) add(s.start - s.transition * TRANSITION_LEAD - 60, 'whoosh', s.transition === TRANSITION_SCENE ? 0.55 : 0.38, s.x > shots[k - 1].x ? 0.6 : -0.6)
    switch (s.kind) {
      case 'point':
        add(s.t0 + 60, 'pop', 0.5)
        break
      case 'stat': {
        const from = s.t0 + STAT_COUNT_START
        const end = s.countEnd ?? from + STAT_COUNT_DUR
        for (let t = from; t < end - 200; t += 110) add(t, 'tick', 0.18 * (1 - (t - from) / (end - from)) + 0.04)
        add(end - 120, 'impact', 0.55)
        break
      }
      case 'compare':
        COMPARE_POP.forEach((d) => add(s.t0 + d, 'pop', 0.5))
        add(s.t0 + COMPARE_DELTA, 'chime', 0.4)
        break
      case 'chart': {
        if (v.kind !== 'chart') break
        const n = v.data.chart === 'bar' ? Math.min(v.data.categories.length, 10) : 0
        for (let b = 0; b < n; b++) add(s.t0 + BAR_START + b * BAR_STAGGER, 'pop', 0.22, -0.5 + b / Math.max(1, n - 1))
        const lastPeak = v.data.chart === 'line' && v.highlight === v.data.categories.length - 1
        if (v.highlight !== null && !lastPeak) add(chartHighlightTime(s, words[s.scene]), 'chime', 0.4)
        break
      }
      case 'image':
        add(s.t0 + 700, 'pop', 0.35)
        break
      case 'definition':
        add(s.t0 + 60, 'pop', 0.5)
        add(s.t0 + 900, 'pop', 0.3)
        break
      case 'timeline':
      case 'steps':
        // Same arrival rule as the renderers: each item lands as it is named.
        s.cues.forEach((_, j) => add(itemArrival(s, j) + 30, 'pop', 0.4, -0.6 + (1.2 * j) / Math.max(1, s.cues.length - 1)))
        break
      case 'summary':
        add(s.t0 + 200, 'chime', 0.45)
        break
      case 'end':
        add(s.t0 + 120, 'pop', 0.3)
        break
    }
  })
  sfx.sort((a, b) => a.t - b.t)

  return { storyboard: sb, timeline: tl, shots, captions: captionWords(words), sfx, speech, words, total: tl.total }
}

/** When the chart's highlight lands: about halfway through the narration, never before the bars finish. */
export function chartHighlightTime(s: Shot, sceneWords: WordTiming[]): number {
  const mid = sceneWords.length ? sceneWords[Math.floor(sceneWords.length * 0.45)].start : s.start + (s.end - s.start) * 0.45
  return Math.max(s.start + CHART_HIGHLIGHT_MIN, Math.min(mid, s.end - 1500))
}

/** Splits the narration into caption lines: break on sentence ends, on commas after three words, or at six words. */
function captionWords(words: WordTiming[][]): CaptionWord[] {
  const out: CaptionWord[] = []
  let chunk = 0
  words.forEach((list) => {
    if (!list.length) return
    let count = 0
    chunk++
    list.forEach((w) => {
      out.push({ text: w.text, start: w.start, end: w.end, chunk })
      count++
      if (/[.!?]["”')]*$/.test(w.text) || (count >= 3 && /[,;:—–]$/.test(w.text)) || count >= 6) {
        chunk++
        count = 0
      }
    })
  })
  return out
}

export function shotAt(plan: MotionPlan, t: number): number {
  const s = plan.shots
  if (!s.length) return -1
  for (let k = s.length - 1; k >= 0; k--) if (t >= s[k].start) return k
  return 0
}

/**
 * Global ms at which item j of a timeline or steps shot lands: 150 ms ahead of the word that names it, but no sooner
 * than 350 ms plus 300 ms per earlier item into the shot.
 */
export function itemArrival(shot: Shot, j: number): number {
  return Math.max(shot.t0 + 350 + j * 300, shot.cues[j] - 150)
}
