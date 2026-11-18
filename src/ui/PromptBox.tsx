import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { ArrowUp, File as FileIcon, FilePdf, FileText, ImageSquare, Paperclip, PresentationChart, Table, X } from '@phosphor-icons/react'
import { ACCEPT, fileKind } from '../ingest'

interface Props {
  text: string
  files: File[]
  busy: boolean
  compact: boolean
  onText: (t: string) => void
  onFiles: (f: File[]) => void
  onSubmit: () => void
  onIntent: () => void
}

const MAX_FILES = 8

function KindIcon({ file }: { file: File }) {
  const k = fileKind(file)
  const props = { size: 16, 'aria-hidden': true } as const
  if (k === 'image') return <ImageSquare {...props} />
  if (k === 'PDF') return <FilePdf {...props} />
  if (k === 'slides') return <PresentationChart {...props} />
  if (k === 'spreadsheet') return <Table {...props} />
  if (k === 'document') return <FileText {...props} />
  return <FileIcon {...props} />
}

/** The one input: type a topic, question or notes, and attach files. */
export function PromptBox({ text, files, busy, compact, onText, onFiles, onSubmit, onIntent }: Props) {
  const area = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  // Grow with the text, up to a limit.
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, compact ? 160 : 240)}px`
  }, [text, compact])

  const add = (list: FileList | File[]) => {
    const incoming = Array.from(list).filter((f) => f.size <= 60_000_000)
    const merged = [...files, ...incoming.filter((f) => !files.some((x) => x.name === f.name && x.size === f.size))].slice(0, MAX_FILES)
    onFiles(merged)
    onIntent()
  }

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!busy && (text.trim() || files.length)) onSubmit()
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const canSubmit = !busy && (text.trim().length > 0 || files.length > 0)

  return (
    <form
      onSubmit={submit}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files.length) add(e.dataTransfer.files)
      }}
      className={`rounded-2xl border bg-panel p-2 transition-colors duration-300 ease-base ${dragging ? 'border-accent' : 'border-edge focus-within:border-[#3d3d3d]'}`}
    >
      {files.length ? (
        <ul className="flex flex-wrap gap-2 px-2 pt-2" aria-label="Attached files">
          {files.map((f, i) => (
            <li key={`${f.name}${f.size}`} className="flex max-w-full items-center gap-2 rounded-lg bg-field py-1 pr-1 pl-2 text-ink-soft">
              <KindIcon file={f} />
              <span className="caption-4 max-w-48 truncate" title={f.name}>
                {f.name}
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onFiles(files.filter((_, j) => j !== i))}
                className="flex h-6 w-6 items-center justify-center rounded-md text-ink-dim transition-colors duration-300 ease-base hover:bg-raise hover:text-ink"
              >
                <X size={12} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="sr-only" htmlFor="prompt">
        Topic, question or notes
      </label>
      <textarea
        id="prompt"
        ref={area}
        rows={1}
        value={text}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={onKey}
        onFocus={onIntent}
        placeholder={dragging ? 'Drop files to add them' : 'Ask about a topic, or paste notes'}
        className="body-3 block max-h-60 w-full resize-none bg-transparent px-3 py-3 text-ink placeholder:text-ink-dim focus:outline-none"
      />
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        <button
          type="button"
          onClick={() => picker.current?.click()}
          className="button-sm flex items-center gap-2 rounded-lg px-2 py-1 text-ink-soft transition-colors duration-300 ease-base hover:bg-raise hover:text-ink active:scale-[0.98]"
        >
          <Paperclip size={18} aria-hidden /> Upload
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            if (e.target.files) add(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          type="submit"
          aria-label="Explain"
          disabled={!canSubmit}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-ink transition-[background-color,opacity,transform] duration-300 ease-base hover:bg-[#35bd4d] active:scale-[0.96] disabled:opacity-30"
        >
          <ArrowUp size={20} weight="bold" />
        </button>
      </div>
    </form>
  )
}
