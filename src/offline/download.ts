// The offline map (Settings → Offline map): downloads the base map around the trip's next cities, so it works with no
// connection, and removes a city's map some days after leaving it; and the whole trip zoomed out (the overview, on
// unless turned off), so the route can be followed offline. Downloaded into the cache the service worker reads
// first (pwa/sw.ts, OFFLINE); what to download is in tiles.ts. Runs a while after the app opens, when the trip or the
// settings change, and when the connection comes back.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { dataset as ds } from '../data/dataset'
import { localToday } from '../planner'
import { SHARED_TOKEN } from '../store/shareLink'
import { useTrip } from '../store/trip'
import { cityExpired, citiesToDownload, cityTiles, glyphFiles, overviewTiles, reliefUrl, tileKey, TILES_HOST, type ClearAfter, type Weeks } from './tiles'

/** The service worker's cache for downloads (pwa/sw.ts). */
const CACHE = 'map-offline'
const VERSION_HEADER = 'x-tile-version'
/** Each file's size, kept with it, so what's stored can be counted without reading it all. */
const SIZE_HEADER = 'x-size'

/** The size of everything downloaded. */
async function storedBytes(cache: Cache) {
  const sizes = await Promise.all((await cache.keys()).map(async (k) => Number((await cache.match(k))?.headers.get(SIZE_HEADER) ?? 0)))
  return sizes.reduce((a, b) => a + b, 0)
}
const PARALLEL = 6

type OfflineMapState = {
  weeks: Weeks
  clearAfter: ClearAfter
  /** The cities downloaded, and when. */
  cities: Record<string, { on: number }>
  /** Download the whole trip zoomed out too (with any weeks set). */
  overview: boolean
  /** The overview's tiles downloaded (as tiles.ts names them). */
  overviewTiles: string[]
  /** All that's downloaded, as stored (counted after each change). */
  bytes: number
  /** A download under way: the files done of all. */
  progress: { done: number; total: number } | null
  /** Why the last download stopped short ("offline", or what went wrong). */
  problem: string | null
  setWeeks: (weeks: Weeks) => void
  setClearAfter: (after: ClearAfter) => void
  setOverview: (on: boolean) => void
  removeAll: () => Promise<void>
}

/** Bumped when the settings change, so a download under way stops (and starts again as now set). */
let generation = 0

export const useOfflineMap = create<OfflineMapState>()(
  persist(
    (set) => ({
      weeks: 0,
      clearAfter: 7,
      cities: {},
      overview: true,
      overviewTiles: [],
      bytes: 0,
      progress: null,
      problem: null,
      setWeeks: (weeks) => {
        generation++
        set({ weeks, problem: null })
      },
      setClearAfter: (clearAfter) => set({ clearAfter }),
      setOverview: (overview) => {
        generation++
        set({ overview })
      },
      removeAll: async () => {
        generation++
        set({ weeks: 0, cities: {}, overviewTiles: [], bytes: 0, progress: null, problem: null })
        await caches.delete(CACHE)
      },
    }),
    {
      name: 'rtw-map-offline-map',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ weeks: s.weeks, clearAfter: s.clearAfter, cities: s.cities, overview: s.overview, overviewTiles: s.overviewTiles, bytes: s.bytes }),
    },
  ),
)

const tileJob = (t: string, template: string, version: string) => {
  if (t.startsWith('relief:')) {
    const [z, x, y] = t.slice(7).split('/').map(Number)
    return { key: reliefUrl(z, x, y), url: reliefUrl(z, x, y), version: '' }
  }
  const [z, x, y] = t.split('/').map(Number)
  return { key: tileKey(z, x, y), url: template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)), version }
}

/** A file to fetch, for a city, the overview or the glyphs. */
type Job = { key: string; url: string; version: string; group: string }
const OVERVIEW = ':overview'
const GLYPHS = ':glyphs'

/** Brings the downloads in line with the trip and the settings: removes the cities (and the overview's tiles) no
 *  longer needed, then downloads what's wanted and not yet there. */
async function syncOnce() {
  const { plan } = useTrip.getState()
  const stops = plan?.stops ?? []
  const today = localToday()
  const { weeks, clearAfter, cities, overview } = useOfflineMap.getState()
  const run = generation
  const wanted = citiesToDownload(stops, today, weeks)
  const keep = new Set([...wanted, ...Object.keys(cities).filter((id) => ds.cities[id] && !cityExpired(id, stops, today, clearAfter))])
  // (The trip's stops left to go, from today: the overview follows the route ahead.)
  const ahead = stops.filter((st) => st.depart > today).map((st) => ds.cities[st.cityId]).filter(Boolean)
  const overviewNow = weeks && overview ? overviewTiles(ahead) : new Set<string>()
  if (!keep.size && !overviewNow.size) {
    const s = useOfflineMap.getState()
    if (Object.keys(s.cities).length || s.bytes || s.overviewTiles.length) {
      await caches.delete(CACHE)
      useOfflineMap.setState({ cities: {}, overviewTiles: [], bytes: 0 })
    }
    return
  }
  const cache = await caches.open(CACHE)

  // Cities no longer needed, and overview tiles off the route: their tiles, but those still used.
  const gone = Object.keys(cities).filter((id) => !keep.has(id))
  const stale = useOfflineMap.getState().overviewTiles.filter((t) => !overviewNow.has(t))
  if (gone.length || stale.length) {
    const kept = new Set([...overviewNow, ...[...keep].flatMap((id) => [...cityTiles(ds.cities[id])])])
    const drop = [...gone.flatMap((id) => (ds.cities[id] ? [...cityTiles(ds.cities[id])] : [])), ...stale].filter((t) => !kept.has(t))
    await Promise.all([...new Set(drop)].map((t) => cache.delete(tileJob(t, '', '').key)))
    const bytes = await storedBytes(cache)
    useOfflineMap.setState((s) => ({
      cities: Object.fromEntries(Object.entries(s.cities).filter(([id]) => !gone.includes(id))),
      overviewTiles: s.overviewTiles.filter((t) => overviewNow.has(t)),
      bytes,
    }))
  }

  const todo = wanted.filter((id) => !useOfflineMap.getState().cities[id])
  const haveOverview = new Set(useOfflineMap.getState().overviewTiles)
  const overviewTodo = [...overviewNow].filter((t) => !haveOverview.has(t))
  if (!todo.length && !overviewTodo.length) return
  if (!navigator.onLine) return useOfflineMap.setState({ problem: 'offline' })

  // The map's current version (its address for tiles), then everything to fetch, in order: the glyphs, the overview,
  // then city by city, so each is done (and usable) as soon as can be.
  const tileJson = (await (await fetch(`${TILES_HOST}/planet`)).json()) as { tiles: string[] }
  const template = tileJson.tiles[0]
  const version = template.match(/\/planet\/([^/]+)\//)?.[1] ?? ''
  // (Labels' scripts: of the countries ahead, which the overview names too.)
  const scripts = [...new Set([...todo.map((id) => ds.cities[id]), ...ahead].map((c) => ds.countries[c.iso2]?.english.script).filter((x): x is string => !!x))]
  const jobs: Job[] = glyphFiles(scripts).map((f) => {
    const url = `${TILES_HOST}/fonts/${f.split('/').map(encodeURIComponent).join('/')}`
    return { key: url, url, version: '', group: GLYPHS }
  })
  const seen = new Set(jobs.map((j) => j.key))
  const add = (t: string, group: string) => {
    const job = { ...tileJob(t, template, version), group }
    if (!seen.has(job.key)) jobs.push(job)
    seen.add(job.key)
  }
  overviewTodo.forEach((t) => add(t, OVERVIEW))
  for (const id of todo) for (const t of cityTiles(ds.cities[id])) add(t, id)

  const left = new Map<string, number>()
  for (const j of jobs) left.set(j.group, (left.get(j.group) ?? 0) + 1)
  let done = 0
  let next = 0
  let problem: string | null = null
  useOfflineMap.setState({ progress: { done, total: jobs.length }, problem: null })

  const finish = (job: Job) => {
    done++
    if (done % 10 === 0 || done === jobs.length) useOfflineMap.setState({ progress: { done, total: jobs.length } })
    const n = left.get(job.group)! - 1
    left.set(job.group, n)
    if (n > 0) return
    // A city, or the overview, is downloaded once all its files are.
    if (job.group === OVERVIEW) useOfflineMap.setState((s) => ({ overviewTiles: [...new Set([...s.overviewTiles, ...overviewTodo])] }))
    else if (job.group !== GLYPHS) useOfflineMap.setState((s) => ({ cities: { ...s.cities, [job.group]: { on: Date.now() } } }))
  }

  async function worker() {
    while (next < jobs.length && !problem && run === generation) {
      const job = jobs[next++]
      const have = await cache.match(job.key, { ignoreVary: true })
      if (!have) {
        let res: Response
        try {
          res = await fetch(job.url, { cache: 'no-store' })
        } catch {
          problem = navigator.onLine ? "The map's server didn't answer: tried again later." : 'offline'
          return
        }
        // (A tile that isn't there, out at sea, is simply skipped.)
        if (res.ok) {
          const body = await res.blob()
          const headers = new Headers({ 'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream', [VERSION_HEADER]: job.version, [SIZE_HEADER]: String(body.size) })
          await cache.put(job.key, new Response(body, { status: res.status, headers }))
        }
      }
      finish(job)
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  useOfflineMap.setState({ progress: null, problem, bytes: await storedBytes(cache) })
}

let running = false
let again = false
/** Brings the downloads in line (one at a time: asked again meanwhile, it goes again after). */
export async function syncOfflineMap() {
  if (SHARED_TOKEN || typeof caches === 'undefined') return
  if (running) {
    again = true
    return
  }
  running = true
  try {
    do {
      again = false
      await syncOnce().catch((e: unknown) => useOfflineMap.setState({ progress: null, problem: (e as Error).message }))
    } while (again)
  } finally {
    running = false
  }
}

/** Keeps the downloads in line from now on (main.tsx). */
export function startOfflineMap() {
  if (SHARED_TOKEN || typeof caches === 'undefined') return
  let timer: ReturnType<typeof setTimeout> | undefined
  const soon = (ms: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => void syncOfflineMap(), ms)
  }
  // (A while after opening, so the app's own loading goes first.)
  soon(5000)
  useTrip.subscribe((s, prev) => s.plan !== prev.plan && soon(3000))
  useOfflineMap.subscribe((s, prev) => (s.weeks !== prev.weeks || s.clearAfter !== prev.clearAfter || s.overview !== prev.overview) && soon(0))
  window.addEventListener('online', () => soon(1000))
  // (A day may have passed: a city to remove, the window moved on.)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soon(2000))
}
