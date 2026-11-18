// The moment the narration names an item. The 2D shots, the 3D stage and the baked sound effects all read these,
// so a step lights up and pops on the word that names it, and a stat lands as its number is spoken.
import type { WordTiming } from './words'
import { topicalWord } from './icons'

interface Anchor {
  /** Digits when the phrase holds a number, else a bare word. */
  text: string
  digits: boolean
}

/** Lowercase letters and digits only, so "evaporates," compares with "Evaporation" on its stem. */
const bare = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const digitsOf = (word: string) => word.replace(/\D/g, '')

/**
 * What to listen for in a phrase: its first number as digits, else the word that picks its picture, else its
 * longest word; '' when the phrase has nothing to match.
 */
function anchorOf(phrase: string): Anchor {
  const tokens = phrase.split(/\s+/).filter(Boolean)
  const num = tokens.find((w) => /\d/.test(w))
  if (num) return { text: digitsOf(num), digits: true }
  const topical = topicalWord(phrase)
  const text = topical ? bare(topical) : tokens.map(bare).reduce((a, b) => (b.length > a.length ? b : a), '')
  return { text, digits: false }
}

/** A number matches on equal digits; a word on a shared prefix of 4 letters, or exactly when it is shorter. */
function matches(anchor: Anchor, word: string): boolean {
  if (anchor.digits) return digitsOf(word) === anchor.text
  const w = bare(word)
  return w === anchor.text || (w.length >= 4 && anchor.text.length >= 4 && w.slice(0, 4) === anchor.text.slice(0, 4))
}

/**
 * For each phrase in order, the start of the first spoken word after the previous match that names it, or that
 * phrase's fallback when nothing does. `fallbacks` runs parallel to `phrases`.
 */
export function anchorTimes(words: WordTiming[], phrases: string[], fallbacks: number[]): number[] {
  let from = 0
  return phrases.map((phrase, i) => {
    const anchor = anchorOf(phrase)
    const k = anchor.text ? words.findIndex((w, j) => j >= from && matches(anchor, w.text)) : -1
    if (k < 0) return fallbacks[i]
    from = k + 1
    return words[k].start
  })
}
