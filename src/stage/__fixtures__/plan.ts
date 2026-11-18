// A storyboard with every scene kind, for tests of the motion plan and the 3D stage. The timeline, steps and kinds
// narrations name their items in order and the stat narration says its number, so word anchors can be checked.
// Narrations are real sentences of 12 to 25 words.
import type { Scene, Storyboard } from '../../model/storyboard'
import { NO_UNIT } from '../../model/storyboard'
import { buildTimeline, estimateSpeechMs } from '../../model/timing'
import type { MotionPlan } from '../../motion/plan'
import { buildPlan } from '../../motion/plan'

export interface FixtureOptions {
  /** Extra two item point scenes before the outro, for long video tests. */
  extraPoints?: number
}

const TITLE = 'Why is the sky blue?'
const PERCENT = { prefix: '', suffix: '%', word: '' }

const evenCues = (n: number) => Array.from({ length: n }, (_, i) => i / n)

function extraPoint(k: number): Scene {
  return {
    id: `extra${k + 1}`,
    priority: 0.4,
    narration: 'Dust and smoke redden the light at dusk, while clouds look white because their droplets scatter every color evenly.',
    visual: { kind: 'bullets', eyebrow: 'Key points', heading: 'More about the sky', items: ['Dust reddens the light', 'Clouds look white'], cues: evenCues(2) },
  }
}

export function fixtureStoryboard({ extraPoints = 0 }: FixtureOptions = {}): Storyboard {
  const scenes: Scene[] = [
    {
      id: 'title',
      priority: 1,
      narration: 'The sky looks blue because air scatters short blue wavelengths of sunlight far more than the longer red ones.',
      visual: { kind: 'title', title: TITLE, subtitle: 'Light, air and scattering' },
    },
    {
      id: 'definition',
      priority: 0.8,
      narration: 'Diffuse sky radiation is the sunlight that air molecules scatter in every direction, and it is what we see as the blue sky.',
      visual: { kind: 'definition', term: 'Diffuse sky radiation', link: 'is', meaning: 'sunlight scattered by molecules and particles in the atmosphere' },
    },
    {
      id: 'points',
      priority: 0.7,
      narration: 'Sunlight carries every color, the air scatters short blue waves far more than red, and at sunset the long path leaves only red light.',
      visual: {
        kind: 'bullets',
        eyebrow: 'Key points',
        heading: 'Three things to know',
        items: ['Sunlight holds every color', 'Air scatters blue most', 'Sunsets turn red'],
        cues: evenCues(3),
      },
    },
    {
      id: 'stat',
      priority: 0.9,
      narration: 'Visible light makes up about 42% of the energy the sun sends our way, and the atmosphere scatters its blue part the most.',
      visual: { kind: 'stat', value: 42, decimals: 0, unit: PERCENT, label: 'of sunlight is visible light', from: null },
    },
    {
      id: 'compare',
      priority: 0.8,
      narration: 'Blue light has a wavelength near 450 nanometers while red light stretches to about 700, and shorter waves scatter far more strongly.',
      visual: {
        kind: 'compare',
        unit: { prefix: '', suffix: '', word: 'nm' },
        decimals: 0,
        left: { label: 'Blue light', value: 450 },
        right: { label: 'Red light', value: 700 },
      },
    },
    {
      id: 'chart',
      priority: 0.85,
      narration: 'Scattering grows fast as wavelengths shorten, so green light scatters more than twice as much as red while violet scatters most.',
      visual: {
        kind: 'chart',
        data: {
          title: 'Scattering by color',
          xLabel: 'Color',
          categories: ['Red', 'Yellow', 'Green', 'Blue', 'Violet'],
          series: [{ name: 'Scattering strength', values: [1, 1.6, 2.3, 3.6, 5.5] }],
          unit: NO_UNIT,
          chart: 'bar',
          temporal: false,
        },
        highlight: 2,
      },
    },
    {
      id: 'image',
      priority: 0.6,
      narration: 'Look up on a clear afternoon and the sky glows a deep even blue, brightest far from the sun and paler near the horizon.',
      visual: { kind: 'image', imageId: 'img1', caption: 'A clear afternoon sky over the sea' },
    },
    {
      id: 'timeline',
      priority: 0.75,
      narration: 'In 1869 Tyndall lit up particles, in 1871 Rayleigh explained the blue, in 1899 molecules got the credit, and in 1908 Mie added droplets.',
      visual: {
        kind: 'timeline',
        heading: 'How the answer was found',
        events: [
          { when: '1869', label: 'Tyndall lights up particles' },
          { when: '1871', label: 'Rayleigh explains the blue' },
          { when: '1899', label: 'Molecules get the credit' },
          { when: '1908', label: 'Mie adds droplets' },
        ],
        cues: evenCues(4),
      },
    },
    {
      id: 'steps',
      priority: 0.85,
      narration: 'First water evaporates from oceans and lakes, then the vapor condenses into clouds, precipitation falls as rain, and collection gathers it in rivers.',
      visual: { kind: 'steps', heading: 'The water cycle', items: ['Evaporation', 'Condensation', 'Precipitation', 'Collection'], style: 'steps', cues: evenCues(4) },
    },
    {
      id: 'kinds',
      priority: 0.7,
      narration: 'Clouds, haze, and dust all scatter every color at once, which is why the sky turns pale instead of deep blue.',
      visual: { kind: 'steps', heading: 'What whitens the sky', items: ['Clouds', 'Haze', 'Dust'], style: 'kinds', cues: evenCues(3) },
    },
    ...Array.from({ length: extraPoints }, (_, k) => extraPoint(k)),
    {
      id: 'outro',
      priority: 1,
      narration: 'In short, the sky is blue because air scatters blue light most, and the same effect paints sunsets red.',
      visual: { kind: 'outro', summary: 'Blue scatters most, so the sky is blue', tags: ['Scattering', 'Sunlight', 'Wavelength'] },
    },
  ]
  return { title: TITLE, planner: 'rule-based', scenes, sources: [{ label: 'Wikipedia: Diffuse sky radiation' }] }
}

/** The fixture storyboard planned at the estimated narration pace, with no audio clips. */
export function fixturePlan(opts: FixtureOptions = {}): MotionPlan {
  const sb = fixtureStoryboard(opts)
  const tl = buildTimeline(sb, sb.scenes.map((s) => estimateSpeechMs(s.narration)))
  return buildPlan(sb, tl, [])
}
