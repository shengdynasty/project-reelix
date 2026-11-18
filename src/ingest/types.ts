import type { DataSeries } from '../model/storyboard'

/** A heading with the text under it. `level` 1 is a top section; deeper levels are subsections. */
export interface Section {
  heading: string
  level: number
  paragraphs: string[]
  items: string[]
  /** True when `items` came from a numbered list, which reads as a sequence. */
  ordered: boolean
}

export type DocKind = 'notes' | 'text' | 'pdf' | 'docx' | 'pptx' | 'odf' | 'sheet' | 'image' | 'wiki'

export interface Doc {
  name: string
  kind: DocKind
  title?: string
  sections: Section[]
}

export interface IngestedImage {
  id: string
  name: string
  caption: string
  bitmap: ImageBitmap
  /** Where an online photo came from, which keys its cached depth map. */
  url?: string
}

export interface Source {
  label: string
  url?: string
}

/** Everything the planner gets: documents, tables and images from all inputs. */
export interface Corpus {
  docs: Doc[]
  tables: DataSeries[]
  images: IngestedImage[]
  sources: Source[]
  warnings: string[]
  /** The Wikipedia article title the text was filled in from, if any. */
  article?: string
}

export function newSection(heading = '', level = 1): Section {
  return { heading, level, paragraphs: [], items: [], ordered: false }
}

export function docWords(d: Doc): number {
  return d.sections.reduce((a, s) => a + [s.heading, ...s.paragraphs, ...s.items].join(' ').split(/\s+/).filter(Boolean).length, 0)
}

export function corpusWords(c: Corpus): number {
  return c.docs.reduce((a, d) => a + docWords(d), 0)
}

/** Words in file names that describe the file, not the topic. */
const FILE_WORDS = /\b(slides?|deck|presentation|diagram|chart|graph|figure|fig|image|img|photo|picture|pic|screenshot|screen shot|scan|scanned|notes?|lecture|lesson|worksheet|handout|homework|assignment|final|draft|copy|version|edited|new|untitled|document|doc|file|v\d+)\b/gi

/** "lab-results_2024 FINAL.pdf" -> "Lab results 2024"; "mitochondria-slide.png" -> "Mitochondria" */
export function cleanName(file: string): string {
  const base = file.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
  const lower = base === base.toUpperCase() ? base.toLowerCase() : base
  const topical = lower.replace(FILE_WORDS, ' ').replace(/\s+/g, ' ').trim()
  const out = topical.length >= 3 ? topical : lower
  return out ? out[0].toUpperCase() + out.slice(1) : file
}

/** The subject of an opening "X is a ..." sentence, if the document starts with one. */
export function definedSubject(d: Doc): string {
  const first = d.sections.flatMap((s) => s.paragraphs)[0] ?? ''
  const m = first.match(/^(?:(?:the|an?)\s+)?([A-Z][\w'’ -]{2,40}?)\s+(?:is|are|was|were|refers to)\s/i)
  return m && m[1].split(/\s+/).length <= 5 ? m[1].trim() : ''
}
