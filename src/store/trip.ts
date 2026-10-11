import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { dataset as ds } from '../data/dataset'
import { makeGroup } from '../data/presets'
import { REGIONS } from '../data/regions'
import type { TempUnit } from '../ui/format'
import { evaluatePlan, isTravelling, localToday, pastChanges, withPrefs, type CostKind, type PastChange } from '../planner'
import { SHARED_TOKEN } from './shareLink'
import { createTripStore, loadTrip, newTripInput, planFor, planId, tripActions, tripData, tripPlans, type TripCore, type TripData } from './tripCore'

export { MAX_NOTE_CHARS, MAX_PLANS, legKey, newTripInput, nextPlanName, tripPlans, type TripData, type TripNotes, type TripPlan } from './tripCore'

export type Selection = { type: 'city'; id: string } | { type: 'leg'; index: number } | null
export type CityTab = 'overview' | 'notes' | 'transport' | 'weather' | 'costs' | 'daily' | 'phrases' | 'health' | 'safety' | 'entry'
export type MapLayer = 'none' | 'climate' | 'air' | 'cost' | 'mobile' | 'nearby' | 'schengen'
export const MAP_LAYERS: MapLayer[] = ['none', 'climate', 'air', 'cost', 'mobile', 'nearby', 'schengen']
/** The kinds of place the Nearby map view can show. */
export type NearbyKind = 'supermarket' | 'pharmacy' | 'clinic' | 'atm'
export const NEARBY_KINDS: NearbyKind[] = ['supermarket', 'pharmacy', 'clinic', 'atm']

/** A plan's short mark (the folded left panel's strip): "B" for "Plan B", else the start of its name ("Sl" for "Slow"). */
export const planMark = (name: string) => name.match(/^Plan (\S{1,2})$/i)?.[1] ?? name.trim().slice(0, 2)

/** The trip (tripCore.ts) and what's on screen. */
type State = TripCore & {
  selected: Selection
  layer: MapLayer
  /** Month shown by the weather and air layers; 0 = each place at the time of the trip (see likelyMonth). */
  layerMonth: number
  /** Kind of place shown by the Nearby layer. */
  nearbyKind: NearbyKind
  /** Kind of cost shown by the Cost layer (a day on the budget by default). */
  costKind: CostKind
  /** What the Weather layer colours by: the average daily high or low. */
  weatherBy: 'high' | 'low'
  /** What the Route view writes in each stop: the trip day you arrive, or the nights there. */
  routeBy: 'day' | 'nights'
  /** The left panel's tab; Today only while the trip is under way (App). */
  panel: 'today' | 'setup' | 'itinerary' | 'assistant'
  /** Adding places to the trip (the Trip tab's picker): whole regions or single countries, from its list or the map. */
  picking: 'region' | 'country' | null
  /** How a country picked on its own joins the trip: must visit, or optional (the planner decides). */
  addAs: 'must' | 'optional'
  /** Countries pointed at in the Trip tab (a country or a region's card), shaded on the map, and those it brings into
   *  view: for a country in a region's card, the region. */
  hovered: { countries: string[]; focus: string[] }
  fitRequest: number
  /** Counts "Ask AI" presses in a city or journey panel: the app shows the Assistant beside it (see App). */
  askRequest: number
  /** Base map labels also give a place's name in its own script where that isn't Latin ("Athens" over "Αθήνα"). */
  localNames: boolean
  /** Country to compare price levels with; null = guess from the display currency. */
  priceCompare: string | null
  /** Selected tab of the city panel; kept when switching cities so they're easy to compare. */
  cityTab: CityTab
  /** The sub-tab open in each city panel tab that has them (e.g. Costs: daily, prices, paying). */
  cityPart: Partial<Record<CityTab, string>>

  select: (s: Selection) => void
  setLayer: (l: MapLayer) => void
  setLayerMonth: (m: number) => void
  setNearbyKind: (k: NearbyKind) => void
  setCostKind: (k: CostKind) => void
  setRouteBy: (by: 'day' | 'nights') => void
  setWeatherBy: (by: 'high' | 'low') => void
  setPanel: (p: State['panel']) => void
  setPicking: (p: State['picking']) => void
  /** Adds one of the world's regions to the trip, or takes it out if it's in (countries already added on their own
   *  stay as they are). */
  toggleRegion: (name: string) => void
  /** Adds a country on its own (as `addAs`), or takes it out: a country added on its own is removed, one in a region
   *  is excluded (and back to `addAs` when picked again). */
  toggleCountry: (iso2: string) => void
  setAddAs: (mode: State['addAs']) => void
  setHovered: (countries: string[], focus?: string[]) => void
  /** Opens the Assistant about the open city or journey panel ("Ask AI"). */
  askAssistant: () => void
  setCurrency: (c: string) => void
  setTempUnit: (u: TempUnit) => void
  setTempFeels: (feels: boolean) => void
  setLocalNames: (on: boolean) => void
  setPriceCompare: (iso2: string) => void
  /** Opens a city panel tab, and with `part` one of its sub-tabs. */
  setCityTab: (tab: CityTab, part?: string) => void
  /** Shows a saved trip (or a new, empty one when `data` is null) and fits the map to it; with `keepView`, keeps the
   *  open panel, map layer month and map position instead (when reloading the trip that is already on screen). */
  openTrip: (data: TripData | null, keepView?: boolean) => void
}

const memory = (): Storage => {
  const mem = new Map<string, string>()
  return { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } as Storage
}
/** Asks the user before an edit by hand changes days that already happened on a trip under way (pastChanges); set
 *  by the app (panels/Travel.tsx). */
let askPast: ((changes: PastChange[]) => boolean) | null = null
export const onPastEdit = (ask: (changes: PastChange[]) => boolean) => { askPast = ask }
/** The edits that can reach back into the trip's days so far. */
const PAST_EDITS = ['setInput', 'setNights', 'removeStop', 'moveStop', 'reorderStops', 'addCity'] as const

/** localStorage can be missing or throw (private mode); fall back to memory. A shared trip's page (shareLink.ts) keeps
 *  everything in memory, so the visitor's own trip in this browser is neither shown nor overwritten. */
const safeStorage = createJSONStorage(() => {
  if (SHARED_TOKEN) return memory()
  try {
    localStorage.setItem('__t', '1')
    localStorage.removeItem('__t')
    return localStorage
  } catch {
    return memory()
  }
})

export const useTrip = create<State>()(
  persist(
    (set, get) => {
      const fresh = newTripInput()
      const firstPlan = planId()
      const core = tripActions(set, get)
      // On a trip under way, an edit is tried on a copy first: if it changes the days so far, the user is asked.
      const minding = Object.fromEntries(PAST_EDITS.map((name) => [name, (...args: unknown[]) => {
        const s = get()
        const today = localToday()
        if (askPast && s.plan && !s.readOnly && isTravelling(s.input, today)) {
          const copy = createTripStore(tripData(s), { currency: s.currency, tempUnit: s.tempUnit, tempFeels: s.tempFeels })
          ;(copy.getState()[name] as (...a: unknown[]) => void)(...args)
          const after = copy.getState()
          const changes = pastChanges({ input: s.input, stops: s.plan.stops }, { input: after.input, stops: after.plan?.stops ?? [] }, today)
          if (changes.length && !askPast(changes)) return
        }
        return (core[name] as (...a: unknown[]) => unknown)(...args)
      }])) as Pick<TripCore, (typeof PAST_EDITS)[number]>
      return {
        input: fresh,
        stops: [],
        plans: [{ id: firstPlan, name: 'Plan A', input: fresh, stops: [] }],
        activePlanId: firstPlan,
        plan: null,
        readOnly: false,
        notes: {},
        selected: null,
        layer: 'none',
        layerMonth: 0,
        nearbyKind: 'pharmacy',
        costKind: 'day',
        weatherBy: 'high',
        routeBy: 'day',
        panel: 'setup',
        picking: null,
        addAs: 'must',
        hovered: { countries: [], focus: [] },
        fitRequest: 0,
        askRequest: 0,
        currency: 'USD',
        tempUnit: 'C',
        tempFeels: true,
        localNames: true,
        priceCompare: null,
        cityTab: 'overview',
        cityPart: {},

        ...core,
        ...minding,
        // A whole new itinerary (the assistant's plan) is fitted into the map.
        setStops: (stops) => {
          const fresh = !get().stops.length
          core.setStops(stops)
          if (fresh) set({ selected: null, fitRequest: get().fitRequest + 1, layerMonth: 0 })
        },
        switchPlan: (id) => {
          const was = get().activePlanId
          core.switchPlan(id)
          if (get().activePlanId !== was) set({ selected: null })
        },
        select: (selected) => set({ selected }),
        setLayer: (layer) => set({ layer }),
        setLayerMonth: (layerMonth) => set({ layerMonth }),
        setNearbyKind: (nearbyKind) => set({ nearbyKind }),
        setCostKind: (costKind) => set({ costKind }),
        setWeatherBy: (weatherBy) => set({ weatherBy }),
        setRouteBy: (routeBy) => set({ routeBy }),
        setPanel: (panel) => set({ panel, ...(panel !== 'setup' && { picking: null }) }),
        setPicking: (picking) => set({ picking }),
        setAddAs: (addAs) => set({ addAs }),
        setHovered: (countries, focus = countries) => set({ hovered: { countries, focus } }),
        toggleRegion: (name) => {
          const { input, setInput } = get()
          const region = REGIONS.find((r) => r.name === name)
          if (!region) return
          if (input.groups.some((g) => g.name === name)) return setInput({ groups: input.groups.filter((g) => g.name !== name) })
          const taken = new Set(input.groups.flatMap((g) => g.countries.map((c) => c.iso2)))
          const countries = region.countries.filter((c) => !taken.has(c))
          if (countries.length) setInput({ groups: [...input.groups, makeGroup(ds, name, countries)] })
        },
        toggleCountry: (iso2) => {
          const { input, setInput } = get()
          const group = input.groups.find((g) => g.countries.some((c) => c.iso2 === iso2))
          const { addAs } = get()
          if (!group) {
            const added = makeGroup(ds, ds.countries[iso2]?.name ?? ds.world[iso2] ?? iso2, [iso2])
            // (A country with a do-not-travel advisory still starts excluded.)
            if (added.countries[0].mode === 'must') added.countries[0].mode = addAs
            return setInput({ groups: [...input.groups, added] })
          }
          if (group.countries.length === 1) return setInput({ groups: input.groups.filter((g) => g !== group) })
          const mode = group.countries.find((c) => c.iso2 === iso2)!.mode === 'excluded' ? addAs : 'excluded'
          setInput({ groups: input.groups.map((g) => (g === group ? { ...g, countries: g.countries.map((c) => (c.iso2 === iso2 ? { ...c, mode } : c)) } : g)) })
        },
        askAssistant: () => set({ panel: 'assistant', askRequest: get().askRequest + 1 }),
        setCurrency: (currency) => set({ currency }),
        setTempUnit: (tempUnit) => set({ tempUnit }),
        // The checks read temperatures as shown, so they follow the setting.
        setTempFeels: (tempFeels) => set({ tempFeels, plan: planFor(get().input, get().stops, tempFeels) }),
        setLocalNames: (localNames) => set({ localNames }),
        setPriceCompare: (priceCompare) => set({ priceCompare }),
        setCityTab: (cityTab, part) => set((s) => ({ cityTab, ...(part && { cityPart: { ...s.cityPart, [cityTab]: part } }) })),
        openTrip: (data, keepView = false) => {
          const { broken, ...trip } = loadTrip(data, get().tempFeels)
          if (broken) {
            // The trip refers to data that no longer exists: keep its setup, drop the itinerary.
            set({ ...trip, selected: null, panel: 'setup', layerMonth: 0, fitRequest: get().fitRequest + 1 })
            return
          }
          if (keepView) {
            const { selected } = get()
            set({ ...trip, selected: selected?.type === 'leg' && !trip.plan?.legs[selected.index] ? null : selected })
            return
          }
          set({ ...trip, selected: null, panel: trip.plan ? get().panel : 'setup', layerMonth: 0, fitRequest: get().fitRequest + 1 })
        },
      }
    },
    {
      name: 'rtw-map-trip',
      version: 1,
      storage: safeStorage,
      partialize: (s) => ({ input: s.input, stops: s.stops, plans: tripPlans(s), activePlanId: s.activePlanId, readOnly: s.readOnly, notes: s.notes, panel: s.panel, layer: s.layer, currency: s.currency, tempUnit: s.tempUnit, tempFeels: s.tempFeels, localNames: s.localNames, priceCompare: s.priceCompare, cityTab: s.cityTab, cityPart: s.cityPart }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<State>) }
        // A map view that has since been removed (Cards, English, Safety).
        if (!MAP_LAYERS.includes(merged.layer)) merged.layer = 'none'
        // Preferences were a tab of their own; now they're in the Trip tab.
        if ((merged.panel as string) === 'prefs') merged.panel = 'setup'
        try {
          merged.input = withPrefs(merged.input)
          // Trips saved before plans existed: one plan, the trip itself.
          if (!merged.plans?.length) merged.plans = [{ id: merged.activePlanId, name: 'Plan A', input: merged.input, stops: merged.stops }]
          else if (!merged.plans.some((p) => p.id === merged.activePlanId)) merged.activePlanId = merged.plans[0].id
          merged.plans = merged.plans.map((p) => ({ ...p, input: withPrefs(p.input) }))
          merged.plan = merged.stops.length ? evaluatePlan(ds, merged.input, merged.stops, { feels: merged.tempFeels }) : null
        } catch {
          // Saved trip refers to data that no longer exists; start fresh.
          return current
        }
        return merged
      },
    },
  ),
)
