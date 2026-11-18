import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny'
import type { AudioCodec, VideoCodec } from 'mediabunny'
import type { MotionPlan } from '../motion/plan'
import { renderFrame } from '../render/renderFrame'
import type { RenderOptions } from '../render/renderFrame'
import { H, W } from '../render/env'
import { MASTER_RATE } from '../player/audio'
import { createStageHandle, type StageHandle } from '../stage/handle'
import type { Tier } from '../stage/tiers'

export interface ExportResult {
  blob: Blob
  ext: 'mp4' | 'webm'
  method: 'webcodecs' | 'recorder'
  /** Shown with the saved file, for example when it was finished with 2D visuals. */
  note?: string
}

export interface ExportJob {
  plan: MotionPlan
  audio: AudioBuffer | null
  options: RenderOptions
  fps?: number
  /** The preview's 3D tier; with a stage in `options` the export renders its own 1920x1080 stage, every effect on high. */
  tier?: Tier
  onProgress: (p: number) => void
  signal?: AbortSignal
}

/** How long a saved video waits for a lost graphics context to come back before it finishes in 2D. */
const RESTORE_WAIT_MS = 2000
const LOST_NOTE = 'Saved with 2D visuals because the graphics context was lost.'

/** True once `stage` has its context back, false if RESTORE_WAIT_MS pass first. */
async function restored(stage: StageHandle): Promise<boolean> {
  const until = performance.now() + RESTORE_WAIT_MS
  while (stage.lost && performance.now() < until) await new Promise((r) => setTimeout(r, 50))
  return !stage.lost
}

type Plan = { format: 'mp4' | 'webm'; video: VideoCodec; audio: AudioCodec | null }

async function pickCodecs(withAudio: boolean): Promise<Plan | null> {
  if (typeof VideoEncoder === 'undefined') return null
  const size = { width: W, height: H }
  const audioOpts = { numberOfChannels: 2, sampleRate: MASTER_RATE }
  // MP4 with H.264 and AAC plays everywhere (QuickTime, phones, social apps). WebM is the fallback.
  const mp4Video = await getFirstEncodableVideoCodec(['avc'], size)
  const mp4Audio = withAudio ? await getFirstEncodableAudioCodec(['aac'], audioOpts) : null
  if (mp4Video && (!withAudio || mp4Audio)) return { format: 'mp4', video: mp4Video, audio: mp4Audio }
  const webmVideo = await getFirstEncodableVideoCodec(['vp9', 'vp8', 'av1'], size)
  const webmAudio = withAudio ? await getFirstEncodableAudioCodec(['opus'], audioOpts) : null
  if (webmVideo && (!withAudio || webmAudio)) return { format: 'webm', video: webmVideo, audio: webmAudio }
  return null
}

function sliceAudio(buf: AudioBuffer, startSec: number, endSec: number): AudioBuffer | null {
  const a = Math.floor(startSec * buf.sampleRate)
  const b = Math.min(buf.length, Math.floor(endSec * buf.sampleRate))
  if (b <= a) return null
  const out = new AudioBuffer({ length: b - a, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate })
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(a, b), c)
  return out
}

/**
 * Renders every frame offline and encodes with WebCodecs, so the file is exact and does not depend
 * on playback speed. Falls back to real time MediaRecorder capture where WebCodecs is missing.
 */
export async function exportVideo(job: ExportJob): Promise<ExportResult> {
  const fps = job.fps ?? 30
  const plan = await pickCodecs(!!job.audio)
  if (!plan) return recordRealtime(job)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })!

  const output = new Output({
    format: plan.format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  })
  const video = new CanvasSource(canvas, { codec: plan.video, quality: QUALITY_HIGH, keyFrameInterval: 2 })
  output.addVideoTrack(video, { frameRate: fps })
  let audio: AudioBufferSource | null = null
  if (job.audio && plan.audio) {
    audio = new AudioBufferSource({ codec: plan.audio, quality: QUALITY_HIGH })
    output.addAudioTrack(audio)
  }
  await output.start()

  const totalSec = job.plan.total / 1000
  const frames = Math.ceil(totalSec * fps)
  let audioSent = 0
  // The preview's stage belongs to the preview; a 3D video gets a stage of its own at full size.
  let stage = job.options.stage ? await createStageHandle('export', { width: W, height: H }, { tier: job.tier }) : null
  if (import.meta.env.DEV) (window as unknown as { __exportStage: StageHandle | null }).__exportStage = stage
  let options: RenderOptions = { ...job.options, stage }
  let note: string | undefined
  try {
    for (let f = 0; f < frames; f++) {
      if (job.signal?.aborted) throw new DOMException('Export canceled', 'AbortError')
      const ts = f / fps
      // Feed audio about a second ahead so the muxer can interleave.
      if (audio && job.audio) {
        while (audioSent < Math.min(totalSec, ts + 1)) {
          const next = Math.min(totalSec, audioSent + 1)
          const chunk = sliceAudio(job.audio, audioSent, next)
          if (chunk) await audio.add(chunk)
          audioSent = next
        }
      }
      if (stage?.lost && !(await restored(stage))) {
        stage.dispose()
        stage = null
        options = { ...job.options, stage: null }
        note = LOST_NOTE
      }
      renderFrame(ctx, job.plan, ts * 1000, options, stage ? stage.samplesAt(job.plan, ts * 1000, options) : 1)
      await video.add(ts, 1 / fps)
      if (f % 6 === 0) job.onProgress(f / frames)
    }
    if (audio && job.audio && audioSent < totalSec) {
      const chunk = sliceAudio(job.audio, audioSent, totalSec)
      if (chunk) await audio.add(chunk)
    }
    await output.finalize()
  } catch (err) {
    await output.cancel().catch(() => {})
    throw err
  } finally {
    stage?.dispose()
  }
  job.onProgress(1)
  const buffer = (output.target as BufferTarget).buffer!
  return {
    blob: new Blob([buffer], { type: plan.format === 'mp4' ? 'video/mp4' : 'video/webm' }),
    ext: plan.format,
    method: 'webcodecs',
    note,
  }
}

/** Last resort for browsers without WebCodecs: play the video once into a MediaRecorder. */
async function recordRealtime(job: ExportJob): Promise<ExportResult> {
  if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record video. Try a recent Chrome, Edge, Safari or Firefox.')
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })!
  const stream = canvas.captureStream(30)
  let audioCtx: AudioContext | null = null
  if (job.audio) {
    audioCtx = new AudioContext({ sampleRate: job.audio.sampleRate })
    const dest = audioCtx.createMediaStreamDestination()
    const src = audioCtx.createBufferSource()
    src.buffer = job.audio
    src.connect(dest)
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr))
    src.start()
  }
  const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()))
  rec.start(1000)
  const t0 = audioCtx ? audioCtx.currentTime * 1000 : performance.now()
  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (job.signal?.aborted) return reject(new DOMException('Export canceled', 'AbortError'))
      const now = (audioCtx ? audioCtx.currentTime * 1000 : performance.now()) - t0
      renderFrame(ctx, job.plan, Math.min(now, job.plan.total), job.options)
      job.onProgress(now / job.plan.total)
      if (now >= job.plan.total) return resolve()
      requestAnimationFrame(tick)
    }
    tick()
  }).finally(() => {
    rec.stop()
    void audioCtx?.close()
  })
  await done
  const isMp4 = mime.startsWith('video/mp4')
  return { blob: new Blob(chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' }), ext: isMp4 ? 'mp4' : 'webm', method: 'recorder' }
}
