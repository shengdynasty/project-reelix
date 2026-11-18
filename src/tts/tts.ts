import type { FromWorker, ToWorker } from './protocol'
import { getClip, putClip } from './cache'
import { speakable } from './speakable'
import { splitSentences } from '../input/parseText'

export interface Clip {
  samples: Float32Array
  sampleRate: number
  durationMs: number
}

export const VOICES = [
  { id: 'af_heart', label: 'Heart', note: 'warm, US' },
  { id: 'af_bella', label: 'Bella', note: 'bright, US' },
  { id: 'am_michael', label: 'Michael', note: 'calm, US' },
  { id: 'am_fenrir', label: 'Fenrir', note: 'deep, US' },
  { id: 'bf_emma', label: 'Emma', note: 'clear, UK' },
  { id: 'bm_george', label: 'George', note: 'steady, UK' },
] as const

export type LoadState =
  | { phase: 'idle' }
  | { phase: 'loading'; loaded: number; total: number }
  | { phase: 'ready' }
  | { phase: 'error'; message: string }

type Listener = (s: LoadState) => void

interface Job {
  id: number
  text: string
  voice: string
  speed: number
  resolve: (c: Clip) => void
  reject: (e: Error) => void
}

interface Slot {
  worker: Worker
  ready: boolean
  busy: Job | null
}

/**
 * How many voice workers to run. One single threaded worker needs about 2.4 seconds of CPU per second of speech,
 * so machines with spare cores and memory synthesize several sentences at once.
 */
/** Hidden overrides for benchmarking: ?pool=1&threads=2 */
function override(name: string): number | null {
  try {
    const v = Number(new URLSearchParams(location.search).get(name))
    return Number.isInteger(v) && v > 0 && v <= 16 ? v : null
  } catch {
    return null
  }
}

function poolSize(): number {
  const forced = override('pool')
  if (forced) return forced
  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  // Each worker holds its own copy of the model (a few hundred MB once running).
  const byMemory = mem < 4 ? 1 : mem < 8 ? 2 : 4
  const byCores = cores >= 12 ? 4 : cores >= 8 ? 3 : cores >= 6 ? 2 : 1
  return Math.min(byMemory, byCores)
}

/** Main thread client for a small pool of Kokoro workers. One instance per page. */
class TtsClient {
  private slots: Slot[] = []
  private queue: Job[] = []
  private nextId = 1
  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null
  private readyReject: ((e: Error) => void) | null = null
  private listeners = new Set<Listener>()
  private size = 1
  state: LoadState = { phase: 'idle' }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.state)
    return () => this.listeners.delete(fn)
  }

  private set(s: LoadState) {
    this.state = s
    for (const fn of this.listeners) fn(s)
  }

  private spawn(): Slot {
    const worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' })
    const slot: Slot = { worker, ready: false, busy: null }
    worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(slot, e.data)
    worker.onerror = (e) => this.fail(slot, e.message || 'The voice engine could not start in this browser.')
    worker.postMessage({ type: 'load', threads: override('threads') ?? 1 } satisfies ToWorker)
    this.slots.push(slot)
    return slot
  }

  private fail(slot: Slot, message: string) {
    const first = this.slots[0] === slot
    if (slot.busy) {
      slot.busy.reject(new Error(message))
      slot.busy = null
    }
    slot.worker.terminate()
    this.slots = this.slots.filter((s) => s !== slot)
    if (first && this.state.phase !== 'ready') {
      this.readyPromise = null
      this.set({ phase: 'error', message })
      this.readyReject?.(new Error(message))
      for (const j of this.queue) j.reject(new Error(message))
      this.queue = []
    } else this.pump()
  }

  private onMessage(slot: Slot, msg: FromWorker) {
    if (msg.type === 'log') console.info(msg.message)
    else if (msg.type === 'progress') {
      if (this.state.phase !== 'ready') this.set({ phase: 'loading', loaded: msg.loaded, total: msg.total })
    } else if (msg.type === 'ready') {
      slot.ready = true
      if (this.state.phase !== 'ready') {
        this.set({ phase: 'ready' })
        this.readyResolve?.()
        // The model is now in the browser cache, so the helpers load without downloading it again.
        while (this.slots.length < this.size) this.spawn()
      }
      this.pump()
    } else if (msg.type === 'audio') {
      const job = slot.busy
      slot.busy = null
      if (job && job.id === msg.id) job.resolve({ samples: msg.samples, sampleRate: msg.sampleRate, durationMs: (msg.samples.length / msg.sampleRate) * 1000 })
      this.pump()
    } else if (msg.type === 'error') {
      if (msg.id !== undefined && slot.busy?.id === msg.id) {
        const job = slot.busy
        slot.busy = null
        job.reject(new Error(msg.message))
        this.pump()
      } else this.fail(slot, msg.message)
    }
  }

  private pump() {
    for (const slot of this.slots) {
      if (!slot.ready || slot.busy || !this.queue.length) continue
      // Longest job first keeps all workers busy until the end.
      let pick = 0
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].text.length > this.queue[pick].text.length) pick = i
      const job = this.queue.splice(pick, 1)[0]
      slot.busy = job
      slot.worker.postMessage({ type: 'speak', id: job.id, text: job.text, voice: job.voice, speed: job.speed } satisfies ToWorker)
    }
  }

  /** Ends every worker (each holds its own copy of the model); the next load or speak starts a new pool. */
  release() {
    const released = new Error('The voice engine was released.')
    for (const slot of this.slots) {
      slot.busy?.reject(released)
      slot.worker.terminate()
    }
    for (const job of this.queue) job.reject(released)
    this.slots = []
    this.queue = []
    this.readyPromise = null
    this.readyResolve = null
    this.readyReject = null
    this.set({ phase: 'idle' })
  }

  /** Downloads the model once (cached by the browser afterwards). */
  load(): Promise<void> {
    if (this.state.phase === 'ready') return Promise.resolve()
    if (!this.readyPromise) {
      this.readyPromise = new Promise<void>((resolve, reject) => {
        this.readyResolve = resolve
        this.readyReject = reject
      })
      this.size = poolSize()
      this.set({ phase: 'loading', loaded: 0, total: 0 })
      if (!this.slots.length) this.spawn()
    }
    return this.readyPromise
  }

  /** Narrates text sentence by sentence (in parallel across workers) and joins the clips with short pauses. */
  async speak(text: string, voice: string, speed = 1): Promise<Clip> {
    const parts = ttsParts(text)
    const clips = await Promise.all(parts.map((p) => this.speakPart(p, voice, speed)))
    return joinClips(clips, SENTENCE_GAP_MS)
  }

  private async speakPart(text: string, voice: string, speed: number): Promise<Clip> {
    const spoken = speakable(text)
    const key = `${voice}|${speed}|${spoken}`
    const cached = await getClip(key)
    if (cached) return { ...cached, durationMs: (cached.samples.length / cached.sampleRate) * 1000 }
    await this.load()
    const clip = await new Promise<Clip>((resolve, reject) => {
      this.queue.push({ id: this.nextId++, text: spoken, voice, speed, resolve, reject })
      this.pump()
    })
    const trimmed = trimSilence(clip)
    void putClip(key, trimmed)
    return trimmed
  }

  /** True when a clip for this text is already cached, so the model download can be skipped. */
  async has(text: string, voice: string, speed = 1): Promise<boolean> {
    const hits = await Promise.all(ttsParts(text).map((p) => getClip(`${voice}|${speed}|${speakable(p)}`)))
    return hits.every((h) => h !== null)
  }
}

const SENTENCE_GAP_MS = 220

/** Sentences, with very long ones split at a clause break, so work spreads evenly across workers. */
function ttsParts(text: string): string[] {
  const sentences = splitSentences(text.trim())
  const out: string[] = []
  for (const s of sentences.length ? sentences : [text]) {
    const words = s.split(/\s+/)
    if (words.length <= 28) { out.push(s); continue }
    const mid = Math.floor(words.length / 2)
    let cut = -1
    for (let d = 0; d < mid - 4; d++) {
      for (const i of [mid + d, mid - d]) if (cut < 0 && /[,;:]$/.test(words[i] ?? '')) cut = i
    }
    if (cut < 0) { out.push(s); continue }
    out.push(words.slice(0, cut + 1).join(' '), words.slice(cut + 1).join(' '))
  }
  return out.filter((p) => /[A-Za-z0-9]/.test(p))
}

function joinClips(clips: Clip[], gapMs: number): Clip {
  if (clips.length === 1) return clips[0]
  const rate = clips[0].sampleRate
  const gap = Math.round((rate * gapMs) / 1000)
  const length = clips.reduce((a, c) => a + c.samples.length, 0) + gap * (clips.length - 1)
  const samples = new Float32Array(length)
  let at = 0
  clips.forEach((c, i) => {
    samples.set(c.samples, at)
    at += c.samples.length + (i < clips.length - 1 ? gap : 0)
  })
  return { samples, sampleRate: rate, durationMs: (length / rate) * 1000 }
}

/** Kokoro pads clips with silence; trimming keeps scene timing tight. */
function trimSilence(clip: Clip): Clip {
  const s = clip.samples
  const threshold = 0.004
  let a = 0
  let b = s.length - 1
  while (a < b && Math.abs(s[a]) < threshold) a++
  while (b > a && Math.abs(s[b]) < threshold) b--
  const pad = Math.round(clip.sampleRate * 0.04)
  const samples = s.slice(Math.max(0, a - pad), Math.min(s.length, b + pad))
  return { samples, sampleRate: clip.sampleRate, durationMs: (samples.length / clip.sampleRate) * 1000 }
}

export const tts = new TtsClient()

/** Frees the voice workers' memory (a few hundred MB each) once every clip is recorded; the next narration starts new ones. */
export function releaseVoiceWorkers(): void {
  tts.release()
}
