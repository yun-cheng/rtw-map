// Keeps what's on screen in the address bar, so a refresh (or a copied link) comes back to the same view:
//   ?panel=city&city=krakow&tab=weather&layer=climate&month=7&map=5.20/50.061/19.937
// (or leg=3 for an open journey; mytrip=stays with My trip open on that tab, record=… for a record's page in it or
// new=… for a new one's, assistant=1 with the Assistant open, beside the map or as a phone's sheet, left=closed with a
// phone's left sheet closed; part=prices for a sub-tab of the city panel tab; kind=atm for the Nearby layer; temp=low for the Weather layer by night temperatures; show=nights for the Route view numbered by nights; map is zoom/latitude/longitude, as on openstreetmap.org; no month means the
// weather and air layers show each place at the time of the trip).
// Going somewhere (another panel, city or journey, another of My trip's tabs or a record's page in it, and on a phone
// opening a sheet) is a step in the browser's history, so Back (and a phone's back gesture) returns from it;
// the rest (a city's tabs, the map moving, its view and month, a phone's sheet closed, so that Back doesn't open it
// again, and on a computer a side panel opened or folded, which is the layout) replaces the address.
import { dataset as ds } from '../data/dataset'
import { COST_KINDS, isTravelling, localToday, type CostKind } from '../planner'
import { openAssistant, useAssistantPanel } from '../ui/assistantPanel'
import { myTripTab, useRightPanel } from '../ui/rightPanel'
import { useLeftSheet } from '../ui/leftSheet'
import { isPhone } from '../ui/usePhone'
import { SHARED_TOKEN } from './shareLink'
import { MAP_LAYERS, NEARBY_KINDS, useTrip, type NearbyKind, type CityTab, type MapLayer, type Selection } from './trip'

export type MapView = { zoom: number; center: [lon: number, lat: number] }

const PANELS = ['setup', 'itinerary', 'city'] as const
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
  // The Assistant was a tab of the left panel too: now its own panel.
  if ((panel as string) === 'assistant') openAssistant()

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

  readSidePanels(q, back)
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

/** My trip, the Assistant and a phone's left sheet as the address has them: My trip on its tab, and the record's page
 *  or new one's, else the tab's list. Opened as it says as the page loads (one it doesn't name is left as it is), and
 *  going back or forward on a phone, closed too; on a computer, which are open is the layout, left as it is (My trip
 *  folded only goes to its tab and page). */
function readSidePanels(q: URLSearchParams, back: boolean) {
  const phone = isPhone()
  const show = !back || phone
  const tab = myTripTab(q.get('mytrip'))
  if (tab) {
    useRightPanel.setState((s) => ({
      ...(show && { open: true, sheet: true }), tab,
      records: { ...s.records, [tab]: q.get('record') ?? undefined },
      adding: { ...s.adding, [tab]: q.get('new') ?? undefined },
    }))
  } else if (back && phone) useRightPanel.setState({ sheet: false })
  if (q.get('assistant') === '1') {
    if (show) openAssistant()
  } else if (back && phone) useAssistantPanel.setState({ sheet: false })
  if (phone && (back || q.has('left'))) useLeftSheet.setState({ open: q.get('left') !== 'closed' })
}

/** Where My trip is: closed, or its tab's list, a record's page or a new one's (open beside the map, or its sheet on
 *  a phone). */
function myTripAt(s = useRightPanel.getState()) {
  if (!useTrip.getState().plan || !(isPhone() ? s.sheet : s.open)) return null
  const adding = s.adding[s.tab]
  return adding ? { new: adding } : { record: s.records[s.tab] }
}

const pageOf = (at: ReturnType<typeof myTripAt>) => (!at ? null : at.new ? 'new' : at.record ? 'record' : 'list')

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
  const my = myTripAt()
  if (my) {
    q.set('mytrip', useRightPanel.getState().tab)
    if (my.new) q.set('new', my.new)
    else if (my.record) q.set('record', my.record)
  }
  const ai = useAssistantPanel.getState()
  if (isPhone() ? ai.sheet : ai.open) q.set('assistant', '1')
  if (isPhone() && !useLeftSheet.getState().open) q.set('left', 'closed')
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

/** Puts the current state in the address: as a new step in the history (`step`, with `state`), else in place of the
 *  current one. */
function writeUrl(step = false, state: SideStep | null = null) {
  const search = buildSearch(useTrip.getState(), mapView)
  if (search === window.location.search) return
  const url = `${window.location.pathname}${search}${window.location.hash}`
  if (!step || stepped || quiet) return history.replaceState(history.state, '', url)
  history.pushState(state, '', url)
  stepped = true
  setTimeout(() => (stepped = false))
}

/** A step in My trip or the Assistant, or a phone's left sheet: where they were before it. */
type SideStep = { sideFrom: string }

/** Where My trip is, and on a phone which sheets are open, to tell a step back to where the last one came from. */
function sideAt(my = useRightPanel.getState(), ai = useAssistantPanel.getState(), left = useLeftSheet.getState()) {
  const at = myTripAt(my)
  const phone = isPhone()
  return JSON.stringify([at && my.tab, at && (at.new ?? at.record ?? null), phone && ai.sheet, phone && left.open])
}

/** A change in My trip, the Assistant or a phone's left sheet: a step, a sheet closed, or neither. Back to where the
 *  last step came from (a page's own back button, or closing a sheet just opened) goes back in the history, as Back
 *  does, so Back then doesn't return to what was just left; another step is a step (remembering where it came from), a
 *  sheet closed otherwise changes the address in place (Back never opens a sheet again), and so does the rest. */
function sideStep(move: 'step' | 'close' | null, from: string) {
  if (move && !stepped && !quiet && (history.state as SideStep | null)?.sideFrom === sideAt()) {
    history.back()
    stepped = true
    setTimeout(() => (stepped = false))
    return
  }
  writeUrl(move === 'step', { sideFrom: from })
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
  // Another of My trip's tabs is a step, and so is going to a record's page, a new one's or back to the list (not a new
  // one done, its page replaced by the record's, or moved to another day, Journal); on a phone so is its sheet opening,
  // not on a computer (the layout: opening it on a page is a step for the page).
  useRightPanel.subscribe((s, prev) => {
    if (restoring) return
    const [at, was] = [myTripAt(s), myTripAt(prev)]
    const [page, before] = [pageOf(at), pageOf(was)]
    const went = s.records !== prev.records || s.adding !== prev.adding
    const phone = isPhone()
    if (phone && was && !at) return sideStep('close', sideAt(prev))
    const step = (phone && !was && !!at) || (!!at && !!was && s.tab !== prev.tab) || (went && (page !== before ? !(before === 'new' && page === 'record') : page === 'record' && at!.record !== was!.record))
    sideStep(step ? 'step' : null, sideAt(prev))
  })
  // (The Assistant's and the left panel's sheets on a phone: on a computer, the layout.)
  const sheet = (open: boolean, was: boolean) => (!isPhone() || open === was ? null : open ? 'step' : 'close')
  useAssistantPanel.subscribe((s, prev) => {
    if (!restoring) sideStep(sheet(s.sheet, prev.sheet), sideAt(undefined, prev))
  })
  useLeftSheet.subscribe((s, prev) => {
    if (!restoring) sideStep(sheet(s.open, prev.open), sideAt(undefined, undefined, prev))
  })
  window.addEventListener('popstate', () => {
    restoring = true
    readUrl(window.location.search, true)
    restoring = false
    // (With the map as it is now.)
    writeUrl()
  })
}
