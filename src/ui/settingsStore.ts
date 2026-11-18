import type { ThemeId } from '../render/theme'
import type { Detail } from '../planner/ruleBased'

export interface SettingsState {
  theme: ThemeId
  voiceOn: boolean
  voice: string
  captions: boolean
  music: boolean
  detail: Detail
  lookup: boolean
  /** Use a local Ollama model when one is found (only ever offered on localhost). */
  localAi: boolean
  /** 3D visuals: on, off, or null for automatic (on for desktops, off for phones and tablets). */
  visuals3d: boolean | null
}

export const DEFAULT_SETTINGS: SettingsState = {
  theme: 'night',
  voiceOn: true,
  voice: 'af_heart',
  captions: true,
  music: true,
  detail: 'standard',
  lookup: true,
  localAi: true,
  visuals3d: null,
}

const KEY = 'explainer-settings'

/** Settings are a per viewer convenience, so browser storage is enough; it may be unavailable. */
export function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<SettingsState>) }
  } catch {
    // Private mode or blocked storage.
  }
  return DEFAULT_SETTINGS
}

export function saveSettings(s: SettingsState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Ignore.
  }
}

