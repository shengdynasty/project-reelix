import { describe, expect, it } from 'vitest'
import { fitLabel, labelFor, shortLabel, type Measure } from './labels'

// A fixed width stand in for canvas measureText.
const mono: Measure = (s, size) => s.length * size * 0.55

describe('shortLabel', () => {
  it('drops a leading article and trailing weak words', () =>
    expect(shortLabel('The core collapses under its own gravity')).toBe('Core collapses'))
  it('keeps at most four words', () => expect(shortLabel('The sun drives the cycle by heating water')).toBe('Sun drives the cycle'))
  it('leaves a single word alone', () => expect(shortLabel('Evaporation')).toBe('Evaporation'))
})

describe('labelFor', () => {
  it('skips a leading ordinal or linking word', () => {
    for (const s of ['First, black holes form when massive stars collapse.', 'Next, water evaporates from the warm ocean.', 'Finally, the vaccine trains the immune system.'])
      expect(labelFor(s, [])?.split(' ')[0]).not.toMatch(/^(First|Next|Finally)$/)
  })
  it('names what the icon shows', () => expect(labelFor('The sun drives the cycle by heating water in oceans and lakes.', ['water', 'cycle'])).toBe('Sun'))
  it('keeps the words before it', () =>
    expect(labelFor('General relativity also predicts that every black hole should have a central singularity.', ['black', 'hole'])).toBe('General relativity'))
  it('skips a phrase that is only the topic', () => expect(labelFor('Some black holes have relativistic jets.', ['black', 'hole'])).toBe('Relativistic jets'))
  it('keeps an adjective', () => expect(labelFor('There is essentially no direct sunlight under an overcast sky.', ['sky', 'blue'])).toBe('Direct sunlight'))
  it('returns null when nothing is worth a label', () => expect(labelFor('It is.', [])).toBeNull())
  it('skips a verb after a modal in the fallback', () =>
    expect(labelFor('A black hole is so compact that nothing can escape.', ['black', 'hole'])).not.toBe('Escape'))
  it('skips a word ending in ed in the fallback', () => expect(labelFor('Roughly 70% of the surface is covered by water.', ['water'])).toBe('Surface'))
})

describe('fitLabel', () => {
  it('never goes below 34 px and fits the width', () => {
    const f = fitLabel('Electroencephalography readings', 520, mono)
    expect(f.size).toBeGreaterThanOrEqual(34)
    expect(f.lines.length).toBeLessThanOrEqual(2)
    f.lines.forEach((l) => expect(mono(l, f.size)).toBeLessThanOrEqual(520))
  })
  it('keeps a number whole', () => expect(fitLabel('1,234,567,890 people', 280, mono).lines.join(' ')).toContain('1,234,567,890'))
  it('ends with an ellipsis at a word boundary when two lines are not enough', () => {
    const f = fitLabel('One two three four five six seven eight nine ten eleven twelve', 200, mono)
    expect(f.truncated).toBe(true)
    expect(f.size).toBe(34)
    expect(f.lines).toHaveLength(2)
    expect(f.lines[1].endsWith('…')).toBe(true)
  })
})
