import { describe, expect, it } from 'vitest'
import { pieceOrigin } from './layout'

describe('pieceOrigin', () => {
  it('starts at the world origin', () => expect(pieceOrigin(0)).toEqual([0, 0, 0]))
  it('spaces consecutive pieces 12 to 18 units apart', () => {
    for (let i = 0; i < 20; i++) {
      const a = pieceOrigin(i)
      const b = pieceOrigin(i + 1)
      const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      expect(d).toBeGreaterThanOrEqual(12)
      expect(d).toBeLessThanOrEqual(18)
    }
  })
  it('moves forward along x and varies height and depth', () => {
    const pts = Array.from({ length: 8 }, (_, i) => pieceOrigin(i))
    pts.slice(1).forEach((p, i) => expect(p[0]).toBeGreaterThan(pts[i][0]))
    expect(new Set(pts.map((p) => p[1])).size).toBeGreaterThan(2)
    expect(new Set(pts.map((p) => p[2])).size).toBeGreaterThan(2)
  })
})
