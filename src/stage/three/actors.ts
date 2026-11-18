import {
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  SRGBColorSpace,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type Material,
  type Object3D,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { rand } from '../../render/easing'
import type { ImageSource } from '../../render/env'
import { WORLD_PER_PX } from '../layout'
import type { ActorData, ActorPose, ActorSpec, DepthMap } from '../types'
import { buildModel, buildMolecule } from './models'
import { iconGeometry } from './icons3d'
import { labelMesh } from './labelMesh'
import { poseMaterial, solidMaterial, type StagePalette } from './materials'

export interface BuildDeps {
  palette: StagePalette
  /** Decoded images by id, loaded with `crossOrigin` so they can be uploaded as textures. */
  images: Map<string, ImageSource>
  /** Depth maps by image id ("Moving photos"): a photo with one is raised into relief. */
  depths?: Map<string, DepthMap>
}

type Data<K extends ActorData['kind']> = Extract<ActorData, { kind: K }>

// Sizes in world units. An icon is 1 unit; everything else is sized so a scale of 1 fits the frame seen from
// HOLD_DISTANCE (about 6.3 by 11.2 units). Things that stand (bars, ribbon, tower) rise from y = 0 so a grow beat
// lifts them from the floor; everything else is centred on its origin.
/** Translucency of the duotone slab behind an icon, like the tint behind the 2D icon. */
const SLAB_OPACITY = 0.35
const PHOTO_HEIGHT = 3
/** A photo with a depth map is a grid this fine, raised up to DEPTH_RELIEF toward the camera. */
const RELIEF_SEGMENTS = [96, 54] as const
const DEPTH_RELIEF = 0.35
const PHOTO_BORDER = 0.12
const PHOTO_DEPTH = 0.12
/** Longest side of the canvas a photo is copied to; the plane is about 1000 px wide on a 1080 frame, so more only costs memory. */
const PHOTO_MAX_PX = 2048
/** Keeps a plane just off the face it sits on, so the two never z-fight. */
const LIFT = 0.005
const BAR_WIDTH = 0.6
const BAR_DEPTH = 0.6
const BAR_PITCH = 0.9
const BAR_MAX_HEIGHT = 3
const BAR_MIN_HEIGHT = 0.12
const BAR_RADIUS = 0.05
const RIBBON_PITCH = 0.9
const RIBBON_HEIGHT = 3
const RIBBON_RADIUS = 0.06
const MARKER_RADIUS = 0.1
const MARKER_HIGHLIGHT_RADIUS = 0.16
/** The first row of category labels hangs with its top this far under the base line of bars and ribbons. */
const CATEGORY_TOP = -0.25
/** A category box is two pitches wide less this, so labels two places apart never touch. */
const CATEGORY_CLEARANCE = 0.1
/** Space between the two rows when neighbouring category labels alternate rows. */
const CATEGORY_ROW_GAP = 0.04
const PICTOGRAM_COLUMNS = 10
const PICTOGRAM_CELL = 0.32
const PICTOGRAM_PITCH = 0.42
const PICTOGRAM_RADIUS = 0.06
const TOWER_ICON = 0.64
const TOWER_PITCH = 0.72
const PATH_RADIUS = 0.05
const STATION_RADIUS = 0.14
const TOKEN_RADIUS = 0.22
const TOKEN_GLOW = 0.6
const PARTICLE_SIZE = 0.1
const PARTICLE_OPACITY = 0.55
const CARD_TEXT_PX = 1200
const CARD_PAD = 0.5
const CARD_GAP = 0.18
const CARD_DEPTH = 0.1
const CARD_RADIUS = 0.1

const UP = new Vector3(0, 1, 0)

function iconObject(name: string, accent: boolean, palette: StagePalette): Group {
  const g = iconGeometry(name)
  const group = new Group()
  const front = new Mesh(g.front, solidMaterial(accent ? palette.accent : palette.object, { emissive: palette.accent }))
  front.castShadow = true
  group.add(front)
  if (g.back) group.add(new Mesh(g.back, solidMaterial(palette.accent, { baseOpacity: SLAB_OPACITY, roughness: 0.7 })))
  return group
}

/**
 * A copy of `image` on a canvas (at most PHOTO_MAX_PX on its longer side), or null when it cannot be used: not
 * decoded, no pixels, no 2D context, or a cross origin source without CORS, which refuses the one pixel read back
 * with the SecurityError `texImage2D` would throw. The texture is built from this canvas rather than the image
 * because three uploads a canvas with an explicit flip but ignores `flipY` for an ImageBitmap, and the app's images
 * are bitmaps; a bitmap uploaded directly would come out upside down, or inherit the flip state of the last upload.
 */
function copyToCanvas(image: ImageSource): HTMLCanvasElement | null {
  if ('naturalWidth' in image && (!image.complete || image.naturalWidth === 0)) return null
  const width = 'naturalWidth' in image ? image.naturalWidth : image.width
  const height = 'naturalHeight' in image ? image.naturalHeight : image.height
  if (!(width > 0 && height > 0)) return null
  const k = Math.min(1, PHOTO_MAX_PX / Math.max(width, height))
  try {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * k)
    canvas.height = Math.round(height * k)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    ctx.getImageData(0, 0, 1, 1)
    return canvas
  } catch {
    return null
  }
}

/**
 * A photo plane of RELIEF_SEGMENTS whose vertices move toward the camera by the depth map (nearest sample), up to
 * DEPTH_RELIEF, so the camera's dolly shows real parallax. Built once per photo, so frames stay a function of t.
 */
function reliefGeometry(w: number, h: number, depth: DepthMap): PlaneGeometry {
  const geometry = new PlaneGeometry(w, h, RELIEF_SEGMENTS[0], RELIEF_SEGMENTS[1])
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const col = Math.round((pos.getX(i) / w + 0.5) * (depth.width - 1))
    const row = Math.round((0.5 - pos.getY(i) / h) * (depth.height - 1))
    pos.setZ(i, (depth.data[row * depth.width + col] / 255) * DEPTH_RELIEF)
  }
  pos.needsUpdate = true
  geometry.computeBoundingSphere()
  return geometry
}

/** A framed photo plane, or the fallback icon (`userData.fallback`) when the image is missing or cannot be uploaded. */
function photoObject(data: Data<'photo'>, deps: BuildDeps): Object3D {
  const image = deps.images.get(data.imageId)
  const copy = image && copyToCanvas(image)
  if (!copy) {
    const icon = iconObject(data.fallbackIcon, false, deps.palette)
    icon.userData.fallback = true
    return icon
  }
  // The photo keeps its own aspect, fitted inside the PHOTO_HEIGHT by data.aspect box its piece laid out.
  const ratio = copy.width / copy.height
  const w = ratio >= data.aspect ? PHOTO_HEIGHT * data.aspect : PHOTO_HEIGHT * ratio
  const h = w / ratio
  const texture = new CanvasTexture(copy)
  texture.colorSpace = SRGBColorSpace
  const group = new Group()
  const frame = new Mesh(
    new RoundedBoxGeometry(w + 2 * PHOTO_BORDER, h + 2 * PHOTO_BORDER, PHOTO_DEPTH, 2, 0.05),
    solidMaterial(deps.palette.ground, { roughness: 0.6 }),
  )
  frame.castShadow = true
  frame.position.z = -PHOTO_DEPTH / 2 - LIFT
  // Unlit and not tone mapped: the picture shows as it is.
  const depth = deps.depths?.get(data.imageId)
  const photo = new Mesh(depth ? reliefGeometry(w, h, depth) : new PlaneGeometry(w, h), new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }))
  group.add(frame, photo)
  return group
}

/**
 * Small labels under a row of x positions. A box is almost two pitches wide, so one word fits whole far more
 * often; when any label is then wider than the pitch, odd labels hang a row under the even ones and no neighbour
 * overlaps. A category that cannot be shown in whole words is dropped rather than shown as a fragment.
 */
function categoryLabels(categories: string[], xs: number[], pitch: number, z: number, palette: StagePalette): Mesh[] {
  const labels = xs.map((x, i) => {
    if (!categories[i]) return null
    const label = labelMesh(categories[i], 'small', palette, { maxWidthPx: (2 * pitch - CATEGORY_CLEARANCE) / WORLD_PER_PX })
    if (label.userData.textless) return null
    label.position.set(x, 0, z)
    return label
  })
  const size = (label: Mesh) => (label.geometry as PlaneGeometry).parameters
  const crowded = labels.some((label) => label !== null && size(label).width > pitch)
  const firstRow = Math.max(0, ...labels.map((label, i) => (label && i % 2 === 0 ? size(label).height : 0)))
  labels.forEach((label, i) => {
    if (!label) return
    const top = CATEGORY_TOP - (crowded && i % 2 === 1 ? firstRow + CATEGORY_ROW_GAP : 0)
    label.position.y = top - size(label).height / 2
  })
  return labels.filter((label): label is Mesh => label !== null)
}

const peak = (values: number[]) => Math.max(...values.map(Math.abs), 0) || 1

/** Rounded pillars from the base line, the tallest (or a bar at `peak`) BAR_MAX_HEIGHT. With a highlight the other bars go muted and stop glowing. */
function barsObject(data: Data<'bars'>, palette: StagePalette): Group {
  const group = new Group()
  const n = data.values.length
  const max = data.peak ?? peak(data.values)
  const xs = data.values.map((_, i) => (i - (n - 1) / 2) * BAR_PITCH)
  data.values.forEach((v, i) => {
    const h = Math.max(BAR_MIN_HEIGHT, (Math.abs(v) / max) * BAR_MAX_HEIGHT)
    const emphasised = data.highlight === null || data.highlight === i
    const bar = new Mesh(
      new RoundedBoxGeometry(BAR_WIDTH, h, BAR_DEPTH, 2, Math.min(BAR_RADIUS, h / 2)),
      solidMaterial(emphasised ? palette.series[0] : palette.muted, { emissive: emphasised ? palette.accent : undefined }),
    )
    bar.castShadow = true
    bar.position.set(xs[i], (v < 0 ? -h : h) / 2, 0)
    // The stage raises each column from the floor on its own start (columnRise), so it needs the column and its resting height.
    bar.userData.column = i
    bar.userData.baseY = bar.position.y
    group.add(bar)
  })
  for (const label of categoryLabels(data.categories, xs, BAR_PITCH, BAR_DEPTH / 2, palette)) group.add(label)
  return group
}

/** A tube through the values with a marker at each, the highlighted one larger and lit. */
function ribbonObject(data: Data<'ribbon'>, palette: StagePalette): Group {
  const group = new Group()
  const n = data.values.length
  const max = peak(data.values)
  const points = data.values.map((v, i) => new Vector3((i - (n - 1) / 2) * RIBBON_PITCH, (v / max) * RIBBON_HEIGHT, 0))
  if (n >= 2) {
    const curve = new CatmullRomCurve3(points, false, 'centripetal')
    const tube = new Mesh(new TubeGeometry(curve, n * 12, RIBBON_RADIUS, 8, false), solidMaterial(palette.series[0], { emissive: palette.accent }))
    tube.castShadow = true
    group.add(tube)
  }
  points.forEach((p, i) => {
    const lit = data.highlight === i
    const marker = new Mesh(
      new SphereGeometry(lit ? MARKER_HIGHLIGHT_RADIUS : MARKER_RADIUS, 16, 12),
      solidMaterial(lit ? palette.accent : palette.object, { emissive: lit ? palette.accent : undefined, baseGlow: lit ? 0.3 : 0 }),
    )
    marker.position.copy(p)
    marker.castShadow = true
    group.add(marker)
  })
  for (const label of categoryLabels(data.categories, points.map((p) => p.x), RIBBON_PITCH, 0, palette)) group.add(label)
  return group
}

/** One instanced mesh of `total` rounded cells in a 10 wide grid, the first `lit` (reading order) in the accent. */
function pictogramObject(data: Data<'pictogram'>, palette: StagePalette): InstancedMesh {
  const n = data.total
  const rows = Math.ceil(n / PICTOGRAM_COLUMNS)
  // The material is white so the per instance colours show as they are.
  const cells = new InstancedMesh(
    new RoundedBoxGeometry(PICTOGRAM_CELL, PICTOGRAM_CELL, PICTOGRAM_CELL, 2, PICTOGRAM_RADIUS),
    solidMaterial('#ffffff', { emissive: palette.accent }),
    n,
  )
  const lit = new Color(palette.accent)
  const unlit = new Color(palette.muted)
  const m = new Matrix4()
  for (let i = 0; i < n; i++) {
    const col = i % PICTOGRAM_COLUMNS
    const row = Math.floor(i / PICTOGRAM_COLUMNS)
    m.makeTranslation((col - (PICTOGRAM_COLUMNS - 1) / 2) * PICTOGRAM_PITCH, ((rows - 1) / 2 - row) * PICTOGRAM_PITCH, 0)
    cells.setMatrixAt(i, m)
    cells.setColorAt(i, i < data.lit ? lit : unlit)
  }
  cells.instanceMatrix.needsUpdate = true
  cells.instanceColor!.needsUpdate = true
  cells.castShadow = true
  return cells
}

/** `count` copies of an icon stacked from the base line, each TOWER_ICON units tall, as one instanced mesh per solid. */
function towerObject(data: Data<'tower'>, palette: StagePalette): Group {
  const g = iconGeometry(data.icon)
  const count = Math.max(1, Math.round(data.count))
  const group = new Group()
  const stack = (geometry: BufferGeometry, material: Material): InstancedMesh => {
    const mesh = new InstancedMesh(geometry, material, count)
    const m = new Matrix4()
    const scale = new Vector3(TOWER_ICON, TOWER_ICON, TOWER_ICON)
    for (let j = 0; j < count; j++) mesh.setMatrixAt(j, m.compose(new Vector3(0, TOWER_PITCH * (j + 0.5), 0), new Quaternion(), scale))
    mesh.instanceMatrix.needsUpdate = true
    return mesh
  }
  const front = stack(g.front, solidMaterial(palette.object, { emissive: palette.accent }))
  front.castShadow = true
  group.add(front)
  if (g.back) group.add(stack(g.back, solidMaterial(palette.accent, { baseOpacity: SLAB_OPACITY, roughness: 0.7 })))
  return group
}

/** Straight tube segments between the points (the same polyline a travel beat follows) with a station sphere at each. */
function pathObject(data: Data<'path'>, palette: StagePalette): Group {
  const group = new Group()
  const points = data.points.map((p) => new Vector3(p[0], p[1], p[2]))
  const tubeMaterial = solidMaterial(palette.muted, { roughness: 0.6 })
  const segments = data.closed ? points.length : points.length - 1
  for (let i = 0; i < segments; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const dir = new Vector3().subVectors(b, a)
    const length = dir.length()
    if (length === 0) continue
    const segment = new Mesh(new CylinderGeometry(PATH_RADIUS, PATH_RADIUS, length, 10, 1), tubeMaterial)
    segment.position.copy(a).addScaledVector(dir, 0.5)
    segment.quaternion.setFromUnitVectors(UP, dir.normalize())
    group.add(segment)
  }
  const stationMaterial = solidMaterial(palette.object, { emissive: palette.accent })
  for (const p of points) {
    const station = new Mesh(new SphereGeometry(STATION_RADIUS, 16, 12), stationMaterial)
    station.position.copy(p)
    station.castShadow = true
    group.add(station)
  }
  return group
}

function tokenObject(palette: StagePalette): Mesh {
  const token = new Mesh(new SphereGeometry(TOKEN_RADIUS, 24, 16), solidMaterial(palette.accent, { emissive: palette.accent, baseGlow: TOKEN_GLOW, roughness: 0.3 }))
  token.castShadow = true
  return token
}

/** `count` points spread through `extent` around the origin, placed once from the seed so every frame sees the same cloud. */
function particlesObject(data: Data<'particles'>, palette: StagePalette): Points {
  const { count, seed, extent } = data
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // Three draws per particle, the first being rand(seed + i).
    for (let k = 0; k < 3; k++) positions[i * 3 + k] = (rand(seed + i + k * count) - 0.5) * extent[k]
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  const material = new PointsMaterial({ color: palette.accent, size: PARTICLE_SIZE, sizeAttenuation: true, transparent: true, opacity: PARTICLE_OPACITY, depthWrite: false })
  material.userData.baseOpacity = PARTICLE_OPACITY
  const points = new Points(geometry, material)
  points.userData.flow = data.flow
  return points
}

/** A rounded panel with the lines stacked on it: the first as a term, the rest small; all CARD_TEXT_PX wide at most. */
function cardObject(data: Data<'card'>, palette: StagePalette): Group {
  const group = new Group()
  const lines = data.lines.map((line, i) => labelMesh(line, i === 0 ? 'term' : 'small', palette, { maxWidthPx: CARD_TEXT_PX }))
  const heights = lines.map((m) => (m.geometry as PlaneGeometry).parameters.height)
  const textHeight = heights.reduce((sum, h) => sum + h, 0) + CARD_GAP * Math.max(0, lines.length - 1)
  const panel = new Mesh(
    new RoundedBoxGeometry(CARD_TEXT_PX * WORLD_PER_PX + 2 * CARD_PAD, textHeight + 2 * CARD_PAD, CARD_DEPTH, 3, CARD_RADIUS),
    solidMaterial(palette.ground, { roughness: 0.7 }),
  )
  panel.castShadow = true
  panel.position.z = -CARD_DEPTH / 2 - LIFT
  group.add(panel)
  let y = textHeight / 2
  lines.forEach((line, i) => {
    line.position.set(0, y - heights[i] / 2, 0)
    y -= heights[i] + CARD_GAP
    group.add(line)
  })
  return group
}

function build(data: ActorData, deps: BuildDeps): Object3D {
  const { palette } = deps
  switch (data.kind) {
    case 'icon':
      return iconObject(data.icon, data.accent, palette)
    case 'label':
      return labelMesh(data.text, data.size, palette)
    case 'photo':
      return photoObject(data, deps)
    case 'bars':
      return barsObject(data, palette)
    case 'ribbon':
      return ribbonObject(data, palette)
    case 'pictogram':
      return pictogramObject(data, palette)
    case 'tower':
      return towerObject(data, palette)
    case 'path':
      return pathObject(data, palette)
    case 'token':
      return tokenObject(palette)
    case 'particles':
      return particlesObject(data, palette)
    case 'card':
      return cardObject(data, palette)
    case 'model':
      return buildModel(data.model, palette)
    case 'molecule':
      return buildMolecule(data.molecule, palette)
  }
}

/**
 * The three.js object for an actor spec, at its `at` and `scale` until the first `applyPose`. Deterministic: the
 * same spec and deps build the same object. The spec's id is kept in `userData.actorId`. Icon geometry comes from
 * the shared cache (`geometry.userData.shared`); everything else belongs to the object and can be disposed with it.
 */
export function buildActor(spec: ActorSpec, deps: BuildDeps): Object3D {
  const obj = build(spec.data, deps)
  obj.userData.actorId = spec.id
  obj.position.set(spec.at[0], spec.at[1], spec.at[2])
  obj.scale.setScalar(spec.scale)
  return obj
}

/**
 * Copies a pose onto a built actor: position, rotation and scale on the object, opacity and glow on every material
 * under it (from each material's own base values, so frames do not compound). An actor at opacity 0 is hidden.
 */
export function applyPose(obj: Object3D, pose: ActorPose): void {
  obj.position.set(pose.position[0], pose.position[1], pose.position[2])
  obj.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2])
  obj.scale.setScalar(pose.scale)
  obj.visible = pose.opacity > 0
  obj.traverse((child) => {
    if (!('material' in child)) return
    const material = child.material as Material | Material[]
    for (const m of Array.isArray(material) ? material : [material]) poseMaterial(m, pose.opacity, pose.glow)
  })
}
