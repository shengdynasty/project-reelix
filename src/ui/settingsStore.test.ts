import { describe, expect, it } from 'vitest'
import { movingPhotosOn } from './settingsStore'

describe('movingPhotosOn', () => {
  it('follows an explicit choice', () => {
    expect(movingPhotosOn(true, { saveData: true })).toBe(true)
    expect(movingPhotosOn(false, {})).toBe(false)
  })
  it('turns itself off on data saver and slow connections when automatic', () => {
    expect(movingPhotosOn(null, { saveData: true })).toBe(false)
    expect(movingPhotosOn(null, { effectiveType: '3g' })).toBe(false)
    expect(movingPhotosOn(null, { effectiveType: 'slow-2g' })).toBe(false)
    expect(movingPhotosOn(null, { effectiveType: '4g' })).toBe(true)
    expect(movingPhotosOn(null, undefined)).toBe(true)
  })
})
