import { describe, expect, it } from 'vitest'
import { assignPhotos, licenseOf, plainText, scorePhoto, type PhotoCandidate } from './select'

const photo = (over: Partial<PhotoCandidate> = {}): PhotoCandidate => ({
  url: 'https://upload.wikimedia.org/a.jpg',
  width: 1600,
  height: 1000,
  title: 'Black hole accretion disk',
  description: 'An accretion disk of hot gas around a black hole',
  artist: 'NASA',
  license: 'Public domain',
  source: 'https://commons.wikimedia.org/wiki/File:A.jpg',
  origin: 'article',
  ...over,
})
const opts = { place: false, people: [] as string[] }

describe('licenseOf', () => {
  it('keeps public domain, CC0, CC BY and CC BY-SA in a readable form', () => {
    expect(licenseOf('CC BY-SA 4.0')).toBe('CC BY-SA 4.0')
    expect(licenseOf('cc-by-sa-3.0')).toBe('CC BY-SA 3.0')
    expect(licenseOf('CC BY 2.5')).toBe('CC BY 2.5')
    expect(licenseOf('by 2.0')).toBe('CC BY 2.0')
    expect(licenseOf('by-sa 4.0')).toBe('CC BY-SA 4.0')
    expect(licenseOf('Public domain')).toBe('Public domain')
    expect(licenseOf('PD-USGov')).toBe('Public domain')
    expect(licenseOf('pdm')).toBe('Public domain')
    expect(licenseOf('CC0')).toBe('CC0')
    expect(licenseOf('cc0 1.0')).toBe('CC0')
  })
  it('refuses non commercial, no derivatives, fair use and anything unknown', () => {
    for (const raw of ['CC BY-NC 2.0', 'CC BY-NC-SA 4.0', 'CC BY-ND 4.0', 'Fair use', 'Copyrighted', 'GFDL', '']) expect(licenseOf(raw)).toBeNull()
  })
})

describe('plainText', () => {
  it('drops tags and decodes entities', () => expect(plainText('<a href="x">Jane</a> &amp; <b>co</b>')).toBe('Jane & co'))
  it('caps long text at a word boundary', () => {
    const out = plainText('word '.repeat(40))
    expect(out.length).toBeLessThanOrEqual(80)
    expect(out.endsWith('word')).toBe(true)
  })
})

describe('scorePhoto', () => {
  const sentence = 'Hot gas forms an accretion disk as it spirals into the black hole.'
  it('refuses odd shapes, small pictures and drawings', () => {
    expect(scorePhoto(photo({ width: 500, height: 1000 }), sentence, opts)).toBe(-Infinity)
    expect(scorePhoto(photo({ width: 3000, height: 1000 }), sentence, opts)).toBe(-Infinity)
    expect(scorePhoto(photo({ width: 600, height: 400 }), sentence, opts)).toBe(-Infinity)
    expect(scorePhoto(photo({ title: 'Black hole diagram' }), sentence, opts)).toBe(-Infinity)
    expect(scorePhoto(photo({ url: 'https://upload.wikimedia.org/a.svg.png' }), sentence, opts)).toBe(-Infinity)
  })
  it('rises with the words it shares with the sentence', () =>
    expect(scorePhoto(photo(), sentence, opts)).toBeGreaterThan(scorePhoto(photo({ title: 'Galaxy', description: 'A spiral galaxy' }), sentence, opts)))
  it('prefers a picture at least 1200 px wide', () => expect(scorePhoto(photo(), sentence, opts)).toBeGreaterThan(scorePhoto(photo({ width: 800, height: 500 }), sentence, opts)))
  it('marks a PNG down twice, since PNGs are mostly drawings and screenshots', () =>
    expect(scorePhoto(photo({ url: 'https://upload.wikimedia.org/thumb/a.png/1280px-a.png' }), sentence, opts)).toBeCloseTo(scorePhoto(photo(), sentence, opts) - 3, 6))
  it('marks down flags, logos, maps and portraits of people the scene does not name', () => {
    const base = scorePhoto(photo(), sentence, opts)
    expect(scorePhoto(photo({ title: 'Flag of black hole accretion disk' }), sentence, opts)).toBeLessThan(base)
    expect(scorePhoto(photo({ title: 'Black hole accretion disk logo' }), sentence, opts)).toBeLessThan(base)
    expect(scorePhoto(photo({ title: 'Black hole accretion disk map' }), sentence, opts)).toBeLessThan(base)
    expect(scorePhoto(photo({ title: 'Black hole accretion disk map' }), sentence, { place: true, people: [] })).toBe(base)
    expect(scorePhoto(photo({ title: 'Portrait of Kip Thorne near a black hole accretion disk' }), sentence, opts)).toBeLessThan(
      scorePhoto(photo({ title: 'Portrait of Kip Thorne near a black hole accretion disk' }), sentence, { place: false, people: ['Kip Thorne'] }),
    )
  })
})

describe('assignPhotos', () => {
  const scenes = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, sentence: 'Hot gas forms an accretion disk around the black hole.', eligible: true, place: false, people: [] }))
  const many = Array.from({ length: 12 }, (_, i) => photo({ url: `https://upload.wikimedia.org/${i}.jpg` }))
  it('gives a scene at most one photo, fewer than half of the scenes one, and uses each photo once', () => {
    const out = assignPhotos(scenes, many)
    expect(out.size).toBe(4)
    expect(new Set([...out.values()].map((c) => c.url)).size).toBe(out.size)
  })
  it('never passes 8 photos', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({ ...scenes[0], id: `t${i}` }))
    expect(assignPhotos(twenty, many).size).toBe(8)
  })
  it('skips scenes that cannot show a photo and scenes no photo fits', () => {
    const out = assignPhotos(
      [
        { ...scenes[0], id: 'a', eligible: false },
        { ...scenes[0], id: 'b', sentence: 'Taxes rose in the spring.' },
        { ...scenes[0], id: 'c' },
        { ...scenes[0], id: 'd' },
        { ...scenes[0], id: 'e' },
      ],
      many,
    )
    expect([...out.keys()]).toEqual(['c', 'd'])
  })
})
