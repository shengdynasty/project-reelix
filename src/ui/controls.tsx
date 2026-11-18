import type { ButtonHTMLAttributes, ReactNode } from 'react'

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg transition-[background-color,color,opacity,transform] duration-300 ease-base active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-[#35bd4d]',
  secondary: 'bg-raise text-ink hover:bg-edge',
  ghost: 'bg-transparent text-ink-soft hover:bg-raise hover:text-ink',
  danger: 'bg-transparent text-ink-soft hover:bg-raise hover:text-danger',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'sm'; children: ReactNode }) {
  const sizing = size === 'md' ? 'button-md px-3 py-2' : 'button-sm px-2 py-1'
  return (
    <button type="button" className={`${base} ${variants[variant]} ${sizing} ${className}`} {...rest}>
      {children}
    </button>
  )
}

export function IconButton({ label, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} className={`${base} ${variants.ghost} h-8 w-8 ${className}`} {...rest}>
      {children}
    </button>
  )
}

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="title-4 text-ink">
        {children}
      </label>
      {hint ? <span className="caption-5 text-ink-dim">{hint}</span> : null}
    </div>
  )
}

export const fieldClass =
  'w-full rounded-lg border border-edge bg-field px-3 py-2 body-6 text-ink placeholder:text-ink-dim transition-colors duration-300 ease-base hover:border-[#3d3d3d] focus:border-accent focus:outline-none'

export function Toggle({ checked, onChange, label, icon, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; label: string; icon?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left body-5 transition-[background-color,color,border-color,transform] duration-300 ease-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${disabled ? 'cursor-not-allowed opacity-50' : 'active:scale-[0.98]'} ${checked ? 'border-accent bg-field text-ink' : `border-edge bg-field text-ink-soft ${disabled ? '' : 'hover:text-ink'}`}`}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span aria-hidden className={`relative h-4 w-8 shrink-0 rounded-full transition-colors duration-300 ease-base ${checked ? 'bg-accent' : 'bg-edge'}`}>
        <span className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-ink transition-transform duration-300 ease-base ${checked ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-edge bg-panel p-4 ${className}`}>{children}</div>
}

export function Bar({ value }: { value: number | null }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-field" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : Math.round(value * 100)}>
      <div
        className={`h-full rounded-full bg-accent transition-transform duration-300 ease-base origin-left ${value === null ? 'pulse-accent' : ''}`}
        style={{ transform: `scaleX(${value === null ? 1 : Math.max(0.02, value)})` }}
      />
    </div>
  )
}
