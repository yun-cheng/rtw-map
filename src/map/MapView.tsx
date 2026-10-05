import type { FeatureCollection, Point } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { ExpressionSpecification, GeoJSONSource, MapGeoJSONFeature, MapMouseEvent, Map as MlMap, PointLike } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import boundaries from '../../data/gen/boundaries.json'
import { dataset as ds } from '../data/dataset'
import { CARD_LABELS, ENGLISH_LABELS, airBand, cardLevel, dailyCost, englishLevel, likelyMonth, tripDay } from '../planner'
import { useTrip } from '../store/trip'
import { MODE_COLOR, MONTHS, STOP_COLOR, WEATHER_STYLE, money, rainShare, ramp, temp, temperatureKind } from '../ui/format'
import { useTheme, type Theme } from '../ui/theme'
import { initialMapView, setMapView } from '../store/url'
import { recolorDark } from './darkStyle'

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

/** Radius of a stop's circle: bigger for longer stays, at least 10px so a three-digit day number fits. */
const stopRadius = (day: number, nights: number) => Math.round(Math.max(day >= 100 ? 10 : 0, 7 + 1.2 * Math.sqrt(nights)) * 2) / 2

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
  const { plan, input, layer, layerMonth, selected, fitRequest, currency, tempUnit } = useTrip()
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
        // The trip day of arrival (day 1 = start date); three-digit days get a smaller font.
        layout: { 'text-field': ['to-string', ['get', 'day']], 'text-font': FONT, 'text-size': ['case', ['>=', ['get', 'day'], 100], 9.5, 11], 'text-allow-overlap': true },
        paint: { 'text-color': '#fff' },
      })
      map.addLayer({
        id: 'stop-names', type: 'symbol', source: 'stops',
        layout: {
          'text-field': ['concat', ['get', 'name'], ' · ', ['to-string', ['get', 'nights']], 'n'],
          'text-font': FONT, 'text-size': 12, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-optional': true,
        },
        paint: { 'text-color': ink.text, 'text-halo-color': ink.halo, 'text-halo-width': 1.5 },
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
      if (!f) return
      useTrip.getState().select(isCity(f) ? { type: 'city', id: String(f.properties.id) } : { type: 'leg', index: Number(f.properties.leg) })
    })
    map.on('mousemove', (e: MapMouseEvent) => {
      const f = hit(e.point)
      map.getCanvas().style.cursor = f ? 'pointer' : ''
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

      const stopFeatures = (plan?.stops ?? []).map((s) => {
        const c = ds.cities[s.cityId]
        const { color, label, rain } = metric(c.id)
        const day = tripDay(input.startDate, s.arrive)
        const radius = stopRadius(day, s.nights)
        const isSelected = selected?.type === 'city' && selected.id === c.id
        return point([c.lon, c.lat], {
          ...(color ? { color } : {}),
          ...(rain !== undefined ? { ring: ringId(rain, radius, isSelected) } : {}),
          id: c.id, name: c.name, day, nights: s.nights, radius,
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
      ;(map.getSource('route') as GeoJSONSource).setData({ type: 'FeatureCollection', features: routeFeatures })

      map.setPaintProperty('country-fill', 'fill-color', countryFill(layer, tripCountries))
      // Country tints need a little more strength to show on the dark map.
      map.setPaintProperty('country-fill', 'fill-opacity', (layer === 'schengen' || layer === 'advisory' ? 0.25 : 0.1) * INK[shownTheme.current].tint)
    }

    /** Month for the weather and air layers: the chosen one, or (by default) when you're there on this trip. */
    function monthFor(cityId: string): number {
      return layerMonth || likelyMonth(ds, plan, input, cityId)
    }

    /** Colour (and hover text) of a city for the map layer; for weather also the share of rainy days. */
    function metric(cityId: string): { color?: string; label?: string; rain?: number } {
      if (layer === 'climate') {
        const month = monthFor(cityId)
        const m = ds.climate[cityId]?.[month - 1]
        if (!m) return {}
        const kind = temperatureKind(m)
        const rain = rainShare(m.rainDays, month)
        return {
          color: WEATHER_STYLE[kind].color, rain,
          label: `${MONTHS[month - 1]}: high ${temp(m.tHigh, tempUnit)}, rain on ${Math.round(m.rainDays)} days`,
        }
      }
      if (layer === 'air') {
        const month = monthFor(cityId)
        const a = ds.air.byCity[cityId]?.[month - 1]
        if (!a) return {}
        const band = airBand(a.pm25)
        return { color: ramp((band.level - 1) / 4), label: `${MONTHS[month - 1]} air: ${band.short.toLowerCase()} (PM2.5 ${a.pm25})` }
      }
      if (layer === 'schengen') {
        const inside = !!ds.countries[ds.cities[cityId]?.iso2]?.schengen
        return { color: inside ? '#2563eb' : '#d97706', label: inside ? 'Schengen area' : 'Outside Schengen' }
      }
      if (layer === 'cost') {
        const d = dailyCost(ds, cityId, input.budget)
        return { color: ramp(1 - Math.min(1, Math.max(0, (d - 20) / 60))), label: `~${money(d, currency)}/day (${input.budget})` }
      }
      if (layer === 'cards') {
        const { level } = cardLevel(ds, cityId)
        return { color: ramp((level - 1) / 4), label: `Cards: ${CARD_LABELS[level].short.toLowerCase()}` }
      }
      if (layer === 'english') {
        const { level } = englishLevel(ds, cityId)
        return { color: ramp((level - 1) / 4), label: `English: ${ENGLISH_LABELS[level].short.toLowerCase()}` }
      }
      return {}
    }

    refresh.current = update
    if (loaded.current) update()
  }, [plan, input, layer, layerMonth, selected, currency, tempUnit])

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

const empty = (): FC => ({ type: 'FeatureCollection', features: [] })
const point = (coordinates: number[], properties: Record<string, unknown>) => ({
  type: 'Feature' as const, properties, geometry: { type: 'Point' as const, coordinates },
})

function countryFill(layer: string, tripCountries: Set<string>): ExpressionSpecification | string {
  const entries = Object.values(ds.countries).flatMap((c) => {
    let color = 'transparent'
    if (layer === 'schengen') color = c.schengen ? '#2563eb' : '#d97706'
    else if (layer === 'advisory') {
      const lvl = ds.advisories[c.iso2]?.excludedByDefault ? 4 : ds.advisories[c.iso2]?.level ?? 1
      color = ['#16a34a', '#16a34a', '#eab308', '#f97316', '#dc2626'][lvl]
    } else if (tripCountries.has(c.iso2)) color = '#0f766e'
    return [c.iso2, color]
  })
  return ['match', ['get', 'iso2'], ...entries, 'transparent'] as unknown as ExpressionSpecification
}
