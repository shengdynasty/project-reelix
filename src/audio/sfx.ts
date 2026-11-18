import type { SfxEvent } from '../motion/plan'
import { env, noiseSource } from './synth'

function whoosh(ctx: BaseAudioContext, t: number, gain: number, pan: number, out: AudioNode) {
  const dur = 0.6
  const src = noiseSource(ctx, t, dur)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.1
  bp.frequency.setValueAtTime(350, t)
  bp.frequency.exponentialRampToValueAtTime(2600, t + 0.32)
  bp.frequency.exponentialRampToValueAtTime(900, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.32 * gain, t + 0.3)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  const p = ctx.createStereoPanner()
  p.pan.setValueAtTime(-pan, t)
  p.pan.linearRampToValueAtTime(pan, t + dur)
  src.connect(bp).connect(g).connect(p).connect(out)
}

function popSfx(ctx: BaseAudioContext, t: number, gain: number, pan: number, out: AudioNode) {
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(480, t)
  o.frequency.exponentialRampToValueAtTime(900, t + 0.05)
  const g = env(ctx, t, 0.22 * gain, 0.004, 0.12)
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  o.connect(g).connect(p).connect(out)
  o.start(t)
  o.stop(t + 0.2)
}

function tick(ctx: BaseAudioContext, t: number, gain: number, out: AudioNode) {
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.value = 2100
  const g = env(ctx, t, 0.08 * gain, 0.001, 0.025)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.05)
}

function impact(ctx: BaseAudioContext, t: number, gain: number, out: AudioNode) {
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(115, t)
  o.frequency.exponentialRampToValueAtTime(40, t + 0.4)
  const g = env(ctx, t, 0.55 * gain, 0.004, 0.5)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.6)
  const src = noiseSource(ctx, t, 0.3)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 700
  const ng = env(ctx, t, 0.2 * gain, 0.002, 0.22)
  src.connect(lp).connect(ng).connect(out)
}

function chime(ctx: BaseAudioContext, t: number, gain: number, out: AudioNode) {
  for (const [f, a] of [[1318.5, 1], [1975.5, 0.5], [2637, 0.25]]) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const g = env(ctx, t, 0.07 * gain * a, 0.003, 1.1)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + 1.2)
  }
}

/** Intro: a rising swell that lands on an impact as the iris opens. */
function sting(ctx: BaseAudioContext, t: number, gain: number, out: AudioNode) {
  const src = noiseSource(ctx, t, 0.75)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.setValueAtTime(800, t)
  hp.frequency.exponentialRampToValueAtTime(5000, t + 0.65)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.16 * gain, t + 0.62)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.72)
  src.connect(hp).connect(g).connect(out)
  impact(ctx, t + 0.66, gain, out)
  chime(ctx, t + 0.68, gain * 0.8, out)
}

export function scheduleSfx(ctx: BaseAudioContext, events: SfxEvent[], out: AudioNode) {
  for (const e of events) {
    const t = e.t / 1000
    switch (e.kind) {
      case 'whoosh': whoosh(ctx, t, e.gain, e.pan, out); break
      case 'pop': popSfx(ctx, t, e.gain, e.pan, out); break
      case 'tick': tick(ctx, t, e.gain, out); break
      case 'impact': impact(ctx, t, e.gain, out); break
      case 'chime': chime(ctx, t, e.gain, out); break
      case 'sting': sting(ctx, t, e.gain, out); break
    }
  }
}
