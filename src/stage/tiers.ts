// Device tiers for the 3D stage and the watchdog that steps a slow preview down.

export type Tier = 'high' | 'medium'

/** Phones and tablets: a coarse pointer, or a screen narrower than this. */
const SMALL_SCREEN = 900
/** Memory (GB, as navigator.deviceMemory reports it) and cores at or under which a desktop gets the medium tier. */
const LOW_MEMORY = 4
const FEW_CORES = 8
/** navigator.deviceMemory is missing outside Chromium; count it as plenty. */
const UNKNOWN_MEMORY = 8

/**
 * The 3D default and tier for a device: phones and tablets default to 2D (3D stays available at the medium tier),
 * desktops with 4 GB or less or fewer than 8 cores get medium, the rest high.
 */
export function deviceProfile(env: { coarsePointer: boolean; screenWidth: number; deviceMemory?: number; cores: number }): { default3d: boolean; tier: Tier } {
  if (env.coarsePointer || env.screenWidth < SMALL_SCREEN) return { default3d: false, tier: 'medium' }
  const memory = env.deviceMemory ?? UNKNOWN_MEMORY
  return { default3d: true, tier: memory <= LOW_MEMORY || env.cores < FEW_CORES ? 'medium' : 'high' }
}

/** A frame this long is the page coming back from a pause (a hidden tab, a sleep), not a slow frame, unless the one before it was as long. */
const PAUSE_MS = 1000

/**
 * Watches preview frame times: once a window of `windowMs` is full, a median frame time over `budgetMs` asks for a
 * step down, and the next window starts afresh, so one slow frame never counts. A pause starts the window again.
 */
export function createWatchdog(opts: { budgetMs?: number; windowMs?: number } = {}): { sample(frameMs: number, now: number): 'ok' | 'step-down' } {
  const budget = opts.budgetMs ?? 50
  const window = opts.windowMs ?? 3000
  let frames: { ms: number; at: number }[] = []
  let start: number | null = null
  let lastLong = false
  return {
    sample(frameMs, now) {
      const long = frameMs > PAUSE_MS
      if (long && !lastLong) {
        lastLong = true
        frames = []
        start = now
        return 'ok'
      }
      lastLong = long
      start ??= now
      frames.push({ ms: frameMs, at: now })
      frames = frames.filter((f) => f.at > now - window)
      if (now - start < window) return 'ok'
      const sorted = frames.map((f) => f.ms).sort((a, b) => a - b)
      const mid = sorted.length / 2
      const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2
      if (median <= budget) return 'ok'
      frames = []
      start = now
      return 'step-down'
    },
  }
}
