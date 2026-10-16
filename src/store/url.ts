// Keeps what's on screen in the address bar, so a refresh (or a copied link) comes back to the same view:
//   ?panel=city&city=krakow&tab=weather&layer=climate&month=7&map=5.20/50.061/19.937
// (or leg=3 for an open journey; part=prices for a sub-tab of the city panel tab; kind=atm for the Nearby layer; temp=low for the Weather layer by night temperatures; show=nights for the Route view numbered by nights; map is zoom/latitude/longitude, as on openstreetmap.org; no month means the
// weather and air layers show each place at the time of the trip).
// Going somewhere (another panel, city or journey) is a step in the browser's history, so Back (and a phone's back
// gesture) returns from it; the rest (a city's tabs, the map moving, its view and month) replaces the address.
import { dataset as ds } from '../data/dataset'
import { COST_KINDS, isTravelling, localToday, type CostKind } from '../planner'
import { useRightPanel } from '../ui/rightPanel'
import { SHARED_TOKEN } from './shareLink'
import { MAP_LAYERS, NEARBY_KINDS, useTrip, type NearbyKind, type CityTab, type MapLayer, type Selection } from './trip'

export type MapView = { zoom: number; center: [lon: number, lat: number] }

const PANELS = ['setup', 'itinerary', 'city', 'assistant'] as const
const TABS: CityTab[] = ['overview', 'notes', 'transport', 'weather', 'holidays', 'costs', 'daily', 'phrases', 'health', 'safety', 'entry']
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

/** Reads the address into the app's state; anything unknown or invalid is ignored (`back`: going back or forward, only
 *  where it was, the panel, city or journey and tab: the map, its view and month stay as they are). */
export function readUrl(search = window.location.search, back = false) {
  const q = new URLSearchParams(search)
  const state = useTrip.getState()
  const patch: Partial<ReturnType<typeof useTrip.getState>> = {}

  const panel = q.get('panel') as (typeof PANELS)[number]
  if (PANELS.includes(panel)) patch.panel = panel
  // Preferences were a tab of their own; now they're in the Trip tab.
  else if ((panel as string) === 'prefs') patch.panel = 'setup'
  // A trip under way opens on Today, in My trip, unless the address names a tab (a refresh, or a link); Today was a
  // tab of the left panel, so an address naming it opens it there too.
  if ((panel as string) === 'today' || (!q.has('panel') && !SHARED_TOKEN && state.plan && isTravelling(state.input, localToday()))) {
    useRightPanel.getState().show('today')
  }

  const city = q.get('city')
  const leg = Number(q.get('leg'))
  let selected: Selection = null
  if (city && ds.cities[city]) selected = { type: 'city', id: city }
  else if (q.has('leg') && Number.isInteger(leg) && state.plan?.legs[leg]) selected = { type: 'leg', index: leg }
  patch.selected = selected
  // The city's or journey's tab: on it when the address names one but no tab, and only with one.
  if (selected && !patch.panel) patch.panel = 'city'
  const on = patch.panel ?? state.panel
  if (on === 'city' && !selected) patch.panel = state.panelBefore
  else if (on !== 'city') patch.panelBefore = on

  const tab = q.get('tab') as CityTab
  if (TABS.includes(tab)) {
    patch.cityTab = tab
    const part = q.get('part')
    if (part) patch.cityPart = { ...state.cityPart, [tab]: part }
  }

  if (back) return useTrip.setState(patch)

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

// (A step already taken in this task: changes made with it, such as a city opened on a tab, are part of it.)
let stepped = false
// (Changes the app makes itself, not the user going somewhere: no step.)
let quiet = false

/** Runs `change` without making it a step in the history (the app setting itself up, not the user going somewhere). */
export function quietly(change: () => void) {
  quiet = true
  try {
    change()
  } finally {
    quiet = false
  }
}

/** Puts the current state in the address: as a new step in the history (`step`), else in place of the current one. */
function writeUrl(step = false) {
  const search = buildSearch(useTrip.getState(), mapView)
  if (search === window.location.search) return
  const url = `${window.location.pathname}${search}${window.location.hash}`
  if (!step || stepped || quiet) return history.replaceState(history.state, '', url)
  history.pushState(null, '', url)
  stepped = true
  setTimeout(() => (stepped = false))
}

/** Called by the map when it stops moving. */
export function setMapView(view: MapView) {
  mapView = view
  writeUrl()
}

/** Reads the address once at start-up, then keeps it up to date, and goes back or forward with the browser. */
export function syncUrl() {
  readUrl()
  writeUrl()
  let restoring = false
  useTrip.subscribe((s, prev) => {
    if (restoring) return
    const step = s.panel !== prev.panel || s.selected !== prev.selected
    if (step || s.cityTab !== prev.cityTab || s.cityPart !== prev.cityPart || s.layer !== prev.layer || s.layerMonth !== prev.layerMonth || s.nearbyKind !== prev.nearbyKind || s.costKind !== prev.costKind || s.weatherBy !== prev.weatherBy || s.routeBy !== prev.routeBy) writeUrl(step)
  })
  window.addEventListener('popstate', () => {
    restoring = true
    readUrl(window.location.search, true)
    restoring = false
    // (With the map as it is now.)
    writeUrl()
  })
}
