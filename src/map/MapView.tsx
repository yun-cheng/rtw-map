import type { FeatureCollection, Point } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { ExpressionSpecification, GeoJSONSource, MapGeoJSONFeature, MapMouseEvent, Map as MlMap, PointLike } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import boundaries from '../../data/gen/boundaries.json'
import { dataset as ds } from '../data/dataset'
import { airBand, dailyCost, likelyMonth, mobileInternet, nearby, nearbyLevel, roughCount, tripDay } from '../planner'
import { useTrip } from '../store/trip'
import { MODE_COLOR, MONTHS, STOP_COLOR, WEATHER_STYLE, levelColor, money, rainShare, shownTemps, temp, tempKind, tempValue } from '../ui/format'
import { useTheme, type Theme } from '../ui/theme'
import { initialMapView, setMapView } from '../store/url'
import { recolorDark } from './darkStyle'
import { NEARBY_LABELS, costScale, nearbyColor } from './scales'

// Vite bundles MapLibre's worker separately; tell MapLibre where it is.
maplibregl.setWorkerUrl(workerUrl)

const STYLE: Record<Theme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}
// Colours of our own layers that depend on the base map.
const INK: Record<Theme, { text: string; halo: string; border: string; dot: string; outline: string; tint: number; rain: string; route: string }> = {
  light: { text: '#1c1917', halo: '#ffffff', border: '#a8a29e', dot: '#a8a29e', outline: '#ffffff', tint: 1, rain: '#2563eb', route: '#a8a29e' },
  dark: { text: '#f5f5f4', halo: '#24201d', border: '#a39a92', dot: '#c4bcb5', outline: '#24201d', tint: 1.6, rain: '#60a5fa', route: '#8a827b' },
}

/** Font size of the number in a stop: smaller from three characters ("104", "-12"). */
const textSize = (text: string) => (text.length >= 3 ? 9.5 : 11)
/** The smallest radius that fits a stop's number. */
const fitRadius = (text: string) => [...text].reduce((w, ch) => w + (/\d/.test(ch) ? 0.6 : 0.4), 0) * textSize(text) / 2 + 1.5
const half = (r: number) => Math.round(r * 2) / 2
/** Base radius of a stop: in the Route view bigger for longer stays (legend in MapControls); elsewhere all the same. */
const SAME_RADIUS = 9

// Weather layer: the stop's white outline becomes a progress ring, blue clockwise from 12 o'clock for the share of
// rainy days in the month, white for the rest. Each one is drawn as an image named
// "rain-<percent>-<radius>-<selected>", added before the stops that use it (images are dropped with the base map
// when the theme changes, and redrawn). A selected stop gets the usual dark selection ring just outside it.
const RING_WIDTH = 2 // the same as the circle's normal white outline
const ringId = (share: number, radius: number, selected: boolean) => `rain-${Math.round(share * 20) * 5}-${radius}-${selected ? 1 : 0}`

function drawRing(id: string, theme: Theme): ImageData | null {
  const m = id.match(/^rain-(\d+)-([\d.]+)-([01])$/)
  if (!m) return null
  const share = Number(m[1]) / 100
  const radius = Number(m[2])
  const selected = m[3] === '1'
  // Starts half a pixel inside the circle so no sliver of map shows between the fill and the ring.
  const mid = radius + (RING_WIDTH - 0.5) / 2
  const ratio = 2
  const size = Math.ceil(2 * (radius + RING_WIDTH + (selected ? 4 : 0)) + 2)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size * ratio
  const ctx = canvas.getContext('2d')!
  ctx.scale(ratio, ratio)
  const arc = (color: string, r: number, width: number, to = 1) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * to)
    ctx.stroke()
  }
  arc('#ffffff', mid, RING_WIDTH + 0.5)
  if (share > 0) arc(INK[theme].rain, mid, RING_WIDTH + 0.5, share)
  // 1px gap, so it doesn't merge with the white part of the ring.
  if (selected) arc(INK[theme].text, radius + RING_WIDTH + 2.25, 2.5)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** Load the base map for the theme; the dark one is recoloured as it loads. */
function showBaseMap(map: MlMap, theme: Theme) {
  map.setStyle(STYLE[theme], { diff: false, transformStyle: theme === 'dark' ? (_, next) => recolorDark(next) : undefined })
}
const FONT = ['Noto Sans Bold']
/** Width of the city/leg panel that covers the right of the map (App.tsx). */
const DRAWER = 420
const CITY_LAYERS = ['stop-circles', 'city-dots']
const ROUTE_LAYERS = ['route-solid', 'route-dashed']

type FC = FeatureCollection

export function MapView() {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const loaded = useRef(false)
  const refresh = useRef<(() => void) | null>(null)
  const { plan, input, layer, layerMonth, nearbyKind, weatherBy, routeBy, selected, fitRequest, currency, tempUnit, tempFeels } = useTrip()
  const theme = useTheme((s) => s.theme)
  const shownTheme = useRef(theme)

  // Create the map once. Our sources and layers are added on every 'style.load': at the start and
  // again after the base map changes with the theme (a new style drops them).
  useEffect(() => {
    const view = initialMapView ?? { center: [22, 50] as [number, number], zoom: 3.6 }
    const map = new maplibregl.Map({ container: container.current!, ...view, attributionControl: { compact: true } })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    showBaseMap(map, shownTheme.current)
    map.on('moveend', () => {
      const c = map.getCenter()
      setMapView({ zoom: map.getZoom(), center: [c.lng, c.lat] })
    })
    map.on('style.load', () => {
      const ink = INK[shownTheme.current]
      // 2×2 transparent pixels, scaled to a stop's diameter by the names layer.
      map.addImage('stop-box', { width: 2, height: 2, data: new Uint8Array(16) })
      map.addSource('countries', { type: 'geojson', data: boundaries as unknown as FC })
      map.addSource('cities', { type: 'geojson', data: empty() })
      map.addSource('route', { type: 'geojson', data: empty() })
      map.addSource('stops', { type: 'geojson', data: empty() })

      map.addLayer({ id: 'country-fill', type: 'fill', source: 'countries', paint: { 'fill-color': 'transparent', 'fill-opacity': 0.25 } })
      map.addLayer({ id: 'country-line', type: 'line', source: 'countries', paint: { 'line-color': ink.border, 'line-width': 0.6 } })
      map.addLayer({
        id: 'route-solid', type: 'line', source: 'route', filter: ['!', ['get', 'estimated']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 6, 3.5] },
      })
      map.addLayer({
        id: 'route-dashed', type: 'line', source: 'route', filter: ['get', 'estimated'],
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 6, 3], 'line-dasharray': [1.5, 1.5] },
      })
      map.addLayer({
        id: 'city-dots', type: 'circle', source: 'cities',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3.5, 7, 6],
          'circle-color': ['case', ['has', 'color'], ['get', 'color'], ink.dot],
          'circle-stroke-color': ink.outline,
          'circle-stroke-width': 1,
        },
      })
      map.addLayer({
        id: 'stop-rain', type: 'symbol', source: 'stops', filter: ['has', 'ring'],
        layout: { 'icon-image': ['get', 'ring'], 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      })
      map.addLayer({
        id: 'stop-circles', type: 'circle', source: 'stops',
        paint: {
          'circle-radius': ['get', 'radius'],
          // Each map view colours the stops by its measure; the Route view uses one colour.
          'circle-color': ['case', ['has', 'color'], ['get', 'color'], STOP_COLOR],
          'circle-stroke-color': ['case', ['get', 'selected'], ink.text, '#ffffff'],
          // On the weather layer the rain ring (stop-rain) takes the outline's place.
          'circle-stroke-width': ['case', ['has', 'ring'], 0, ['get', 'selected'], 3, 2],
        },
      })
      map.addLayer({
        id: 'stop-numbers', type: 'symbol', source: 'stops',
        // The view's number for the stop: the trip day of arrival, the average high or PM2.5 (see stopText).
        layout: { 'text-field': ['get', 'text'], 'text-font': FONT, 'text-size': ['get', 'textSize'], 'text-allow-overlap': true },
        paint: { 'text-color': '#fff' },
      })
      map.addLayer({
        id: 'stop-names', type: 'symbol', source: 'stops',
        layout: {
          // Each name tries the sides of its stop in turn (away from its route lines first, see labelAnchors) and
          // takes the first that's free of stops and other names.
          'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': NAME_SIZE,
          'text-variable-anchor-offset': ['get', 'anchors'], 'text-justify': 'auto', 'text-optional': true,
        },
        paint: { 'text-color': ink.text, 'text-halo-color': ink.halo, 'text-halo-width': 1.5 },
      })
      // An invisible box the size of each circle, so names (ours and the base map's) keep off the stops. Labels are
      // placed from the top layer down, so these go above the names to be in place before any name.
      map.addLayer({
        id: 'stop-boxes', type: 'symbol', source: 'stops',
        layout: { 'icon-image': 'stop-box', 'icon-size': ['get', 'radius'], 'icon-allow-overlap': true },
      })
      loaded.current = true
      refresh.current?.()
    })

    // One click/hover handler for the whole map, so a city wins over the route line drawn under it (separate
    // per-layer handlers both fired, and the route's ran last). Dots get a few pixels of slack around them.
    const hit = (p: maplibregl.Point): MapGeoJSONFeature | undefined => {
      if (!loaded.current) return undefined
      const near = (r: number): [PointLike, PointLike] => [[p.x - r, p.y - r], [p.x + r, p.y + r]]
      return map.queryRenderedFeatures(p, { layers: CITY_LAYERS })[0]
        ?? map.queryRenderedFeatures(near(5), { layers: CITY_LAYERS })[0]
        ?? map.queryRenderedFeatures(near(3), { layers: ROUTE_LAYERS })[0]
    }
    const isCity = (f: MapGeoJSONFeature) => CITY_LAYERS.includes(f.layer.id)
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 })
    map.on('click', (e: MapMouseEvent) => {
      const f = hit(e.point)
      if (!f || (!isCity(f) && Number(f.properties.leg) < 0)) return
      useTrip.getState().select(isCity(f) ? { type: 'city', id: String(f.properties.id) } : { type: 'leg', index: Number(f.properties.leg) })
    })
    map.on('mousemove', (e: MapMouseEvent) => {
      const f = hit(e.point)
      map.getCanvas().style.cursor = f && (isCity(f) || Number(f.properties.leg) >= 0) ? 'pointer' : ''
      if (f && isCity(f)) popup.setLngLat((f.geometry as Point).coordinates as [number, number]).setText(String(f.properties.label ?? f.properties.name)).addTo(map)
      else popup.remove()
    })
    map.getCanvas().addEventListener('mouseleave', () => popup.remove())
    return () => map.remove()
  }, [])

  // Switch the base map with the light/dark theme.
  useEffect(() => {
    const map = mapRef.current
    if (!map || theme === shownTheme.current) return
    shownTheme.current = theme
    loaded.current = false
    showBaseMap(map, theme)
  }, [theme])

  // Push data whenever the plan, layer or selection changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const update = () => {
      const inPlan = new Map(plan?.stops.map((s, i) => [s.cityId, i]) ?? [])
      const tripCountries = new Set(input.groups.flatMap((g) => g.countries.filter((c) => c.mode !== 'excluded').map((c) => c.iso2)))

      const cityFeatures = Object.values(ds.cities)
        .filter((c) => !inPlan.has(c.id))
        .map((c) => {
          const { color, label } = metric(c.id)
          return point([c.lon, c.lat], { id: c.id, name: c.name, label: label ? `${c.name} · ${label}` : `${c.name} (click for details)`, ...(color ? { color } : {}) })
        })
      ;(map.getSource('cities') as GeoJSONSource).setData({ type: 'FeatureCollection', features: cityFeatures })

      // The Route view numbers the stops by the day you arrive (day 1 = start date) or by the nights there (the
      // legend's switch), and sizes them by the nights; the weather, air and mobile views show their value; the
      // others leave the circle plain. Outside the Route view all stops are one size, big enough for the longest
      // number.
      const stops = (plan?.stops ?? []).map((s) => {
        const metrics = metric(s.cityId)
        const day = tripDay(input.startDate, s.arrive)
        return { s, day, metrics, text: layer === 'none' ? String(routeBy === 'nights' ? s.nights : day) : metrics.value ?? '' }
      })
      const sameRadius = half(Math.max(SAME_RADIUS, ...stops.map((x) => fitRadius(x.text))))
      // For each stop, the places its route lines lead to (the first or last hop of the journeys either side).
      const routeEnds = new Map<string, [number, number][]>()
      for (const h of plan?.legs.flatMap((l) => l.hops) ?? []) {
        for (const [a, b] of [[h.from, h.to], [h.to, h.from]]) {
          routeEnds.set(a, [...(routeEnds.get(a) ?? []), [ds.cities[b].lon, ds.cities[b].lat]])
        }
      }
      const stopFeatures = stops.map(({ s, day, metrics: { color, label, rain }, text }) => {
        const c = ds.cities[s.cityId]
        const radius = layer === 'none' ? half(Math.max(fitRadius(text), 7 + 1.2 * Math.sqrt(s.nights))) : sameRadius
        const isSelected = selected?.type === 'city' && selected.id === c.id
        return point([c.lon, c.lat], {
          ...(color ? { color } : {}),
          ...(rain !== undefined ? { ring: ringId(rain, radius, isSelected) } : {}),
          id: c.id, name: c.name, text, textSize: textSize(text), nights: s.nights, radius,
          anchors: labelAnchors(c.id, radius, routeEnds),
          selected: isSelected,
          label: `Day ${day}: ${c.name} · ${s.nights} nights${label ? ` · ${label}` : ''}`,
        })
      })
      // Ring images must exist before the stops are sent: MapLibre's own request for missing images comes too late
      // for the first drawing, which then shows no rings.
      for (const f of stopFeatures) {
        const id = f.properties.ring
        if (typeof id === 'string' && !map.hasImage(id)) map.addImage(id, drawRing(id, shownTheme.current)!, { pixelRatio: 2 })
      }
      ;(map.getSource('stops') as GeoJSONSource).setData({ type: 'FeatureCollection', features: stopFeatures })

      // The Route view colours each hop by how you travel and dashes estimated ones (legend in MapControls); the
      // other views draw the route plainly so it doesn't compete with their own colours.
      const byMode = layer === 'none'
      const routeFeatures = (plan?.legs ?? []).flatMap((leg, li) =>
        leg.hops.map((h) => ({
          type: 'Feature' as const,
          properties: {
            leg: li, selected: selected?.type === 'leg' && selected.index === li,
            color: byMode ? MODE_COLOR[h.mode] ?? INK[shownTheme.current].route : INK[shownTheme.current].route,
            estimated: byMode && h.estimated,
          },
          geometry: { type: 'LineString' as const, coordinates: [[ds.cities[h.from].lon, ds.cities[h.from].lat], [ds.cities[h.to].lon, ds.cities[h.to].lat]] },
        })),
      )
      // From home and back (set in Preferences): drawn dashed, not clickable (leg -1), and left out when fitting the map.
      const homeFeatures = [plan?.home.out, plan?.home.back].flatMap((leg) => (leg ? leg.hops : [])).map((h) => ({
        type: 'Feature' as const,
        properties: { leg: -1, selected: false, color: INK[shownTheme.current].route, estimated: true },
        geometry: { type: 'LineString' as const, coordinates: [[ds.cities[h.from].lon, ds.cities[h.from].lat], [ds.cities[h.to].lon, ds.cities[h.to].lat]] },
      }))
      ;(map.getSource('route') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [...homeFeatures, ...routeFeatures] })

      map.setPaintProperty('country-fill', 'fill-color', countryFill(layer, tripCountries))
      // Country tints need a little more strength to show on the dark map.
      map.setPaintProperty('country-fill', 'fill-opacity', (layer === 'schengen' ? 0.25 : 0.1) * INK[shownTheme.current].tint)
    }

    const costs = costScale(input.budget, currency)

    /** Month for the weather and air layers: the chosen one, or (by default) when you're there on this trip. */
    function monthFor(cityId: string): number {
      return layerMonth || likelyMonth(ds, plan, input, cityId)
    }

    /**
     * Colour (and hover text) of a city for the map layer; for weather also the share of rainy days, and for
     * weather and air the number shown in the stop's circle.
     */
    function metric(cityId: string): { color?: string; label?: string; rain?: number; value?: string } {
      if (layer === 'climate') {
        const month = monthFor(cityId)
        const m = ds.climate[cityId]?.[month - 1]
        if (!m) return {}
        // Coloured and numbered by the high (days) or the low (nights), as picked in the legend, as it feels or as
        // measured (the shared setting).
        const shown = shownTemps(m, tempFeels)
        const t = weatherBy === 'low' ? shown.low : shown.high
        const rain = rainShare(m.rainDays, month)
        return {
          color: WEATHER_STYLE[tempKind(t)].color, rain, value: String(tempValue(t, tempUnit)),
          label: `${MONTHS[month - 1]}: ${shown.feels ? 'feels like ' : ''}${tempValue(shown.high, tempUnit)}° / ${temp(shown.low, tempUnit)} (high / low)${shown.feels ? `, real ${tempValue(m.tHigh, tempUnit)}° / ${temp(m.tLow, tempUnit)}` : ''}, rain on ${Math.round(m.rainDays)} days`,
        }
      }
      if (layer === 'air') {
        const month = monthFor(cityId)
        const a = ds.air.byCity[cityId]?.[month - 1]
        if (!a) return {}
        const band = airBand(a.pm25)
        return {
          color: levelColor(band.level), value: String(Math.round(a.pm25)),
          label: `${MONTHS[month - 1]} air: ${band.short.toLowerCase()} (PM2.5 ${a.pm25} µg/m³)`,
        }
      }
      if (layer === 'schengen') {
        const inside = !!ds.countries[ds.cities[cityId]?.iso2]?.schengen
        return { color: inside ? '#2563eb' : '#d97706', label: inside ? 'Schengen area' : 'Outside Schengen' }
      }
      if (layer === 'mobile') {
        const m = mobileInternet(ds, cityId)
        if (!m) return { color: NO_DATA, label: 'Mobile internet: no data' }
        return { color: levelColor(m.level), value: String(m.downMbps), label: `Mobile internet: ${m.short.toLowerCase()} (~${m.downMbps} Mbps)` }
      }
      if (layer === 'nearby') {
        const n = nearby(ds, cityId)?.[nearbyKind]
        if (n === undefined) return { color: NO_DATA, label: `${NEARBY_LABELS[nearbyKind]}: no data` }
        return { color: nearbyColor(nearbyLevel(n)), label: `${NEARBY_LABELS[nearbyKind]} within ${ds.amenities.radiusKm} km: ${roughCount(n)}` }
      }
      if (layer === 'cost') {
        const d = dailyCost(ds, cityId, input.budget)
        return { color: costs.color(d), label: `~${money(d, currency)}/day (${input.budget})` }
      }
      return {}
    }

    refresh.current = update
    if (loaded.current) update()
  }, [plan, input, layer, layerMonth, nearbyKind, weatherBy, routeBy, selected, currency, tempUnit, tempFeels])

  // Bring a selected city into view when it's off screen or under the city panel (it may have been picked from
  // the itinerary, the timeline or another city's panel).
  useEffect(() => {
    const map = mapRef.current
    if (!map || selected?.type !== 'city') return
    const c = ds.cities[selected.id]
    if (!c) return
    const { width, height } = map.getContainer().getBoundingClientRect()
    const p = map.project([c.lon, c.lat])
    const margin = 40
    const visible = p.x > margin && p.x < width - DRAWER - margin && p.y > margin + 80 && p.y < height - margin
    // Centre it in the part of the map the panel doesn't cover.
    if (!visible) map.easeTo({ center: [c.lon, c.lat], offset: [-DRAWER / 2, 0], duration: 700 })
  }, [selected])

  // Zoom to the plan after generating or importing.
  useEffect(() => {
    const map = mapRef.current
    const stops = useTrip.getState().plan?.stops
    if (!map || !stops?.length || !fitRequest) return
    const b = new maplibregl.LngLatBounds()
    stops.forEach((s) => b.extend([ds.cities[s.cityId].lon, ds.cities[s.cityId].lat]))
    map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 60, right: 60 }, duration: 800 })
  }, [fitRequest])

  return (
    <div ref={container} className="h-full w-full" />
  )
}

const NAME_SIZE = 12
/** A city's colour on a map view that has no data for it. */
const NO_DATA = '#a8a29e'
/** Where a name can go around its stop: the side, and the direction from the stop towards it on screen. */
const SIDES: { anchor: string; dir: [number, number] }[] = [
  // The anchor is the side of the text nearest the stop: 'top' puts the name below.
  { anchor: 'top', dir: [0, 1] }, { anchor: 'right', dir: [-1, 0] }, { anchor: 'left', dir: [1, 0] }, { anchor: 'bottom', dir: [0, -1] },
  { anchor: 'top-left', dir: [Math.SQRT1_2, Math.SQRT1_2] }, { anchor: 'top-right', dir: [-Math.SQRT1_2, Math.SQRT1_2] },
  { anchor: 'bottom-left', dir: [Math.SQRT1_2, -Math.SQRT1_2] }, { anchor: 'bottom-right', dir: [-Math.SQRT1_2, -Math.SQRT1_2] },
]
const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))

/**
 * The sides of a stop to try for its name, in order: the ones furthest (in angle) from its route lines first,
 * then below, right, left and above as before. Each with the offset that clears the circle, for
 * text-variable-anchor-offset.
 */
function labelAnchors(cityId: string, radius: number, routeEnds: Map<string, [number, number][]>): (string | [number, number])[] {
  const c = ds.cities[cityId]
  // Directions on screen (y down) of the lines leaving the stop.
  const lines = (routeEnds.get(cityId) ?? []).map(([lon, lat]) => {
    const dx = lon - c.lon
    const dy = -(mercatorY(lat) - mercatorY(c.lat)) * (180 / Math.PI)
    const len = Math.hypot(dx, dy) || 1
    return [dx / len, dy / len]
  })
  // How close a side comes to a line: the largest cosine between them (1 = right on it).
  const clash = (dir: [number, number]) => Math.max(-1, ...lines.map(([x, y]) => x * dir[0] + y * dir[1]))
  const gap = (radius + 3) / NAME_SIZE // ems
  return SIDES
    .map((side, i) => ({ side, score: clash(side.dir) + i * 0.01 }))
    .sort((a, b) => a.score - b.score)
    .flatMap(({ side: { anchor, dir } }) => [anchor, [dir[0] * gap, dir[1] * gap] as [number, number]])
}

const empty = (): FC => ({ type: 'FeatureCollection', features: [] })
const point = (coordinates: number[], properties: Record<string, unknown>) => ({
  type: 'Feature' as const, properties, geometry: { type: 'Point' as const, coordinates },
})

function countryFill(layer: string, tripCountries: Set<string>): ExpressionSpecification | string {
  const entries = Object.values(ds.countries).flatMap((c) => {
    let color = 'transparent'
    if (layer === 'schengen') color = c.schengen ? '#2563eb' : '#d97706'
    else if (tripCountries.has(c.iso2)) color = '#0f766e'
    return [c.iso2, color]
  })
  return ['match', ['get', 'iso2'], ...entries, 'transparent'] as unknown as ExpressionSpecification
}
