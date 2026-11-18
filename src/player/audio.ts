import type { MotionPlan } from '../motion/plan'
import type { Clip } from '../tts/tts'
import { createMusic } from '../audio/music'
import { scheduleSfx } from '../audio/sfx'

export const MASTER_RATE = 48_000

export interface MixOptions {
  voice: boolean
  music: boolean
}

/**
 * Renders the whole soundtrack offline: narration, a music bed that ducks under the voice, and sound effects,
 * through a gentle compressor. 48 kHz stereo, the rate AAC and Opus encoders accept everywhere.
 */
export async function buildMasterAudio(plan: MotionPlan, clips: (Clip | undefined)[], opts: MixOptions): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil((plan.total / 1000) * MASTER_RATE))
  const ctx = new OfflineAudioContext(2, length, MASTER_RATE)
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -12
  comp.knee.value = 8
  comp.ratio.value = 4
  comp.attack.value = 0.004
  comp.release.value = 0.25
  const master = ctx.createGain()
  master.gain.value = 0.92
  comp.connect(master).connect(ctx.destination)

  if (opts.voice) {
    const voice = ctx.createGain()
    voice.gain.value = 1
    voice.connect(comp)
    plan.timeline.scenes.forEach((st, i) => {
      const clip = clips[i]
      if (!st.included || !clip) return
      const buf = ctx.createBuffer(1, clip.samples.length, clip.sampleRate)
      buf.copyToChannel(clip.samples as Float32Array<ArrayBuffer>, 0)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(voice)
      src.start(st.speechStart / 1000)
    })
  }

  if (opts.music) {
    const music = ctx.createGain()
    const base = opts.voice ? 1.8 : 2
    const ducked = 0.62
    music.gain.setValueAtTime(base, 0)
    // Duck under each spoken stretch, with short ramps either side.
    if (opts.voice) {
      for (const w of plan.speech) {
        const a = w.start / 1000
        const b = w.end / 1000
        music.gain.setTargetAtTime(ducked, Math.max(0, a - 0.15), 0.06)
        music.gain.setTargetAtTime(base, b + 0.1, 0.25)
      }
    }
    // Fade out over the last second and a half.
    const end = plan.total / 1000
    music.gain.setTargetAtTime(0.0001, Math.max(0, end - 1.5), 0.4)
    music.connect(comp)
    const bars = createMusic(ctx, plan, music)

    const fx = ctx.createGain()
    fx.gain.value = 0.9
    fx.connect(comp)
    const schedule = (from: number, to: number) => {
      bars(from, to)
      scheduleSfx(ctx, plan.sfx.filter((e) => e.t / 1000 >= from && e.t / 1000 < to), fx)
    }

    // Every pending note is processed on every block until it plays, so a graph holding the whole video's
    // notes renders several times slower. Pausing the render every few seconds to add the next stretch keeps
    // the graph small. Browsers without OfflineAudioContext.suspend get everything up front.
    if (typeof ctx.suspend === 'function') {
      const STEP = 6
      schedule(0, STEP)
      for (let t = STEP; t < end; t += STEP) {
        const from = t
        const to = t + STEP >= end ? Infinity : t + STEP
        ctx
          .suspend(Math.max(0, from - 0.25))
          .then(() => {
            schedule(from, to)
            return ctx.resume()
          })
          .catch(() => schedule(from, to))
      }
    } else {
      schedule(0, Infinity)
    }
  }
  return ctx.startRendering()
}
