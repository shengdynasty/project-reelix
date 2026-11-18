// The molecule kit's data: a compound's 3D structure from PubChem (keyless, CORS open), read from its SDF record.

export interface Molecule {
  atoms: { element: string; x: number; y: number; z: number }[]
  /** Atom indices from 0, and the bond order (1 single, 2 double, 3 triple). */
  bonds: { a: number; b: number; order: number }[]
}

const PUBCHEM = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/'
/** A compound's own names lead its synonym list; a name further down is a loose match. */
const OWN_NAMES = 3

/** The first molfile block of an SDF record (V2000), or null when the text is not one. */
export function parseSdf(text: string): Molecule | null {
  const lines = text.split(/\r?\n/)
  const at = lines.findIndex((l) => /V2000\s*$/.test(l))
  if (at < 0) return null
  const atomCount = Number(lines[at].slice(0, 3))
  const bondCount = Number(lines[at].slice(3, 6))
  if (!(atomCount > 0) || !(bondCount >= 0) || lines.length < at + 1 + atomCount + bondCount) return null
  const atoms = lines.slice(at + 1, at + 1 + atomCount).map((l) => {
    const [x, y, z, element] = l.trim().split(/\s+/)
    return { element, x: Number(x), y: Number(y), z: Number(z) }
  })
  const bonds = lines.slice(at + 1 + atomCount, at + 1 + atomCount + bondCount).map((l) => ({ a: Number(l.slice(0, 3)) - 1, b: Number(l.slice(3, 6)) - 1, order: Number(l.slice(6, 9)) }))
  if (atoms.some((a) => !a.element || ![a.x, a.y, a.z].every(Number.isFinite)) || bonds.some((b) => !(b.a >= 0 && b.b >= 0 && b.a < atomCount && b.b < atomCount))) return null
  return { atoms, bonds }
}

/** The 3D structure of the compound called `name`, or null when PubChem has none or cannot be reached. */
export async function fetchMolecule(name: string, signal?: AbortSignal): Promise<Molecule | null> {
  try {
    // PubChem matches names loosely ("Fire" finds resin): the name must be one of the compound's first synonyms.
    const synonyms = await fetch(`${PUBCHEM}${encodeURIComponent(name)}/synonyms/JSON`, { signal })
    if (!synonyms.ok) return null
    const list = ((await synonyms.json()) as { InformationList?: { Information?: { Synonym?: string[] }[] } }).InformationList?.Information?.[0]?.Synonym ?? []
    if (!list.slice(0, OWN_NAMES).some((s) => s.toLowerCase() === name.trim().toLowerCase())) return null
    const res = await fetch(`${PUBCHEM}${encodeURIComponent(name)}/SDF?record_type=3d`, { signal })
    return res.ok ? parseSdf(await res.text()) : null
  } catch {
    return null
  }
}
