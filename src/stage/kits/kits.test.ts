import { describe, expect, it } from 'vitest'
import { kitModel } from '.'

describe('kitModel', () => {
  it('gives space topics their own heroes', () => {
    expect(kitModel({ topic: 'Black holes', sentence: 'A black hole is a region of spacetime where gravity is so strong nothing escapes.' })).toBe('black-hole')
    expect(kitModel({ topic: 'Galaxies', sentence: 'The Milky Way holds hundreds of billions of stars.' })).toBe('galaxy')
  })
  it('picks the immune system model a scene is about inside a vaccine video', () => {
    expect(kitModel({ topic: 'How do vaccines work?', sentence: 'A vaccine shows the body a harmless piece of a virus.' })).toBe('virus')
    expect(kitModel({ topic: 'How do vaccines work?', sentence: 'The immune system answers by making antibodies that remember the shape.' })).toBe('antibody')
  })
  it('shows scattering for why the sky is blue, and a prism for a spectrum', () => {
    expect(kitModel({ topic: 'Why is the sky blue?', sentence: 'Air scatters short blue wavelengths of sunlight far more than red ones.' })).toBe('scatter')
    expect(kitModel({ topic: 'Light', sentence: 'A prism spreads white light into a spectrum by refraction.' })).toBe('prism')
  })
  it('covers earth science and biology', () => {
    expect(kitModel({ topic: 'Volcanoes', sentence: 'Magma rises through cracks in the crust.' })).toBe('volcano')
    expect(kitModel({ topic: 'The water cycle', sentence: 'Water evaporates from the ocean and falls again as rain.' })).toBe('water-cycle')
    expect(kitModel({ topic: 'Photosynthesis', sentence: 'Chloroplasts turn sunlight into sugar.' })).toBe('cell')
    expect(kitModel({ topic: 'Genetics', sentence: 'DNA carries the genes in a double helix.' })).toBe('dna')
  })
  it('shows a globe for places and geography', () => {
    expect(kitModel({ topic: 'The continents', sentence: 'Seven continents sit on the tectonic plates of the Earth.' })).toBe('globe')
    expect(kitModel({ topic: 'Countries of Africa', sentence: 'Africa has 54 countries.' })).toBe('globe')
  })
  it('stays generic when a keyword is used in another sense or nothing matches', () => {
    expect(kitModel({ topic: 'Cell phone batteries', sentence: 'A cell phone battery stores energy in lithium.' })).toBeNull()
    expect(kitModel({ topic: 'A light lunch', sentence: 'Salads make a light lunch.' })).toBeNull()
    expect(kitModel({ topic: 'The French Revolution', sentence: 'The Estates General met in 1789.' })).toBeNull()
  })
  it('counts the defined term as part of the scene', () => expect(kitModel({ topic: 'Space', sentence: 'It bends light around it.', term: 'Black hole' })).toBe('black-hole'))
})
