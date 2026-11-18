/** An easing for cubic-bezier(x1, y1, x2, y2), sampled once into a lookup table. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const N = 1024
  const lut = new Float32Array(N + 1)
  const bx = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3
  const by = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3
  // Invert x(t) by bisection once per sample, then look up.
  for (let i = 0; i <= N; i++) {
    const x = i / N
    let lo = 0
    let hi = 1
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2
      if (bx(mid) < x) lo = mid
      else hi = mid
    }
    lut[i] = by((lo + hi) / 2)
  }
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    const f = x * N
    const i = Math.floor(f)
    return lut[i] + (lut[i + 1] - lut[i]) * (f - i)
  }
}

// The motion curve from the design system, cubic-bezier(0.22, 1, 0.36, 1): weighted, decelerating into place.
export const ease = bezier(0.22, 1, 0.36, 1)
export const easeInOut = bezier(0.65, 0, 0.35, 1)
/** Entrances on the 3D stage: cubic-bezier(0.16, 1, 0.3, 1), a long decelerating settle. */
export const easeEnter = bezier(0.16, 1, 0.3, 1)
/** State to state changes on the 3D stage: cubic-bezier(0.65, 0, 0.35, 1), symmetric in and out. */
export const easeState = bezier(0.65, 0, 0.35, 1)

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const progress = (t: number, start: number, dur: number) => clamp01((t - start) / dur)
/** Eased 0..1 for an entrance that starts at `delay` ms and lasts `dur` ms. */
export const enter = (t: number, delay: number, dur = 700) => ease(progress(t, delay, dur))
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k

export function mixHex(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (p: number, s: number) => (p >> s) & 255
  const m = (s: number) => Math.round(lerp(ch(pa, s), ch(pb, s), clamp01(k)))
  return `rgb(${m(16)},${m(8)},${m(0)})`
}

/** Overshoots then settles, for things that pop into place. */
export function spring(x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  return 1 - Math.exp(-6.5 * x) * Math.cos(11 * x)
}
export const pop = (t: number, delay: number, dur = 700) => spring(progress(t, delay, dur))

export function easeOutBack(x: number): number {
  const c1 = 1.4
  const c3 = c1 + 1
  const k = clamp01(x)
  return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2
}

export function easeInOutCubic(x: number): number {
  const k = clamp01(x)
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2
}

/** Deterministic pseudo random number in [0, 1) for integer seeds. */
export function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
