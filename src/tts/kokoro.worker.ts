/// <reference lib="webworker" />
// Runs Kokoro 82M (Apache 2.0) entirely in the browser. The quantized model (about 90 MB) and the ONNX runtime
// come from public CDNs (Hugging Face and jsDelivr) with no key, and the browser caches them after the first load.
import { KokoroTTS } from 'kokoro-js'
import { env as hfEnv } from '@huggingface/transformers'
import type { FromWorker, ToWorker } from './protocol'

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const ctx = self as unknown as DedicatedWorkerGlobalScope
let loading: Promise<KokoroTTS> | null = null
const files = new Map<string, { loaded: number; total: number }>()

function post(msg: FromWorker, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer)
}

function load(threads = 0): Promise<KokoroTTS> {
  if (!loading) {
    // One thread per worker; parallelism comes from running several workers. Multi threaded WebAssembly
    // stalled between runs in the production bundle, while single threaded workers are steady everywhere.
    const wasm = (hfEnv.backends.onnx as { wasm?: { numThreads?: number } }).wasm
    if (wasm) wasm.numThreads = Math.max(1, threads)
    loading = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: unknown) => {
        const e = p as { status?: string; file?: string; loaded?: number; total?: number }
        if (e.status === 'progress' && e.file && e.total) {
          files.set(e.file, { loaded: e.loaded ?? 0, total: e.total })
          let loaded = 0
          let total = 0
          for (const f of files.values()) { loaded += f.loaded; total += f.total }
          post({ type: 'progress', loaded, total })
        }
      },
    }).then(async (tts) => {
      // The first inference runs unoptimized WebAssembly while V8 recompiles the hot code in the background.
      // A tiny warm-up phrase starts that recompile before real work arrives.
      const t0 = performance.now()
      await tts.generate('Hi there.', { voice: 'af_heart' }).catch(() => null)
      if (import.meta.env.DEV) post({ type: 'log', message: `[kokoro] warm up ${(performance.now() - t0).toFixed(0)} ms` })
      post({ type: 'ready', device: 'wasm' })
      return tts
    })
    loading.catch((err) => {
      loading = null
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    })
  }
  return loading
}

ctx.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data
  if (msg.type === 'load') {
    load(msg.threads).catch(() => {})
    return
  }
  if (msg.type === 'speak') {
    try {
      const tts = await load()
      const t0 = performance.now()
      const audio = await tts.generate(msg.text, { voice: msg.voice as never, speed: msg.speed })
      const samples = new Float32Array(audio.audio)
      const wasm = (hfEnv.backends.onnx as { wasm?: { numThreads?: number } }).wasm
      if (import.meta.env.DEV) post({ type: 'log', message: `[kokoro] ${(performance.now() - t0).toFixed(0)} ms for ${(samples.length / audio.sampling_rate).toFixed(1)} s audio, threads=${wasm?.numThreads}` })
      post({ type: 'audio', id: msg.id, samples, sampleRate: audio.sampling_rate }, [samples.buffer])
    } catch (err) {
      post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
    }
  }
}
