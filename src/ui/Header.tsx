import type { ReactNode } from 'react'
import { FilmSlate } from '@phosphor-icons/react'

export function Header({ settings, onHome }: { settings: ReactNode; onHome: () => void }) {
  return (
    <header className="fixed top-4 right-4 left-4 z-40 flex items-center justify-between gap-4">
      <a
        href="./"
        onClick={(e) => {
          e.preventDefault()
          onHome()
        }}
        className="title-3 flex items-center gap-2 rounded-full border border-edge bg-panel/80 px-4 py-2 text-ink backdrop-blur-md transition-colors duration-300 ease-base hover:bg-raise"
        aria-current="page"
      >
        <FilmSlate size={20} weight="fill" className="text-accent" aria-hidden />
        Project Reelix
      </a>
      {settings}
    </header>
  )
}
