import { describe, expect, it } from 'vitest'
import { fixturePlan, fixtureStoryboard } from '../stage/__fixtures__/plan'
import { buildTimeline, estimateSpeechMs } from '../model/timing'
import { buildPlan, cueAt } from './plan'
import type { Storyboard } from '../model/storyboard'

const plan = fixturePlan()
const planOf = (sb: Storyboard) => buildPlan(sb, buildTimeline(sb, sb.scenes.map((x) => estimateSpeechMs(x.narration))), [])

describe('word-anchored cues', () => {
  it('gives timeline and steps shots one cue per item', () =>
    plan.shots.filter((s) => s.kind === 'steps' || s.kind === 'timeline').forEach((s) => {
      const v = plan.storyboard.scenes[s.scene].visual
      const n = v.kind === 'timeline' ? v.events.length : v.kind === 'steps' ? v.items.length : -1
      expect(s.cues).toHaveLength(n)
    }))
  it('anchors each step to the word that names it', () => {
    const s = plan.shots.find((x) => x.kind === 'steps')!
    const w = plan.words[s.scene]
    expect(s.cues[0]).toBe(w.find((x) => x.text.toLowerCase().startsWith('evapor'))!.start)
    expect(s.cues[1]).toBe(w.find((x) => x.text.toLowerCase().startsWith('conden'))!.start)
  })
  it('ends the stat count when the number is spoken', () => {
    const s = plan.shots.find((x) => x.kind === 'stat')!
    const num = plan.words[s.scene].find((x) => x.text.includes('42'))!
    expect(s.countEnd).toBe(Math.min(Math.max(num.start, s.t0 + 900), s.end - 400))
    expect(plan.sfx.some((e) => e.kind === 'impact' && e.t === s.countEnd! - 120)).toBe(true)
  })
  it('finds the number in its compact form too', () => {
    const sb = fixtureStoryboard()
    const i = sb.scenes.findIndex((x) => x.visual.kind === 'stat')
    const v = sb.scenes[i].visual
    if (v.kind !== 'stat') throw new Error('fixture has no stat scene')
    sb.scenes[i] = { ...sb.scenes[i], narration: 'Across those six years the average was $82.2K per year, most of it from the last two.', visual: { ...v, value: 82200 } }
    const p = planOf(sb)
    const s = p.shots.find((x) => x.kind === 'stat')!
    const num = p.words[s.scene].find((x) => x.text.includes('82.2K'))!
    expect(s.countEnd).toBe(Math.min(Math.max(num.start, s.t0 + 900), s.end - 400))
  })
  it('keeps cues in order when an item is not named', () => {
    const sb = fixtureStoryboard()
    const i = sb.scenes.findIndex((x) => x.visual.kind === 'steps')
    // Only the first step is named, and late; the others fall back to fractions that would land before it.
    sb.scenes[i] = { ...sb.scenes[i], narration: 'Rain falls from the clouds and collects in rivers before any of the water evaporates again.' }
    const p = planOf(sb)
    const s = p.shots.find((x) => x.kind === 'steps')!
    const w = p.words[s.scene]
    expect(s.cues[0]).toBe(w.find((x) => x.text.startsWith('evaporates'))!.start)
    expect(cueAt(w, 1 / 4, s.start)).toBeLessThan(s.cues[0])
    expect(s.cues[1]).toBe(s.cues[0] + 300)
    s.cues.slice(1).forEach((c, j) => expect(c).toBeGreaterThanOrEqual(s.cues[j] + 300))
  })
})
