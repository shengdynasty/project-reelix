import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { ArrowSquareOut, CheckCircle, CornersIn, CornersOut, DownloadSimple, Pause, Play, Warning } from '@phosphor-icons/react'
import { Bar } from './controls'
import type { Source } from '../ingest/types'

export type GenStatus =
  | { phase: 'idle' }
  | { phase: 'reading'; message: string }
  | { phase: 'planning'; message: string }
  | { phase: 'voice'; loaded: number; total: number }
  | { phase: 'narrating'; done: number; total: number }
  | { phase: 'ready' }
  | { phase: 'error'; message: string }

export type ExportStatus =
  | { phase: 'idle' }
  | { phase: 'running'; progress: number }
  | { phase: 'done'; url: string; filename: string; note?: string }
  | { phase: 'error'; message: string }

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>
  visible: boolean
  playing: boolean
  time: number
  duration: number
  canPlay: boolean
  canExport: boolean
  /** Shows a placeholder over the video while the script is being prepared. */
  loading: boolean
  status: GenStatus
  exportStatus: ExportStatus
  sources: Source[]
  warnings: string[]
  note: string | null
  onToggle: () => void
  onSeek: (t: number) => void
  onExport: () => void
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const iconButton =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-[background-color,color,transform] duration-300 ease-base hover:bg-raise hover:text-ink active:scale-[0.96] disabled:pointer-events-none disabled:opacity-30'

export function Player({ canvasRef, ...p }: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void frame.current?.requestFullscreen?.()
  }

  return (
    <section aria-label="Explainer" className={p.visible ? 'rise-in' : 'hidden'}>
      <div className="rounded-2xl border border-edge bg-panel p-2">
        <div
          ref={frame}
          className="group relative overflow-hidden rounded-lg bg-base"
          style={full ? undefined : { aspectRatio: '16 / 9' }}
          onDoubleClick={toggleFull}
        >
          <canvas
            ref={canvasRef}
            width={1920}
            height={1080}
            className="h-full w-full object-contain"
            aria-label="Explainer video"
            tabIndex={0}
            onClick={() => p.canPlay && p.onToggle()}
            onKeyDown={(e) => {
              if (e.key === ' ' && p.canPlay) {
                e.preventDefault()
                p.onToggle()
              }
              if (e.key === 'f') toggleFull()
            }}
          />
          {p.loading ? (
            <div className="absolute inset-0 flex flex-col justify-center gap-4 bg-base p-8 sm:p-16" aria-hidden>
              <div className="skeleton h-4 w-28 rounded-full" />
              <div className="skeleton h-10 w-3/4 rounded-lg" />
              <div className="skeleton h-10 w-1/2 rounded-lg" />
              <div className="skeleton mt-4 h-4 w-40 rounded-full" />
            </div>
          ) : null}
          {!p.playing && p.canPlay ? (
            <button
              type="button"
              onClick={p.onToggle}
              aria-label="Play"
              className="absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-accent-ink transition-transform duration-300 ease-base hover:scale-105 active:scale-[0.98]"
            >
              <Play size={28} weight="fill" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2 px-1 pt-2">
          <button type="button" className={iconButton} onClick={p.onToggle} disabled={!p.canPlay} aria-label={p.playing ? 'Pause' : 'Play'}>
            {p.playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
          </button>
          <input
            type="range"
            className="scrub h-2 min-w-0 flex-1"
            min={0}
            max={Math.max(1, p.duration)}
            step={10}
            value={p.time}
            disabled={!p.duration}
            aria-label="Seek"
            onChange={(e) => p.onSeek(Number(e.target.value))}
          />
          <span className="caption-4 w-24 shrink-0 text-right font-mono text-ink-soft tabular-nums">
            {fmt(p.time)} / {fmt(p.duration)}
          </span>
          <button
            type="button"
            className={iconButton}
            onClick={p.onExport}
            disabled={!p.canExport || p.exportStatus.phase === 'running'}
            aria-label={p.exportStatus.phase === 'running' ? `Saving video, ${Math.round(p.exportStatus.progress * 100)}%` : 'Download video'}
            title="Download video"
          >
            {p.exportStatus.phase === 'running' ? (
              <span className="caption-3 font-mono tabular-nums">{Math.round(p.exportStatus.progress * 100)}</span>
            ) : p.exportStatus.phase === 'done' ? (
              <CheckCircle size={18} weight="fill" className="text-accent" />
            ) : (
              <DownloadSimple size={18} />
            )}
          </button>
          <button type="button" className={iconButton} onClick={toggleFull} aria-label={full ? 'Exit full screen' : 'Full screen'} title="Full screen">
            {full ? <CornersIn size={18} /> : <CornersOut size={18} />}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 px-1">
        <StatusLine status={p.status} />
        {p.exportStatus.phase === 'done' ? (
          <p className="caption-5 text-ink-dim">
            Saved {p.exportStatus.filename}.{p.exportStatus.note ? ` ${p.exportStatus.note}` : ''}{' '}
            <a className="text-ink-soft underline underline-offset-4 hover:text-ink" href={p.exportStatus.url} download={p.exportStatus.filename}>
              Save again
            </a>
          </p>
        ) : null}
        {p.exportStatus.phase === 'error' ? (
          <p role="alert" className="caption-5 text-danger">
            {p.exportStatus.message}
          </p>
        ) : null}
        {p.warnings.map((w) => (
          <p key={w} className="caption-5 flex items-start gap-2 text-ink-dim">
            <Warning size={14} className="mt-0.5 shrink-0" aria-hidden /> {w}
          </p>
        ))}
        {p.note ? <p className="caption-5 text-ink-dim">{p.note}</p> : null}
        {p.sources.length ? (
          <p className="caption-5 text-ink-dim">
            Sources:{' '}
            {p.sources.map((s, i) => (
              <span key={s.label}>
                {i ? ' · ' : ''}
                {s.url ? (
                  <a className="inline-flex items-center gap-1 text-ink-soft underline underline-offset-4 hover:text-ink" href={s.url} target="_blank" rel="noreferrer">
                    {s.label}
                    <ArrowSquareOut size={12} aria-hidden />
                  </a>
                ) : (
                  s.label
                )}
              </span>
            ))}
            {p.sources.some((s) => s.url) ? '. Wikipedia text is available under CC BY-SA.' : ''}
          </p>
        ) : null}
      </div>
    </section>
  )
}

function StatusLine({ status }: { status: GenStatus }) {
  if (status.phase === 'idle' || status.phase === 'ready') return null
  if (status.phase === 'error')
    return (
      <p role="alert" className="body-6 text-danger">
        {status.message}
      </p>
    )
  const [label, value] =
    status.phase === 'reading' || status.phase === 'planning'
      ? [status.message, null]
      : status.phase === 'voice'
        ? [
            status.total > 0
              ? `Downloading the voice, ${(status.loaded / 1e6).toFixed(0)} of ${(status.total / 1e6).toFixed(0)} MB. This happens once. You can watch while it records.`
              : 'Starting the voice',
            status.total > 0 ? status.loaded / status.total : null,
          ]
        : [`Recording the voice, ${status.done} of ${status.total} scenes. You can watch while it records.`, status.done / Math.max(1, status.total)]
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <span className="body-6 text-ink-soft">{label}</span>
      <Bar value={value} />
    </div>
  )
}
