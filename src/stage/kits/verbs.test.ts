import { describe, expect, it } from 'vitest'
import { verbBeats } from './verbs'

const say = (...pairs: [string, number][]) => pairs.map(([text, start]) => ({ text, start, end: start + 200 }))

describe('verbBeats', () => {
  it('makes the hero act on the verbs as they are spoken', () => {
    const beats = verbBeats(say(['The', 0], ['disk', 200], ['spins', 400], ['as', 600], ['gas', 1500], ['glows.', 1700], ['It', 2600], ['erupts!', 2800]), 0, 5000)
    expect(beats.map((b) => [b.action, b.t])).toEqual([
      ['spin', 400],
      ['focus', 1700],
      ['pulse', 2800],
    ])
  })
  it('keeps actions apart and at most three per piece', () => {
    const beats = verbBeats(say(['spins', 0], ['glows', 300], ['erupts', 1000], ['rotates', 2000], ['expands', 3000], ['shines', 4000]), 0, 9000)
    expect(beats.map((b) => b.t)).toEqual([0, 1000, 2000])
  })
  it('ignores verbs outside the piece and words that only look like verbs', () => {
    expect(verbBeats(say(['spins', 100], ['spinach', 1200], ['glows', 6000]), 1000, 5000)).toEqual([])
  })
})
