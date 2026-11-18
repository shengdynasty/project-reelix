// Narration verbs: when the narration says the hero spins, glows or erupts, the hero does, on that word.
import type { WordTiming } from '../../motion/words'
import type { Beat } from '../types'

/** Each verb family, its forms, the beat it gives and how long that lasts. */
const VERBS: { forms: RegExp; action: Beat['action']; dur: number }[] = [
  { forms: /^(spin|spins|spinning|rotate|rotates|rotating|orbit|orbits|orbiting|swirl|swirls|swirling|turn|turns|turning)$/, action: 'spin', dur: 1200 },
  { forms: /^(glow|glows|glowing|shine|shines|shining|burn|burns|burning|heat|heats|heating|ignite|ignites)$/, action: 'focus', dur: 800 },
  { forms: /^(erupt|erupts|erupting|explode|explodes|exploding|burst|bursts|bursting|expand|expands|expanding|swell|swells|grow|grows|growing|split|splits|collapse|collapses|collapsing)$/, action: 'pulse', dur: 400 },
]
/** At most this many verb beats per piece, at least GAP_MS apart, so the hero acts rather than fidgets. */
const MAX_BEATS = 3
const GAP_MS = 700

/** Beats for the verbs spoken between global ms `from` and `to`. */
export function verbBeats(words: WordTiming[], from: number, to: number): Beat[] {
  const beats: Beat[] = []
  for (const w of words) {
    if (beats.length >= MAX_BEATS) break
    if (w.start < from || w.start >= to) continue
    const verb = VERBS.find((v) => v.forms.test(w.text.toLowerCase().replace(/[^a-z]/g, '')))
    if (!verb || (beats.length && w.start - beats[beats.length - 1].t < GAP_MS)) continue
    beats.push({ t: w.start, dur: verb.dur, action: verb.action })
  }
  return beats
}
