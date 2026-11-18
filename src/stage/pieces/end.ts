// The end card: the title, where the content came from and the maker's mark on one card in the world, the video's
// icon above it, under a slow orbit while the music ends.
import type { Storyboard } from '../../model/storyboard'
import { HOLD_DISTANCE } from '../layout'
import type { ActorSpec, CameraKey, SetPiece, Vec3 } from '../types'
import { actorId, enter, framePiece, holdSpan, iconActor, pieceKey, type PieceContext } from './kit'

const CARD_AT: Vec3 = [0, -0.2, 0]
const ICON_AT: Vec3 = [0, 2.3, 0]
const ICON_SCALE = 1.2
/** The camera looks between the icon and the card and orbits ORBIT degrees around that point over the card's time. */
const AIM: Vec3 = [0, 0.4, 0]
const ORBIT = 14
const ORBIT_DISTANCE = HOLD_DISTANCE * 0.96
const ORBIT_RISE = 0.5
const MADE_WITH = 'Made with Project Reelix'
/** A token longer than this would make the card drop its line (three.js builders), so it is cut with an ellipsis. */
const MAX_TOKEN = 59

/** `line` with every token under 60 characters. */
export function shortTokens(line: string): string {
  return line.trim().split(/\s+/).filter(Boolean).map((w) => (w.length <= MAX_TOKEN ? w : w.slice(0, MAX_TOKEN - 1) + '…')).join(' ')
}

/**
 * The card's lines: the title, "Sources: " with the source labels (never their URLs), "Photos: " with each photo's
 * short credit, so every credit fits, and the maker's mark; empty lines left out.
 */
export function cardLines(title: string, sources: Storyboard['sources']): string[] {
  const labels = [...new Set(sources.filter((s) => !s.credit).map((s) => s.label.trim()).filter(Boolean))]
  const photos = [...new Set(sources.flatMap((s) => (s.credit ? [s.credit.trim()] : [])))]
  return [title, labels.length ? `Sources: ${labels.join(' · ')}` : '', photos.length ? `Photos: ${photos.join(' · ')}` : '', MADE_WITH].map(shortTokens).filter(Boolean)
}

/** The camera `deg` degrees around AIM from the front, ORBIT_DISTANCE away and ORBIT_RISE above. */
function orbitPosition(deg: number): Vec3 {
  const a = (deg * Math.PI) / 180
  return [AIM[0] + Math.sin(a) * ORBIT_DISTANCE, AIM[1] + ORBIT_RISE, AIM[2] + Math.cos(a) * ORBIT_DISTANCE]
}

export function endPiece(ctx: PieceContext): SetPiece {
  const shot = ctx.shots[0]
  const sb = ctx.plan.storyboard
  const card: ActorSpec = { id: actorId(ctx, 'card'), at: CARD_AT, scale: 1, data: { kind: 'card', lines: cardLines(sb.title, sb.sources) }, beats: [enter(shot.t0)] }
  const icon = iconActor(ctx, 'icon', 0, shot.icon, ICON_AT, ICON_SCALE, [enter(shot.t0)])
  const { holdStart, holdEnd } = holdSpan(ctx)
  const camera: CameraKey[] = [pieceKey(ctx, holdStart, orbitPosition(-ORBIT / 2), AIM)]
  if (holdEnd > holdStart) camera.push(pieceKey(ctx, holdEnd, orbitPosition(ORBIT / 2), AIM))
  return framePiece(ctx, card, [icon], AIM, camera)
}
