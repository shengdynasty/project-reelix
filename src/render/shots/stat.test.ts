import { describe, expect, it } from 'vitest'
import { countProgress } from './stat'
import { STAT_COUNT_DUR, STAT_COUNT_START } from '../../motion/beats'

describe('countProgress', () => {
  it('is 0 before the count starts and 1 at its end', () => {
    expect(countProgress(0, 5000)).toBe(0)
    expect(countProgress(STAT_COUNT_START + STAT_COUNT_DUR, STAT_COUNT_DUR)).toBe(1)
    expect(countProgress(STAT_COUNT_START + 5000, 5000)).toBe(1)
  })
  it('keeps the usual settle for a count of the default length', () =>
    expect(countProgress(STAT_COUNT_START + STAT_COUNT_DUR / 2, STAT_COUNT_DUR)).toBeGreaterThan(0.85))
  it('lands the final digits with the burst on a long count', () => {
    const dur = 5000
    expect(countProgress(STAT_COUNT_START + dur * 0.5, dur)).toBeLessThan(0.6)
    // A 30 still reads 29 here: the last integer arrives in the final tenth.
    expect(countProgress(STAT_COUNT_START + dur * 0.8, dur)).toBeLessThan(0.97)
    expect(countProgress(STAT_COUNT_START + dur * 0.9, dur)).toBeGreaterThan(0.98)
  })
})
