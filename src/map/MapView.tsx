import type { FeatureCollection, Point } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { ExpressionSpecification, GeoJSONSource, MapGeoJSONFeature, MapMouseEvent, Map as MlMap, PointLike } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import boundaries from '../../data/gen/boundaries.json'
import { dataset as ds } from '../data/dataset'
import { REGIONS, REGION_OF } from '../data/regions'
import { citiesIn, tripDay, type TripInput } from '../planner'
import { useTrip } from '../store/trip'
import { MODE_COLOR, STOP_COLOR } from '../ui/format'
import { DRAWER_WIDTH } from '../ui/layout'
import { isPhone } from '../ui/usePhone'
import { useTheme, type Theme } from '../ui/theme'
import { initialMapView, setMapView } from '../store/url'
import { recolorDark } from './darkStyle'
import { cityMetrics, cityTip, stopTip } from './cityMetric'
import { shapeOf } from './shapes'
import { tipElement } from '../ui/tipBody'

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
const CITY_LAYERS = ['stop-circles', 'city-dots']
const ROUTE_LAYERS = ['route-solid', 'route-dashed']
const STOP_LAYERS = ['stop-rain', 'stop-circles', 'stop-numbers', 'stop-names', 'stop-boxes']
/** The country or region pointed at (on the map while adding places, or in the Trip tab's list): blue, unlike the
 *  trip's own colours. */
const HOVER_COLOR = 'rgba(59,130,246,0.55)'
/** Colours of the trip's countries while its setup is open, by how they're picked: must visit strong and optional
 *  faint, so they're easy to tell apart. */
const PICK_COLOR = { must: 'rgba(20,184,166,0.8)', optional: 'rgba(15,118,110,0.2)', excluded: 'rgba(120,113,108,0.25)' }

type FC = FeatureCollection

/**
 * `editing`: the trip's setup (the Trip tab) is open. The map then shows the trip's countries instead of its route and
 * stops, and while adding places (`picking`) a click adds or removes the country or region under it.
 */
export function MapView({ editing = false }: { editing?: boolean }) {
  const container = useRef<HTMLDivElement>(null)
  const editingRef = useRef(editing)
  editingRef.current = editing
  const mapRef = useRef<MlMap | null>(null)
  const loaded = useRef(false)
  const refresh = useRef<(() => void) | null>(null)
  const { plan, input, layer, layerMonth, nearbyKind, costKind, weatherBy, routeBy, selected, fitRequest, currency, tempUnit, tempFeels, picking } = useTrip()
  const theme = useTheme((s) => s.theme)
  const shownTheme = useRef(theme)

  // Create the map once. Our sources and layers are added on every 'style.load': at the start and
  // again after the base map changes with the theme (a new style drops them).
  useEffect(() => {
    const view = initialMapView ?? { center: [22, 50] as [number, number], zoom: 3.6 }
    const map = new maplibregl.Map({ container: container.current!, ...view, attributionControl: { compact: true } })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    // The map's credits start folded into their ⓘ button, which shows them: MapLibre opens them once, when its sources
    // first say what to credit (some time after loading), so fold them the moment that happens.
    const credits = map.getContainer().querySelector('.maplibregl-ctrl-attrib')
    if (credits) {
      const fold = () => {
        if (!credits.classList.contains('maplibregl-compact-show')) return
        credits.classList.remove('maplibregl-compact-show')
        watch.disconnect()
      }
      const watch = new MutationObserver(fold)
      watch.observe(credits, { attributeFilter: ['class'] })
      fold()
    }
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
      // Outlines of the countries the app has cities in (all of them while editing the trip, see pick-line).
      map.addLayer({ id: 'country-line', type: 'line', source: 'countries', filter: ['in', ['get', 'iso2'], ['literal', Object.keys(ds.countries)]], paint: { 'line-color': ink.border, 'line-width': 0.6 } })
      map.addLayer({ id: 'pick-fill', type: 'fill', source: 'countries', layout: { visibility: 'none' }, paint: { 'fill-color': 'transparent' } })
      // The country or region a click would add or remove, shaded over its colour (under the borders).
      map.addLayer({
        id: 'pick-hover', type: 'fill', source: 'countries', filter: ['in', ['get', 'iso2'], ['literal', []]], layout: { visibility: 'none' },
        paint: { 'fill-color': HOVER_COLOR },
      })
      map.addLayer({ id: 'pick-line', type: 'line', source: 'countries', layout: { visibility: 'none' }, paint: { 'line-color': ink.border, 'line-width': 0.5 } })
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
    // Adding places: the country under the pointer, and the countries a click would add (it, or its whole region).
    const picked = (p: maplibregl.Point) => {
      const how = useTrip.getState().picking
      if (!how || !editingRef.current || !loaded.current) return null
      const iso2 = map.queryRenderedFeatures(p, { layers: ['pick-fill'] })[0]?.properties.iso2 as string | undefined
      if (!iso2) return null
      const region = REGIONS.find((r) => r.name === REGION_OF[iso2])
      return { how, iso2, region, countries: how === 'region' && region ? region.countries : [iso2] }
    }
    const showPick = (e: MapMouseEvent) => {
      const p = picked(e.point)
      map.setFilter('pick-hover', ['in', ['get', 'iso2'], ['literal', p?.countries ?? []]])
      map.getCanvas().style.cursor = p ? 'pointer' : ''
      if (p) popup.setLngLat(e.lngLat).setDOMContent(tipElement(pickTip(useTrip.getState().input, p.how, p.iso2))).addTo(map)
      else popup.remove()
    }
    map.on('click', (e: MapMouseEvent) => {
      if (useTrip.getState().picking && editingRef.current) {
        const p = picked(e.point)
        if (p?.how === 'region' && p.region) useTrip.getState().toggleRegion(p.region.name)
        else if (p) useTrip.getState().toggleCountry(p.iso2)
        // The hover box now says the opposite (added ↔ not).
        return showPick(e)
      }
      const f = hit(e.point)
      if (!f || (!isCity(f) && Number(f.properties.leg) < 0)) return
      useTrip.getState().select(isCity(f) ? { type: 'city', id: String(f.properties.id) } : { type: 'leg', index: Number(f.properties.leg) })
    })
    map.on('mousemove', (e: MapMouseEvent) => {
      if (useTrip.getState().picking && editingRef.current) return showPick(e)
      const f = hit(e.point)
      map.getCanvas().style.cursor = f && (isCity(f) || Number(f.properties.leg) >= 0) ? 'pointer' : ''
      // Each city carries its hover box content (see cityTip / stopTip), laid out like the timeline's.
      if (f && isCity(f)) popup.setLngLat((f.geometry as Point).coordinates as [number, number]).setDOMContent(tipElement(JSON.parse(String(f.properties.tip)))).addTo(map)
      else popup.remove()
    })
    map.getCanvas().addEventListener('mouseleave', () => {
      popup.remove()
      if (loaded.current) map.setFilter('pick-hover', ['in', ['get', 'iso2'], ['literal', []]])
    })
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

      // While editing the trip, the stops aren't shown, so every city is a dot, in plain colour (no map view's legend).
      const cityFeatures = Object.values(ds.cities)
        .filter((c) => editing || !inPlan.has(c.id))
        .map((c) => {
          const m = metric(c.id)
          return point([c.lon, c.lat], { id: c.id, name: c.name, tip: JSON.stringify(cityTip(c.id, m)), ...(m.color && !editing ? { color: m.color } : {}) })
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
      const stopFeatures = stops.map(({ s, metrics, text }) => {
        const { color, rain } = metrics
        const c = ds.cities[s.cityId]
        const radius = layer === 'none' ? half(Math.max(fitRadius(text), 7 + 1.2 * Math.sqrt(s.nights))) : sameRadius
        const isSelected = selected?.type === 'city' && selected.id === c.id
        return point([c.lon, c.lat], {
          ...(color ? { color } : {}),
          ...(rain !== undefined ? { ring: ringId(rain, radius, isSelected) } : {}),
          id: c.id, name: c.name, text, textSize: textSize(text), nights: s.nights, radius,
          anchors: labelAnchors(c.id, radius, routeEnds),
          selected: isSelected,
          tip: JSON.stringify(stopTip(input.startDate, s, metrics)),
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

      map.setPaintProperty('country-fill', 'fill-color', editing ? 'transparent' : countryFill(layer, tripCountries))
      // Country tints need a little more strength to show on the dark map.
      map.setPaintProperty('country-fill', 'fill-opacity', (layer === 'schengen' ? 0.25 : 0.1) * INK[shownTheme.current].tint)

      // Editing the trip: its countries instead of its route and stops; while adding places, every country's outline.
      const show = (ids: string[], on: boolean) => ids.forEach((id) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'))
      show([...ROUTE_LAYERS, ...STOP_LAYERS], !editing)
      show(['pick-fill'], editing)
      show(['pick-line'], editing && !!picking)
      show(['pick-hover'], editing)
      show(['city-dots'], !(editing && picking))
      if (editing) map.setPaintProperty('pick-fill', 'fill-color', pickFill(input))
    }

    const metric = cityMetrics({ plan, input, layer, layerMonth, nearbyKind, costKind, weatherBy, currency, tempUnit, tempFeels })

    refresh.current = update
    if (loaded.current) update()
  }, [plan, input, layer, layerMonth, nearbyKind, costKind, weatherBy, routeBy, selected, currency, tempUnit, tempFeels, editing, picking])

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
    // The panel covers the right of the map, or on a phone the bottom half (its sheet opens to half).
    const cover = isPhone() ? { right: 0, bottom: height / 2 } : { right: DRAWER_WIDTH, bottom: 0 }
    const visible = p.x > margin && p.x < width - cover.right - margin && p.y > margin + 80 && p.y < height - cover.bottom - margin
    // Centre it in the part of the map the panel doesn't cover.
    if (!visible) map.easeTo({ center: [c.lon, c.lat], offset: [-cover.right / 2, -cover.bottom / 2], duration: 700 })
  }, [selected])

  // Countries pointed at in the Trip tab's list: shaded, and what they're part of (a country in a region's card: the
  // region) brought into view, after a moment so passing over the list doesn't move the map, at a zoom that fits it,
  // kept between FOCUS_ZOOM's: a small country isn't blown up, and a huge one is shown in part, around its cities in
  // the app, rather than as a speck.
  const shaded = useTrip((s) => s.hovered.countries)
  useEffect(() => {
    const map = mapRef.current
    if (map && loaded.current) map.setFilter('pick-hover', ['in', ['get', 'iso2'], ['literal', shaded]])
  }, [shaded])
  // (As text, so moving between countries of the same region doesn't move the map again.)
  const focus = useTrip((s) => s.hovered.focus.join())
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current || !focus) return
    const hovered = focus.split(',')
    const shape = shapeOf(hovered)
    const box = shape && new maplibregl.LngLatBounds([shape.box[0], shape.box[1]], [shape.box[2], shape.box[3]])
    if (!shape) return
    const timer = setTimeout(() => {
      const { width, height } = map.getContainer().getBoundingClientRect()
      // What covers the map: the legend along the top, and a phone's bottom sheet or the city panel at the right.
      const cover = { top: 40, ...(isPhone() ? { right: 0, bottom: sheetHeight(map) } : { right: useTrip.getState().selected ? DRAWER_WIDTH : 0, bottom: 0 }) }
      const margin = 40
      const fit = map.cameraForBounds(box!, { padding: { top: cover.top + margin, bottom: cover.bottom + margin, left: margin, right: cover.right + margin } })?.zoom ?? map.getZoom()
      const zoom = Math.max(FOCUS_ZOOM.min, Math.min(FOCUS_ZOOM.max, fit))
      // Shown in part (too big to fit): around its cities in the app, else the middle of its land.
      const center = (zoom > fit + 0.01 && citiesCentre(hovered)) || shape.centre
      // The middle of the part of the map nothing covers, where it goes; no move when it's about there already.
      const mid = { x: (width - cover.right) / 2, y: (height + cover.top - cover.bottom) / 2 }
      const p = map.project(center)
      if (Math.abs(map.getZoom() - zoom) < 0.5 && Math.hypot(p.x - mid.x, p.y - mid.y) < 40) return
      map.easeTo({ center, zoom, offset: [mid.x - width / 2, mid.y - height / 2], duration: 700 })
    }, 350)
    return () => clearTimeout(timer)
  }, [focus])

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

/** The zooms the map moves to for a country or region pointed at in the Trip tab (see MapView). */
const FOCUS_ZOOM = { min: 3, max: 6 }

/** The middle of the app's cities in these countries (where a trip there goes), if it has any. */
function citiesCentre(countries: string[]): [number, number] | null {
  const cities = Object.values(ds.cities).filter((c) => countries.includes(c.iso2))
  if (!cities.length) return null
  return [cities.reduce((t, c) => t + c.lon, 0) / cities.length, cities.reduce((t, c) => t + c.lat, 0) / cities.length]
}

/** How much of the map a phone's bottom sheet covers (BottomSheet sets --sheet-height on the map's parent). */
const sheetHeight = (map: MlMap) => parseFloat(map.getContainer().parentElement?.style.getPropertyValue('--sheet-height') || '0') || 0

const empty = (): FC => ({ type: 'FeatureCollection', features: [] })
const point = (coordinates: number[], properties: Record<string, unknown>) => ({
  type: 'Feature' as const, properties, geometry: { type: 'Point' as const, coordinates },
})

/** The trip's countries by how they're picked (must visit, optional, excluded), for editing its setup. */
function pickFill(input: TripInput): ExpressionSpecification | string {
  const modes = new Map(input.groups.flatMap((g) => g.countries.map((c) => [c.iso2, c.mode] as const)))
  if (!modes.size) return 'transparent'
  return ['match', ['get', 'iso2'], ...[...modes].flatMap(([iso2, mode]) => [iso2, PICK_COLOR[mode]]), 'transparent'] as unknown as ExpressionSpecification
}

/** What a click would do while adding places: the country or region under the pointer, and whether it's in the trip. */
function pickTip(input: TripInput, how: 'region' | 'country', iso2: string) {
  const name = ds.countries[iso2]?.name ?? ds.world[iso2] ?? iso2
  const covered = citiesIn(ds)
  const mode = input.groups.flatMap((g) => g.countries).find((c) => c.iso2 === iso2)?.mode
  if (how === 'region') {
    const region = REGIONS.find((r) => r.name === REGION_OF[iso2])
    if (!region) return { title: name }
    const added = input.groups.some((g) => g.name === region.name)
    const withCities = region.countries.filter((c) => covered.has(c)).length
    return {
      title: region.name,
      lines: [
        `${region.countries.length} ${region.countries.length > 1 ? 'countries' : 'country'}${withCities === region.countries.length ? '' : withCities ? `, ${withCities} with cities` : ', no cities yet'}`,
        added ? 'In your trip: click to remove' : 'Click to add',
      ],
    }
  }
  return {
    title: name,
    lines: [
      ...(covered.has(iso2) ? [] : ['No cities yet']),
      mode && mode !== 'excluded' ? 'In your trip: click to remove' : mode === 'excluded' ? 'Excluded: click to add' : 'Click to add',
    ],
  }
}

function countryFill(layer: string, tripCountries: Set<string>): ExpressionSpecification | string {
  const entries = Object.values(ds.countries).flatMap((c) => {
    let color = 'transparent'
    if (layer === 'schengen') color = c.schengen ? '#2563eb' : '#d97706'
    else if (tripCountries.has(c.iso2)) color = '#0f766e'
    return [c.iso2, color]
  })
  return ['match', ['get', 'iso2'], ...entries, 'transparent'] as unknown as ExpressionSpecification
}
