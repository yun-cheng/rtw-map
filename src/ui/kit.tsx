import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Button({ variant = 'default', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' }) {
  const styles = {
    default: 'border border-line bg-panel hover:bg-canvas',
    primary: 'bg-accent text-white hover:bg-teal-800 disabled:opacity-40',
    ghost: 'hover:bg-canvas',
  }[variant]
  return <button className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`} {...props} />
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Source({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[11px] leading-snug text-muted">{children}</p>
}

const SEVERITY = {
  error: 'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  ok: 'bg-accent-soft text-accent',
}
export function Badge({ tone = 'info', children }: { tone?: keyof typeof SEVERITY; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${SEVERITY[tone]}`}>{children}</span>
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-md border border-line bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded px-2 py-1 text-[12px] font-medium ${value === o.value ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}
