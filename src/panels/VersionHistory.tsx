// The open trip's version history, like a shared document's (worker/versions.ts, store/versions.ts): its versions,
// newest first, each with when, by whom (you, the trip assistant with what it was asked, another app) and what
// changed, the trip's stops then on a click, and Restore to go back to it (as a new version, so that can be undone
// too). In a panel from the right, opened by the clock beside Undo and Redo in the Itinerary; signed-in trips only (the
// server keeps the history).
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { restoreVersion, useSaved } from '../store/saved'
import { fetchVersions, useVersionHistory, versionChanges, type Version, type VersionBy } from '../store/versions'
import { confirm } from '../ui/dialog'
import { cityName } from '../ui/format'
import { Button } from '../ui/kit'

/** Lines of changes shown under a version before "and N more". */
const LINES_SHOWN = 4

/** "14 Oct, 20:31" (with the year when it isn't this year's). */
function when(ms: number) {
  const d = new Date(ms)
  const year = d.getFullYear() !== new Date().getFullYear()
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', ...(year && { year: 'numeric' }), hour: '2-digit', minute: '2-digit' })
}
/** "20:05 – 20:31": a version's spell of changes, when it lasted a while (the day is the heading's). */
function span(v: Version) {
  const time = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return v.updated - v.started >= 60_000 && new Date(v.started).toDateString() === new Date(v.updated).toDateString() ? `${time(v.started)} – ${time(v.updated)}` : null
}

function byLine(by: VersionBy) {
  switch (by.who) {
    case 'you': return 'You'
    case 'assistant': return <>Trip assistant{by.asked && <span className="text-muted"> · “{by.asked}”</span>}</>
    case 'app': return by.app
    case 'restore': return `You restored the version of ${when(by.from)}`
    case 'earlier': return 'Before the history began'
  }
}

function VersionCard({ v, before, current, onRestore }: { v: Version; before: Version | null | undefined; current: boolean; onRestore: () => void }) {
  const [allLines, setAllLines] = useState(false)
  const [stops, setStops] = useState(false)
  // (`before` undefined: not loaded yet, the page before; null: none, the trip's first.)
  const lines = v.by.who === 'earlier' || before === undefined ? [] : versionChanges(before?.data ?? null, v.data)
  const shown = allLines ? lines : lines.slice(0, LINES_SHOWN)
  const range = span(v)
  return (
    <li className="rounded-lg border border-line bg-panel p-3 text-[13px]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {when(v.updated)}
            {current && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">Current</span>}
          </p>
          <p className="text-[12px]">{byLine(v.by)}{range && <span className="text-muted"> · {range}</span>}</p>
        </div>
        {!current && v.data && <Button onClick={onRestore} className="shrink-0">Restore</Button>}
      </div>
      {lines.length > 0 && (
        <ul className="mt-1.5 list-disc pl-4 text-[12px] text-muted">
          {shown.map((l, i) => <li key={i}>{l}</li>)}
          {lines.length > LINES_SHOWN && !allLines && (
            <li className="list-none"><button onClick={() => setAllLines(true)} className="text-accent hover:underline">and {lines.length - LINES_SHOWN} more</button></li>
          )}
        </ul>
      )}
      {before !== undefined && v.by.who !== 'earlier' && !lines.length && <p className="mt-1.5 text-[12px] text-muted">No changes to the plan (only notes or settings kept with it).</p>}
      {v.data && (
        <>
          <button onClick={() => setStops(!stops)} className="mt-1.5 text-[12px] text-accent hover:underline">{stops ? 'Hide the stops' : 'See the stops'}</button>
          {stops && (
            <p className="mt-1 text-[12px]">
              {v.data.input?.startDate} – {v.data.input?.endDate}
              {v.data.stops?.length ? <>: {v.data.stops.map((s) => `${cityName(s.cityId)} ${s.nights}`).join(' · ')}</> : ': no stops yet'}
            </p>
          )}
        </>
      )}
    </li>
  )
}

const close = () => useVersionHistory.setState({ open: false })

/** The versions listed: the pages loaded so far, of which trip. */
type Listed = { tripId: string; versions: Version[]; previous: Version | null; more: boolean }

export function VersionHistory() {
  const open = useVersionHistory((s) => s.open)
  const tripId = useSaved((s) => s.activeId)
  const tripName = useSaved((s) => s.trips.find((t) => t.id === s.activeId)?.name)
  const [loaded, setListed] = useState<Listed | null>(null)
  // (Another trip's, opened since: not shown.)
  const listed = loaded?.tripId === tripId ? loaded : null
  const [olderLoading, setOlderLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // (Counted up to load the list again: after a restore.)
  const [reload, setReload] = useState(0)

  // Loaded each time it opens (the trip may have changed meanwhile).
  useEffect(() => {
    if (!open || !tripId) return
    let gone = false
    fetchVersions(tripId).then(
      (page) => { if (!gone) { setListed({ tripId, ...page }); setError(null) } },
      (e: Error) => { if (!gone) setError(e.message) },
    )
    return () => { gone = true }
  }, [open, tripId, reload])
  const older = async () => {
    if (!tripId || !listed) return
    setOlderLoading(true)
    try {
      const page = await fetchVersions(tripId, listed.versions.at(-1)?.started)
      setListed({ tripId, ...page, versions: [...listed.versions, ...page.versions] })
    } catch (e) {
      setError((e as Error).message)
    }
    setOlderLoading(false)
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const restore = async (v: Version) => {
    if (!(await confirm(`Restore the version of ${when(v.updated)}?`, { message: 'The trip goes back to how it was then. Nothing is lost: the trip as it is now stays in the history.', ok: 'Restore', danger: false }))) return
    const problem = await restoreVersion(v.id)
    if (problem) setError(problem)
    else setReload((n) => n + 1)
  }

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div onClick={close} className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} />
      <div
        role="dialog"
        aria-label="Version history"
        className={`absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col bg-canvas shadow-xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Version history</p>
            {tripName && <p className="truncate text-[11px] text-muted">{tripName}</p>}
          </div>
          <button onClick={close} aria-label="Close version history" className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error && <p className="mb-2 text-[12px] text-danger">{error}</p>}
          {listed && !listed.versions.length && (
            <p className="text-[13px] text-muted">No versions yet: the trip's history starts with its next change.</p>
          )}
          <ul className="flex flex-col gap-2">
            {listed?.versions.map((v, i, versions) => (
              <VersionCard
                key={v.id} v={v} current={i === 0}
                // (The oldest listed: the one before it is `previous`, or none when this is the trip's first.)
                before={i + 1 < versions.length ? versions[i + 1] : listed.more ? listed.previous ?? undefined : null}
                onRestore={() => void restore(v)}
              />
            ))}
          </ul>
          {((!listed && !error) || olderLoading) && <p className="mt-2 text-[13px] text-muted">Loading…</p>}
          {listed?.more && !olderLoading && <Button onClick={() => void older()} className="mt-2 w-full">Older versions</Button>}
        </div>
      </div>
    </div>
  )
}
