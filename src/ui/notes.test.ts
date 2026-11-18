import { describe, expect, it } from 'vitest'
import { addNote } from './notes'

describe('addNote', () => {
  it('shows the note alone when there is none yet', () => expect(addNote(null, 'Switched to 2D visuals.')).toBe('Switched to 2D visuals.'))
  it('keeps the planner note and adds the new one after it', () =>
    expect(addNote('Filled in from Wikipedia.', 'Switched to 2D visuals.')).toBe('Filled in from Wikipedia. Switched to 2D visuals.'))
  it('does not repeat a note already shown', () => expect(addNote('Filled in. Switched to 2D visuals.', 'Switched to 2D visuals.')).toBe('Filled in. Switched to 2D visuals.'))
})
