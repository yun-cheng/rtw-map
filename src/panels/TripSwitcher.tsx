import { useEffect, useRef, useState } from 'react'
import { useAccount } from '../agent/account'
import { useSaved, type TripSummary } from '../store/saved'
import { shareUrl } from '../store/shareLink'
import { confirm } from '../ui/dialog'
import { shortDate } from '../ui/format'
import { useOnline } from '../ui/useOnline'

const STATUS: Record<string, { text: string; className: string }> = {
  saving: { text: 'Saving…', className: 'text-muted' },
  saved: { text: 'Saved', className: 'text-muted' },
  loading: { text: 'Loading…', className: 'text-muted' },
  offline: { text: 'Offline · saved on this device', className: 'text-muted' },
  error: { text: 'Not saved', className: 'text-danger' },
}
const OFFLINE_TIP = "No connection: your changes are kept on this device and saved to your account when you're back online"


const tripLine = (t: TripSummary) =>
  [t.startDate && t.endDate ? `${shortDate(t.startDate)} – ${shortDate(t.endDate)} ${t.endDate.slice(0, 4)}` : null, t.stops ? `${t.stops} stops` : 'not planned yet']
    .filter(Boolean).join(' · ')

/** Header control for the user's saved trips: the open trip's name, save status, and a menu to switch, add, rename,
 *  delete or share (a public, read-only link). */
export function TripSwitcher() {
  const user = useAccount((s) => s.user)
  const loaded = useAccount((s) => s.loaded)
  const offline = useAccount((s) => s.offline)
  const online = useOnline()
  const { trips, activeId, status, error, open: openTrip, create, rename, remove } = useSaved()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<'new' | 'rename' | 'share' | null>(null)
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
  // Offline from the start: the account's trip as kept on this device (not knowing yet whether still signed in).
  // (With no connection the top bar's Offline says so: only how the trip is saved here.)
  if (!user && offline && activeId) return <span className="shrink-0 text-[12px] text-muted" title={OFFLINE_TIP}>{online ? (status === 'offline' ? STATUS.offline.text : 'Offline') : 'Saved on this device'}</span>
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
  const s = status === 'offline' && !online ? { ...STATUS.offline, text: 'Saved on this device' } : STATUS[status]

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
      {s && <span className={`text-[12px] ${s.className}`} title={status === 'error' ? `${error ?? ''} — your changes will be saved on the next edit` : status === 'offline' ? OFFLINE_TIP : undefined}>{s.text}</span>}

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
                    <span className="block truncate font-medium">{t.name}{t.share && <span className="ml-1.5 text-[11px] font-normal text-accent">Shared</span>}</span>
                    <span className="block text-[11px] text-muted">{tripLine(t)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-line px-3 pt-2">
            {editing === 'share' && active ? (
              <SharePanel trip={active} />
            ) : editing ? (
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
                {active && <button onClick={() => setEditing('share')} className="text-muted hover:text-ink">{active.share ? 'Shared…' : 'Share…'}</button>}
                {active && (
                  <button
                    onClick={async () => {
                      close()
                      if (await confirm(`Delete "${active.name}"?`, { message: "This can't be undone.", ok: 'Delete' })) void remove(active.id)
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

/** The open trip's public link: anyone with it sees the trip read-only, without signing in; never the notes, the
 *  wishes for the assistant or the chat. */
function SharePanel({ trip }: { trip: TripSummary }) {
  const setShared = useSaved((s) => s.setShared)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const turn = async (on: boolean) => {
    setBusy(true)
    await setShared(trip.id, on)
    setBusy(false)
  }
  const url = trip.share ? shareUrl(trip.share) : ''
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // No clipboard (an old browser, no permission): the link is selected in the box to copy by hand.
    }
  }
  return (
    <div className="flex flex-col gap-2 pb-1 text-[12px]">
      <p className="text-muted">
        {trip.share ? 'Anyone with this link can see the trip' : 'Make a link anyone can open to see this trip'}, read-only, without signing in. Your notes, your wishes for the assistant and the chat stay private.
      </p>
      {trip.share ? (
        <>
          <div className="flex gap-1.5">
            <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Public link" className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1 text-[12px]" />
            <button onClick={copy} className="rounded-md bg-accent px-2 py-1 font-medium text-on-accent">{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <button disabled={busy} onClick={() => void turn(false)} className="self-start font-medium text-danger hover:underline disabled:opacity-50">Stop sharing</button>
        </>
      ) : (
        <button disabled={busy} onClick={() => void turn(true)} className="self-start rounded-md bg-accent px-2.5 py-1 font-medium text-on-accent disabled:opacity-50">Create link</button>
      )}
    </div>
  )
}
