// Topic kits: which custom 3D model, if any, should stand in for a scene's icon. Each model lists the words that
// call for it; the topic and a defined term count more than the scene's own sentence, and a word with other common
// senses ("cell", "sun") only counts next to another word of the same model. Pure, so the director stays deterministic.

export type ModelName =
  | 'black-hole'
  | 'galaxy'
  | 'planet'
  | 'star'
  | 'volcano'
  | 'water-cycle'
  | 'strata'
  | 'cell'
  | 'dna'
  | 'virus'
  | 'antibody'
  | 'prism'
  | 'scatter'
  | 'globe'

export interface KitContext {
  /** The video's title or question. */
  topic: string
  /** The scene's narration. */
  sentence: string
  /** A defined term: what the scene is about, so it counts like the topic. */
  term?: string
}

/** A model needs at least this score: one word in the topic, or two in the scene. */
export const KIT_THRESHOLD = 0.5
const TOPIC_WEIGHT = 0.6
const SCENE_WEIGHT = 0.4

/** Words with other everyday senses: they count only beside another word of the same model. */
const AMBIGUOUS = new Set(['cell', 'nucleus', 'membrane', 'sun', 'solar', 'star', 'orbit', 'rain', 'spectrum', 'infection', 'fusion', 'layers', 'plates'])

/** In order: on equal scores the earlier model wins, so the more specific ones come first. */
const MODELS: { model: ModelName; words: string[] }[] = [
  { model: 'scatter', words: ['scatter', 'scatters', 'scattered', 'scattering', 'rayleigh', 'wavelength', 'sky blue', 'blue sky'] },
  { model: 'prism', words: ['prism', 'refraction', 'refract', 'refracts', 'rainbow', 'spectrum'] },
  { model: 'black-hole', words: ['black hole', 'event horizon', 'accretion', 'singularity', 'quasar'] },
  { model: 'galaxy', words: ['galaxy', 'galaxies', 'milky way', 'nebula'] },
  { model: 'planet', words: ['planet', 'jupiter', 'saturn', 'mars', 'venus', 'mercury', 'neptune', 'uranus', 'exoplanet', 'orbit'] },
  { model: 'star', words: ['supernova', 'red giant', 'white dwarf', 'neutron star', 'sun', 'solar', 'star', 'fusion'] },
  { model: 'volcano', words: ['volcano', 'magma', 'lava', 'eruption', 'erupt', 'erupts'] },
  { model: 'water-cycle', words: ['water cycle', 'evaporation', 'evaporates', 'evaporate', 'condensation', 'precipitation', 'rainfall', 'rain'] },
  { model: 'strata', words: ['strata', 'sediment', 'sedimentary', 'fossil', 'erosion', 'tectonic', 'earthquake', 'layers', 'plates'] },
  { model: 'antibody', words: ['antibody', 'antibodies', 'immune', 'immunity', 'lymphocyte', 'white blood cell'] },
  { model: 'virus', words: ['virus', 'viral', 'pathogen', 'vaccine', 'vaccination', 'bacteria', 'infection'] },
  { model: 'dna', words: ['dna', 'gene', 'genetic', 'genetics', 'chromosome', 'genome', 'double helix'] },
  { model: 'globe', words: ['continent', 'countries', 'country', 'capital city', 'geography', 'latitude', 'longitude', 'hemisphere', 'equator', 'world map'] },
  { model: 'cell', words: ['mitochondria', 'mitochondrion', 'chloroplast', 'organelle', 'photosynthesis', 'cytoplasm', 'cell', 'nucleus', 'membrane'] },
]

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** `word` in `text` as a whole word, allowing a plural "s" or "es". */
const has = (text: string, word: string) => new RegExp(`\\b${escape(word)}(s|es)?\\b`, 'i').test(text)

/** The model for a scene, or null for the generic treatment (the scene's icon). */
export function kitModel(ctx: KitContext): ModelName | null {
  const named = `${ctx.topic} ${ctx.term ?? ''}`
  let best: { model: ModelName; score: number } | null = null
  for (const { model, words } of MODELS) {
    const inTopic = words.filter((w) => has(named, w))
    const inScene = words.filter((w) => has(ctx.sentence, w))
    const all = new Set([...inTopic, ...inScene])
    const clear = [...all].some((w) => !AMBIGUOUS.has(w)) || all.size > 1
    if (!clear) continue
    const score = Math.min(1, inTopic.length * TOPIC_WEIGHT + inScene.length * SCENE_WEIGHT)
    if (score >= KIT_THRESHOLD && (!best || score > best.score)) best = { model, score }
  }
  return best?.model ?? null
}
