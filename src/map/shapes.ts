// Where the map centres on countries and regions (the Trip tab's list, see MapView).
import type { FeatureCollection, MultiPolygon } from 'geojson'
import boundaries from '../../data/gen/boundaries.json'

type Box = [number, number, number, number]
type Shape = { box: Box; centre: [number, number]; pop: number }
/**
 * A country's outline as the map focuses on it: its bounds, and the middle of its largest piece of land (the middle
 * of its bounds can be outside it: Croatia's is in Bosnia, Greece's out at sea), and its population. One
 * reaching across the date line (Russia, Fiji) is measured with longitudes past 180°, so it isn't the width of the world.
 */
const shapes = new Map<string, Shape | null>()
export function countryShape(iso2: string): Shape | null {
  if (shapes.has(iso2)) return shapes.get(iso2)!
  const f = (boundaries as unknown as FeatureCollection).features.find((x) => x.properties?.iso2 === iso2)
  let shape: Shape | null = null
  if (f) {
    const polys = (f.geometry as MultiPolygon).coordinates
    const points = polys.flat(2)
    const lats = points.map((p) => p[1])
    const span = (lons: number[]) => Math.max(...lons) - Math.min(...lons)
    // (Only a country spread over more than half the world's longitudes: the date line runs through it.)
    const shift = span(points.map((p) => p[0])) > 180 && span(points.map((p) => (p[0] < 0 ? p[0] + 360 : p[0]))) < span(points.map((p) => p[0]))
    const lon = (x: number) => (shift && x < 0 ? x + 360 : x)
    const lons = points.map((p) => lon(p[0]))
    // Each piece's outer ring: its area and centroid (on the flat map, which is close enough here).
    const pieces = polys.map(([ring]) => {
      let a = 0, cx = 0, cy = 0
      for (let i = 0; i < ring.length - 1; i++) {
        const [x0, y0, x1, y1] = [lon(ring[i][0]), ring[i][1], lon(ring[i + 1][0]), ring[i + 1][1]]
        const k = x0 * y1 - x1 * y0
        a += k
        cx += (x0 + x1) * k
        cy += (y0 + y1) * k
      }
      return { area: Math.abs(a / 2), centre: [cx / (3 * a), cy / (3 * a)] as [number, number] }
    })
    const box: Shape['box'] = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
    // (A piece with no area, a sliver, has no centroid: then the middle of the bounds.)
    const main = pieces.reduce<(typeof pieces)[number] | null>((x, y) => (y.area > (x?.area ?? 0) ? y : x), null)
    if (points.length) shape = { box, centre: main?.centre ?? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], pop: Number(f.properties?.pop) || 0 }
  }
  shapes.set(iso2, shape)
  return shape
}

/**
 * Countries together (a region): their bounds, and their middles weighted by population, which is where trips go
 * (by area, Greenland would put the Nordic countries' middle out in the Atlantic).
 */
export function shapeOf(countries: string[]): { box: Box; centre: [number, number] } | null {
  const shapes = countries.map(countryShape).filter((s) => s !== null)
  if (!shapes.length) return null
  // Longitudes on the same side of the date line as the most populous country's, so they average.
  const ref = shapes.reduce((a, b) => (b.pop > a.pop ? b : a)).centre[0]
  const near = (lon: number) => lon + 360 * Math.round((ref - lon) / 360)
  const all = shapes.map((s) => {
    const d = near(s.centre[0]) - s.centre[0]
    return { box: [s.box[0] + d, s.box[1], s.box[2] + d, s.box[3]] as Box, centre: [s.centre[0] + d, s.centre[1]], weight: s.pop || 1 }
  })
  const total = all.reduce((t, s) => t + s.weight, 0)
  return {
    box: [Math.min(...all.map((s) => s.box[0])), Math.min(...all.map((s) => s.box[1])), Math.max(...all.map((s) => s.box[2])), Math.max(...all.map((s) => s.box[3]))],
    centre: [all.reduce((t, s) => t + s.centre[0] * s.weight, 0) / total, all.reduce((t, s) => t + s.centre[1] * s.weight, 0) / total],
  }
}
