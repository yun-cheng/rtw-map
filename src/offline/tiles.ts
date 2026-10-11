// What the offline map downloads (download.ts): the base map's tiles around each city, from its streets out to the
// region around it at low zoom, and the labels' glyphs for the scripts of the trip's countries. Pure, so it's tested and the same tiles are found
// again when a city's map is removed.
import { addDays, type ScheduledStop } from '../planner'

export const TILES_HOST = 'https://tiles.openfreemap.org'
/** The vector tiles' address under any version of the map: tiles are kept by place, not by version (pwa/sw.ts). */
export const tileKey = (z: number, x: number, y: number) => `${TILES_HOST}/planet/_/${z}/${x}/${y}.pbf`
/** The base map's shaded relief at low zoom (the light style's `ne2_shaded`, to zoom 6). */
export const reliefUrl = (z: number, x: number, y: number) => `${TILES_HOST}/natural_earth/ne2sr/${z}/${x}/${y}.png`

/** How far around a city each zoom is kept, km: the streets (zoom 14, the most the map has; closer zooms use it)
 *  near the centre, wider and coarser further out, to the region around it (a city's neighbours share those). */
const RADIUS_KM: Record<number, number> = { 14: 4, 13: 7, 12: 12, 11: 20, 10: 35, 9: 50, 8: 80 }
/** Zoomed out, from the whole world to the country (zoom 7), the region around the city. */
const REGION_KM = 150
const REGION_MAX_ZOOM = 7
/** A big city's streets go further out. */
const BIG_CITY = 1_000_000
const BIG_CITY_STREETS_KM = 7
const RELIEF_MAX_ZOOM = 6

const KM_PER_DEG = 111.32
const clampLat = (lat: number) => Math.max(-85.05, Math.min(85.05, lat))

/** The tile (x, y) at a zoom for a point. */
export function tileAt(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z
  const rad = (clampLat(lat) * Math.PI) / 180
  const x = Math.floor(((lon + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))]
}

/** Tiles ("z/x/y") covering a box at a zoom. */
function boxTiles(west: number, south: number, east: number, north: number, z: number, into: Set<string>) {
  const [x0, y0] = tileAt(west, north, z)
  const [x1, y1] = tileAt(east, south, z)
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) into.add(`${z}/${x}/${y}`)
}

/** The tiles kept for a city: the base map's ("z/x/y") and, zoomed out, the relief's ("relief:z/x/y"). */
export function cityTiles(city: { lat: number; lon: number; population: number | null }): Set<string> {
  const tiles = new Set<string>()
  const around = (km: number, z: number, into: Set<string>, prefix = '') => {
    const dLat = km / KM_PER_DEG
    const dLon = km / (KM_PER_DEG * Math.max(0.1, Math.cos((city.lat * Math.PI) / 180)))
    const found = new Set<string>()
    boxTiles(city.lon - dLon, city.lat - dLat, city.lon + dLon, city.lat + dLat, z, found)
    for (const t of found) into.add(prefix + t)
  }
  for (const [zoom, km] of Object.entries(RADIUS_KM)) {
    const z = Number(zoom)
    around(z === 14 && (city.population ?? 0) >= BIG_CITY ? BIG_CITY_STREETS_KM : km, z, tiles)
  }
  for (let z = 0; z <= REGION_MAX_ZOOM; z++) around(REGION_KM, z, tiles)
  for (let z = 0; z <= RELIEF_MAX_ZOOM; z++) around(REGION_KM, z, tiles, 'relief:')
  return tiles
}

/** The whole trip zoomed out (download.ts, "Overview of the whole trip"): continent to country (zooms 0–5, and the
 *  relief) around every stop, so the route can be followed offline; the cities' own tiles go closer. */
const OVERVIEW_MAX_ZOOM = 5
export function overviewTiles(points: { lat: number; lon: number }[]): Set<string> {
  const tiles = new Set<string>()
  for (const p of points) {
    const dLat = REGION_KM / KM_PER_DEG
    const dLon = REGION_KM / (KM_PER_DEG * Math.max(0.1, Math.cos((p.lat * Math.PI) / 180)))
    for (let z = 0; z <= OVERVIEW_MAX_ZOOM; z++) {
      const found = new Set<string>()
      boxTiles(p.lon - dLon, p.lat - dLat, p.lon + dLon, p.lat + dLat, z, found)
      for (const t of found) tiles.add(t).add(`relief:${t}`)
    }
  }
  return tiles
}

/** Weeks of the trip to download: its next 1–4 (from its first day, before it starts), all of it, or none. */
export type Weeks = 0 | 1 | 2 | 3 | 4 | 'trip'
/** Days after leaving a city its map is removed, or never (until removed by hand). */
export type ClearAfter = 0 | 7 | 'never'

/** The cities to download: the stops in the trip's next `weeks` from today (from its first day, before it starts). */
export function citiesToDownload(stops: ScheduledStop[], today: string, weeks: Weeks): string[] {
  if (!weeks || !stops.length) return []
  const from = stops[0].arrive > today ? stops[0].arrive : today
  const to = weeks === 'trip' ? '9999-12-31' : addDays(from, weeks * 7)
  return [...new Set(stops.filter((s) => s.depart > from && s.arrive < to).map((s) => s.cityId))]
}

/** Whether a downloaded city's map is no longer needed: not in the trip any more, or left `after` days ago (its last
 *  stay there). */
export function cityExpired(cityId: string, stops: ScheduledStop[], today: string, after: ClearAfter): boolean {
  const stays = stops.filter((s) => s.cityId === cityId)
  if (!stays.length) return true
  if (after === 'never') return false
  const left = stays.reduce((last, s) => (s.depart > last ? s.depart : last), '')
  return addDays(left, after) <= today
}

/** The labels' fonts in the base map's styles (light and dark). */
export const FONT_STACKS = ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic']
/** Glyph ranges (MapLibre fetches 256 characters at a time): Latin with its accents and punctuation always; others by
 *  the scripts the trip's countries write in. Chinese, Japanese and Korean are drawn with the device's own font. */
const LATIN = [0, 256, 512, 7680, 8192]
const SCRIPTS: [RegExp, number[]][] = [
  [/greek/i, [768]],
  [/cyrillic/i, [1024, 1280]],
  [/armenian|hebrew/i, [1280]],
  [/arabic|persian|urdu/i, [1536, 1792]],
  [/devanagari|hindi|bengali|nepali/i, [2304]],
  [/gurmukhi|gujarati/i, [2560]],
  [/tamil|oriya/i, [2816]],
  [/telugu|kannada/i, [3072]],
  [/malayalam|sinhala/i, [3328]],
  [/thai|lao/i, [3584]],
  [/tibetan/i, [3840]],
  [/georgian|burmese|myanmar/i, [4096]],
  [/ethiopic|amharic/i, [4608]],
  [/khmer/i, [6016]],
]

/** The glyph files ("<font>/<start>-<end>.pbf") for countries writing in these scripts (the data's free-text
 *  descriptions, e.g. "Cyrillic and Latin"). */
export function glyphFiles(scripts: string[]): string[] {
  const starts = new Set(LATIN)
  for (const script of scripts) for (const [re, ranges] of SCRIPTS) if (re.test(script)) ranges.forEach((r) => starts.add(r))
  return FONT_STACKS.flatMap((font) => [...starts].sort((a, b) => a - b).map((r) => `${font}/${r}-${r + 255}.pbf`))
}
