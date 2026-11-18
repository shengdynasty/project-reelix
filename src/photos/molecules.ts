// The molecule kit's data: a definition scene about a chemical compound gets the compound's 3D structure from
// PubChem, so its hero is a ball and stick model. Only the defined term is sent, and only when the scene's own
// sentence is about chemistry.
import type { Storyboard } from '../model/storyboard'
import { fetchMolecule, type Molecule } from '../stage/kits/molecule'

/** A definition is about a compound when its sentence uses one of these words. */
const CHEMISTRY = /\b(molecules?|compounds?|chemicals?|atoms?|formula|acids?|sugars?|salts?|carbon|oxygen|hydrogen|nitrogen|elements?|bonds?)\b/i
/** At most this many lookups per video, and whatever answers within TIMEOUT_MS is used. */
const MAX_LOOKUPS = 2
const TIMEOUT_MS = 4000

export async function attachMolecules(
  sb: Storyboard,
  opts: { signal?: AbortSignal; fetch?: (name: string, signal?: AbortSignal) => Promise<Molecule | null>; timeoutMs?: number } = {},
): Promise<Storyboard> {
  const lookup = opts.fetch ?? fetchMolecule
  const wanted = sb.scenes.filter((s) => s.visual.kind === 'definition' && CHEMISTRY.test(s.narration)).slice(0, MAX_LOOKUPS)
  if (!wanted.length) return sb
  const found = new Map<string, { term: string; molecule: Molecule }>()
  const work = Promise.all(
    wanted.map(async (s) => {
      const term = s.visual.kind === 'definition' ? s.visual.term : ''
      const molecule = await lookup(term, opts.signal).catch(() => null)
      if (molecule) found.set(s.id, { term, molecule })
    }),
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([work, new Promise((resolve) => (timer = setTimeout(resolve, opts.timeoutMs ?? TIMEOUT_MS)))])
  clearTimeout(timer)
  if (!found.size) return sb
  return {
    ...sb,
    scenes: sb.scenes.map((s) => (found.has(s.id) ? { ...s, molecule: found.get(s.id)!.molecule } : s)),
    sources: [...sb.sources, ...[...found.values()].map(({ term }) => ({ label: `Structure: PubChem, ${term}`, url: `https://pubchem.ncbi.nlm.nih.gov/compound/${encodeURIComponent(term)}` }))],
  }
}
