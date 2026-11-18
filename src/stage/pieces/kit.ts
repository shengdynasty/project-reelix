// Shared by the set piece builders: the context the director hands them, actor factories that follow the stable id
// scheme, the frame that turns a builder's actors into a SetPiece with its window, camera keys and particles, and the
// camera helpers for pieces that move the camera in their own way.
import type { Scene } from '../../model/storyboard'
import type { MotionPlan, Shot } from '../../motion/plan'
import type { WordTiming } from '../../motion/words'
import { cameraKey, defaultCameraKeys, holdWindow } from '../camera'
import { kitModel } from '../kits'
import { verbBeats } from '../kits/verbs'
import { pieceWindow } from '../timing'
import type { ActorSpec, Beat, CameraKey, LabelSize, SetPiece, Vec3 } from '../types'

export interface PieceContext {
  plan: MotionPlan
  scene: Scene
  /** The piece's index in the set, which also places it along the world. */
  index: number
  /** The piece's shots in order: one scene's shots, or the end card alone. */
  shots: Shot[]
  /** Word timings of the scene, global ms. */
  words: WordTiming[]
  origin: Vec3
  hasImage: (id: string) => boolean
  /** The heroes of the pieces built before this one, for pieces that bring them back. */
  heroes: { piece: number; actor: ActorSpec }[]
  /** Content words of the video title, so labels do not repeat the topic (labelFor). */
  topicWords: string[]
}

// Sizes the builders place by, in world units. An icon is 1 unit at scale 1 and a photo 3 units tall (three.js
// builders); seen from HOLD_DISTANCE the frame is about 6.3 by 11.2 units.
/** A hero icon stands 2 units tall. */
export const HERO_SCALE = 2
/** A photo actor is this tall at scale 1. */
const PHOTO_HEIGHT = 3
/** How long an entrance takes unless a piece says otherwise. */
export const ENTER = 700
/** The volume the particles of a piece drift through: a little more than the frame, in front of and behind the actors. */
const PARTICLE_EXTENT: Vec3 = [12, 6, 6]
const PARTICLE_COUNT = 60

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

/** The stable actor id of the piece: `${pieceIndex}:${role}:${n}`, never random. */
export const actorId = (ctx: PieceContext, role: string, n = 0) => `${ctx.index}:${role}:${n}`

export const enter = (t: number, dur = ENTER): Beat => ({ t, dur, action: 'enter' })

/** An icon actor in the accent colour. */
export function iconActor(ctx: PieceContext, role: string, n: number, icon: string, at: Vec3, scale: number, beats: Beat[]): ActorSpec {
  return { id: actorId(ctx, role, n), at, scale, data: { kind: 'icon', icon, accent: true }, beats }
}

export function labelActor(ctx: PieceContext, role: string, n: number, text: string, size: LabelSize, at: Vec3, beats: Beat[], scale = 1): ActorSpec {
  return { id: actorId(ctx, role, n), at, scale, data: { kind: 'label', text, size }, beats }
}

/** A framed photo fitted inside a 16:9 box at scale 1 when `imageId` is given, else the icon as a hero, entering at `t`. */
export function pictureHero(ctx: PieceContext, imageId: string | undefined, icon: string, at: Vec3, t: number): ActorSpec {
  if (imageId) return { id: actorId(ctx, 'photo'), at, scale: 1, data: { kind: 'photo', imageId, fallbackIcon: icon, aspect: 16 / 9 }, beats: [enter(t)] }
  return iconActor(ctx, 'icon', 0, icon, at, HERO_SCALE, [enter(t)])
}

/** The scene's own online photo when it loaded, for pictureHero. */
export const scenePhoto = (ctx: PieceContext): string | undefined => (ctx.scene.photo && ctx.hasImage(ctx.scene.photo.imageId) ? ctx.scene.photo.imageId : undefined)

/**
 * A piece's single hero: the photo when there is one (the scene's own unless `photo` is given), else the model its
 * topic kit calls for, acting on the verbs the narration says, else the icon; entering at `t`.
 */
export function heroFor(ctx: PieceContext, icon: string, at: Vec3, t: number, photo: string | undefined = scenePhoto(ctx)): ActorSpec {
  if (photo) return pictureHero(ctx, photo, icon, at, t)
  const v = ctx.scene.visual
  const model = kitModel({ topic: ctx.plan.storyboard.title, sentence: ctx.scene.narration, term: v.kind === 'definition' ? v.term : undefined })
  if (!model) return iconActor(ctx, 'icon', 0, icon, at, HERO_SCALE, [enter(t)])
  const end = ctx.shots[ctx.shots.length - 1].end
  return { id: actorId(ctx, 'model'), at, scale: HERO_SCALE, data: { kind: 'model', model }, beats: [enter(t), ...verbBeats(ctx.words, t + ENTER, end)] }
}

/** Half the height of a hero made by pictureHero or heroFor. */
export const pictureHalfHeight = (hero: ActorSpec) => (hero.data.kind === 'photo' ? PHOTO_HEIGHT / 2 : HERO_SCALE / 2)

/** The particles every piece gets: a sparse stream through its volume, seeded by the piece, so something is always alive. */
function particles(ctx: PieceContext): ActorSpec {
  return {
    id: actorId(ctx, 'fx'),
    at: [0, 0, 0],
    scale: 1,
    data: { kind: 'particles', count: PARTICLE_COUNT, seed: ctx.index * 7919, flow: 'stream', extent: PARTICLE_EXTENT },
    beats: [],
  }
}

/** The piece's origin and window, which the camera key helpers place and clamp by. */
export function pieceFrame(ctx: PieceContext): Pick<SetPiece, 'origin' | 'start' | 'end'> {
  return { origin: ctx.origin, ...pieceWindow(ctx.shots, ctx.plan.total) }
}

/**
 * When the camera holds on the piece: from its arrival on the first shot until it leaves for the shot after the last.
 * Every camera key a builder adds lies in this span, at `holdEnd` at the latest, because the next piece's flight key
 * follows at that time and the keys of all pieces are read as one timeline.
 */
export function holdSpan(ctx: PieceContext): { holdStart: number; holdEnd: number } {
  const last = ctx.shots[ctx.shots.length - 1]
  return holdWindow(ctx.shots, ctx.plan.shots[last.index + 1])
}

/** A camera key at `t` with the camera at `position` looking at `target`, both relative to the piece origin. */
export function pieceKey(ctx: PieceContext, t: number, position: Vec3, target: Vec3): CameraKey {
  return cameraKey(t, add(ctx.origin, position), add(ctx.origin, target))
}

/**
 * A SetPiece from a builder's actors, the hero first: the window of its shots, the camera keys (`camera` when the
 * builder moves the camera in its own way, else the default keys holding on `aim`, the hero's `at` unless given,
 * relative to the origin, from the camera's arrival on the first shot until it leaves for the shot after the last) and
 * the particles every piece gets. The director prepends the flight key.
 */
export function framePiece(ctx: PieceContext, hero: ActorSpec, others: ActorSpec[], aim: Vec3 = hero.at, camera?: CameraKey[]): SetPiece {
  const { shots, index } = ctx
  const first = shots[0]
  const frame = pieceFrame(ctx)
  const { holdStart, holdEnd } = holdSpan(ctx)
  return {
    index,
    scene: first.scene,
    kind: first.kind,
    origin: frame.origin,
    start: frame.start,
    end: frame.end,
    actors: [hero, ...others, particles(ctx)],
    camera: camera ?? defaultCameraKeys(frame, aim, holdStart, holdEnd),
    heroId: hero.id,
  }
}

/** The generic treatment for a shot whose scene visual does not match its kind: the first shot's icon standing at the origin, entering as that shot builds. */
export function genericPiece(ctx: PieceContext): SetPiece {
  const first = ctx.shots[0]
  return framePiece(ctx, iconActor(ctx, 'hero', 0, first.icon, [0, 0, 0], HERO_SCALE, [enter(first.t0)]), [])
}
