import { travelWeight, type Graph } from './graph'

export type RouteItem = { cityId: string; group: number }

const MAX_SEEDS = 25

/**
 * Orders cities into a short route. Groups are visited in order (group index ascending);
 * inside a group the order is free. A fixed start/end city stays first/last.
 * Without a fixed start, several starting cities are tried and the shortest result wins.
 */
export function orderRoute(g: Graph, items: RouteItem[], startId: string | null, endId: string | null): RouteItem[] {
  if (items.length <= 2) return sortForFixedEnds(items, startId, endId)
  const w = (a: string, b: string) => travelWeight(g, a, b)
  const start = items.find((x) => x.cityId === startId) ?? null
  const end = items.find((x) => x.cityId === endId) ?? null
  const groups = [...new Set(items.filter((x) => x !== start && x !== end).map((x) => x.group))].sort((a, b) => a - b)
  const seeds: (RouteItem | null)[] = start ? [null] : items.filter((x) => x.group === groups[0] && x !== end).slice(0, MAX_SEEDS)

  const fixedFirst = start ? 1 : 0
  const fixedLast = (r: RouteItem[]) => (end ? r.length - 2 : r.length - 1)
  let best: RouteItem[] = []
  let bestCost = Infinity
  for (const seed of seeds) {
    const route = construct(items, groups, start, end, seed, w)
    improve(route, fixedFirst, fixedLast(route), w)
    const c = routeCostOf(route, w)
    if (c < bestCost) { bestCost = c; best = route }
  }

  // Iterated local search: shake up a stretch of one group ("double bridge"), re-optimize, keep if better.
  // Small moves alone can get stuck, e.g. when flights make far-apart cities look close.
  const rand = seededRandom(items.length)
  for (let iter = 0; iter < SHAKES; iter++) {
    const candidate = doubleBridge(best, fixedFirst, fixedLast(best), rand)
    if (!candidate) break
    improve(candidate, fixedFirst, fixedLast(candidate), w)
    const c = routeCostOf(candidate, w)
    if (c + 1e-6 < bestCost) { bestCost = c; best = candidate }
  }
  return best
}

const SHAKES = 60

/** Small deterministic random generator, so the same trip always gets the same route. */
function seededRandom(seed: number) {
  let x = (seed * 2654435761) >>> 0 || 1
  return () => {
    x ^= x << 13; x >>>= 0
    x ^= x >> 17
    x ^= x << 5; x >>>= 0
    return x / 4294967296
  }
}

/** Cuts a stretch of one group into four pieces A B C D and swaps the middle ones: A C B D. */
function doubleBridge(route: RouteItem[], first: number, last: number, rand: () => number): RouteItem[] | null {
  const runs: [number, number][] = []
  for (let i = first; i <= last; ) {
    let j = i
    while (j + 1 <= last && route[j + 1].group === route[i].group) j++
    if (j - i + 1 >= 6) runs.push([i, j])
    i = j + 1
  }
  if (!runs.length) return null
  const [s, e] = runs[Math.floor(rand() * runs.length)]
  const len = e - s + 1
  const cuts = new Set<number>()
  while (cuts.size < 3) cuts.add(1 + Math.floor(rand() * (len - 1)))
  const [p1, p2, p3] = [...cuts].sort((a, b) => a - b).map((c) => s + c)
  return [...route.slice(0, p1), ...route.slice(p2, p3), ...route.slice(p1, p2), ...route.slice(p3)]
}

/** Nearest-neighbour construction, group by group. */
function construct(
  items: RouteItem[], groups: number[], start: RouteItem | null, end: RouteItem | null,
  seed: RouteItem | null, w: (a: string, b: string) => number,
): RouteItem[] {
  const route: RouteItem[] = []
  let current: string | null = null
  for (const first of [start, seed]) {
    if (first) { route.push(first); current = first.cityId }
  }
  for (const grp of groups) {
    const pool = items.filter((x) => x.group === grp && !route.includes(x) && x !== end)
    while (pool.length) {
      const from = current
      const next = from ? pool.reduce((a, b) => (w(from, b.cityId) < w(from, a.cityId) ? b : a)) : pool[0]
      route.push(next)
      pool.splice(pool.indexOf(next), 1)
      current = next.cityId
    }
  }
  if (end) route.push(end)
  return route
}

/** Local search inside each group: 2-opt (reverse a segment), or-opt (move 1–3 cities) and swapping two cities. */
function improve(route: RouteItem[], fixedFirst: number, fixedLast: number, w: (a: string, b: string) => number) {
  const c = (a?: RouteItem, b?: RouteItem) => (a && b ? w(a.cityId, b.cityId) : 0)
  const inner = (seg: RouteItem[]) => seg.slice(1).reduce((s, x, k) => s + c(seg[k], x), 0)
  let improved = true
  for (let iter = 0; improved && iter < 50; iter++) {
    improved = false

    for (let i = fixedFirst; i < fixedLast; i++) {
      for (let k = i + 1; k <= fixedLast; k++) {
        if (route[i].group !== route[k].group) break
        const before = c(route[i - 1], route[i]) + c(route[k], route[k + 1]) + inner(route.slice(i, k + 1))
        const rev = route.slice(i, k + 1).reverse()
        const after = c(route[i - 1], route[k]) + c(route[i], route[k + 1]) + inner(rev)
        if (after + 1e-6 < before) {
          route.splice(i, k - i + 1, ...rev)
          improved = true
        }
      }
    }

    // Swap two cities of the same group.
    for (let i = fixedFirst; i < fixedLast; i++) {
      for (let k = i + 1; k <= fixedLast; k++) {
        if (route[i].group !== route[k].group) break
        const before = routeCostOf(route.slice(Math.max(0, i - 1), k + 2), w)
        const swapped = [...route]
        ;[swapped[i], swapped[k]] = [swapped[k], swapped[i]]
        const after = routeCostOf(swapped.slice(Math.max(0, i - 1), k + 2), w)
        if (after + 1e-6 < before) {
          route.splice(0, route.length, ...swapped)
          improved = true
        }
      }
    }

    for (let len = 1; len <= 3; len++) {
      for (let i = fixedFirst; i + len - 1 <= fixedLast; i++) {
        const seg = route.slice(i, i + len)
        if (seg.some((x) => x.group !== seg[0].group)) continue
        const grp = seg[0].group
        const rest = [...route.slice(0, i), ...route.slice(i + len)]
        const gain = c(route[i - 1], seg[0]) + c(seg[len - 1], route[i + len]) - c(route[i - 1], route[i + len]) + inner(seg)
        // With a fixed end city, never insert after it.
        const maxJ = fixedLast === route.length - 1 ? rest.length : rest.length - 1
        let best: { j: number; seg: RouteItem[]; add: number } | null = null
        for (let j = fixedFirst; j <= maxJ; j++) {
          if (j === i) continue
          const prev = rest[j - 1]
          const next = rest[j]
          if ((prev && prev.group > grp) || (next && next.group < grp)) continue
          for (const o of len > 1 ? [seg, [...seg].reverse()] : [seg]) {
            const add = c(prev, o[0]) + c(o[len - 1], next) - c(prev, next) + inner(o)
            if (add < (best?.add ?? gain - 1e-6)) best = { j, seg: o, add }
          }
        }
        if (best) {
          rest.splice(best.j, 0, ...best.seg)
          route.splice(0, route.length, ...rest)
          improved = true
        }
      }
    }
  }
}

const routeCostOf = (route: RouteItem[], w: (a: string, b: string) => number) =>
  route.slice(1).reduce((s, x, i) => s + w(route[i].cityId, x.cityId), 0)

function sortForFixedEnds(items: RouteItem[], startId: string | null, endId: string | null) {
  return [...items].sort((a, b) => rank(a) - rank(b) || a.group - b.group)
  function rank(x: RouteItem) { return x.cityId === startId ? -1 : x.cityId === endId ? 1 : 0 }
}
