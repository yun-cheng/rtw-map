import { useEffect, useRef, useState } from 'react'
import { useAccount } from '../agent/account'
import { useSaved, type TripSummary } from '../store/saved'
import { shortDate } from '../ui/format'

const STATUS: Record<string, { text: string; className: string }> = {
  saving: { text: 'Saving…', className: 'text-muted' },
  saved: { text: 'Saved', className: 'text-muted' },
  loading: { text: 'Loading…', className: 'text-muted' },
  error: { text: 'Not saved', className: 'text-danger' },
}

const tripLine = (t: TripSummary) =>
  [t.startDate && t.endDate ? `${shortDate(t.startDate)} – ${shortDate(t.endDate)} ${t.endDate.slice(0, 4)}` : null, t.stops ? `${t.stops} stops` : 'not planned yet']
    .filter(Boolean).join(' · ')

/** Header control for the user's saved trips: the open trip's name, save status, and a menu to switch, add, rename or delete. */
export function TripSwitcher() {
  const user = useAccount((s) => s.user)
  const loaded = useAccount((s) => s.loaded)
  const { trips, activeId, status, error, open: openTrip, create, rename, remove } = useSaved()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<'new' | 'rename' | null>(null)
  const [name, setName] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const active = trips.find((t) => t.id === activeId)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!loaded) return null
  if (!user) {
    return <span className="shrink-0 text-[12px] text-muted" title="Sign in (top right) to save trips to your account, keep several and use them on any device">Saved in this browser only</span>
  }

  const close = () => {
    setOpen(false)
    setEditing(null)
  }
  const submit = () => {
    const n = name.trim()
    if (!n) return
    if (editing === 'new') void create(n)
    else if (editing === 'rename' && activeId) void rename(activeId, n)
    close()
  }
  const s = STATUS[status]

  return (
    <div ref={box} className="relative flex shrink-0 items-center gap-2">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex max-w-[14rem] items-center gap-1 rounded-md border border-line px-2 py-1 text-[13px] font-medium hover:bg-canvas"
      >
        <span className="truncate">{active?.name ?? 'Trips'}</span>
        <span className="text-muted">▾</span>
      </button>
      {s && <span className={`text-[12px] ${s.className}`} title={status === 'error' ? `${error ?? ''} — your changes will be saved on the next edit` : undefined}>{s.text}</span>}

      {open && (
        <div role="menu" className="absolute top-full left-0 z-30 mt-1 w-72 rounded-lg border border-line bg-panel py-1.5 text-[13px] shadow-lg">
          <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Your trips</p>
          <ul className="max-h-72 overflow-y-auto">
            {trips.map((t) => (
              <li key={t.id}>
                <button
                  role="menuitem"
                  onClick={() => {
                    close()
                    if (t.id !== activeId) void openTrip(t.id)
                  }}
                  className={`flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-canvas ${t.id === activeId ? 'bg-accent-soft' : ''}`}
                >
                  <span className="w-3 shrink-0 text-accent">{t.id === activeId ? '✓' : ''}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.name}</span>
                    <span className="block text-[11px] text-muted">{tripLine(t)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-line px-3 pt-2">
            {editing ? (
              <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex gap-1.5">
                <input
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={editing === 'new' ? 'Name of the new trip' : 'Trip name'}
                  className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 text-[13px] outline-none focus:border-accent"
                />
                <button type="submit" className="rounded-md bg-accent px-2 py-1 text-[12px] font-medium text-on-accent">{editing === 'new' ? 'Create' : 'Rename'}</button>
              </form>
            ) : (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-medium">
                <button onClick={() => { setName(''); setEditing('new') }} className="text-accent hover:underline">+ New trip</button>
                {active && <button onClick={() => { setName(active.name); setEditing('rename') }} className="text-muted hover:text-ink">Rename</button>}
                {active && (
                  <button
                    onClick={() => {
                      if (!window.confirm(`Delete "${active.name}"? This can't be undone.`)) return
                      close()
                      void remove(active.id)
                    }}
                    className="text-muted hover:text-danger"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
