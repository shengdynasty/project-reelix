import type { Storyboard, VisualKind } from './storyboard'
import { countWords } from './storyboard'

/** Camera move between scenes. */
export const FADE_MS = 450
/** Speech starts once the scene has arrived. */
const LEAD_MS = 380
const TAIL_MS = 600
/** The title waits for the intro sting before speaking. */
const TITLE_LEAD_MS = 1100
/** A brief closing card after the last line. */
const END_CARD_MS = 1800
/** Narration pace used before real audio exists (Kokoro reads about 2.6 words per second). */
const WORDS_PER_SEC = 2.6

/**
 * Shortest time each kind of scene needs for its animation to read, whatever the narration length.
 * There is no target length: a video is as long as its narration.
 */
const MIN_DUR: Record<VisualKind, number> = {
  title: 3000,
  bullets: 3600,
  stat: 4200,
  chart: 6000,
  image: 4500,
  compare: 5000,
  definition: 4500,
  timeline: 5500,
  steps: 5000,
  outro: 3500,
}

export interface SceneTiming {
  start: number
  dur: number
  speechStart: number
  speechDur: number
  included: boolean
}

export interface Timeline {
  scenes: SceneTiming[]
  total: number
}

export function estimateSpeechMs(text: string): number {
  return (countWords(text) / WORDS_PER_SEC) * 1000 + 300
}

/** Lays scenes end to end at a natural pace: lead in, narration, a short pause, longer only when the visual needs it. */
export function buildTimeline(sb: Storyboard, speechMs: (number | undefined)[]): Timeline {
  let t = 0
  const scenes: SceneTiming[] = sb.scenes.map((s, i) => {
    const speech = speechMs[i] ?? estimateSpeechMs(s.narration)
    const kind = s.visual.kind
    const lead = kind === 'title' ? TITLE_LEAD_MS : LEAD_MS
    const tail = kind === 'outro' ? END_CARD_MS + TAIL_MS : TAIL_MS
    const dur = Math.round(Math.max(MIN_DUR[kind] + (kind === 'outro' ? END_CARD_MS : 0), lead + speech + tail))
    const st: SceneTiming = { start: t, dur, speechStart: t + lead, speechDur: speech, included: true }
    t += dur
    return st
  })
  return { scenes, total: t }
}

/** Index of the scene playing at time t. */
export function sceneAt(tl: Timeline, t: number): number {
  for (let i = 0; i < tl.scenes.length; i++) {
    const s = tl.scenes[i]
    if (t < s.start + s.dur) return i
  }
  return tl.scenes.length - 1
}
