import type { MotionPlan } from '../motion/plan'
import { env, midiHz, noiseSource } from './synth'

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// I, V, vi, IV in a major key.
const PROGRESSION: { root: number; minor: boolean }[] = [
  { root: 0, minor: false },
  { root: 7, minor: false },
  { root: 9, minor: true },
  { root: 5, minor: false },
]

/**
 * A light, upbeat explainer bed: pads, a plucked arpeggio through a delay, bass, soft kick, claps and hats.
 * Key and tempo come from the title, so each video sounds a little different but renders the same every time.
 * Sections follow the video: no drums under the title, full groove in the body, a held chord on the end card.
 *
 * Sets up the buses and returns a function that schedules the bars starting in a time window, so a long
 * render can add notes a few seconds ahead instead of holding every note of the video in the graph at once.
 */
export function createMusic(ctx: BaseAudioContext, plan: MotionPlan, out: AudioNode): (from: number, to: number) => void {
  const seed = hash(plan.storyboard.title)
  const bpm = 98 + (seed % 10)
  const beat = 60 / bpm
  const barLen = beat * 4
  const key = [48, 50, 53, 55, 45][seed % 5]
  const total = plan.total / 1000
  const introEnd = plan.shots.length > 1 ? plan.shots[1].start / 1000 - 0.3 : barLen * 2
  const endShot = plan.shots.find((s) => s.kind === 'end')
  const outroStart = endShot ? endShot.start / 1000 : total - barLen
  const bars = Math.ceil(total / barLen) + 1

  // Buses.
  const padBus = ctx.createBiquadFilter()
  padBus.type = 'lowpass'
  padBus.Q.value = 0.6
  padBus.frequency.setValueAtTime(500, 0)
  padBus.frequency.linearRampToValueAtTime(1500, Math.max(0.5, introEnd))
  const padGain = ctx.createGain()
  padGain.gain.value = 0.9
  padBus.connect(padGain).connect(out)

  const arpBus = ctx.createGain()
  arpBus.gain.value = 1
  const delay = ctx.createDelay(2)
  delay.delayTime.value = beat * 0.75
  const fb = ctx.createGain()
  fb.gain.value = 0.3
  const wet = ctx.createGain()
  wet.gain.value = 0.28
  arpBus.connect(out)
  arpBus.connect(delay)
  delay.connect(fb).connect(delay)
  delay.connect(wet).connect(out)

  const drumBus = ctx.createGain()
  drumBus.gain.value = 1
  drumBus.connect(out)

  return (from, to) => {
    for (let b = Math.max(0, Math.floor(from / barLen)); b < bars; b++) {
      const t0 = b * barLen
      if (t0 >= total || t0 >= to) break
      if (t0 < from) continue
      const chord = PROGRESSION[b % 4]
      const root = key + chord.root
      const tones = [root, root + (chord.minor ? 3 : 4), root + 7]
      const inOutro = t0 >= outroStart - 0.01

      // Pad: detuned saws per chord tone; the final chord rings out over the end card.
      if (!inOutro || t0 < outroStart + barLen) {
        const padDur = inOutro ? Math.max(barLen, total - t0) : barLen
        for (const m of [...tones.map((x) => x + 12), root]) {
          for (const det of [-7, 7]) {
            const o = ctx.createOscillator()
            o.type = 'sawtooth'
            o.frequency.value = midiHz(m)
            o.detune.value = det
            const g = ctx.createGain()
            g.gain.setValueAtTime(0.0001, t0)
            g.gain.exponentialRampToValueAtTime(0.012, t0 + Math.min(0.6, padDur * 0.3))
            g.gain.setValueAtTime(0.012, t0 + padDur - 0.35)
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + padDur + 0.4)
            o.connect(g).connect(padBus)
            o.start(t0)
            o.stop(t0 + padDur + 0.5)
          }
        }
      }
      if (inOutro) continue

      // Plucked arpeggio in eighth notes.
      const pattern = [0, 1, 2, 1, 3, 2, 1, 2]
      const arpTones = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[0] + 24]
      pattern.forEach((p, i) => {
        const t = t0 + i * (beat / 2)
        if (t >= outroStart) return
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.value = midiHz(arpTones[p])
        const g = env(ctx, t, t < introEnd ? 0.035 : 0.045, 0.004, 0.24)
        o.connect(g).connect(arpBus)
        o.start(t)
        o.stop(t + 0.3)
      })

      if (t0 + barLen <= introEnd) continue

      // Bass: root on 1, a push on the "and" of 2, the fifth on 3.
      const bassHits: [number, number][] = [[0, root - 12], [1.5, root - 12], [2, root - 5], [3.5, root - 12]]
      for (const [pos, m] of bassHits) {
        const t = t0 + pos * beat
        if (t < introEnd || t >= outroStart) continue
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.value = midiHz(m)
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 420
        const g = env(ctx, t, 0.16, 0.008, 0.38)
        o.connect(lp).connect(g).connect(drumBus)
        o.start(t)
        o.stop(t + 0.45)
      }

      for (let q = 0; q < 4; q++) {
        const t = t0 + q * beat
        if (t < introEnd || t >= outroStart) continue
        if (q === 0 || q === 2) {
          // Kick: a falling sine.
          const o = ctx.createOscillator()
          o.type = 'sine'
          o.frequency.setValueAtTime(140, t)
          o.frequency.exponentialRampToValueAtTime(46, t + 0.13)
          const g = env(ctx, t, 0.42, 0.003, 0.26)
          o.connect(g).connect(drumBus)
          o.start(t)
          o.stop(t + 0.32)
        } else {
          // Clap: band passed noise.
          const src = noiseSource(ctx, t, 0.16)
          const bp = ctx.createBiquadFilter()
          bp.type = 'bandpass'
          bp.frequency.value = 1700
          bp.Q.value = 0.9
          const g = env(ctx, t, 0.05, 0.002, 0.12)
          src.connect(bp).connect(g).connect(drumBus)
        }
        // Hats on the off beats.
        const th = t + beat / 2
        if (th < outroStart) {
          const src = noiseSource(ctx, th, 0.06)
          const hp = ctx.createBiquadFilter()
          hp.type = 'highpass'
          hp.frequency.value = 7500
          const g = env(ctx, th, 0.03, 0.001, 0.045)
          src.connect(hp).connect(g).connect(drumBus)
        }
      }
    }
  }
}
