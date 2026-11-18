import { describe, expect, it, vi } from 'vitest'
import { createStageHandle, type StageHandle } from '../stage/handle'
import { exportStage } from './exportVideo'

vi.mock('../stage/handle', () => ({ createStageHandle: vi.fn() }))
const create = vi.mocked(createStageHandle)

describe('exportStage', () => {
  it('makes no stage for a 2D video', async () => {
    const calls = create.mock.calls.length
    expect(await exportStage(false, 'high')).toEqual({ stage: null })
    expect(create.mock.calls.length).toBe(calls)
  })
  it('returns the full size export stage of a 3D video', async () => {
    const stage = { lost: false } as StageHandle
    create.mockResolvedValue(stage)
    expect(await exportStage(true, 'medium')).toEqual({ stage })
    expect(create).toHaveBeenCalledWith('export', { width: 1920, height: 1080 }, { tier: 'medium' })
  })
  it('saves in 2D with a note when the 3D stage cannot be made', async () => {
    create.mockResolvedValue(null)
    expect(await exportStage(true, 'high')).toEqual({ stage: null, note: 'Saved with 2D visuals because the 3D stage could not start.' })
  })
  it('saves in 2D with the same note when making the stage throws', async () => {
    create.mockImplementation(() => {
      throw new Error('chunk failed to load')
    })
    expect(await exportStage(true, 'high')).toEqual({ stage: null, note: 'Saved with 2D visuals because the 3D stage could not start.' })
  })
})
