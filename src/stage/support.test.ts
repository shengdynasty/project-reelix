import { describe, expect, it } from 'vitest'
import { renderMode } from './support'

describe('renderMode', () => {
  it('uses 3D only when wanted and supported', () => {
    expect(renderMode(true, true)).toBe('3d')
    expect(renderMode(true, false)).toBe('2d')
    expect(renderMode(false, true)).toBe('2d')
  })
})
