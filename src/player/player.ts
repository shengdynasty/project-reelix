import type { MotionPlan } from '../motion/plan'
import { renderFrame } from '../render/renderFrame'
import type { RenderOptions } from '../render/renderFrame'

const POSTER_MS = 2600

export interface PlayerMedia {
  plan: MotionPlan
  audio: AudioBuffer | null
}

/**
 * Drives the preview canvas with requestAnimationFrame. With audio, the AudioContext clock is the
 * source of truth so picture and narration stay in sync.
 */
export class Player {
  private ctx2d: CanvasRenderingContext2D
  private media: PlayerMedia | null = null
  private options: RenderOptions
  private audioCtx: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private raf = 0
  private playing = false
  private startedAt = 0
  private perfStartedAt = 0
  private offset = 0
  private onTime: (t: number, playing: boolean) => void

  constructor(canvas: HTMLCanvasElement, options: RenderOptions, onTime: (t: number, playing: boolean) => void) {
    this.ctx2d = canvas.getContext('2d')!
    this.options = options
    this.onTime = onTime
  }

  get duration(): number {
    return this.media?.plan.total ?? 0
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get time(): number {
    if (!this.playing) return this.offset
    // The audio clock keeps picture and sound locked. If the browser has not let audio start, use the system clock.
    if (this.audioCtx && this.media?.audio && this.audioCtx.state === 'running') {
      return Math.min(this.duration, this.audioCtx.currentTime * 1000 - this.startedAt)
    }
    return Math.min(this.duration, performance.now() - this.perfStartedAt)
  }

  setMedia(media: PlayerMedia | null, keepTime = true) {
    const t = keepTime ? Math.min(this.time, media?.plan.total ?? 0) : 0
    const wasPlaying = this.playing
    this.stopSource()
    this.playing = false
    this.media = media
    this.offset = t
    if (wasPlaying && media) this.play()
    else this.draw()
  }

  setOptions(options: RenderOptions) {
    this.options = options
    if (!this.playing) this.draw()
  }

  play() {
    if (!this.media) return
    if (this.offset >= this.duration - 50) this.offset = 0
    this.perfStartedAt = performance.now() - this.offset
    if (this.media.audio) {
      this.audioCtx ??= new AudioContext()
      void this.audioCtx.resume()
      const src = this.audioCtx.createBufferSource()
      src.buffer = this.media.audio
      src.connect(this.audioCtx.destination)
      src.start(0, this.offset / 1000)
      this.source = src
      this.startedAt = this.audioCtx.currentTime * 1000 - this.offset
    } else {
      this.startedAt = performance.now() - this.offset
    }
    this.playing = true
    this.loop()
  }

  pause() {
    if (!this.playing) return
    this.offset = this.time
    this.playing = false
    this.stopSource()
    cancelAnimationFrame(this.raf)
    this.draw()
  }

  toggle() {
    if (this.playing) this.pause()
    else this.play()
  }

  seek(t: number) {
    const was = this.playing
    if (was) this.pause()
    this.offset = Math.max(0, Math.min(this.duration, t))
    if (was) this.play()
    else this.draw()
  }

  destroy() {
    this.pause()
    void this.audioCtx?.close()
  }

  private stopSource() {
    try {
      this.source?.stop()
    } catch {
      // Already stopped.
    }
    this.source?.disconnect()
    this.source = null
  }

  private loop = () => {
    if (!this.playing) return
    const t = this.time
    this.drawAt(t)
    if (t >= this.duration) {
      this.playing = false
      this.offset = this.duration
      this.stopSource()
      this.onTime(this.offset, false)
      return
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  draw() {
    this.drawAt(this.offset)
  }

  private drawAt(t: number) {
    if (!this.media) {
      this.onTime(0, false)
      return
    }
    // Paused at the very start, show a poster frame once the title has animated in.
    const frameT = !this.playing && t === 0 ? Math.min(POSTER_MS, this.duration) : t
    renderFrame(this.ctx2d, this.media.plan, frameT, this.options)
    this.onTime(t, this.playing)
  }
}
