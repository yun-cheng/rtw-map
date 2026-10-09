// Country outlines for the map from Natural Earth 1:50m (public domain): every country, so any can be picked for a
// trip, with its name (for countries the app has no data on yet) and population (where the map centres on a region).
import { join } from 'node:path'
import { GEN, fetchCached, today, writeJson } from './lib.ts'

const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'

type Ring = number[][]
type Feature = { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }
const ne = JSON.parse(await fetchCached(URL, 'ne_50m_admin_0_countries.geojson')) as { features: Feature[] }

// Not countries anyone travels to (no towns), or open ocean.
const SKIP = new Set(['AQ', 'HM', 'TF', 'IO', 'GS'])
// Areas Natural Earth draws on their own, counted with the country ISO 3166 puts them in.
const PART_OF: Record<string, string> = { SOL: 'SO', CYN: 'CY' }
// Shorter or clearer names than Natural Earth's abbreviations.
const NAMES: Record<string, string> = {
  US: 'United States', BA: 'Bosnia and Herzegovina', CD: 'DR Congo', CF: 'Central African Republic', DO: 'Dominican Republic',
  GQ: 'Equatorial Guinea', SS: 'South Sudan', SB: 'Solomon Islands', MH: 'Marshall Islands', AG: 'Antigua and Barbuda',
  VC: 'Saint Vincent and the Grenadines', KN: 'Saint Kitts and Nevis', SZ: 'Eswatini', EH: 'Western Sahara', FO: 'Faroe Islands',
  KY: 'Cayman Islands', TC: 'Turks and Caicos Islands', VG: 'British Virgin Islands', VI: 'US Virgin Islands', MP: 'Northern Mariana Islands',
  CK: 'Cook Islands', PF: 'French Polynesia', PN: 'Pitcairn Islands', WF: 'Wallis and Futuna', FK: 'Falkland Islands',
  BL: 'Saint Barthélemy', MF: 'Saint Martin', PM: 'Saint Pierre and Miquelon', ST: 'São Tomé and Príncipe',
}

// Douglas–Peucker: drop points within `tol` degrees of the line through their neighbours, then round to ~1 km. A ring
// too small for that (Vatican City, Tuvalu's atolls) is kept as it is, rounded to ~10 m, so every country has an outline.
const TOL = 0.02
const simplifyRing = (ring: Ring): Ring => {
  const simple = simplified(ring)
  return simple.length >= 4 ? simple : ring.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4])
}
const simplified = (ring: Ring): Ring => {
  const keep = new Uint8Array(ring.length)
  keep[0] = keep[ring.length - 1] = 1
  const stack: [number, number][] = [[0, ring.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = ring[a]
    const [bx, by] = ring[b]
    const len = Math.hypot(bx - ax, by - ay)
    let far = -1
    let farD = TOL
    for (let i = a + 1; i < b; i++) {
      const [x, y] = ring[i]
      const d = len ? Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / len : Math.hypot(x - ax, y - ay)
      if (d > farD) { farD = d; far = i }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]) }
  }
  const out: Ring = []
  ring.forEach(([x, y], i) => {
    if (!keep[i]) return
    const p = [Math.round(x * 100) / 100, Math.round(y * 100) / 100]
    const last = out[out.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
  })
  return out
}

const byIso = new Map<string, { name: string; pop: number; polys: Ring[][] }>()
for (const f of ne.features) {
  const p = f.properties
  const iso2 = PART_OF[p.ADM0_A3] ?? (p.ADM0_A3 === 'KOS' ? 'XK' : p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2)
  if (iso2 === '-99' || SKIP.has(iso2)) continue
  const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][]
  const simple = polys.map((poly) => poly.map(simplifyRing).filter((r) => r.length >= 4)).filter((poly) => poly.length)
  const entry = byIso.get(iso2)
  // A country's main feature names it (not e.g. Australia's "Ashmore and Cartier Is.").
  const main = p.ADM0_A3 === p.SOV_A3 || p.TYPE !== 'Dependency' || !entry
  const pop = Number(p.POP_EST) || 0
  if (entry) {
    entry.polys.push(...simple)
    entry.pop += pop
    if (main && p.TYPE !== 'Dependency' && !PART_OF[p.ADM0_A3]) entry.name = NAMES[iso2] ?? p.NAME
  } else byIso.set(iso2, { name: NAMES[iso2] ?? p.NAME, pop, polys: simple })
}

const features = [...byIso].sort(([a], [b]) => a.localeCompare(b)).map(([iso2, { name, pop, polys }]) => ({
  type: 'Feature',
  properties: { iso2, name, pop },
  geometry: { type: 'MultiPolygon', coordinates: polys },
}))

writeJson(join(GEN, 'boundaries.json'), {
  _meta: { source: 'Natural Earth 1:50m admin-0 countries (public domain)', updatedAt: today() },
  type: 'FeatureCollection',
  features,
}, true)
console.log(`${features.length} countries`)
