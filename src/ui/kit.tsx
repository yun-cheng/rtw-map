import { ChevronRight, Info, Minus, Plus } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type FocusEvent, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { levelColor } from './format'

export function Button({ variant = 'default', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' }) {
  const styles = {
    default: 'border border-line bg-panel hover:bg-canvas',
    primary: 'bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-40',
    ghost: 'hover:bg-canvas',
  }[variant]
  return <button className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`} {...props} />
}

/**
 * A card of related information in a drawer, on the drawer's darker background (wrap a drawer's sections in
 * `Sections`). The title is optional for a card that needs no heading.
 */
export function Section({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl bg-panel px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      {(title || aside) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold">{title}</h3>
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * A card like `Section` that folds to its title and a line saying what's in it (`summary`); starts folded. With `open`
 * and `onToggle` its parent decides (e.g. one card open at a time).
 */
export function Fold({ title, summary, open: shown, onToggle, children }: { title: string; summary: ReactNode; open?: boolean; onToggle?: () => void; children: ReactNode }) {
  const [own, setOwn] = useState(false)
  const open = shown ?? own
  const setOpen = (v: boolean) => (onToggle ? onToggle() : setOwn(v))
  // Opened by a click: its top kept in view, as another card folding above it can move it up out of sight (or a
  // pinned bar can cover the bottom of the panel).
  const card = useRef<HTMLElement>(null)
  const clicked = useRef(false)
  useLayoutEffect(() => {
    const el = card.current
    const view = el?.closest('.overflow-y-auto')?.getBoundingClientRect()
    if (el && view && open && clicked.current) {
      const top = el.getBoundingClientRect().top
      if (top < view.top || top > view.bottom - 120) el.scrollIntoView({ block: 'start' })
    }
    clicked.current = false
  }, [open])
  return (
    <section ref={card} className="scroll-mt-3 rounded-xl bg-panel shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <button onClick={() => { clicked.current = true; setOpen(!open) }} aria-expanded={open} className="flex w-full items-start gap-2 px-4 py-3 text-left">
        <ChevronRight size={14} className={`mt-0.5 shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">{title}</span>
          {!open && <span className="mt-0.5 block truncate text-[12px] text-muted">{summary}</span>}
        </span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </section>
  )
}

/** A drawer's cards, spaced apart so each one reads as its own group. */
export const Sections = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-3 p-3">{children}</div>

/** A line of related links under a section (official pages and guides). */
export function Links({ children }: { children: ReactNode }) {
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

/** A whole number between `min` and `max`, typed or stepped with − and + either side. */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  const btn = 'flex w-7 shrink-0 items-center justify-center text-muted hover:bg-canvas hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent'
  return (
    <div role="group" aria-label={label} className="flex h-[32px] items-stretch overflow-hidden rounded-md border border-line bg-panel text-[13px] focus-within:border-accent">
      <button type="button" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={`Less: ${label}`} className={`${btn} border-r border-line`}><Minus size={13} /></button>
      <input
        type="number" inputMode="numeric" min={min} max={max} aria-label={label}
        value={value}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value))
          onChange(e.target.value.trim() && Number.isFinite(n) ? clamp(n) : min)
        }}
        className="w-9 min-w-0 bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label={`More: ${label}`} className={`${btn} border-l border-line`}><Plus size={13} /></button>
    </div>
  )
}

/**
 * A name, with what follows it (`after`, e.g. a small button), what goes at the right (`aside`) and under it
 * (`children`). With a `hint`, an info icon after the name shows what it means (InfoTip).
 */
export function Named({ label, hint, after, aside, labelClass = 'text-muted', children }: { label: ReactNode; hint?: string; after?: ReactNode; aside?: ReactNode; labelClass?: string; children?: ReactNode }) {
  return (
    <div className="text-[13px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5">
          <span className={labelClass}>{label}</span>
          {hint && <InfoTip text={hint} label={typeof label === 'string' ? label : 'this'} />}
          {after}
        </span>
        {aside}
      </div>
      {children}
    </div>
  )
}

/**
 * An info icon whose `text` shows in a tooltip above it, styled like the map's hover box: on hover, or while the icon
 * has focus (a tap on a phone, or the keyboard). It's drawn over the page, so a scrolling panel doesn't cut it off,
 * and moved back inside the window when needed, with its arrow still on the icon.
 */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [shift, setShift] = useState(0)
  const box = useRef<HTMLSpanElement>(null)
  const id = useId()
  const show = (e: MouseEvent | FocusEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    setShift(0)
    setAt({ x: r.left + r.width / 2, y: r.top })
  }
  useLayoutEffect(() => {
    if (!at || !box.current) return
    const r = box.current.getBoundingClientRect()
    const edge = 8
    setShift(r.left < edge ? edge - r.left : r.right > window.innerWidth - edge ? window.innerWidth - edge - r.right : 0)
  }, [at])
  return (
    <>
      <button
        type="button"
        aria-label={`What ${label.toLowerCase()} means`}
        aria-describedby={at ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={() => setAt(null)}
        onFocus={show}
        onBlur={() => setAt(null)}
        className="text-muted hover:text-ink focus:text-ink focus:outline-none"
      >
        <Info size={12} />
      </button>
      {at && createPortal(
        <span
          ref={box}
          id={id}
          role="tooltip"
          style={{ left: at.x + shift, top: at.y - 8 }}
          className="pointer-events-none fixed z-50 w-max max-w-60 -translate-x-1/2 -translate-y-full rounded-lg bg-panel px-2.5 py-1.5 text-[12px] leading-snug font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
        >
          {text}
          <span style={{ left: `calc(50% - ${shift}px)` }} className="absolute top-full -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-panel" />
        </span>,
        document.body,
      )}
    </>
  )
}

/** A label and its value; with a `hint`, an info icon after the label explains what's counted. */
export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="py-0.5">
      <Named label={label} hint={hint} aside={<span className="text-right font-medium">{children}</span>} />
    </div>
  )
}

/** Five-step bar for 1–5 ratings, coloured red (1) to green (5). */
export function LevelBar({ level, label }: { level: number; label: string }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${label}: ${level} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="h-2 w-5 rounded-sm" style={{ background: n <= level ? levelColor(level) : 'var(--color-line)' }} />
      ))}
    </span>
  )
}
