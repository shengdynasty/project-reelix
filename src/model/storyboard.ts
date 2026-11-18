import { z } from 'zod'

/** Display unit for a number: "$" + 4.2M + "%" etc. `word` is a trailing unit word such as "hours". */
export const UnitSchema = z.object({
  prefix: z.string(),
  suffix: z.string(),
  word: z.string(),
})
export type Unit = z.infer<typeof UnitSchema>
export const NO_UNIT: Unit = { prefix: '', suffix: '', word: '' }

export const ChartKindSchema = z.enum(['bar', 'line', 'pie'])
export type ChartKind = z.infer<typeof ChartKindSchema>

/** A parsed table or a series detected in prose. Categories run along x (or around the pie). */
export const DataSeriesSchema = z.object({
  title: z.string(),
  xLabel: z.string(),
  categories: z.array(z.string()).min(1),
  series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).min(1),
  unit: UnitSchema,
  chart: ChartKindSchema,
  temporal: z.boolean(),
})
export type DataSeries = z.infer<typeof DataSeriesSchema>

const TitleVisual = z.object({ kind: z.literal('title'), title: z.string(), subtitle: z.string() })
const BulletsVisual = z.object({
  kind: z.literal('bullets'),
  eyebrow: z.string(),
  heading: z.string(),
  items: z.array(z.string()).min(1).max(4),
  /** Fraction (0..1) of the narration at which each item appears, so items land as they are spoken. */
  cues: z.array(z.number()),
})
const StatVisual = z.object({
  kind: z.literal('stat'),
  value: z.number(),
  decimals: z.number(),
  unit: UnitSchema,
  label: z.string(),
  from: z.number().nullable(),
})
const ChartVisual = z.object({
  kind: z.literal('chart'),
  data: DataSeriesSchema,
  highlight: z.number().nullable(),
})
const ImageVisual = z.object({ kind: z.literal('image'), imageId: z.string(), caption: z.string() })
const CompareVisual = z.object({
  kind: z.literal('compare'),
  unit: UnitSchema,
  decimals: z.number(),
  left: z.object({ label: z.string(), value: z.number() }),
  right: z.object({ label: z.string(), value: z.number() }),
})
/** "A vaccine is a biological preparation that..." shown as the term over its meaning. */
const DefinitionVisual = z.object({
  kind: z.literal('definition'),
  term: z.string(),
  /** Connecting verb as written: "is", "are", "refers to". */
  link: z.string(),
  meaning: z.string(),
})
/** Dated events in order. `cues` say when each one is spoken. */
const TimelineVisual = z.object({
  kind: z.literal('timeline'),
  heading: z.string(),
  events: z.array(z.object({ when: z.string(), label: z.string() })).min(2).max(6),
  cues: z.array(z.number()),
})
/** A process or a set of kinds, shown as numbered steps joined by arrows. */
const StepsVisual = z.object({
  kind: z.literal('steps'),
  heading: z.string(),
  items: z.array(z.string()).min(2).max(5),
  /** "steps" draws arrows between items; "kinds" lays them out as a group. */
  style: z.enum(['steps', 'kinds']),
  cues: z.array(z.number()),
})
/** A short closing line, not a recap of every scene. */
const OutroVisual = z.object({
  kind: z.literal('outro'),
  summary: z.string(),
  tags: z.array(z.string()).max(3),
})

export const VisualSchema = z.discriminatedUnion('kind', [
  TitleVisual,
  BulletsVisual,
  StatVisual,
  ChartVisual,
  ImageVisual,
  CompareVisual,
  DefinitionVisual,
  TimelineVisual,
  StepsVisual,
  OutroVisual,
])
export type Visual = z.infer<typeof VisualSchema>
export type VisualKind = Visual['kind']
export type VisualOf<K extends VisualKind> = Extract<Visual, { kind: K }>

export const SceneSchema = z.object({
  id: z.string(),
  narration: z.string(),
  visual: VisualSchema,
  /** 0..1. When the narration runs past 60 s the lowest priority body scenes are skipped first. */
  priority: z.number(),
  /** An online photo the 3D piece shows as its hero, with the credit line drawn while it is on screen. */
  photo: z.object({ imageId: z.string(), credit: z.string() }).optional(),
})
export type Scene = z.infer<typeof SceneSchema>

export const StoryboardSchema = z.object({
  title: z.string(),
  planner: z.enum(['rule-based', 'ollama']),
  scenes: z.array(SceneSchema).min(1),
  /** Where the content came from, shown under the player and on the end card. */
  sources: z.array(z.object({ label: z.string(), url: z.string().optional() })),
})
export type Storyboard = z.infer<typeof StoryboardSchema>

let counter = 0
export function sceneId(): string {
  counter += 1
  return `s${Date.now().toString(36)}${counter}`
}

export function countWords(text: string): number {
  const m = text.trim().match(/\S+/g)
  return m ? m.length : 0
}

export const KIND_LABEL: Record<VisualKind, string> = {
  title: 'Title',
  bullets: 'Key points',
  stat: 'Big number',
  chart: 'Chart',
  image: 'Image',
  compare: 'Comparison',
  definition: 'Definition',
  timeline: 'Timeline',
  steps: 'Steps',
  outro: 'In short',
}
