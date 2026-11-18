import { z } from 'zod'
import type { DataSeries, Scene, Storyboard } from '../model/storyboard'
import { countWords, sceneId } from '../model/storyboard'
import { compress, shortPhrase, ensurePeriod, splitSentences } from '../input/parseText'
import { tidySeries } from '../input/parseTable'
import { meaningfulStats, salientStats } from '../input/extractNumbers'
import { describeSeries } from './describe'
import { BUDGET, planRuleBased, statVisual } from './ruleBased'
import type { PlannerInput } from './ruleBased'

export const OLLAMA_URL = 'http://localhost:11434'

/**
 * Ollama only accepts requests from localhost pages by default, and probing localhost from a public site
 * can trigger a browser permission prompt. So local AI is offered only when the app itself runs on localhost.
 */
export function isLocalPage(): boolean {
  return typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
}

export async function detectOllama(timeoutMs = 1500): Promise<string[] | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const json = (await res.json()) as { models?: { name: string }[] }
    return (json.models ?? []).map((m) => m.name)
  } catch {
    return null
  }
}

/** Prefer small instruction models that answer in seconds. */
export function pickModel(models: string[]): string | null {
  const prefs = ['llama3.2', 'qwen3', 'qwen2.5', 'gemma3', 'llama3.1', 'mistral', 'phi4', 'phi3']
  for (const p of prefs) {
    const m = models.find((x) => x.startsWith(p))
    if (m) return m
  }
  return models[0] ?? null
}

/**
 * The JSON the model must produce. The caps matter: they bound the grammar, so a small model cannot loop
 * forever adding scenes or bullets.
 */
function planSchema(maxScenes: number) {
  return z.object({
    hook: z.string(),
    definition: z.object({ term: z.string(), link: z.string(), meaning: z.string() }).nullable(),
    scenes: z
      .array(
        z.object({
          type: z.enum(['point', 'stat', 'chart', 'image']),
          narration: z.string(),
          heading: z.string(),
          bullets: z.array(z.string()).max(3),
          ref: z.number().int(),
        }),
      )
      .min(1)
      .max(maxScenes),
    summary: z.string(),
    keyTerms: z.array(z.string()).max(3),
  })
}
const LlmPlan = planSchema(16)
type LlmPlan = z.infer<typeof LlmPlan>

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 0.005)

/** Strips list markers, quotes, links and markdown the model sometimes adds. */
function clean(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<?https?:\/\/\S+>?/g, ' ')
    .replace(/^[\s\-–—*•#>"'“”]+/, '')
    .replace(/["'“”\s]+$/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const LINK_VERB = /^(is|are|was|were|refers to|means|describes)$/i

/** "is" or "are" for a term, taken from how the source itself says it, so a stray word or URL never gets spoken. */
function linkFor(term: string, given: string, sourceText: string): string {
  const g = clean(given).toLowerCase()
  if (LINK_VERB.test(g)) return g
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const seen = sourceText.match(new RegExp(`\\b${esc}\\s+(is|are|was|were)\\b`, 'i'))
  if (seen) return seen[1].toLowerCase()
  return /[^siu]s$/i.test(term) ? 'are' : 'is'
}

/** A scene that only asks ("How do they work?") or only sums up ("In summary, ...") teaches nothing new. */
function emptyNarration(narration: string): boolean {
  if (/^(in summary|to summarize|to sum up|in conclusion|in short|overall|to recap|recap)\b/i.test(narration)) return true
  const sentences = splitSentences(narration)
  return sentences.length > 0 && sentences.every((x) => /\?\s*$/.test(x))
}

interface Assets {
  tables: DataSeries[]
  numbers: string[]
  sourceValues: number[]
  text: string
}

function assetsFor(input: PlannerInput): Assets {
  const { corpus } = input
  const tables = corpus.tables.map(tidySeries)
  const lines: string[] = []
  for (const d of corpus.docs) {
    for (const s of d.sections) {
      if (s.heading) lines.push(`## ${s.heading}`)
      lines.push(...s.paragraphs, ...s.items.map((i) => `- ${i}`))
    }
  }
  const text = lines.join('\n').slice(0, 7000)
  const sentences = corpus.docs.flatMap((d) => d.sections.flatMap((s) => s.paragraphs.flatMap((p) => splitSentences(p))))
  const numbers = sentences.filter((s) => meaningfulStats(s).length).slice(0, 8)
  const sourceValues = [...sentences.flatMap((s) => salientStats(s).map((st) => st.value)), ...tables.flatMap((t) => t.series.flatMap((x) => x.values))]
  return { tables, numbers, sourceValues, text }
}

export function buildPrompt(input: PlannerInput, a: Assets): string {
  const words = BUDGET[input.detail].words
  const charts = a.tables.length ? a.tables.map((t, i) => `[${i}] ${t.title} (${t.chart} chart). Fact: ${describeSeries(t).narration}`).join('\n') : '(none)'
  const numbers = a.numbers.length ? a.numbers.map((s, i) => `[${i}] ${s}`).join('\n') : '(none)'
  const images = input.corpus.images.length ? input.corpus.images.map((img, i) => `[${i}] ${img.caption || 'untitled image'}`).join('\n') : '(none)'
  return `Write the narration for a short animated video that helps someone understand a topic.

${input.prompt.trim() ? `THE VIEWER ASKED: "${input.prompt.trim()}"\n` : ''}SOURCE:
"""
${a.text || '(no text)'}
"""

CHARTS (use each exactly once as a "chart" scene, ref = its number):
${charts}

NUMBERS (a "stat" scene must use one of these, ref = its number):
${numbers}

IMAGES (use each at most once as an "image" scene, ref = its number):
${images}

RULES:
- Explain clearly, in plain spoken English, for someone new to the topic. Answer the viewer's question if there is one.
- hook: one short sentence that opens the video.
- definition: what the main thing is, as term, link ("is" or "are") and meaning, or null if there is nothing to define.
- Scenes in a logical order. Each narration is one or two sentences, at most 30 words, and states a fact.
- Never write a scene that only asks a question, and never a summary scene: the summary field covers that.
- No links, URLs or citations anywhere.
- Total spoken words about ${words}.
- "point" scenes: heading of at most 5 words and 2 or 3 bullets of at most 7 words, ref -1.
- Use only facts from the source. Never invent numbers.
- summary: one sentence of at most 16 words that sums up the idea. keyTerms: up to 3 single words or short terms.`
}

function toStoryboard(plan: LlmPlan, input: PlannerInput, a: Assets): Storyboard {
  const base = planRuleBased(input)
  const title = base.title
  const body: Scene[] = []
  const usedTables = new Set<number>()
  const usedImages = new Set<number>()
  const images = input.corpus.images
  const maxScenes = BUDGET[input.detail].scenes
  if (plan.definition?.term && clean(plan.definition.meaning)) {
    const term = clean(plan.definition.term)
    const link = linkFor(term, plan.definition.link, a.text)
    const meaning = clean(plan.definition.meaning).replace(new RegExp(`^(${LINK_VERB.source.slice(2, -2)})\\s+`, 'i'), '')
    const narration = ensurePeriod(`${term} ${link} ${meaning}`)
    body.push({ id: sceneId(), narration, priority: 1, visual: { kind: 'definition', term: shortPhrase(term, 5), link, meaning: shortPhrase(meaning, 16) } })
  }
  for (const s of plan.scenes.slice(0, maxScenes)) {
    const narration = compress(clean(s.narration), 40)
    if (countWords(narration) < 4 || emptyNarration(narration)) continue
    if (s.type === 'chart' && a.tables[s.ref] && !usedTables.has(s.ref)) {
      usedTables.add(s.ref)
      const d = a.tables[s.ref]
      body.push({ id: sceneId(), narration, priority: 1, visual: { kind: 'chart', data: d, highlight: describeSeries(d).highlight } })
      continue
    }
    if (s.type === 'image' && images[s.ref] && !usedImages.has(s.ref)) {
      usedImages.add(s.ref)
      body.push({ id: sceneId(), narration, priority: 1, visual: { kind: 'image', imageId: images[s.ref].id, caption: images[s.ref].caption } })
      continue
    }
    // A big number must be the one being spoken, and it must exist in the source.
    const spoken = salientStats(narration)
    if (spoken.length && spoken.every((st) => a.sourceValues.some((v) => near(v, st.value)))) {
      const visual = statVisual(narration)
      if (visual && s.type !== 'point') {
        body.push({ id: sceneId(), narration, priority: 0.8, visual })
        continue
      }
    }
    const items = (s.bullets.length ? s.bullets : [s.heading || narration]).slice(0, 3).map((b) => shortPhrase(clean(b), 8)).filter(Boolean)
    if (!items.length) continue
    body.push({
      id: sceneId(),
      narration,
      priority: 0.6,
      visual: { kind: 'bullets', eyebrow: items.length > 1 ? 'Key points' : 'Key point', heading: s.heading ? shortPhrase(clean(s.heading), 6) : '', items, cues: items.map((_, i) => (i / items.length) * 0.85) },
    })
  }
  // Charts the model skipped still get a scene.
  a.tables.forEach((d, i) => {
    if (usedTables.has(i)) return
    const { narration, highlight } = describeSeries(d)
    body.push({ id: sceneId(), narration, priority: 1, visual: { kind: 'chart', data: d, highlight } })
  })
  if (body.filter((b) => b.visual.kind !== 'definition').length < 2) throw new Error('the model returned too little to use')
  const titleScene = base.scenes[0]
  const summary = shortPhrase(clean(plan.summary), 16)
  const scenes: Scene[] = [{ ...titleScene, narration: ensurePeriod(clean(plan.hook) || titleScene.narration) }, ...body]
  if (summary) {
    scenes.push({
      id: sceneId(),
      narration: ensurePeriod(`In short, ${summary.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())}`),
      priority: 1,
      visual: { kind: 'outro', summary, tags: plan.keyTerms.map((k) => shortPhrase(clean(k), 3)).filter(Boolean).slice(0, 3) },
    })
  }
  return { title, planner: 'ollama', scenes, sources: input.corpus.sources }
}

/** Asks a local Ollama model for the script; falls back to the rule based planner on any failure. */
export async function planWithOllama(input: PlannerInput, model: string, signal?: AbortSignal): Promise<Storyboard> {
  const a = assetsFor(input)
  const { words, scenes } = BUDGET[input.detail]
  // A hard stop on time and length: a stuck model falls back to the built in planner instead of hanging.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error('it took too long')), 30000 + words * 300)
  const onAbort = () => ctrl.abort(signal?.reason)
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: z.toJSONSchema(planSchema(scenes + 1)),
        options: { temperature: 0.4, num_ctx: 8192, num_predict: words * 6 + 400 },
        messages: [
          { role: 'system', content: 'You write clear, accurate narration for short educational explainer videos. Reply with JSON only.' },
          { role: 'user', content: buildPrompt(input, a) },
        ],
      }),
    })
    if (!res.ok) throw new Error(`Ollama answered ${res.status}`)
    const json = (await res.json()) as { message?: { content?: string }; done_reason?: string }
    if (json.done_reason === 'length') throw new Error('the answer ran too long')
    const plan = LlmPlan.parse(JSON.parse(json.message?.content ?? '{}'))
    return toStoryboard(plan, input, a)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function planAuto(input: PlannerInput, model: string | null, signal?: AbortSignal): Promise<{ storyboard: Storyboard; note: string | null }> {
  if (!model) return { storyboard: planRuleBased(input), note: null }
  try {
    return { storyboard: await planWithOllama(input, model, signal), note: null }
  } catch (err) {
    if (signal?.aborted) throw err
    return { storyboard: planRuleBased(input), note: `Local AI failed (${err instanceof Error ? err.message : 'unknown error'}), so the built in planner wrote this.` }
  }
}
