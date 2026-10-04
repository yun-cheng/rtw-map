import type { FeatureCollection } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { ExpressionSpecification, GeoJSONSource, MapLayerMouseEvent, Map as MlMap } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import boundaries from '../../data/gen/boundaries.json'
import { dataset as ds } from '../data/dataset'
import { CARD_LABELS, ENGLISH_LABELS, airBand, cardLevel, dailyCost, englishLevel } from '../planner'
import { useTrip } from '../store/trip'
import { MODE_COLOR, MONTHS, WEATHER_STYLE, money, ramp, weatherKind } from '../ui/format'

// Vite bundles MapLibre's worker separately; tell MapLibre where it is.
maplibregl.setWorkerUrl(workerUrl)

const STYLE = 'https://tiles.openfreemap.org/styles/positron'
const FONT = ['Noto Sans Bold']

type FC = FeatureCollection

export function MapView() {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const loaded = useRef(false)
  const pending = useRef<(() => void) | null>(null)
  const { plan, input, layer, layerMonth, selected, fitRequest, currency } = useTrip()

  // Create the map once.
  useEffect(() => {
    const map = new maplibregl.Map({ container: container.current!, style: STYLE, center: [22, 50], zoom: 3.6, attributionControl: { compact: true } })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.on('load', () => {
      map.addSource('countries', { type: 'geojson', data: boundaries as unknown as FC })
      map.addSource('cities', { type: 'geojson', data: empty() })
      map.addSource('route', { type: 'geojson', data: empty() })
      map.addSource('stops', { type: 'geojson', data: empty() })

      map.addLayer({ id: 'country-fill', type: 'fill', source: 'countries', paint: { 'fill-color': 'transparent', 'fill-opacity': 0.25 } })
      map.addLayer({ id: 'country-line', type: 'line', source: 'countries', paint: { 'line-color': '#a8a29e', 'line-width': 0.6 } })
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
          'circle-color': ['case', ['has', 'color'], ['get', 'color'], '#a8a29e'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1,
        },
      })
      map.addLayer({
        id: 'stop-circles', type: 'circle', source: 'stops',
        paint: {
          'circle-radius': ['+', 7, ['*', 1.2, ['sqrt', ['get', 'nights']]]],
          // Weather/cost/English layers colour the stops too; otherwise Schengen vs outside.
          'circle-color': ['case', ['has', 'color'], ['get', 'color'], ['get', 'schengen'], '#2563eb', '#d97706'],
          'circle-stroke-color': ['case', ['get', 'selected'], '#1c1917', '#ffffff'],
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 2],
        },
      })
      map.addLayer({
        id: 'stop-numbers', type: 'symbol', source: 'stops',
        layout: { 'text-field': ['to-string', ['get', 'order']], 'text-font': FONT, 'text-size': 11, 'text-allow-overlap': true },
        paint: { 'text-color': '#fff' },
      })
      map.addLayer({
        id: 'stop-names', type: 'symbol', source: 'stops',
        layout: {
          'text-field': ['concat', ['get', 'name'], ' · ', ['to-string', ['get', 'nights']], 'n'],
          'text-font': FONT, 'text-size': 12, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-optional': true,
        },
        paint: { 'text-color': '#1c1917', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      })

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 })
      for (const id of ['city-dots', 'stop-circles']) {
        map.on('click', id, (e: MapLayerMouseEvent) => {
          const f = e.features?.[0]
          if (f) useTrip.getState().select({ type: 'city', id: String(f.properties.id) })
        })
        map.on('mouseenter', id, (e: MapLayerMouseEvent) => {
          map.getCanvas().style.cursor = 'pointer'
          const f = e.features?.[0]
          if (f) popup.setLngLat(e.lngLat).setText(String(f.properties.label ?? f.properties.name)).addTo(map)
        })
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; popup.remove() })
      }
      for (const id of ['route-solid', 'route-dashed']) {
        map.on('click', id, (e: MapLayerMouseEvent) => {
          const f = e.features?.[0]
          if (f) useTrip.getState().select({ type: 'leg', index: Number(f.properties.leg) })
        })
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''))
      }
      loaded.current = true
      pending.current?.()
    })
    return () => map.remove()
  }, [])

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

      const stopFeatures = (plan?.stops ?? []).map((s, i) => {
        const c = ds.cities[s.cityId]
        const { color } = metric(c.id)
        return point([c.lon, c.lat], {
          ...(color ? { color } : {}),
          id: c.id, name: c.name, order: i + 1, nights: s.nights,
          schengen: !!ds.countries[c.iso2]?.schengen,
          selected: selected?.type === 'city' && selected.id === c.id,
          label: `${i + 1}. ${c.name} · ${s.nights} nights`,
        })
      })
      ;(map.getSource('stops') as GeoJSONSource).setData({ type: 'FeatureCollection', features: stopFeatures })

      const routeFeatures = (plan?.legs ?? []).flatMap((leg, li) =>
        leg.hops.map((h) => ({
          type: 'Feature' as const,
          properties: { leg: li, color: MODE_COLOR[h.mode] ?? '#57534e', estimated: h.estimated, selected: selected?.type === 'leg' && selected.index === li },
          geometry: { type: 'LineString' as const, coordinates: [[ds.cities[h.from].lon, ds.cities[h.from].lat], [ds.cities[h.to].lon, ds.cities[h.to].lat]] },
        })),
      )
      ;(map.getSource('route') as GeoJSONSource).setData({ type: 'FeatureCollection', features: routeFeatures })

      map.setPaintProperty('country-fill', 'fill-color', countryFill(layer, tripCountries))
      map.setPaintProperty('country-fill', 'fill-opacity', layer === 'schengen' || layer === 'advisory' ? 0.25 : 0.1)
    }

    function metric(cityId: string): { color?: string; label?: string } {
      if (layer === 'climate') {
        const m = ds.climate[cityId]?.[layerMonth - 1]
        if (!m) return {}
        const kind = weatherKind(m)
        return { color: WEATHER_STYLE[kind].color, label: `${MONTHS[layerMonth - 1]}: ${WEATHER_STYLE[kind].label.replace(/ \(.*\)/, '').toLowerCase()}, high ${m.tHigh}°C, ${m.rainDays} rain days` }
      }
      if (layer === 'air') {
        const a = ds.air.byCity[cityId]?.[layerMonth - 1]
        if (!a) return {}
        const band = airBand(a.pm25)
        return { color: ramp((band.level - 1) / 4), label: `${MONTHS[layerMonth - 1]} air: ${band.short.toLowerCase()} (PM2.5 ${a.pm25})` }
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

    if (loaded.current) update()
    else pending.current = update
  }, [plan, input, layer, layerMonth, selected, currency])

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
