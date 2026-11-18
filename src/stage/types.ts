import type { ModelName } from './kits'
import type { Molecule } from './kits/molecule'
import type { ShotKind } from '../motion/plan'

export type Vec3 = [number, number, number]
export type LabelSize = 'title' | 'term' | 'label' | 'small'
export type BeatAction = 'enter' | 'exit' | 'pulse' | 'focus' | 'grow' | 'travel' | 'count' | 'spin' | 'highlight'

export interface Beat {
  /** Global ms when the beat starts. */
  t: number
  dur: number
  action: BeatAction
  /** grow: target scale multiplier. */
  to?: number
  /** travel: polyline relative to the actor's `at`, and the station index to reach. */
  path?: Vec3[]
  index?: number
}

export type ActorData =
  | { kind: 'icon'; icon: string; accent: boolean }
  /** A topic kit's procedural model in place of an icon (same unit box). */
  | { kind: 'model'; model: ModelName }
  /** A compound's 3D structure as a ball and stick model (same unit box). */
  | { kind: 'molecule'; molecule: Molecule }
  | { kind: 'label'; text: string; size: LabelSize }
  | { kind: 'photo'; imageId: string; fallbackIcon: string; aspect: number }
  /** `peak`: the value the tallest possible bar stands for (default: the largest of `values`), so separate bars share one scale. */
  | { kind: 'bars'; values: number[]; categories: string[]; highlight: number | null; peak?: number }
  | { kind: 'ribbon'; values: number[]; categories: string[]; highlight: number | null }
  | { kind: 'pictogram'; lit: number; total: 100 }
  | { kind: 'tower'; count: number; icon: string }
  | { kind: 'path'; points: Vec3[]; closed: boolean }
  | { kind: 'token' }
  | { kind: 'particles'; count: number; seed: number; flow: 'rise' | 'fall' | 'stream'; extent: Vec3 }
  | { kind: 'card'; lines: string[] }

export interface ActorSpec {
  /** Stable id `${pieceIndex}:${role}:${n}`, never random. */
  id: string
  /** Position relative to the piece origin, world units. */
  at: Vec3
  scale: number
  data: ActorData
  beats: Beat[]
}

export interface CameraKey {
  t: number
  position: Vec3
  target: Vec3
  fov: number
  /** Depth of field focus distance, world units. */
  focus: number
}

export interface SetPiece {
  index: number
  scene: number
  kind: ShotKind
  /** World position; actor `at` values are relative to it. */
  origin: Vec3
  /** Global ms window in which the piece can be on screen. */
  start: number
  end: number
  actors: ActorSpec[]
  /** Absolute world positions, sorted by t. */
  camera: CameraKey[]
  heroId: string
}

export interface StageSet {
  pieces: SetPiece[]
  total: number
}

export interface CameraPose {
  position: Vec3
  target: Vec3
  fov: number
  focus: number
  roll: number
}

export interface ActorPose {
  position: Vec3
  rotation: Vec3
  scale: number
  opacity: number
  glow: number
  /** 0 to 1 progress of the latest count beat, for count up labels. */
  progress: number
}

/** A depth map for a photo: one byte per pixel, larger is nearer (Depth Anything's relative depth), row major. */
export interface DepthMap {
  width: number
  height: number
  data: Uint8Array
}
