// Keeps what's on screen in the address bar, so a refresh (or a copied link) comes back to the same view:
//   ?panel=itinerary&city=krakow&tab=weather&layer=climate&month=7&map=5.20/50.061/19.937
// (or leg=3 for an open journey; part=prices for a sub-tab of the city panel tab; kind=atm for the Nearby layer; temp=low for the Weather layer by night temperatures; show=nights for the Route view numbered by nights; map is zoom/latitude/longitude, as on openstreetmap.org; no month means the
// weather and air layers show each place at the time of the trip).
// The address is replaced, not pushed, so moving around doesn't fill the browser's history.
import { dataset as ds } from '../data/dataset'
import { COST_KINDS, type CostKind } from '../planner'
import { MAP_LAYERS, NEARBY_KINDS, useTrip, type NearbyKind, type CityTab, type MapLayer, type Selection } from './trip'

export type MapView = { zoom: number; center: [lon: number, lat: number] }

const PANELS = ['setup', 'itinerary', 'assistant'] as const
const TABS: CityTab[] = ['overview', 'transport', 'weather', 'costs', 'daily', 'phrases', 'health', 'safety', 'entry']
/** Layers that show one month of the year. */
const MONTHLY: MapLayer[] = ['climate', 'air']

/** The map position in the address when the page loaded, if any. */
export let initialMapView: MapView | null = null
let mapView: MapView | null = null

export function parseMapView(s: string | null): MapView | null {
  const [zoom, lat, lon] = (s ?? '').split('/').map(Number)
  if (![zoom, lat, lon].every(Number.isFinite) || zoom < 0 || zoom > 22 || Math.abs(lat) > 85 || Math.abs(lon) > 180) return null
  return { zoom, center: [lon, lat] }
}

const formatMapView = (v: MapView) => `${v.zoom.toFixed(2)}/${v.center[1].toFixed(3)}/${v.center[0].toFixed(3)}`

/** Reads the address into the app's state; anything unknown or invalid is ignored. */
export function readUrl(search = window.location.search) {
  const q = new URLSearchParams(search)
  const state = useTrip.getState()
  const patch: Partial<ReturnType<typeof useTrip.getState>> = {}

  const panel = q.get('panel') as (typeof PANELS)[number]
  if (PANELS.includes(panel)) patch.panel = panel
  // Preferences were a tab of their own; now they're in the Trip tab.
  else if ((panel as string) === 'prefs') patch.panel = 'setup'

  const city = q.get('city')
  const leg = Number(q.get('leg'))
  let selected: Selection = null
  if (city && ds.cities[city]) selected = { type: 'city', id: city }
  else if (q.has('leg') && Number.isInteger(leg) && state.plan?.legs[leg]) selected = { type: 'leg', index: leg }
  patch.selected = selected

  const tab = q.get('tab') as CityTab
  if (TABS.includes(tab)) {
    patch.cityTab = tab
    const part = q.get('part')
    if (part) patch.cityPart = { ...state.cityPart, [tab]: part }
  }

  const layer = q.get('layer') as MapLayer
  if (MAP_LAYERS.includes(layer)) patch.layer = layer
  else if (q.size) patch.layer = 'none'
  const month = Number(q.get('month'))
  patch.layerMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : 0
  const kind = q.get('kind') as NearbyKind
  if (NEARBY_KINDS.includes(kind)) patch.nearbyKind = kind
  patch.costKind = COST_KINDS.includes(kind as CostKind) ? (kind as CostKind) : 'day'
  patch.weatherBy = q.get('temp') === 'low' ? 'low' : 'high'
  patch.routeBy = q.get('show') === 'nights' ? 'nights' : 'day'

  useTrip.setState(patch)
  initialMapView = mapView = parseMapView(q.get('map'))
}

/** The address for the current state. */
export function buildSearch(s: ReturnType<typeof useTrip.getState>, view: MapView | null): string {
  const q = new URLSearchParams()
  q.set('panel', s.panel)
  if (s.selected?.type === 'city') {
    q.set('city', s.selected.id)
    q.set('tab', s.cityTab)
    if (s.cityPart[s.cityTab]) q.set('part', s.cityPart[s.cityTab]!)
  } else if (s.selected?.type === 'leg') q.set('leg', String(s.selected.index))
  if (s.layer !== 'none') q.set('layer', s.layer)
  if (MONTHLY.includes(s.layer) && s.layerMonth) q.set('month', String(s.layerMonth))
  if (s.layer === 'nearby') q.set('kind', s.nearbyKind)
  if (s.layer === 'cost' && s.costKind !== 'day') q.set('kind', s.costKind)
  if (s.layer === 'climate' && s.weatherBy === 'low') q.set('temp', 'low')
  if (s.layer === 'none' && s.routeBy === 'nights') q.set('show', 'nights')
  if (view) q.set('map', formatMapView(view))
  // Keep slashes readable.
  return `?${q.toString().replaceAll('%2F', '/')}`
}

function writeUrl() {
  const search = buildSearch(useTrip.getState(), mapView)
  if (search !== window.location.search) history.replaceState(history.state, '', `${window.location.pathname}${search}${window.location.hash}`)
}

/** Called by the map when it stops moving. */
export function setMapView(view: MapView) {
  mapView = view
  writeUrl()
}

/** Reads the address once at start-up, then keeps it up to date. */
export function syncUrl() {
  readUrl()
  writeUrl()
  useTrip.subscribe((s, prev) => {
    if (s.panel !== prev.panel || s.selected !== prev.selected || s.cityTab !== prev.cityTab || s.cityPart !== prev.cityPart || s.layer !== prev.layer || s.layerMonth !== prev.layerMonth || s.nearbyKind !== prev.nearbyKind || s.costKind !== prev.costKind || s.weatherBy !== prev.weatherBy || s.routeBy !== prev.routeBy) writeUrl()
  })
}
