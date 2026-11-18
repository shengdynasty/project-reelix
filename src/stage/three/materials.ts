import { MeshStandardMaterial, type Material } from 'three'
import type { Theme } from '../../render/theme'

/** Colours of the 3D stage for one theme, as CSS hex strings (three converts them to the working colour space). */
export interface StagePalette {
  background: string
  /** Same as the background, so distance fades objects into it without a horizon seam. */
  fog: string
  /** The shadow catching floor and the panels objects sit on (photo frames, the end card). */
  ground: string
  /** Solids that are not accented: the softer ink, so lighting still shows on them. */
  object: string
  accent: string
  /** Text. */
  ink: string
  /** Small text, unlit pictogram cells, de-emphasised bars, the path tube. */
  muted: string
  /** Categorical colours; `series[0]` is the accent in every theme. */
  series: string[]
}

export function stagePalette(theme: Theme): StagePalette {
  return {
    background: theme.bg,
    fog: theme.bg,
    ground: theme.surface,
    object: theme.inkSoft,
    accent: theme.accent,
    ink: theme.ink,
    muted: theme.muted,
    series: theme.series,
  }
}

/** Emissive intensity a pose's glow of 1 adds (the bloom threshold is 0.85, so a focused object blooms). */
export const GLOW_INTENSITY = 0.8

export interface SolidOptions {
  /** Colour the object glows in when its pose has glow; black (the default) keeps it unaffected. */
  emissive?: string
  roughness?: number
  /** Opacity at pose opacity 1; under 1 the material also stops writing depth. */
  baseOpacity?: number
  /** Emissive intensity at glow 0, for things that always shine (the token). */
  baseGlow?: number
}

/**
 * A lit material for the stage. Every material carries its base opacity and glow in `userData`, so `poseMaterial`
 * can apply a pose each frame from the same base instead of compounding the previous frame's values.
 */
export function solidMaterial(color: string, opts: SolidOptions = {}): MeshStandardMaterial {
  const { emissive = '#000000', roughness = 0.5, baseOpacity = 1, baseGlow = 0 } = opts
  const material = new MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.05,
    emissive,
    emissiveIntensity: baseGlow,
    transparent: true,
    opacity: baseOpacity,
    depthWrite: baseOpacity >= 1,
  })
  material.userData.baseOpacity = baseOpacity
  material.userData.baseGlow = baseGlow
  return material
}

/** Sets one material's opacity and glow for a pose, on top of the base values it was built with. */
export function poseMaterial(material: Material, opacity: number, glow: number): void {
  material.opacity = (material.userData.baseOpacity ?? 1) * opacity
  if (material instanceof MeshStandardMaterial) material.emissiveIntensity = (material.userData.baseGlow ?? 0) + glow * GLOW_INTENSITY
}
