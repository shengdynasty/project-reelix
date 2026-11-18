import './cached-fetch'
// Prints storyboards for short topics, fetched live from Wikipedia: `npx tsx scripts/plan-topics.ts "black holes" quick`
import { lookupTopic } from '../src/ingest/wiki'
import { textToDoc } from '../src/ingest/text'
import { planRuleBased } from '../src/planner/ruleBased'
import type { Detail } from '../src/planner/ruleBased'
import type { Corpus } from '../src/ingest/types'
import { countWords } from '../src/model/storyboard'

async function wikiCorpus(q: string): Promise<Corpus> {
  const wiki = await lookupTopic(q)
  if (!wiki) throw new Error('nothing found')
  return { docs: [wiki.doc], tables: [], images: [], sources: [{ label: `Wikipedia: ${wiki.title}`, url: wiki.url }], warnings: [] }
}

const [q = 'how do vaccines work?', detail = 'standard'] = process.argv.slice(2)
const corpus = q.startsWith('notes:') ? { docs: [textToDoc('Your notes', q.slice(6), 'notes').doc], tables: [], images: [], sources: [{ label: 'Your notes' }], warnings: [] } : await wikiCorpus(q)
const sb = planRuleBased({ prompt: q.startsWith('notes:') ? '' : q, corpus, detail: detail as Detail })
const words = sb.scenes.reduce((a, s) => a + countWords(s.narration), 0)
console.log(`=== "${sb.title}" ${detail}: ${sb.scenes.length} scenes, ${words} words (~${Math.round(words / 2.6)} s)  sources: ${sb.sources.map((s) => s.label).join(', ')}`)
for (const s of sb.scenes) {
  const { kind, ...rest } = s.visual
  console.log(`- [${kind}] "${s.narration}"\n    ${JSON.stringify(rest, (k, v) => (k === 'cues' ? undefined : k === 'data' ? v.title : v)).slice(0, 260)}`)
}
