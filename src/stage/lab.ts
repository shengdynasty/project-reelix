// The stage lab: a dev only page (stage-lab.html, served by Vite in dev and never built) that renders a video's 3D
// stage into a visible 1280x720 canvas and exposes checks on window.__lab for the browser console: pixel reports,
// frame hashes for order independence, a scrub for bounded GPU memory, a frame time bench, context loss and
// restore, loading any acceptance item through the app's own pipeline, and accept(), the plan's acceptance checks.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { EXAMPLES } from '../examples'
import { buildCorpus } from '../ingest'
import { buildTimeline } from '../model/timing'
import { buildPlan, type MotionPlan } from '../motion/plan'
import { planAuto } from '../planner/ollama'
import { H, SAFE_BOTTOM, type ImageSource } from '../render/env'
import { loadFonts } from '../render/text'
import { THEMES, type ThemeId } from '../render/theme'
import { fixturePlan } from './__fixtures__/plan'
import { cueSkew } from './accept'
import { cameraPose } from './camera'
import { directVideo } from './director'
import type { BuildDeps } from './three/actors'
import { labelMesh } from './three/labelMesh'
import { stagePalette } from './three/materials'
import { createStage, type Stage } from './three/stage'
import type { StageSet, Vec3 } from './types'

const WIDTH = 1280
const HEIGHT = 720
/** One frame of the 30 fps video, ms. */
const FRAME = 33
/** Frame hashes are taken over this downscale. */
const HASH_WIDTH = 64
const HASH_HEIGHT = 36
/** A pixel at least this far (any channel, 0..255) from the frame's dominant colour counts as content. */
const CONTENT_DIFF = 12
/** A frame pair with fewer pixels changed by STILL_DIFF or more is still; the 4% grain alone never moves a pixel that far. */
const STILL_DIFF = 24
const STILL_PIXELS = 40
const STILL_STRIDE = 500
/** R12: a camera step of 1.5 world units or more per 16 ms is a jump. */
const JUMP_UNITS = 1.5
const LABEL_MIN_PX = 34
/** Where the bench starts: a stretch with several pieces built and a flight in it. */
const BENCH_START = 12000
const FIXTURES_URL = '/docs/superpowers/fixtures/'

type Source = 'fixture' | { example: string } | { file: string }

interface Lab {
  render(t: number): void
  report(): { nonBackground: number; meanLuma: number; pieces: number; geometries: number; textures: number }
  /** FNV-1a of a 64x36 downscale of frame t. */
  hashAt(t: number): string
  scrub(from: number, to: number, step: number): { maxPieces: number; geometriesAtEnd: number; geometriesAtStart: number }
  bench(frames: number): { msPerFrame: number }
  loseContext(): void
  restoreContext(): void
  /** Builds the plan through the app's own pipeline (Local AI and voice off), or the fixture. */
  load(source: Source): Promise<void>
  /**
   * The acceptance checks: label limits, camera continuity, entrance skew against shot cues and sound, frames with
   * nothing moving, and a direct seek against sequential playback at the same tier (R15).
   */
  accept(): { labelsOk: boolean; cameraJumps: number; maxCueSkewMs: number; stillFrames: number; hashMatch: boolean }
  /** What the lab holds, for poking at in the console. */
  state(): { plan: MotionPlan; set: StageSet; stage: Stage; deps: BuildDeps }
}

declare global {
  interface Window {
    __lab: Lab
  }
}

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const view = byId<HTMLCanvasElement>('view')
const ctx = view.getContext('2d', { willReadFrequently: true })!
const statusEl = byId<HTMLSpanElement>('status')
const slider = byId<HTMLInputElement>('time')
const clock = byId<HTMLSpanElement>('clock')
const guide = byId<HTMLDivElement>('guide')
const guideToggle = byId<HTMLInputElement>('guide-toggle')
const small = document.createElement('canvas')
small.width = HASH_WIDTH
small.height = HASH_HEIGHT
const smallCtx = small.getContext('2d', { willReadFrequently: true })!
smallCtx.imageSmoothingQuality = 'high'

const params = new URLSearchParams(location.search)
const theme = THEMES[(params.get('theme') ?? 'night') as ThemeId] ?? THEMES.night
const quality = params.get('quality') === 'export' ? 'export' : 'preview'
const reducedMotion = params.has('reduced')

let plan: MotionPlan
let set: StageSet
let deps: BuildDeps
let stage: Stage

const setStatus = (message: string) => {
  statusEl.textContent = message
}

function render(t: number): void {
  const frame = stage.render(set, t, deps)
  if (frame) ctx.drawImage(frame, 0, 0)
  slider.value = String(t)
  clock.textContent = `${(t / 1000).toFixed(3)} s`
  setStatus(frame ? `${stage.info.pieces} pieces built, ${stage.info.geometries} geometries, ${stage.info.textures} textures` : 'Context lost')
}

const pixels = () => ctx.getImageData(0, 0, WIDTH, HEIGHT).data

/** The frame's most common colour (quantized to 32 levels a channel, averaged within the bucket): the background. */
function dominant(px: Uint8ClampedArray): [number, number, number] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < px.length; i += 16) {
    const key = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3)
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bucket.n++
    bucket.r += px[i]
    bucket.g += px[i + 1]
    bucket.b += px[i + 2]
    buckets.set(key, bucket)
  }
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0]
  return [best.r / best.n, best.g / best.n, best.b / best.n]
}

function report() {
  const px = pixels()
  const [br, bg, bb] = dominant(px)
  const n = px.length / 4
  let content = 0
  let luma = 0
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]
    const g = px[i + 1]
    const b = px[i + 2]
    luma += 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (Math.max(Math.abs(r - br), Math.abs(g - bg), Math.abs(b - bb)) >= CONTENT_DIFF) content++
  }
  return { nonBackground: content / n, meanLuma: luma / n / 255, ...stage.info }
}

/** 32 bit FNV-1a of the bytes, as 8 hex digits. */
function fnv1a(bytes: Uint8ClampedArray): string {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function hashAt(t: number): string {
  render(t)
  smallCtx.drawImage(view, 0, 0, HASH_WIDTH, HASH_HEIGHT)
  return fnv1a(smallCtx.getImageData(0, 0, HASH_WIDTH, HASH_HEIGHT).data)
}

function scrub(from: number, to: number, step: number) {
  render(from)
  const geometriesAtStart = stage.info.geometries
  let maxPieces = stage.info.pieces
  for (let t = from + step; t <= to; t += step) {
    render(t)
    maxPieces = Math.max(maxPieces, stage.info.pieces)
  }
  return { maxPieces, geometriesAtEnd: stage.info.geometries, geometriesAtStart }
}

function bench(frames: number) {
  const t0 = Math.min(BENCH_START, plan.total * 0.3)
  render(t0)
  const start = performance.now()
  for (let k = 1; k <= frames; k++) {
    render(t0 + k * FRAME)
    // Reading a pixel back waits for the GPU, so the time covers the whole frame and not only the submit.
    ctx.getImageData(0, 0, 1, 1)
  }
  return { msPerFrame: (performance.now() - start) / frames }
}

/** The plan of a landing example or an upload fixture, built as the app builds it with Local AI and the voice off. */
async function planFor(source: Exclude<Source, 'fixture'>): Promise<{ plan: MotionPlan; images: Map<string, ImageSource> }> {
  let text = ''
  let files: File[] = []
  if ('example' in source) {
    const example = EXAMPLES.find((e) => e.id === source.example)
    if (!example) throw new Error(`No example "${source.example}"; try ${EXAMPLES.map((e) => e.id).join(', ')}`)
    text = example.prompt
    files = example.files?.() ?? []
  } else {
    const res = await fetch(FIXTURES_URL + encodeURIComponent(source.file))
    if (!res.ok) throw new Error(`${source.file}: the dev server answered ${res.status}`)
    const blob = await res.blob()
    files = [new File([blob], source.file, { type: blob.type })]
  }
  const corpus = await buildCorpus({ text, files, lookup: true, onStatus: setStatus })
  setStatus('Writing the script')
  const { storyboard } = await planAuto({ prompt: text, corpus, detail: 'standard' }, null)
  const timeline = buildTimeline(storyboard, [])
  return { plan: buildPlan(storyboard, timeline, []), images: new Map(corpus.images.map((img) => [img.id, img.bitmap])) }
}

/**
 * A stand in for the fixture's photo `img1`, as the ImageBitmap the app's ingest makes: a sky over a dark sea with
 * the sun top right and the word UP top left, so a photo uploaded upside down or mirrored shows at once.
 */
async function fixtureImage(): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 720
  const c = canvas.getContext('2d')!
  const sky = c.createLinearGradient(0, 0, 0, 500)
  sky.addColorStop(0, '#1b4f9c')
  sky.addColorStop(1, '#9fd0f2')
  c.fillStyle = sky
  c.fillRect(0, 0, 1280, 500)
  c.fillStyle = '#123a5e'
  c.fillRect(0, 500, 1280, 220)
  c.fillStyle = '#fff4c2'
  c.beginPath()
  c.arc(1000, 150, 70, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#ffffff'
  c.font = '600 96px "Geist Variable", sans-serif'
  c.textBaseline = 'top'
  c.fillText('UP', 48, 32)
  return createImageBitmap(canvas)
}

async function load(source: Source): Promise<void> {
  await loadFonts()
  const loaded = source === 'fixture' ? { plan: fixturePlan(), images: new Map<string, ImageSource>([['img1', await fixtureImage()]]) } : await planFor(source)
  plan = loaded.plan
  deps = { palette: stagePalette(theme), images: loaded.images }
  set = directVideo(plan, { hasImage: (id) => loaded.images.has(id) })
  slider.max = String(plan.total)
  render(Math.min(2500, plan.total))
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Every label within its word limit and drawable at 34 px or more without a cut; a label dropped for a fragment is allowed. */
function labelsOk(): boolean {
  return set.pieces.every((p) =>
    p.actors.every((a) => {
      if (a.data.kind !== 'label') return true
      const words = a.data.text.trim().split(/\s+/).filter(Boolean).length
      if (words > (a.data.size === 'title' ? 8 : 4)) return false
      const mesh = labelMesh(a.data.text, a.data.size, deps.palette)
      const ok = mesh.userData.textless === true || (mesh.userData.labelPx >= LABEL_MIN_PX && !mesh.userData.truncated)
      mesh.geometry.dispose()
      const material = mesh.material as { map?: { dispose(): void } | null; dispose(): void }
      material.map?.dispose()
      material.dispose()
      return ok
    }),
  )
}

function cameraJumps(): number {
  let jumps = 0
  for (let t = 0; t < plan.total; t += 16) {
    if (dist(cameraPose(set, t, { reducedMotion }).position, cameraPose(set, t + 16, { reducedMotion }).position) >= JUMP_UNITS) jumps++
  }
  return jumps
}

/** Pixels that differ by STILL_DIFF or more in some channel between two frames. */
function changedPixels(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let changed = 0
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) >= STILL_DIFF || Math.abs(a[i + 1] - b[i + 1]) >= STILL_DIFF || Math.abs(a[i + 2] - b[i + 2]) >= STILL_DIFF) changed++
  }
  return changed
}

/** Sampled every STILL_STRIDE ms: frames whose next frame looks the same. */
function stillFrames(): number {
  let still = 0
  for (let t = 0; t + FRAME <= plan.total; t += STILL_STRIDE) {
    render(t)
    const before = pixels()
    render(t + FRAME)
    if (changedPixels(before, pixels()) < STILL_PIXELS) still++
  }
  return still
}

/** R15: at a quarter, half and three quarters, a direct seek from far away matches a second of sequential playback. */
function hashMatch(): boolean {
  return [0.25, 0.5, 0.75].every((f) => {
    const at = Math.round(f * plan.total)
    render((at + plan.total / 2) % plan.total)
    const direct = hashAt(at)
    for (let t = at - 1000; t < at; t += FRAME) render(t)
    return hashAt(at) === direct
  })
}

function accept() {
  return { labelsOk: labelsOk(), cameraJumps: cameraJumps(), maxCueSkewMs: cueSkew(plan, set), stillFrames: stillFrames(), hashMatch: hashMatch() }
}

const lab: Lab = {
  render,
  report,
  hashAt,
  scrub,
  bench,
  loseContext: () => stage.loseContextForTest(),
  restoreContext: () => stage.restoreContextForTest(),
  load,
  accept,
  state: () => ({ plan, set, stage, deps }),
}

async function boot(): Promise<void> {
  guide.style.height = `${(1 - SAFE_BOTTOM / H) * 100}%`
  guideToggle.addEventListener('change', () => {
    guide.hidden = !guideToggle.checked
  })
  slider.addEventListener('input', () => render(Number(slider.value)))
  const created = createStage({ width: WIDTH, height: HEIGHT, quality, reducedMotion })
  if (!created) {
    setStatus('WebGL2 is not available here')
    throw new Error('createStage returned null')
  }
  stage = created
  window.__lab = lab
  const example = params.get('example')
  const file = params.get('file')
  await load(example ? { example } : file ? { file } : 'fixture')
}

boot().catch((err: unknown) => {
  setStatus(err instanceof Error ? err.message : String(err))
  throw err
})
