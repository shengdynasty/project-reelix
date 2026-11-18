// Small synthesis helpers on top of an OfflineAudioContext. Everything is generated, so there is no licensing
// question and nothing to download.
export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12)

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()
export function noise(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx)
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = b.getChannelData(0)
    let seed = 12345
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      d[i] = (seed / 0x7fffffff) * 2 - 1
    }
    noiseCache.set(ctx, b)
  }
  return b
}

/** Exponential decay envelope on a fresh gain node. */
export function env(ctx: BaseAudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  return g
}

export function noiseSource(ctx: BaseAudioContext, t: number, dur: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = noise(ctx)
  src.loop = true
  src.start(t, (t * 7.13) % 0.5)
  src.stop(t + dur)
  return src
}
