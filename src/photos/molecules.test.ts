import { describe, expect, it } from 'vitest'
import type { Storyboard } from '../model/storyboard'
import type { Molecule } from '../stage/kits/molecule'
import { attachMolecules } from './molecules'

const water: Molecule = { atoms: [{ element: 'O', x: 0, y: 0, z: 0 }], bonds: [] }
const board = (narration: string, term: string): Storyboard => ({
  title: 'Sugars',
  planner: 'rule-based',
  sources: [{ label: 'Wikipedia: Glucose', url: 'https://en.wikipedia.org/wiki/Glucose' }],
  scenes: [
    { id: 't', narration: 'Sugars.', priority: 1, visual: { kind: 'title', title: 'Sugars', subtitle: '' } },
    { id: 'd', narration, priority: 1, visual: { kind: 'definition', term, link: 'is', meaning: 'a simple sugar' } },
  ],
})

describe('attachMolecules', () => {
  it('gives a definition about a compound its 3D structure and credits PubChem', async () => {
    const asked: string[] = []
    const out = await attachMolecules(board('Glucose is a simple sugar molecule made of carbon, hydrogen and oxygen.', 'Glucose'), { fetch: async (name) => (asked.push(name), water) })
    expect(asked).toEqual(['Glucose'])
    expect(out.scenes[1].molecule).toEqual(water)
    expect(out.sources.at(-1)).toEqual({ label: 'Structure: PubChem, Glucose', url: 'https://pubchem.ncbi.nlm.nih.gov/compound/Glucose' })
  })
  it('asks nothing for definitions that are not about chemistry', async () => {
    const asked: string[] = []
    const sb = board('A black hole is a region of spacetime where nothing escapes.', 'Black hole')
    expect(await attachMolecules(sb, { fetch: async (name) => (asked.push(name), water) })).toEqual(sb)
    expect(asked).toEqual([])
  })
  it('leaves the storyboard alone when PubChem has nothing or is too slow', async () => {
    const sb = board('Glucose is a simple sugar molecule.', 'Glucose')
    expect(await attachMolecules(sb, { fetch: async () => null })).toEqual(sb)
    expect(await attachMolecules(sb, { fetch: () => new Promise(() => {}), timeoutMs: 20 })).toEqual(sb)
  })
})
