// The stage: a three.js scene that shows a StageSet at any time t, lit, shadowed, fogged and finished with the post
// effects, drawn into an offscreen canvas. render(set, t, deps) is a function of its arguments alone: it builds the
// pieces active at t and disposes the rest, poses every actor from actorPose, places the camera from cameraPose and
// renders, so frames can be asked for in any order and export matches preview. The count beats and the particles,
// which the builders leave static, are finished here from t alone.
import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  ShadowMaterial,
  Sphere,
  Vector3,
  WebGLRenderer,
  type BufferAttribute,
  type Material,
  type Object3D,
  type Texture,
  type WebGLRenderTarget,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { STAT_COUNT_START } from '../../motion/beats'
import { clamp01 } from '../../render/easing'
import { countProgress } from '../../render/shots/stat'
import { cameraPose } from '../camera'
import { FOV } from '../layout'
import { actorPose, columnRise } from '../pose'
import type { ActorData, ActorSpec, Beat, SetPiece, StageSet } from '../types'
import { activePieces } from '../window'
import { applyPose, buildActor, type BuildDeps } from './actors'
import { moveModel } from './models'
import { createFx, type Fx } from './fx'
import type { StagePalette } from './materials'

export interface StageOptions {
  width: number
  height: number
  quality: 'preview' | 'export'
  reducedMotion?: boolean
  /** False on the medium tier: no depth of field. */
  depthOfField?: boolean
}

export interface Stage {
  /** Draws frame t of `set` and returns the canvas it was drawn into, or null while the WebGL context is lost. */
  render(set: StageSet, t: number, deps: BuildDeps): HTMLCanvasElement | null
  resize(width: number, height: number): void
  dispose(): void
  readonly lost: boolean
  readonly info: { pieces: number; geometries: number; textures: number }
  loseContextForTest(): void
  restoreContextForTest(): void
}

const NEAR = 0.5
const FAR = 200
/** The shadow catching floor sits under the lowest piece and its labels (origins reach y = -2.4, labels about 2.3 below). */
const GROUND_Y = -5
const GROUND_SIZE = 300
const SHADOW_OPACITY = 0.4
/** Distance fog in the palette's colour: the neighbouring piece (about 17 units off) stays clear, the ones beyond recede. */
const FOG_NEAR = 18
const FOG_FAR = 90
/**
 * The room environment through PMREM, kept low: its white reflections wash the accent toward mint, so the key and
 * fill do most of the lighting and a lit accent face comes out close to the theme's accent after tone mapping.
 */
const ENV_BLUR = 0.04
const ENV_INTENSITY = 0.2
const KEY_INTENSITY = 2.6
const FILL_INTENSITY = 0.8
/** Light offsets from the camera's target: the key high and left on the camera's side, the fill low on the right. */
const KEY_OFFSET = new Vector3(-6, 9, 7)
const FILL_OFFSET = new Vector3(7, 2, 5)
/** Half width of the key light's shadow frustum around the target: the piece on screen and the near parts of its neighbours. */
const SHADOW_HALF = 14
const SHADOW_NEAR = 1
const SHADOW_FAR = 48
const SHADOW_BIAS = -0.0005
const SHADOW_NORMAL_BIAS = 0.02
/** Softness of the shadow edges, in shadow map texels. */
const SHADOW_RADIUS = 4
/** Texture alpha under which a label pixel is not drawn; the rest write depth so the depth of field keeps labels sharp. */
const LABEL_ALPHA_TEST = 0.1
/** Particle drift along the flow, world units per second, and the sway across it. */
const FLOW_SPEED = 0.4
const SWAY = 0.08
const SWAY_HZ = 0.25

type ParticleData = Extract<ActorData, { kind: 'particles' }>

interface BuiltActor {
  spec: ActorSpec
  object: Object3D
  /** The actor's count beat when it has one: a count label redraws and a pictogram lights up by its progress. */
  count: Beat | undefined
  /** A bars actor's entrance, from which each column rises on its own start. */
  rise: Beat | undefined
  /** The text a count label's object was last drawn with. */
  text: string
  /** The cells a pictogram was last lit to. */
  lit: number
}

interface BuiltPiece {
  group: Group
  actors: BuiltActor[]
}

/** `final` with its first number scaled by `k` (0..1): "42%" at 0.5 is "21%", "1,284 hours" at 0.25 is "321 hours". */
export function countText(final: string, k: number): string {
  const m = /\d[\d,]*(?:\.\d+)?/.exec(final)
  if (!m) return final
  const raw = m[0]
  const decimals = raw.split('.')[1]?.length ?? 0
  const value = Number(raw.replace(/,/g, '')) * clamp01(k)
  const text = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: raw.includes(',') })
  return final.slice(0, m.index) + text + final.slice(m.index + raw.length)
}

/** The count curve the 2D stat uses, from the beat's linear progress: ease for a usual count, easeInOut for a long one. */
function countCurve(progress: number, dur: number): number {
  return dur > 0 ? countProgress(STAT_COUNT_START + progress * dur, dur) : progress
}

const materialsOf = (object: Mesh | Points): Material[] => (Array.isArray(object.material) ? object.material : [object.material])

/**
 * Settings the renderer needs on a built actor, which the builders leave to the stage: lit solids receive shadows (an
 * icon's drawing shadows its slab, bars shadow each other), and everything writes depth, labels where their texture is
 * opaque, so the depth of field reads their distance and keeps them sharp instead of blurring them as background.
 */
function prepare(object: Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof Mesh) && !(child instanceof Points)) return
    for (const material of materialsOf(child)) {
      if (material instanceof MeshStandardMaterial) {
        child.receiveShadow = true
        material.depthWrite = true
      } else if (material instanceof MeshBasicMaterial && material.map) {
        material.depthWrite = true
        material.alphaTest = LABEL_ALPHA_TEST
      } else if (material instanceof PointsMaterial) material.depthWrite = true
    }
  })
}

/** Frees what an actor owns: its geometries (never the shared icon geometry), materials, textures and instance buffers. */
export function disposeObject(object: Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof Mesh) && !(child instanceof Points)) return
    if (!child.geometry.userData.shared) child.geometry.dispose()
    for (const material of materialsOf(child)) {
      ;(material as { map?: Texture | null }).map?.dispose()
      material.dispose()
    }
    if (child instanceof InstancedMesh) child.dispose()
  })
}

function buildPiece(piece: SetPiece, deps: BuildDeps, scene: Scene): BuiltPiece {
  const group = new Group()
  group.position.set(piece.origin[0], piece.origin[1], piece.origin[2])
  const actors = piece.actors.map((spec): BuiltActor => {
    const count = spec.beats.find((b) => b.action === 'count')
    // A count label starts at its count's first value, so it never shows the final number before the count begins.
    const text = count && spec.data.kind === 'label' ? countText(spec.data.text, 0) : ''
    const object = buildActor(text && spec.data.kind === 'label' ? { ...spec, data: { ...spec.data, text } } : spec, deps)
    prepare(object)
    group.add(object)
    const rise = spec.data.kind === 'bars' ? spec.beats.find((b) => b.action === 'enter') : undefined
    return { spec, object, count, rise, text, lit: -1 }
  })
  scene.add(group)
  return { group, actors }
}

function disposePiece(piece: BuiltPiece): void {
  disposeObject(piece.group)
  piece.group.removeFromParent()
}

/** Lights the first `shown` cells of a pictogram (the fraction of the last one by its colour), as the 2D pictogram fills. */
function lightCells(actor: BuiltActor, shown: number, palette: StagePalette): void {
  if (shown === actor.lit) return
  actor.lit = shown
  const on = new Color(palette.accent)
  const off = new Color(palette.muted)
  const cell = new Color()
  actor.object.traverse((child) => {
    if (!(child instanceof InstancedMesh) || !child.instanceColor) return
    for (let i = 0; i < child.count; i++) child.setColorAt(i, cell.copy(off).lerp(on, clamp01(shown - i)))
    child.instanceColor.needsUpdate = true
  })
}

/** A column this little risen is drawn at this height instead of none, so its matrix stays invertible. */
const MIN_RISE = 0.001

/** Raises each column of a bars actor from the floor on its own start, so every column lands with its pop. */
function riseColumns(object: Object3D, entrance: Beat, t: number): void {
  for (const child of object.children) {
    const column = child.userData.column as number | undefined
    if (column === undefined) continue
    const k = columnRise(entrance, column, t)
    child.visible = k > 0
    child.scale.y = Math.max(k, MIN_RISE)
    child.position.y = (child.userData.baseY as number) * k
  }
}

const wrap = (v: number, extent: number) => (extent > 0 ? ((((v + extent / 2) % extent) + extent) % extent) - extent / 2 : v)

/**
 * Moves a piece's particles as a function of t alone: each drifts along its flow (x for a stream, y up for rise and
 * down for fall) and wraps within the extent, with a slow sway across the flow, so something is always alive.
 */
function drift(object: Object3D, data: ParticleData, t: number): void {
  if (!(object instanceof Points)) return
  const attribute = object.geometry.getAttribute('position') as BufferAttribute
  let base = object.userData.base as Float32Array | undefined
  if (!base) {
    base = Float32Array.from(attribute.array as ArrayLike<number>)
    object.userData.base = base
    // The cloud stays inside its extent, so one bounding sphere covers every frame.
    object.geometry.boundingSphere = new Sphere(new Vector3(), Math.hypot(data.extent[0], data.extent[1], data.extent[2]) / 2 + SWAY)
  }
  const along = data.flow === 'stream' ? 0 : 1
  const across = data.flow === 'stream' ? 1 : 0
  const direction = data.flow === 'fall' ? -1 : 1
  const seconds = t / 1000
  const positions = attribute.array as Float32Array
  for (let i = 0; i < data.count; i++) {
    const j = i * 3
    const phase = base[j] * 3 + base[j + 2] * 2
    positions[j] = base[j]
    positions[j + 1] = base[j + 1]
    positions[j + 2] = base[j + 2]
    positions[j + along] = wrap(base[j + along] + direction * FLOW_SPEED * seconds, data.extent[along])
    positions[j + across] = base[j + across] + SWAY * Math.sin(2 * Math.PI * SWAY_HZ * seconds + phase)
  }
  attribute.needsUpdate = true
}

function poseActor(actor: BuiltActor, group: Group, t: number, deps: BuildDeps, reducedMotion: boolean): void {
  const pose = actorPose(actor.spec, t)
  if (actor.count) {
    const k = countCurve(pose.progress, actor.count.dur)
    const data = actor.spec.data
    if (data.kind === 'label') {
      const text = countText(data.text, k)
      if (text !== actor.text) {
        group.remove(actor.object)
        disposeObject(actor.object)
        actor.object = buildActor({ ...actor.spec, data: { ...data, text } }, deps)
        prepare(actor.object)
        group.add(actor.object)
        actor.text = text
      }
    } else if (data.kind === 'pictogram') lightCells(actor, data.lit * k, deps.palette)
  }
  applyPose(actor.object, pose)
  if (actor.rise) riseColumns(actor.object, actor.rise, t)
  if (actor.spec.data.kind === 'particles') drift(actor.object, actor.spec.data, t)
  if (actor.spec.data.kind === 'model' || actor.spec.data.kind === 'molecule') moveModel(actor.object, t, reducedMotion)
}

function build({ width, height, quality, reducedMotion = false, depthOfField = true }: StageOptions): Stage | null {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false })
  if (!context) return null
  const renderer = new WebGLRenderer({ canvas, context, alpha: false, antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.setSize(width, height, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  // Tone mapping is the last post effect, so the renderer itself applies none.
  renderer.toneMapping = NoToneMapping

  const scene = new Scene()
  const camera = new PerspectiveCamera(FOV, width / height, NEAR, FAR)

  const key = new DirectionalLight('#ffffff', KEY_INTENSITY)
  key.castShadow = true
  const mapSize = quality === 'export' ? 2048 : 1024
  key.shadow.mapSize.set(mapSize, mapSize)
  const frustum = key.shadow.camera
  frustum.left = -SHADOW_HALF
  frustum.right = SHADOW_HALF
  frustum.top = SHADOW_HALF
  frustum.bottom = -SHADOW_HALF
  frustum.near = SHADOW_NEAR
  frustum.far = SHADOW_FAR
  frustum.updateProjectionMatrix()
  key.shadow.bias = SHADOW_BIAS
  key.shadow.normalBias = SHADOW_NORMAL_BIAS
  key.shadow.radius = SHADOW_RADIUS
  const fill = new DirectionalLight('#ffffff', FILL_INTENSITY)
  scene.add(key, key.target, fill, fill.target)

  const ground = new Mesh(
    new PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new ShadowMaterial({ opacity: SHADOW_OPACITY, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = GROUND_Y
  ground.receiveShadow = true
  scene.add(ground)

  let envTarget: WebGLRenderTarget | null = null
  let envDirty = true
  const buildEnvironment = () => {
    envTarget?.dispose()
    const pmrem = new PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    envTarget = pmrem.fromScene(room, ENV_BLUR)
    room.dispose()
    pmrem.dispose()
    scene.environment = envTarget.texture
    scene.environmentIntensity = ENV_INTENSITY
    envDirty = false
  }

  const fx: Fx = createFx(renderer, scene, camera, quality, { depthOfField })

  let lost = false
  const onLost = (event: Event) => {
    event.preventDefault()
    lost = true
  }
  // The environment map lives in a render target whose pixels went with the old context; everything else re-uploads itself.
  const onRestored = () => {
    lost = false
    envDirty = true
  }
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)

  const built = new Map<number, BuiltPiece>()
  let currentSet: StageSet | null = null
  let currentImages: BuildDeps['images'] | null = null
  let currentDepths: BuildDeps['depths'] = undefined
  let paletteKey = ''
  const target = new Vector3()

  const disposeAll = () => {
    for (const piece of built.values()) disposePiece(piece)
    built.clear()
  }

  const render = (set: StageSet, t: number, deps: BuildDeps): HTMLCanvasElement | null => {
    if (lost) return null
    const palette = JSON.stringify(deps.palette)
    if (set !== currentSet || deps.images !== currentImages || deps.depths !== currentDepths || palette !== paletteKey) {
      disposeAll()
      currentSet = set
      currentImages = deps.images
      currentDepths = deps.depths
      paletteKey = palette
      scene.background = new Color(deps.palette.background)
      scene.fog = new Fog(deps.palette.fog, FOG_NEAR, FOG_FAR)
    }
    if (envDirty) buildEnvironment()

    const active = activePieces(set, t)
    for (const [index, piece] of built) {
      if (active.includes(index)) continue
      disposePiece(piece)
      built.delete(index)
    }
    for (const index of active) if (!built.has(index)) built.set(index, buildPiece(set.pieces[index], deps, scene))
    for (const piece of built.values()) for (const actor of piece.actors) poseActor(actor, piece.group, t, deps, reducedMotion)

    const pose = cameraPose(set, t, { reducedMotion })
    camera.position.set(pose.position[0], pose.position[1], pose.position[2])
    target.set(pose.target[0], pose.target[1], pose.target[2])
    camera.lookAt(target)
    if (pose.roll !== 0) camera.rotateZ(pose.roll)
    if (camera.fov !== pose.fov) {
      camera.fov = pose.fov
      camera.updateProjectionMatrix()
    }
    // The lights and the floor follow the target, so the shadow frustum covers what is on screen wherever it is.
    key.position.copy(target).add(KEY_OFFSET)
    key.target.position.copy(target)
    fill.position.copy(target).add(FILL_OFFSET)
    fill.target.position.copy(target)
    ground.position.x = target.x
    ground.position.z = target.z

    fx.setFocus(pose.focus)
    fx.render(t / 1000)
    return canvas
  }

  return {
    render,
    resize(w, h) {
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      fx.setSize(w, h)
    },
    dispose() {
      disposeAll()
      fx.dispose()
      envTarget?.dispose()
      key.shadow.dispose()
      ground.geometry.dispose()
      ground.material.dispose()
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      renderer.dispose()
      renderer.forceContextLoss()
    },
    get lost() {
      return lost
    },
    get info() {
      return { pieces: built.size, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }
    },
    loseContextForTest() {
      lost = true
      renderer.forceContextLoss()
    },
    restoreContextForTest() {
      renderer.forceContextRestore()
    },
  }
}

/** A stage of `width` by `height`, or null when WebGL2 is unavailable or creating the renderer throws. */
export function createStage(opts: StageOptions): Stage | null {
  if (typeof document === 'undefined' || typeof WebGL2RenderingContext === 'undefined') return null
  try {
    return build(opts)
  } catch {
    return null
  }
}
