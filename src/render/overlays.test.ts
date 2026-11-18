import { describe, expect, it } from 'vitest'
import { buildTimeline, estimateSpeechMs } from '../model/timing'
import { buildPlan } from '../motion/plan'
import { fixtureStoryboard } from '../stage/__fixtures__/plan'
import { creditFor } from './overlays'

const sb = fixtureStoryboard()
const at = sb.scenes.findIndex((s) => s.id === 'definition')
sb.scenes[at] = { ...sb.scenes[at], photo: { imageId: 'web1', credit: 'Photo: Jane Doe, CC BY 4.0' } }
const plan = buildPlan(sb, buildTimeline(sb, sb.scenes.map((s) => estimateSpeechMs(s.narration))), [])
const shot = plan.shots.find((s) => s.scene === at)!
const mid = (shot.start + shot.end) / 2
const images = new Map([['web1', {} as ImageBitmap]])

describe('creditFor', () => {
  it('names the photo while its scene is on screen', () => expect(creditFor(plan, mid, images)).toBe('Photo: Jane Doe, CC BY 4.0'))
  it('says nothing outside the scene', () => {
    const other = plan.shots.find((s) => s.scene !== at)!
    expect(creditFor(plan, (other.start + other.end) / 2, images)).toBeNull()
  })
  it('says nothing when the photo did not load', () => expect(creditFor(plan, mid, new Map())).toBeNull())
})
