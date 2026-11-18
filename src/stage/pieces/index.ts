// One set piece builder per scene kind, dispatched on the piece's first shot; a steps shot goes by its style to the
// steps or the kinds builder. A shot whose scene visual does not match its kind keeps the generic hero.
import type { SetPiece } from '../types'
import { chartPiece } from './chart'
import { comparePiece } from './compare'
import { definitionPiece } from './definition'
import { endPiece } from './end'
import { imagePiece } from './image'
import { introPiece } from './intro'
import { kindsPiece } from './kinds'
import { genericPiece, type PieceContext } from './kit'
import { pointsPiece } from './points'
import { statPiece } from './stat'
import { stepsPiece } from './steps'
import { summaryPiece } from './summary'
import { timelinePiece } from './timeline'

export type { PieceContext } from './kit'

export function buildPiece(ctx: PieceContext): SetPiece {
  const visual = ctx.scene.visual
  switch (ctx.shots[0].kind) {
    case 'intro': return introPiece(ctx)
    case 'definition': return definitionPiece(ctx)
    case 'point': return pointsPiece(ctx)
    case 'stat': return statPiece(ctx)
    case 'compare': return comparePiece(ctx)
    case 'chart': return chartPiece(ctx)
    case 'image': return imagePiece(ctx)
    case 'timeline': return timelinePiece(ctx)
    case 'steps': return visual.kind === 'steps' && visual.style === 'kinds' ? kindsPiece(ctx) : stepsPiece(ctx)
    case 'summary': return summaryPiece(ctx)
    case 'end': return endPiece(ctx)
    default: return genericPiece(ctx)
  }
}
