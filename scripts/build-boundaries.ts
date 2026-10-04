// Country outlines for map layers from Natural Earth 1:50m (public domain), trimmed to our countries.
import { join } from 'node:path'
import { GEN, SEED, fetchCached, readJson, today, writeJson } from './lib.ts'

const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'
const { countries } = readJson<{ countries: { iso2: string }[] }>(join(SEED, 'countries.json'))
const wanted = new Set(countries.map((c) => c.iso2))

type Ring = number[][]
type Feature = { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }
const ne = JSON.parse(await fetchCached(URL, 'ne_50m_admin_0_countries.geojson')) as { features: Feature[] }

// Round to ~1 km and drop repeated points to keep the file small.
const simplifyRing = (ring: Ring): Ring => {
  const out: Ring = []
  for (const [x, y] of ring) {
    const p = [Math.round(x * 100) / 100, Math.round(y * 100) / 100]
    const last = out[out.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
  }
  return out
}

const features = ne.features
  .map((f) => {
    const p = f.properties
    const iso2 = p.ADM0_A3 === 'KOS' ? 'XK' : p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2
    return { f, iso2 }
  })
  .filter(({ iso2 }) => wanted.has(iso2))
  .map(({ f, iso2 }) => {
    const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][]
    const coordinates = polys.map((poly) => poly.map(simplifyRing).filter((r) => r.length >= 4)).filter((p) => p.length)
    return { type: 'Feature', properties: { iso2 }, geometry: { type: 'MultiPolygon', coordinates } }
  })

const missing = [...wanted].filter((iso2) => !features.some((f) => f.properties.iso2 === iso2))
if (missing.length) console.error(`No boundary for: ${missing.join(', ')}`)

writeJson(join(GEN, 'boundaries.json'), {
  _meta: { source: 'Natural Earth 1:50m admin-0 countries (public domain)', updatedAt: today() },
  type: 'FeatureCollection',
  features,
}, true)
