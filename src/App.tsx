import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Header } from './ui/Header'
import { PromptBox } from './ui/PromptBox'
import { Player } from './ui/Player'
import type { ExportStatus, GenStatus } from './ui/Player'
import { Settings } from './ui/Settings'
import { loadSettings, movingPhotosOn, saveSettings } from './ui/settingsStore'
import type { SettingsState } from './ui/settingsStore'
import { EXAMPLES } from './examples'
import type { Example } from './examples'
import type { Storyboard } from './model/storyboard'
import { buildTimeline } from './model/timing'
import { buildCorpus } from './ingest'
import type { Source } from './ingest/types'
import { planAuto, detectOllama, isLocalPage, pickModel } from './planner/ollama'
import { releaseVoiceWorkers, tts } from './tts/tts'
import type { Clip } from './tts/tts'
import { buildMasterAudio } from './player/audio'
import { buildPlan } from './motion/plan'
import { Player as VideoPlayer } from './player/player'
import { THEMES } from './render/theme'
import { loadFonts } from './render/text'
import { createStageHandle, type StageHandle } from './stage/handle'
import { renderMode, supportsWebGL2 } from './stage/support'
import { createWatchdog, deviceProfile, type Tier } from './stage/tiers'
import type { DepthMap } from './stage/types'
import { addNote } from './ui/notes'
import { addOnlineVisuals } from './ui/onlineVisuals'

/** The 3D preview's size on the high tier (the medium tier previews at 960x540). */
const PREVIEW_SIZE = { width: 1280, height: 720 }
const SMOOTH_NOTE = 'Switched to 2D visuals to keep playback smooth.'
/** Devices reporting this much memory (GB) or less release the voice workers once every clip is recorded. */
const LOW_MEMORY_GB = 4

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'reelix'
}

export default function App() {
  const [settings, setSettingsState] = useState<SettingsState>(loadSettings)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const setSettings = useCallback((next: SettingsState) => {
    settingsRef.current = next
    setSettingsState(next)
    saveSettings(next)
  }, [])

  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null)
  const [images, setImages] = useState<Map<string, ImageBitmap>>(new Map())
  const [depths, setDepths] = useState<Map<string, DepthMap>>(new Map())
  const [clips, setClips] = useState<(Clip | undefined)[]>([])
  const [audio, setAudio] = useState<AudioBuffer | null>(null)
  const [status, setStatus] = useState<GenStatus>({ phase: 'idle' })
  const [exportStatus, setExportStatus] = useState<ExportStatus>({ phase: 'idle' })
  const [warnings, setWarnings] = useState<string[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  // The model found on this computer; whether to use it is a saved setting.
  const [localModel, setLocalModel] = useState<string | null>(null)
  const localModelRef = useRef(localModel)
  localModelRef.current = localModel

  // 3D visuals: the setting, or the device's default when it is automatic; supported means WebGL2 works here.
  const [device] = useState(() =>
    deviceProfile({
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      screenWidth: screen.width,
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      cores: navigator.hardwareConcurrency || 1,
    }),
  )
  const [supported] = useState(supportsWebGL2)
  const [reducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  // The watchdog can lower the tier, and then turn 3D off, for the rest of the session.
  const [tier, setTier] = useState<Tier>(device.tier)
  const [forced2d, setForced2d] = useState(false)
  const want3d = settings.visuals3d ?? device.default3d
  const mode = forced2d ? '2d' : renderMode(want3d, supported)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const [stage, setStage] = useState<StageHandle | null>(null)
  const stageRef = useRef(stage)
  stageRef.current = stage
  const tierRef = useRef(tier)
  tierRef.current = tier
  const watchdogRef = useRef(createWatchdog())
  const lastFrameRef = useRef(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playerRef = useRef<VideoPlayer | null>(null)
  const genRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const exportAbort = useRef<AbortController | null>(null)
  const storyboardRef = useRef(storyboard)
  storyboardRef.current = storyboard

  const busy = status.phase === 'reading' || status.phase === 'planning' || status.phase === 'voice' || status.phase === 'narrating'
  const preparing = status.phase === 'reading' || status.phase === 'planning'

  const renderOptions = useMemo(() => ({ theme: THEMES[settings.theme], images, captions: settings.captions, stage, depths }), [settings.theme, images, settings.captions, stage, depths])

  // While the voice records, the preview runs on estimated timing (silent, with music) so it stays stable;
  // once every scene has its clip, timing comes from the real narration.
  const voiceReady = !!storyboard && (!settings.voiceOn || storyboard.scenes.every((_, i) => !!clips[i]))
  const useClips = settings.voiceOn && voiceReady
  const timeline = useMemo(() => (storyboard ? buildTimeline(storyboard, useClips ? clips.map((c) => c?.durationMs) : []) : null), [storyboard, clips, useClips])
  const plan = useMemo(() => (storyboard && timeline ? buildPlan(storyboard, timeline, useClips ? clips : []) : null), [storyboard, timeline, clips, useClips])
  const planRef = useRef(plan)
  planRef.current = plan

  const withVoice = settings.voiceOn && voiceReady
  const needsAudio = withVoice || settings.music
  useEffect(() => {
    if (!plan || !needsAudio) {
      setAudio(null)
      return
    }
    let cancelled = false
    // The old mix belongs to the old timing; until the new one is ready the preview plays without sound.
    setAudio(null)
    void buildMasterAudio(plan, withVoice ? clips : [], { voice: withVoice, music: settings.music })
      .then((buf) => !cancelled && setAudio(buf))
      .catch(() => {
        // Without a mix the preview stays silent; saving waits for one.
      })
    return () => {
      cancelled = true
    }
  }, [plan, needsAudio, withVoice, clips, settings.music])

  // Playback can start before the music mix is ready (it joins in when it is); a saved file needs the full mix.
  const canPlay = !!storyboard && !preparing
  const canExport = canPlay && (!needsAudio || !!audio) && !busy && voiceReady

  // When the narrated version replaces the silent preview, start it from the top.
  const prevVoiceReady = useRef(voiceReady)
  useEffect(() => {
    if (voiceReady && !prevVoiceReady.current) {
      playerRef.current?.pause()
      if (settings.voiceOn) playerRef.current?.seek(0)
    }
    prevVoiceReady.current = voiceReady
  }, [voiceReady, settings.voiceOn])

  // A preview too slow for 3D: high drops to medium, medium to the 2D renderer.
  const stepDown = useCallback(() => {
    watchdogRef.current = createWatchdog()
    if (tierRef.current === 'high') setTier('medium')
    else {
      setForced2d(true)
      setNote((current) => addNote(current, SMOOTH_NOTE))
    }
  }, [])

  // A change of the setting starts again from the device's tier.
  useEffect(() => {
    setForced2d(false)
    setTier(device.tier)
  }, [settings.visuals3d, device.tier])

  // The preview's 3D stage loads once there is a storyboard, and goes when 3D is off or the tier changes.
  const hasStoryboard = !!storyboard
  useEffect(() => {
    if (mode !== '3d' || !hasStoryboard) return
    let cancelled = false
    let handle: StageHandle | null = null
    createStageHandle('preview', PREVIEW_SIZE, { reducedMotion, tier })
      .then((h) => {
        if (cancelled) h?.dispose()
        else {
          handle = h
          // A new stage gets a full window of its own frames before the watchdog judges it.
          watchdogRef.current = createWatchdog()
          setStage(h)
        }
      })
      .catch(() => {
        // The 3D code could not load; the 2D renderer carries on.
      })
    return () => {
      cancelled = true
      handle?.dispose()
      setStage(null)
    }
  }, [mode, hasStoryboard, tier, reducedMotion])

  // Player lifecycle.
  const playingRef = useRef(false)
  const lastTimeRef = useRef(0)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const p = new VideoPlayer(canvas, renderOptions, (t, pl) => {
      // The watchdog times the frames while the 3D stage plays.
      const now = performance.now()
      if (pl && stageRef.current && lastFrameRef.current && watchdogRef.current.sample(now - lastFrameRef.current, now) === 'step-down') stepDown()
      lastFrameRef.current = pl ? now : 0
      if (pl !== playingRef.current) {
        playingRef.current = pl
        setPlaying(pl)
      }
      if (!pl || Math.abs(t - lastTimeRef.current) >= 100) {
        lastTimeRef.current = t
        setTime(t)
      }
    })
    playerRef.current = p
    if (import.meta.env.DEV) (window as unknown as { __player: VideoPlayer }).__player = p
    void loadFonts().then(() => p.draw())
    return () => p.destroy()
    // The player is created once; options and media are pushed by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => playerRef.current?.setOptions(renderOptions), [renderOptions])
  useEffect(() => {
    playerRef.current?.setMedia(plan ? { plan, audio: needsAudio ? audio : null } : null)
  }, [plan, audio, needsAudio])

  // Local AI is offered only when the app runs on localhost (see planner/ollama.ts).
  useEffect(() => {
    if (!isLocalPage()) return
    void detectOllama().then((models) => {
      const model = models ? pickModel(models) : null
      if (model) setLocalModel(model)
    })
  }, [])

  const resetExport = useCallback(() => {
    setExportStatus((prev) => {
      if (prev.phase === 'done') URL.revokeObjectURL(prev.url)
      return { phase: 'idle' }
    })
  }, [])

  const narrate = useCallback(async (sb: Storyboard, id: number) => {
    const voice = settingsRef.current.voice
    const indices = sb.scenes.map((_, i) => i)
    setStatus({ phase: 'narrating', done: 0, total: indices.length })
    const cached = await Promise.all(indices.map((i) => tts.has(sb.scenes[i].narration, voice)))
    if (id !== genRef.current) return
    if (!cached.every(Boolean)) {
      const unsub = tts.subscribe((ls) => {
        if (ls.phase === 'loading' && id === genRef.current) setStatus({ phase: 'voice', loaded: ls.loaded, total: ls.total })
      })
      try {
        await tts.load()
      } catch (err) {
        unsub()
        if (id !== genRef.current) return
        setStatus({ phase: 'error', message: `The voice could not load (${err instanceof Error ? err.message : 'unknown error'}). Turn off Voiceover in settings to watch with captions only.` })
        return
      }
      unsub()
    }
    // All scenes go to the worker pool at once; it runs as many in parallel as the device allows.
    let done = 0
    let failed: string | null = null
    setStatus({ phase: 'narrating', done: 0, total: indices.length })
    await Promise.all(
      indices.map(async (i) => {
        try {
          const clip = await tts.speak(sb.scenes[i].narration, voice)
          if (id !== genRef.current) return
          done++
          setClips((prev) => {
            const next = [...prev]
            next[i] = clip
            return next
          })
          setStatus({ phase: 'narrating', done, total: indices.length })
        } catch (err) {
          failed ??= `The voice failed on scene ${i + 1} (${err instanceof Error ? err.message : 'unknown error'}).`
        }
      }),
    )
    if (id !== genRef.current) return
    setStatus(failed ? { phase: 'error', message: failed } : { phase: 'ready' })
  }, [])

  const explain = useCallback(
    async (override?: { text: string; files: File[] }) => {
      const prompt = override?.text ?? text
      const attached = override?.files ?? files
      if (!prompt.trim() && !attached.length) return
      const id = ++genRef.current
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      exportAbort.current?.abort()
      playerRef.current?.pause()
      resetExport()
      setWarnings([])
      setNote(null)
      setStatus({ phase: 'reading', message: attached.length ? 'Reading your files' : 'Gathering information' })
      const s = settingsRef.current
      try {
        await loadFonts()
        const corpus = await buildCorpus({
          text: prompt,
          files: attached,
          lookup: s.lookup,
          signal: ctrl.signal,
          onStatus: (message) => id === genRef.current && setStatus({ phase: 'reading', message }),
        })
        if (id !== genRef.current) return
        setWarnings(corpus.warnings)
        if (!corpus.docs.length && !corpus.tables.length && !corpus.images.length) {
          setStatus({ phase: 'error', message: corpus.warnings[0] ?? 'There is nothing to explain yet. Type a topic or a question, or upload a file.' })
          return
        }
        const ai = s.localAi ? localModelRef.current : null
        setStatus({ phase: 'planning', message: ai ? `Writing the script with ${ai} on this computer` : 'Writing the script' })
        const result = await planAuto({ prompt, corpus, detail: s.detail }, ai, ctrl.signal)
        if (id !== genRef.current) return
        // Online photos only show on the 3D stage, and only for text that came from a Wikipedia article.
        if (s.lookup && corpus.article && modeRef.current === '3d') {
          setStatus({ phase: 'planning', message: 'Finding photos' })
          const searchScenes = corpus.docs.every((d) => d.kind === 'wiki')
          const exclude = corpus.images.flatMap((img) => (img.url ? [img.url] : []))
          const found = await addOnlineVisuals(result.storyboard, { article: corpus.article, searchScenes, exclude, signal: ctrl.signal })
          if (id !== genRef.current) return
          result.storyboard = found.storyboard
          corpus.images.push(...found.images)
          // Depth maps arrive in the background; each one rebuilds the stage with that photo in relief.
          if (found.images.length && movingPhotosOn(s.movingPhotos, (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection)) {
            void import('./photos')
              .then(({ depthFor }) => {
                for (const img of found.images) void depthFor(img.url ?? img.id, img.bitmap).then((map) => map && id === genRef.current && setDepths((prev) => new Map(prev).set(img.id, map)))
              })
              .catch(() => {})
          }
        }
        setDepths(new Map())
        setImages(new Map(corpus.images.map((img) => [img.id, img.bitmap])))
        setSources(result.storyboard.sources)
        setStoryboard(result.storyboard)
        setClips([])
        setNote(result.note)
        playerRef.current?.seek(0)
        if (s.voiceOn) await narrate(result.storyboard, id)
        else setStatus({ phase: 'ready' })
      } catch (err) {
        if (id !== genRef.current || ctrl.signal.aborted) return
        setStatus({ phase: 'error', message: `Something went wrong (${err instanceof Error ? err.message : 'unknown error'}). Try again.` })
      }
    },
    [text, files, narrate, resetExport],
  )

  // A new voice, or turning the voice on, re-records the narration (cached sentences make this quick).
  const voiceKey = `${settings.voice}|${settings.voiceOn}`
  const prevVoiceKey = useRef(voiceKey)
  useEffect(() => {
    if (prevVoiceKey.current === voiceKey) return
    prevVoiceKey.current = voiceKey
    const sb = storyboardRef.current
    resetExport()
    if (!sb || preparing) return
    const id = ++genRef.current
    setClips([])
    if (settings.voiceOn) void narrate(sb, id)
    else setStatus({ phase: 'ready' })
  }, [voiceKey, settings.voiceOn, narrate, resetExport, preparing])

  useEffect(() => resetExport(), [settings.theme, settings.captions, settings.music, mode, resetExport])

  // On devices with little memory, the voice workers give theirs back once every clip is recorded.
  useEffect(() => {
    if (!storyboard || !settings.voiceOn || !voiceReady) return
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
    if (memory !== undefined && memory <= LOW_MEMORY_GB) releaseVoiceWorkers()
  }, [storyboard, settings.voiceOn, voiceReady])

  // Start fetching and warming the voice model while the user is still typing, unless they are saving data.
  const onIntent = useCallback(() => {
    if (!settingsRef.current.voiceOn || tts.state.phase !== 'idle') return
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if (conn?.saveData || /(^|-)2g|3g/.test(conn?.effectiveType ?? '')) return
    void tts.load().catch(() => {})
  }, [])

  const onExample = useCallback(
    (ex: Example) => {
      const f = ex.files?.() ?? []
      setText(ex.prompt)
      setFiles(f)
      onIntent()
      void explain({ text: ex.prompt, files: f })
    },
    [explain, onIntent],
  )

  const goHome = useCallback(() => {
    genRef.current++
    abortRef.current?.abort()
    playerRef.current?.pause()
    setStoryboard(null)
    setClips([])
    setStatus({ phase: 'idle' })
    setWarnings([])
    setSources([])
    resetExport()
  }, [resetExport])

  const onExport = useCallback(async () => {
    const sb = storyboardRef.current
    const p = planRef.current
    if (!sb || !p) return
    playerRef.current?.pause()
    resetExport()
    const ctrl = new AbortController()
    exportAbort.current = ctrl
    setExportStatus({ phase: 'running', progress: 0 })
    try {
      await loadFonts()
      // The encoder library only loads when someone saves a video.
      const { exportVideo } = await import('./export/exportVideo')
      const res = await exportVideo({ plan: p, audio, options: renderOptions, tier, onProgress: (pr) => setExportStatus({ phase: 'running', progress: pr }), signal: ctrl.signal })
      const url = URL.createObjectURL(res.blob)
      const filename = `${slug(sb.title)}.${res.ext}`
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setExportStatus({ phase: 'done', url, filename, note: res.note })
    } catch (err) {
      if (ctrl.signal.aborted) setExportStatus({ phase: 'idle' })
      else setExportStatus({ phase: 'error', message: `Saving failed (${err instanceof Error ? err.message : 'unknown error'}). Try again, or try another browser.` })
    }
  }, [audio, renderOptions, tier, resetExport])

  const active = !!storyboard || busy || status.phase === 'error'

  return (
    <div className="min-h-dvh bg-base text-ink">
      <Header
        onHome={goHome}
        settings={
          <Settings
            value={settings}
            onChange={setSettings}
            localAi={localModel ? { model: localModel, enabled: settings.localAi } : null}
            onLocalAi={(enabled) => setSettings({ ...settings, localAi: enabled })}
            visuals={{ on: want3d, supported }}
          />
        }
      />
      <main id="main" className={`mx-auto flex w-full flex-col gap-6 px-4 pb-16 ${active ? 'max-w-5xl pt-24' : 'min-h-dvh max-w-2xl justify-center pt-24'}`}>
        {!active ? (
          <div className="rise-in flex flex-col gap-3 text-center">
            <h1 className="heading-4 sm:text-4xl sm:leading-10 bg-gradient-to-r from-[#FFFFFF] to-[#9B9B9B] bg-clip-text text-transparent">
              Understand any topic,
              <br />
              visually
            </h1>
            <p className="body-3 mx-auto max-w-lg text-ink-soft">
              Ask about something, or upload notes, slides, a PDF or a spreadsheet. You get a narrated, animated explanation that plays right here.
            </p>
          </div>
        ) : null}

        <Player
          canvasRef={canvasRef}
          visible={active}
          playing={playing}
          time={time}
          duration={timeline?.total ?? 0}
          canPlay={canPlay}
          canExport={canExport}
          loading={preparing}
          status={status}
          exportStatus={exportStatus}
          sources={sources}
          warnings={warnings}
          note={note}
          onToggle={() => playerRef.current?.toggle()}
          onSeek={(t) => playerRef.current?.seek(t)}
          onExport={onExport}
        />

        <div className={active ? 'mx-auto w-full max-w-3xl' : ''}>
          <PromptBox text={text} files={files} busy={preparing} compact={active} onText={setText} onFiles={setFiles} onSubmit={() => void explain()} onIntent={onIntent} />
          {!active ? (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => onExample(ex)}
                  className="button-sm rounded-full border border-edge px-3 py-1 text-ink-soft transition-colors duration-300 ease-base hover:bg-raise hover:text-ink active:scale-[0.98]"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-8">
        <p className="caption-5 text-center text-ink-dim">
          Free, with no account or API key. Files stay on your device. Built by{' '}
          <a className="text-ink-soft underline underline-offset-4 hover:text-ink" href="https://sheng-yan.com">
            Sheng Yan
          </a>
          .
        </p>
      </footer>
    </div>
  )
}
