import { describe, expect, it } from 'vitest'
import { createWatchdog, deviceProfile } from './tiers'

describe('deviceProfile', () => {
  it('phones default to 2D', () => expect(deviceProfile({ coarsePointer: true, screenWidth: 390, cores: 6 }).default3d).toBe(false))
  it('a big desktop gets the high tier', () =>
    expect(deviceProfile({ coarsePointer: false, screenWidth: 1440, deviceMemory: 16, cores: 12 })).toEqual({ default3d: true, tier: 'high' }))
  it('a small laptop gets the medium tier', () =>
    expect(deviceProfile({ coarsePointer: false, screenWidth: 1280, deviceMemory: 4, cores: 4 })).toEqual({ default3d: true, tier: 'medium' }))
})

describe('createWatchdog', () => {
  it('steps down after 3 s of slow frames', () => {
    const w = createWatchdog()
    let r = 'ok'
    for (let t = 0; t <= 3000; t += 60) r = w.sample(70, t)
    expect(r).toBe('step-down')
  })
  it('ignores one slow frame', () => {
    const w = createWatchdog()
    const results = []
    for (let t = 0; t <= 3000; t += 33) results.push(w.sample(t === 990 ? 400 : 20, t))
    expect(results.every((r) => r === 'ok')).toBe(true)
  })
  it('treats one long frame gap, a hidden tab coming back, as a pause rather than a slow frame', () => {
    const w = createWatchdog()
    for (let t = 0; t <= 3000; t += 16) w.sample(16, t)
    expect(w.sample(5000, 8000)).toBe('ok')
    const results = []
    for (let t = 8016; t <= 12000; t += 16) results.push(w.sample(16, t))
    expect(results.every((r) => r === 'ok')).toBe(true)
  })
  it('still steps down a device whose every frame is longer than the pause limit', () => {
    const w = createWatchdog()
    let r = 'ok'
    for (let t = 0; t <= 8000 && r === 'ok'; t += 2000) r = w.sample(2000, t)
    expect(r).toBe('step-down')
  })
})
