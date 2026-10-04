import type { Dataset, Leg, LegHop } from './types'

/** Countries where we never invent road connections across the border (closed or restricted crossings). */
const HARD_BORDER = new Set(['RU', 'BY', 'UA'])
const MAX_ESTIMATED_DRIVE_MIN = 420
const TRANSFER_MIN = 30
/** Time at airports per flight (getting there, check-in, security, boarding, bags). */
export const AIRPORT_MIN = 150
/** How much a euro of fare "costs" in minutes when choosing routes: backpackers trade some time for money. */
const MINUTES_PER_EUR = 1.5

/** Door-to-door time of one hop: flights include airport time. */
const hopMinutes = (h: LegHop) => h.durationMin + (h.mode === 'flight' ? AIRPORT_MIN : 0)
export const UNREACHABLE = 1e7

export type Graph = {
  ids: string[]
  index: Map<string, number>
  dist: Float64Array // route weight, n×n: door-to-door minutes plus a fare term
  next: Int32Array // path reconstruction, n×n
  hop: Map<string, LegHop> // "a>b" → direct hop
}

const key = (a: string, b: string) => `${a}>${b}`

/** All-pairs shortest travel times between the allowed cities (Floyd–Warshall; n is small). */
export function buildGraph(ds: Dataset, allowed: Set<string>): Graph {
  const ids = [...allowed].filter((id) => ds.cities[id])
  const n = ids.length
  const index = new Map(ids.map((id, i) => [id, i]))
  const dist = new Float64Array(n * n).fill(UNREACHABLE)
  const next = new Int32Array(n * n).fill(-1)
  const hop = new Map<string, LegHop>()

  const addEdge = (h: LegHop) => {
    const i = index.get(h.from)
    const j = index.get(h.to)
    if (i === undefined || j === undefined) return
    const w = hopMinutes(h) + TRANSFER_MIN + MINUTES_PER_EUR * ((h.priceMin + h.priceMax) / 2)
    if (w < dist[i * n + j]) {
      dist[i * n + j] = w
      next[i * n + j] = j
      hop.set(key(h.from, h.to), h)
    }
  }

  const curated = new Set<string>()
  for (const c of ds.connections) {
    for (const [from, to] of [[c.from, c.to], [c.to, c.from]]) {
      curated.add(key(from, to))
      addEdge({
        from, to, mode: c.mode, durationMin: c.durationMin, priceMin: c.priceMin, priceMax: c.priceMax,
        overnight: c.overnight, estimated: false, frequency: c.frequency, note: c.note,
      })
    }
  }

  for (const r of ds.roads) {
    if (curated.has(key(r.a, r.b)) || r.driveMin > MAX_ESTIMATED_DRIVE_MIN) continue
    const ca = ds.cities[r.a]?.iso2
    const cb = ds.cities[r.b]?.iso2
    if (!ca || !cb) continue
    if (ca !== cb && (HARD_BORDER.has(ca) || HARD_BORDER.has(cb))) continue
    const durationMin = Math.round((r.driveMin * 1.3 + 20) / 15) * 15
    const priceMin = Math.max(3, Math.round(r.km * 0.05))
    const priceMax = Math.max(5, Math.round(r.km * 0.08))
    for (const [from, to] of [[r.a, r.b], [r.b, r.a]]) {
      addEdge({ from, to, mode: 'bus', durationMin, priceMin, priceMax, overnight: false, estimated: true })
    }
  }

  for (let i = 0; i < n; i++) { dist[i * n + i] = 0; next[i * n + i] = i }
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const ik = dist[i * n + k]
      if (ik >= UNREACHABLE) continue
      for (let j = 0; j < n; j++) {
        const d = ik + dist[k * n + j]
        if (d < dist[i * n + j]) {
          dist[i * n + j] = d
          next[i * n + j] = next[i * n + k]
        }
      }
    }
  }
  return { ids, index, dist, next, hop }
}

export function travelWeight(g: Graph, a: string, b: string): number {
  const i = g.index.get(a)
  const j = g.index.get(b)
  if (i === undefined || j === undefined) return UNREACHABLE
  return g.dist[i * g.ids.length + j]
}

export function legBetween(g: Graph, a: string, b: string): Leg {
  const n = g.ids.length
  const i = g.index.get(a)
  const j = g.index.get(b)
  const empty: Leg = { from: a, to: b, hops: [], durationMin: 0, priceMin: 0, priceMax: 0, overnight: false, estimated: true, reachable: false }
  if (i === undefined || j === undefined || g.dist[i * n + j] >= UNREACHABLE) return empty
  const hops: LegHop[] = []
  let cur = i
  while (cur !== j) {
    const nxt = g.next[cur * n + j]
    hops.push(g.hop.get(key(g.ids[cur], g.ids[nxt]))!)
    cur = nxt
  }
  const durationMin = hops.reduce((s, h) => s + hopMinutes(h), 0) + TRANSFER_MIN * (hops.length - 1)
  return {
    from: a,
    to: b,
    hops,
    durationMin,
    priceMin: hops.reduce((s, h) => s + h.priceMin, 0),
    priceMax: hops.reduce((s, h) => s + h.priceMax, 0),
    overnight: durationMin >= 360 && hops.some((h) => h.overnight),
    estimated: hops.some((h) => h.estimated),
    reachable: true,
  }
}
