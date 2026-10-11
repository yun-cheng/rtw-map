import { dataset as ds } from '../data/dataset'
import { localToday } from '../planner'
import { useOfflineMap } from '../offline/download'
import type { ClearAfter, Weeks } from '../offline/tiles'
import { useTrip } from '../store/trip'
import { Button } from '../ui/kit'

const WEEKS: { value: Weeks; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'The next week' },
  { value: 2, label: 'The next 2 weeks' },
  { value: 3, label: 'The next 3 weeks' },
  { value: 4, label: 'The next 4 weeks' },
  { value: 'trip', label: 'The whole trip' },
]
const CLEAR: { value: ClearAfter; label: string }[] = [
  { value: 7, label: 'A week after leaving' },
  { value: 0, label: 'On leaving' },
  { value: 'never', label: 'Never (until removed)' },
]

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1e6))} MB`

/** Settings → Offline map: which of the trip's cities to download the map around (src/offline/download.ts), when to
 *  remove a city's, and what's downloaded so far. */
export function OfflineMapSettings() {
  const { weeks, clearAfter, cities, overview, overviewTiles, bytes, progress, problem, setWeeks, setClearAfter, setOverview, removeAll } = useOfflineMap()
  const plan = useTrip((s) => s.plan)
  const ids = Object.keys(cities)
  const parts = [...(overviewTiles.length ? ['Trip overview'] : []), ...ids.map((id) => ds.cities[id]?.name ?? id)]
  const notStarted = !!plan?.stops.length && plan.stops[0].arrive > localToday()
  const select = 'rounded-md border border-line bg-panel px-2 py-1 font-medium'

  return (
    <div className="flex flex-col gap-2.5 text-[13px]">
      <p className="text-muted">The map around the trip's cities, downloaded to use with no connection: 5–20 MB a city (the first in a region the most), so best on Wi-Fi.</p>
      <label className="flex items-center justify-between gap-3">
        <span className="text-muted">Download</span>
        <select value={String(weeks)} onChange={(e) => setWeeks(WEEKS.find((w) => String(w.value) === e.target.value)!.value)} className={select}>
          {WEEKS.map((w) => <option key={w.label} value={String(w.value)}>{w.label}</option>)}
        </select>
      </label>
      {weeks !== 0 && (
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={overview} onChange={(e) => setOverview(e.target.checked)} className="mt-0.5" />
          <span>
            The whole trip, zoomed out
            <span className="block text-[12px] text-muted">Continents to countries around every stop ahead, to follow the route offline: about 10 MB.</span>
          </span>
        </label>
      )}
      <label className="flex items-center justify-between gap-3">
        <span className="text-muted">Remove a city's map</span>
        <select value={String(clearAfter)} onChange={(e) => setClearAfter(CLEAR.find((c) => String(c.value) === e.target.value)!.value)} className={select}>
          {CLEAR.map((c) => <option key={c.label} value={String(c.value)}>{c.label}</option>)}
        </select>
      </label>
      {weeks !== 0 && weeks !== 'trip' && notStarted && <p className="text-[12px] text-muted">Before the trip starts: its first {weeks === 1 ? 'week' : `${weeks} weeks`}.</p>}
      {progress && (
        <div>
          <div className="flex justify-between text-[12px] text-muted"><span>Downloading…</span><span>{Math.round((progress.done / progress.total) * 100)}%</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}
      {!progress && problem && <p className="text-[12px] text-muted">{problem === 'offline' ? 'Waiting for a connection to download.' : problem}</p>}
      {parts.length > 0 && (
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0">
            <span className="font-medium">{ids.length} {ids.length === 1 ? 'city' : 'cities'}{overviewTiles.length > 0 && ' and the overview'} · {mb(bytes)}</span>
            <span className="block text-[12px] text-muted">{parts.join(', ')}</span>
          </p>
          <Button onClick={() => void removeAll()} className="shrink-0">Remove all</Button>
        </div>
      )}
    </div>
  )
}
