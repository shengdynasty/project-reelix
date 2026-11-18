import { describe, expect, it } from 'vitest'
import { anchorTimes } from './anchors'
import type { WordTiming } from './words'

const words = (text: string): WordTiming[] => text.split(' ').map((w, i) => ({ text: w, start: i * 300, end: i * 300 + 250 }))

describe('anchorTimes', () => {
  const w = words('First water evaporates, then the vapor condenses into clouds, and finally rain falls back down.')
  it('finds the word that names each step, in order', () =>
    expect(anchorTimes(w, ['Evaporation', 'Condensation', 'Precipitation'], [-1, -2, -3])).toEqual([600, 1800, -3]))
  it('matches a number by its digits', () =>
    expect(anchorTimes(words('Human liver cells have about 1,000 mitochondria each.'), ['1000'], [-1])).toEqual([1500]))
  it('maps a repeated word to successive mentions', () =>
    expect(anchorTimes(words('Water rises, then water falls.'), ['Water', 'Water'], [-1, -1])).toEqual([0, 900]))
})
