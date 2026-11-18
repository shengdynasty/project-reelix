import DATA from './icons.json'
import { contentWords } from '../input/parseText'

interface IconDef {
  n: string
  t: string
  b: string
  f: string
}

const ICONS = DATA as IconDef[]
const BY_NAME = new Map(ICONS.map((i) => [i.n, i]))

// Topic words that the icon tags do not cover well.
const SYNONYMS: Record<string, string> = {
  water: 'drop', fresh: 'drop', liquid: 'drop', ocean: 'waves', oceans: 'waves', sea: 'waves', salt: 'waves', river: 'waves', rivers: 'waves', lake: 'waves', lakes: 'waves',
  glacier: 'snowflake', glaciers: 'snowflake', ice: 'snowflake', frozen: 'snowflake', snow: 'snowflake', groundwater: 'drop-half', underground: 'drop-half', aquifer: 'drop-half', aquifers: 'drop-half',
  earth: 'globe-hemisphere-west', world: 'globe-hemisphere-west', global: 'globe-hemisphere-west', planet: 'planet', climate: 'thermometer', temperature: 'thermometer', warming: 'thermometer-hot',
  revenue: 'chart-line-up', sales: 'chart-line-up', profit: 'coins', income: 'money', price: 'tag', prices: 'tag', cost: 'tag', costs: 'tag', dollars: 'currency-dollar', money: 'money', budget: 'wallet', savings: 'piggy-bank', bank: 'bank', invest: 'trend-up', growth: 'trend-up', grew: 'trend-up', rose: 'trend-up', increase: 'trend-up', decline: 'trend-down', fell: 'trend-down', drop: 'trend-down',
  bakery: 'bread', bread: 'bread', sourdough: 'bread', baked: 'bread', rolls: 'cookie', cinnamon: 'cookie', pies: 'cake', pie: 'cake', cake: 'cake', coffee: 'coffee', food: 'fork-knife', meal: 'fork-knife', restaurant: 'fork-knife',
  subscription: 'repeat', subscribers: 'repeat', members: 'users-three', membership: 'users-three', customers: 'users', people: 'users', population: 'users-three', community: 'users-three', team: 'users-three',
  online: 'shopping-cart', orders: 'package', order: 'package', shipping: 'truck', delivery: 'truck', store: 'storefront', shop: 'storefront', location: 'map-pin', locations: 'map-pin', station: 'train', market: 'storefront', stall: 'storefront',
  students: 'student', student: 'student', school: 'graduation-cap', teens: 'student', teenagers: 'student', class: 'chalkboard-teacher', teacher: 'chalkboard-teacher', learn: 'book-open', study: 'book-open', homework: 'notebook', survey: 'chat-circle-dots', surveyed: 'chat-circle-dots',
  phone: 'device-mobile', phones: 'device-mobile', smartphone: 'device-mobile', screen: 'device-mobile', screens: 'device-mobile', apps: 'device-mobile', app: 'device-mobile', video: 'video', videos: 'video', messaging: 'chat-circle', messages: 'chat-circle', games: 'game-controller', gaming: 'game-controller', music: 'music-notes', social: 'chats',
  sleep: 'bed', slept: 'bed', bedroom: 'bed', night: 'moon', bed: 'bed', health: 'heartbeat', exercise: 'barbell', doctor: 'first-aid', disease: 'virus', medicine: 'pill',
  hours: 'clock', minutes: 'timer', time: 'clock', weekends: 'calendar', weekdays: 'calendar', weekday: 'calendar', days: 'calendar', year: 'calendar', years: 'calendar',
  energy: 'lightning', electricity: 'plug', solar: 'solar-panel', power: 'lightning', battery: 'battery-charging', fuel: 'gas-pump', oil: 'gas-pump', recycling: 'recycle', waste: 'recycle',
  plan: 'map-trifold', plans: 'map-trifold', goal: 'target', goals: 'target', idea: 'lightbulb', ideas: 'lightbulb', protect: 'shield-check', protecting: 'shield-check', safety: 'shield-check', risk: 'warning', problem: 'warning',
  research: 'flask', science: 'atom', data: 'database', computer: 'desktop', software: 'code', internet: 'wifi-high', ai: 'robot', news: 'newspaper', book: 'book', books: 'books', reading: 'book-open',
  travel: 'airplane', city: 'city', cities: 'city', home: 'house', homes: 'house', housing: 'house', car: 'car', cars: 'car', traffic: 'car', transit: 'bus',
  best: 'trophy', winner: 'trophy', leads: 'trophy', top: 'medal', record: 'medal', launch: 'rocket', launched: 'rocket', start: 'flag', opened: 'storefront',
  share: 'chart-pie-slice', percent: 'percent', breakdown: 'chart-pie', compare: 'scales', comparison: 'scales', versus: 'scales',
  animals: 'paw-print', animal: 'paw-print', birds: 'bird', trees: 'tree', forest: 'tree-evergreen', plants: 'plant', farm: 'plant', crops: 'plant', grow: 'plant',
  recap: 'check-circle', takeaways: 'check-circle',
  hole: 'planet', holes: 'planet', galaxy: 'planet', galaxies: 'planet', universe: 'planet', cosmos: 'planet', astronomy: 'planet', astronomical: 'planet', gravity: 'planet', gravitational: 'planet', orbit: 'planet', orbits: 'planet', spacetime: 'planet', relativity: 'atom',
  sky: 'sun', skies: 'sun', blue: 'sun', colors: 'palette', colour: 'palette', color: 'palette',
  star: 'star', stars: 'star', stellar: 'star', supernova: 'star', sun: 'sun', sunlight: 'sun', light: 'sun', radiation: 'sun', moon: 'moon', comet: 'star', asteroid: 'planet', telescope: 'magnifying-glass',
  atom: 'atom', atoms: 'atom', molecule: 'atom', molecules: 'atom', particle: 'atom', particles: 'atom', electron: 'atom', quantum: 'atom', physics: 'atom', chemistry: 'flask', chemical: 'flask', reaction: 'flask', experiment: 'flask',
  cell: 'dna', cells: 'dna', gene: 'dna', genes: 'dna', genetic: 'dna', dna: 'dna', rna: 'dna', protein: 'dna', proteins: 'dna', bacteria: 'virus', virus: 'virus', viruses: 'virus', immune: 'shield-check', immunity: 'shield-check', vaccine: 'syringe', vaccines: 'syringe', vaccination: 'syringe', antibodies: 'shield-check',
  volcano: 'mountains', volcanoes: 'mountains', magma: 'fire', lava: 'fire', eruption: 'fire', earthquake: 'mountains', rock: 'mountains', rocks: 'mountains',
  photosynthesis: 'leaf', chlorophyll: 'leaf', leaves: 'leaf', leaf: 'leaf', oxygen: 'wind', carbon: 'cloud', atmosphere: 'cloud', weather: 'cloud-rain', rain: 'cloud-rain', evaporation: 'thermometer-hot', condensation: 'cloud', precipitation: 'cloud-rain',
  history: 'hourglass', war: 'flag', empire: 'flag', government: 'buildings', election: 'check-circle', economy: 'chart-line-up',
  heart: 'heartbeat', blood: 'heartbeat', brain: 'brain', neurons: 'brain', mind: 'brain', memory: 'brain', muscle: 'barbell', muscles: 'barbell', bones: 'person',
}

/** Words too vague to pick a picture from ("body" is not a person in "astronomical body"). */
const WEAK = new Set('body form forms field fields matter mass area region regions point points line lines state states level levels part parts type types kind kinds group groups system systems process processes way ways thing things use uses value values order orders case cases term terms result results number numbers change changes example examples model models structure feature features time times power'.split(' '))

// Icon names ("game-controller") are strong evidence; catalog tags are loose, so they count for little.
const NAME_INDEX = new Map<string, string[]>()
const INDEX = new Map<string, string[]>()
for (const icon of ICONS) {
  const parts = icon.n.split('-')
  for (const part of parts) NAME_INDEX.set(part, [...(NAME_INDEX.get(part) ?? []), icon.n])
  for (const word of icon.t.split(' ')) if (!parts.includes(word)) INDEX.set(word, [...(INDEX.get(word) ?? []), icon.n])
}

function stem(w: string): string {
  return w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '')
}

/** Best icon for a piece of text: curated synonyms first, then icon names; a neutral fallback beats a wrong picture. */
export function iconFor(text: string, fallback = 'lightbulb'): string {
  const words = contentWords(text)
  const score = new Map<string, number>()
  const add = (name: string, s: number) => BY_NAME.has(name) && score.set(name, (score.get(name) ?? 0) + s)
  words.forEach((w, i) => {
    const weight = 1 + 1 / (i + 1)
    const s = stem(w)
    if (SYNONYMS[w]) add(SYNONYMS[w], 4 * weight)
    else if (SYNONYMS[s]) add(SYNONYMS[s], 3.5 * weight)
    if (WEAK.has(w) || WEAK.has(s)) return
    for (const name of NAME_INDEX.get(w) ?? NAME_INDEX.get(s) ?? []) add(name, 2 * weight)
    for (const name of INDEX.get(w) ?? []) add(name, 0.5 * weight)
  })
  let best = fallback
  let bestScore = 2.4
  for (const [name, s] of score) if (s > bestScore) { best = name; bestScore = s }
  return best
}

export function unitIcon(unit: { prefix: string; suffix: string; word: string }, text: string): string {
  if (unit.prefix === '$') return 'currency-dollar'
  if (unit.prefix === '€') return 'currency-eur'
  if (unit.prefix === '£') return 'currency-gbp'
  const fromText = iconFor(`${unit.word} ${text}`, '')
  if (fromText) return fromText
  if (unit.suffix === '%') return 'percent'
  return 'chart-bar'
}

const cache = new Map<string, { b: Path2D | null; f: Path2D }>()

function paths(name: string) {
  let p = cache.get(name)
  if (!p) {
    const def = BY_NAME.get(name) ?? BY_NAME.get('lightbulb')!
    p = { b: def.b ? new Path2D(def.b) : null, f: new Path2D(def.f) }
    cache.set(name, p)
  }
  return p
}

/** Draws a duotone icon centered at (x, y): soft tinted shape behind a solid line drawing. */
export function drawIcon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, ink: string, tint: string, tintAlpha = 0.35) {
  const p = paths(name)
  ctx.save()
  ctx.translate(x - size / 2, y - size / 2)
  ctx.scale(size / 256, size / 256)
  if (p.b) {
    ctx.globalAlpha *= tintAlpha
    ctx.fillStyle = tint
    ctx.fill(p.b)
    ctx.globalAlpha /= tintAlpha
  }
  ctx.fillStyle = ink
  ctx.fill(p.f)
  ctx.restore()
}

/**
 * The word that picks the picture: the first content word with an icon, else the longest content word, returned as
 * written in the text without trailing punctuation; '' when there is none.
 */
export function topicalWord(text: string): string {
  const words = contentWords(text)
  const topical = words.find((w) => !WEAK.has(w) && (SYNONYMS[w] || SYNONYMS[stem(w)] || NAME_INDEX.has(w)))
  const pick = topical ?? [...words].sort((a, b) => b.length - a.length)[0]
  if (!pick) return ''
  return text.split(/\s+/).find((t) => t.toLowerCase().replace(/[^a-z0-9'’]/g, '').replace(/[’']s$/, '') === pick)?.replace(/[,.;:!?]+$/, '') ?? ''
}

/** The word worth highlighting on screen: a number if there is one, else the topical word. */
export function focusWord(text: string): string {
  const num = text.split(/\s+/).find((w) => /\d/.test(w))
  if (num) return num.replace(/[,.;:!?]+$/, '')
  return topicalWord(text)
}
