import { useEffect, useId, useRef, useState } from 'react'
import { ClosedCaptioning, Cpu, Cube, GearSix, Globe, MusicNotes, SpeakerHigh } from '@phosphor-icons/react'
import { Toggle, fieldClass } from './controls'
import { THEMES } from '../render/theme'
import { VOICES } from '../tts/tts'
import type { Detail } from '../planner/ruleBased'
import type { SettingsState } from './settingsStore'

const DETAILS: { id: Detail; label: string }[] = [
  { id: 'quick', label: 'Quick' },
  { id: 'standard', label: 'Standard' },
  { id: 'deep', label: 'In depth' },
]

interface Props {
  value: SettingsState
  onChange: (next: SettingsState) => void
  localAi: { model: string; enabled: boolean } | null
  onLocalAi: (enabled: boolean) => void
  /** Whether 3D visuals are on (the setting, or the device's default when it is automatic) and whether they can run here. */
  visuals: { on: boolean; supported: boolean }
}

/** Gear button in the top right corner that opens a settings panel. */
export function Settings({ value, onChange, localAi, onLocalAi, visuals }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const voiceId = useId()
  const set = <K extends keyof SettingsState>(k: K, v: SettingsState[K]) => onChange({ ...value, [k]: v })

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 w-10 items-center justify-center rounded-full border transition-[background-color,border-color,transform] duration-300 ease-base active:scale-[0.96] ${open ? 'border-accent bg-raise text-ink' : 'border-edge bg-panel text-ink-soft hover:bg-raise hover:text-ink'}`}
      >
        <GearSix size={20} weight={open ? 'fill' : 'regular'} className={`transition-transform duration-500 ease-base ${open ? 'rotate-90' : ''}`} />
      </button>
      <div
        id={panelId}
        role="dialog"
        aria-label="Settings"
        className={`absolute top-12 right-0 z-50 w-[min(340px,calc(100vw-32px))] origin-top-right rounded-2xl border border-edge bg-panel p-4 transition-[opacity,transform] duration-300 ease-base ${open ? 'scale-100 opacity-100' : 'pointer-events-none invisible scale-95 opacity-0'}`}
      >
        <p className="title-3 mb-3 text-ink">Settings</p>
        <div className="flex flex-col gap-4">
          <div>
            <p className="title-4 mb-2 text-ink">Detail</p>
            <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-field p-0.5" role="radiogroup" aria-label="Detail">
              {DETAILS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={value.detail === d.id}
                  onClick={() => set('detail', d.id)}
                  className={`button-sm rounded-md px-2 py-1 transition-colors duration-300 ease-base ${value.detail === d.id ? 'bg-raise text-ink' : 'text-ink-dim hover:text-ink'}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="title-4 mb-2 text-ink">Theme</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
              {Object.values(THEMES).map((th) => {
                const active = value.theme === th.id
                return (
                  <button
                    key={th.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set('theme', th.id)}
                    className={`flex flex-col items-start gap-2 rounded-lg border p-2 text-left transition-colors duration-300 ease-base active:scale-[0.98] ${active ? 'border-accent' : 'border-edge hover:border-[#3d3d3d]'}`}
                  >
                    <span className="flex h-6 w-full items-center gap-1 rounded-md px-2" style={{ background: th.bg, boxShadow: `inset 0 0 0 1px ${th.grid}` }}>
                      <span className="h-2 w-2 rounded-sm" style={{ background: th.accent }} />
                      <span className="h-1 flex-1 rounded-full" style={{ background: th.ink, opacity: 0.8 }} />
                    </span>
                    <span className="caption-4 text-ink-soft">{th.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Toggle checked={value.voiceOn} onChange={(v) => set('voiceOn', v)} label="Voiceover" icon={<SpeakerHigh size={16} aria-hidden />} />
            {value.voiceOn ? (
              <select id={voiceId} aria-label="Voice" className={fieldClass} value={value.voice} onChange={(e) => set('voice', e.target.value)}>
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}, {v.note}
                  </option>
                ))}
              </select>
            ) : null}
            <Toggle checked={value.captions} onChange={(v) => set('captions', v)} label="Captions" icon={<ClosedCaptioning size={16} aria-hidden />} />
            <Toggle checked={value.music} onChange={(v) => set('music', v)} label="Music and effects" icon={<MusicNotes size={16} aria-hidden />} />
            <Toggle
              checked={visuals.supported && visuals.on}
              onChange={(v) => set('visuals3d', v)}
              label="3D visuals"
              icon={<Cube size={16} aria-hidden />}
              disabled={!visuals.supported}
            />
            {visuals.supported ? null : <p className="caption-5 -mt-1 text-ink-dim">Not supported in this browser</p>}
            <Toggle checked={value.lookup} onChange={(v) => set('lookup', v)} label="Fill in short topics from Wikipedia" icon={<Globe size={16} aria-hidden />} />
            {localAi ? (
              <Toggle checked={localAi.enabled} onChange={onLocalAi} label={`Local AI (${localAi.model})`} icon={<Cpu size={16} aria-hidden />} />
            ) : null}
          </div>
          <p className="caption-5 text-ink-dim">
            The voice model, about 90 MB, downloads once. Files never leave your device. When there is little to go on, a short topic, typed or found in your file, is looked up on Wikipedia.
          </p>
        </div>
      </div>
    </div>
  )
}
