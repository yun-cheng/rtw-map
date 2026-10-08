// What the user is looking at in the app (the open city or journey panel, the map view), shared with the assistant
// so questions like "is it rainy here?" or "should I stay longer?" make sense. Each item is shown as a chip above
// the message box; the user can leave any of them out. The assistant gets a short overview of each shared item with
// its message; for the values shown it calls get_shared_view (tools.ts), which only returns the shared items.
import { dataset as ds } from '../data/dataset'
import { likelyMonth, stayMonth, type CostKind } from '../planner'
import { useTrip, type CityTab, type MapLayer, type NearbyKind } from '../store/trip'
import { MONTHS, shortDate } from '../ui/format'
import { COST_LABELS } from '../map/scales'

/** What a view item points at, for get_shared_view. */
export type ViewRef =
  | { kind: 'city'; id: string; tab: CityTab }
  | { kind: 'journey'; from: string; to: string; index: number }
  | { kind: 'map'; layer: MapLayer; month: number; nearbyKind?: NearbyKind; costKind?: CostKind; weatherBy?: 'high' | 'low' }

export type ViewItem = {
  /** Changes when the view changes, so a chip the user removed comes back for something new. */
  key: string
  ref: ViewRef
  /** Short text for the chip. */
  label: string
  /** The overview the assistant gets: what is open and what it shows. */
  text: string
}

/** What each city tab shows (the values come from get_shared_view). */
const TAB_SHOWS: Record<CityTab, string> = {
  overview: 'a summary of everything below and any problems',
  transport: 'public transport, taxis and rentals in the city, and direct connections to other cities',
  weather: 'monthly highs and lows, rainy days, sunshine and air quality, with the stay months highlighted',
  money: 'daily costs per budget, sample prices, how widely cards are accepted and when cash is needed',
  daily: 'how easy English is, mobile internet speed, plugs, shops and people & culture',
  phrases: 'seven everyday phrases in the local language (hello, thank you, bye, how much, this one, I don\'t understand, cheers), with how to say them',
  health: 'vaccines and medicines (CDC advice), tap water, health risks, healthcare, and pharmacies, clinics and the nearest hospital',
  safety: 'government travel advice, the emergency number and travel insurance',
  entry: 'the visa rule for their passport, Schengen days and entry notices',
}

const TAB_NAMES: Record<CityTab, string> = {
  overview: 'Overview', transport: 'Transport', weather: 'Weather', money: 'Money', daily: 'Daily life', phrases: 'Phrases', health: 'Health', safety: 'Safety', entry: 'Entry',
}
const LAYER_NAMES: Record<MapLayer, { name: string; about: string }> = {
  none: { name: 'Route', about: 'the trip: its stops in order, numbered by the trip day they arrive, joined by lines coloured by travel mode (dashed where times are estimated)' },
  climate: { name: 'Weather', about: 'average daily high (the number on each stop) and share of rainy days' },
  air: { name: 'Air', about: 'air pollution: monthly average PM2.5 in µg/m³ (the number on each stop)' },
  nearby: { name: 'Nearby', about: 'roughly how many places of one kind are within 1.5 km of the centre (from map data and business listings, both incomplete): none found, 1–4, 5+, 10+, 20+ or 50+' },
  mobile: { name: 'Mobile', about: 'mobile internet: typical download speed on phones, in Mbps (the number on each stop), in five bands from slow (under 25) to very fast (200+)' },
  cost: { name: 'Cost', about: 'daily cost for their budget, in five bands of about a fifth of all cities each' },
  schengen: { name: 'Schengen', about: 'which countries are in the Schengen area' },
}
const NEARBY_NAMES: Record<NearbyKind, string> = { supermarket: 'supermarkets', pharmacy: 'pharmacies', clinic: 'clinics & doctors', atm: 'ATMs' }
const COST_NAMES: Record<CostKind, string> = {
  day: 'daily cost for their budget', dorm: 'a night in a hostel dorm', private: 'a night in a private room', meal: 'a meal at a simple local eatery',
  groceries: 'a day of DIY meals from the supermarket', transport: 'a day of local transport',
}
const MONTH_NAMES = MONTHS.map((_, i) => new Date(2000, i).toLocaleString('en', { month: 'long' }))

/** The parts of the current view worth sharing: the open city or journey, and the map view (Route only with a plan). */
export function viewItems(): ViewItem[] {
  const { selected, cityTab, layer, layerMonth, nearbyKind, costKind, weatherBy, routeBy, plan, input } = useTrip.getState()
  const items: ViewItem[] = []

  if (selected?.type === 'city' && ds.cities[selected.id]) {
    const c = ds.cities[selected.id]
    const country = ds.countries[c.iso2]?.name ?? c.iso2
    const i = plan?.stops.findIndex((s) => s.cityId === c.id) ?? -1
    const stop = i >= 0 ? plan!.stops[i] : null
    const where = stop
      ? `It is stop ${i + 1} of the trip: ${shortDate(stop.arrive)} – ${shortDate(stop.depart)}, ${stop.nights} nights (mostly ${MONTH_NAMES[stayMonth(stop) - 1]}).`
      : `It is not in the trip; if added, they'd likely be there around ${MONTH_NAMES[likelyMonth(ds, plan, input, c.id) - 1]}.`
    items.push({
      key: `city:${c.id}:${cityTab}`,
      ref: { kind: 'city', id: c.id, tab: cityTab },
      label: `${c.name} · ${TAB_NAMES[cityTab]}`,
      text: `The details panel of ${c.name}, ${country} (id ${c.id}) is open on its ${TAB_NAMES[cityTab]} tab, showing ${TAB_SHOWS[cityTab]}. ${where}`,
    })
  } else if (selected?.type === 'leg' && plan?.legs[selected.index]) {
    const leg = plan.legs[selected.index]
    const from = ds.cities[leg.from]?.name ?? leg.from
    const to = ds.cities[leg.to]?.name ?? leg.to
    items.push({
      key: `leg:${leg.from}:${leg.to}`,
      ref: { kind: 'journey', from: leg.from, to: leg.to, index: selected.index },
      label: `${from} → ${to}`,
      text: `The panel for the journey from ${from} to ${to} (between stops ${selected.index + 1} and ${selected.index + 2}) is open, showing each part of the journey with its mode, time, price and whether it's estimated.`,
    })
  }

  if (layer !== 'none' || plan) {
    const l = layer === 'climate' && weatherBy === 'low'
      ? { name: 'Weather (lows)', about: 'average daily low, how the nights feel (the number on each stop), and share of rainy days' }
      : layer === 'none' && routeBy === 'nights'
        ? { ...LAYER_NAMES.none, about: LAYER_NAMES.none.about.replace('numbered by the trip day they arrive', 'numbered by the nights there') }
        : layer === 'cost'
          ? { ...LAYER_NAMES.cost, about: `${COST_NAMES[costKind]}, in five bands of about a fifth of all cities each` }
          : LAYER_NAMES[layer]
    const monthly = layer === 'climate' || layer === 'air'
    const when = layer === 'nearby' ? ` (${NEARBY_NAMES[nearbyKind]})` : !monthly ? '' : layerMonth ? ` in ${MONTH_NAMES[layerMonth - 1]}` : ' for each place at the time of the trip'
    items.push({
      key: `map:${layer}:${monthly ? layerMonth : ''}${layer === 'nearby' ? nearbyKind : ''}${layer === 'cost' ? costKind : ''}${layer === 'climate' ? weatherBy : ''}${layer === 'none' ? routeBy : ''}`,
      ref: { kind: 'map', layer, month: monthly ? layerMonth : 0, ...(layer === 'nearby' && { nearbyKind }), ...(layer === 'cost' && { costKind }), ...(layer === 'climate' && { weatherBy }) },
      label: `${l.name} map${monthly ? ` · ${layerMonth ? MONTHS[layerMonth - 1] : 'trip dates'}` : layer === 'nearby' ? ` · ${NEARBY_NAMES[nearbyKind]}` : layer === 'cost' && costKind !== 'day' ? ` · ${COST_LABELS[costKind].label}` : ''}`,
      text: layer === 'none'
        ? `The map shows the ${l.name} view: ${l.about}.`
        : `The map shows the ${l.name} view, colouring each stop and city by ${l.about}${when}.`,
    })
  }
  return items
}

/** The shared items as one block for the assistant's context. */
export const viewText = (items: ViewItem[]) =>
  items.length
    ? `What the user was looking at in the app when they asked:\n${items.map((v) => `- ${v.text}`).join('\n')}\nCall get_shared_view for the values shown, if you need them.`
    : ''

/** The items shared with the message being answered; get_shared_view only returns these. */
let shared: ViewItem[] = []
export const setSharedView = (items: ViewItem[]) => { shared = items }
export const sharedView = () => shared
