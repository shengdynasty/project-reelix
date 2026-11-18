import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchMolecule, parseSdf } from './molecule'

// PubChem's 3D record for water (CID 962), trimmed to the molfile block.
const WATER = `962
  -OEChem-11172614353D

  3  2  0     0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.2774    0.8929    0.2544 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.6068   -0.2383   -0.7169 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
M  END
$$$$
`

afterEach(() => vi.unstubAllGlobals())

describe('parseSdf', () => {
  it('reads atoms with their elements and bonds with their order', () => {
    const mol = parseSdf(WATER)!
    expect(mol.atoms.map((a) => a.element)).toEqual(['O', 'H', 'H'])
    expect(mol.atoms[1]).toEqual({ element: 'H', x: 0.2774, y: 0.8929, z: 0.2544 })
    expect(mol.bonds).toEqual([
      { a: 0, b: 1, order: 1 },
      { a: 0, b: 2, order: 1 },
    ])
  })
  it('gives null for text that is not a molfile', () => {
    expect(parseSdf('Status: 404')).toBeNull()
    expect(parseSdf('')).toBeNull()
  })
})

describe('fetchMolecule', () => {
  it("asks PubChem for the compound's 3D record by name", async () => {
    const fetch = vi.fn(async (_url: string) => new Response(WATER))
    vi.stubGlobal('fetch', fetch)
    expect((await fetchMolecule('water'))?.atoms).toHaveLength(3)
    expect(fetch.mock.calls[0][0]).toBe('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/water/SDF?record_type=3d')
  })
  it('gives null when PubChem has no such compound or cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Status: 404', { status: 404 })))
    expect(await fetchMolecule('unobtainium')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    expect(await fetchMolecule('water')).toBeNull()
  })
})
