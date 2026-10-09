import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { dataset as ds } from '../data/dataset'
import { makeGroup } from '../data/presets'
import { REGIONS } from '../data/regions'
import { testCaseInput } from '../data/testCase'
import type { TempUnit } from '../ui/format'
import {
  DEFAULT_PREFS, addDays, addStop, evaluatePlan, generatePlan, rebalance, reoptimize, stylePrefs, withPrefs,
  type Budget, type CostKind, type Plan, type Stop, type TravelPrefs, type TripInput,
} from '../planner'

export type Selection = { type: 'city'; id: string } | { type: 'leg'; index: number } | null
export type CityTab = 'overview' | 'transport' | 'weather' | 'costs' | 'daily' | 'phrases' | 'health' | 'safety' | 'entry'
export type MapLayer = 'none' | 'climate' | 'air' | 'cost' | 'mobile' | 'nearby' | 'schengen'
export const MAP_LAYERS: MapLayer[] = ['none', 'climate', 'air', 'cost', 'mobile', 'nearby', 'schengen']
/** The kinds of place the Nearby map view can show. */
export type NearbyKind = 'supermarket' | 'pharmacy' | 'clinic' | 'atm'
export const NEARBY_KINDS: NearbyKind[] = ['supermarket', 'pharmacy', 'clinic', 'atm']

/** One version of a trip's itinerary, with the setup and preferences it was made with. */
export type TripPlan = { id: string; name: string; input: TripInput; stops: Stop[] }
/** A trip as saved: the active plan's setup and stops (what the trip list reads), and all of its plans. */
export type TripData = { input: TripInput; stops: Stop[]; plans?: TripPlan[]; activePlanId?: string }
export const MAX_PLANS = 8

const planId = () => Math.random().toString(36).slice(2, 10)
/** "Plan A", "Plan B", …: the first name not in use. */
export function nextPlanName(plans: { name: string }[]): string {
  for (let i = 0; i < 26; i++) {
    const name = `Plan ${String.fromCharCode(65 + i)}`
    if (!plans.some((p) => p.name === name)) return name
  }
  return `Plan ${plans.length + 1}`
}

/** All plans of the trip, with the active one up to date (its setup and stops live in `input` and `stops`). */
/** A plan's short mark (the folded left panel's strip): "B" for "Plan B", else the start of its name ("Sl" for "Slow"). */
export const planMark = (name: string) => name.match(/^Plan (\S{1,2})$/i)?.[1] ?? name.trim().slice(0, 2)

export const tripPlans = (s: { plans: TripPlan[]; activePlanId: string; input: TripInput; stops: Stop[] }): TripPlan[] =>
  s.plans.map((p) => (p.id === s.activePlanId ? { ...p, input: s.input, stops: s.stops } : p))

type State = {
  /** The active plan's setup and stops; the other plans are in `plans`. */
  input: TripInput
  stops: Stop[]
  plans: TripPlan[]
  activePlanId: string
  plan: Plan | null
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
  panel: 'setup' | 'prefs' | 'itinerary' | 'assistant'
  /** Adding places to the trip (the Trip tab's picker): whole regions or single countries, from its list or the map. */
  picking: 'region' | 'country' | null
  /** How a country picked on its own joins the trip: must visit, or optional (the planner decides). */
  addAs: 'must' | 'optional'
  /** Countries pointed at in the Trip tab (a country or a region's card), shaded on the map, and those it centres on:
   *  for a country in a region's card, the region. */
  hovered: { countries: string[]; focus: string[] }
  fitRequest: number
  /** Counts "Ask AI" presses in a city or journey panel: the app shows the Assistant beside it (see App). */
  askRequest: number
  /** Display currency for all prices (US dollars by default; prices are converted from the stored EUR or local amounts). */
  currency: string
  /** Temperatures in Celsius or Fahrenheit (data is stored in °C). */
  tempUnit: TempUnit
  /** Temperatures shown as how they feel (heat with humidity, cold with wind) rather than measured; one setting for the
   *  map, the city panel and the timeline. Planning and the preference limits use measured temperatures. */
  tempFeels: boolean
  /** Country to compare price levels with; null = guess from the display currency. */
  priceCompare: string | null
  /** Selected tab of the city panel; kept when switching cities so they're easy to compare. */
  cityTab: CityTab
  /** The sub-tab open in each city panel tab that has them (e.g. Costs: daily, prices, paying). */
  cityPart: Partial<Record<CityTab, string>>

  setInput: (patch: Partial<TripInput>) => void
  /** Picks a travel style: its preferences replace the style fields, and daily costs use its price level. */
  setStyle: (style: Budget) => void
  setPrefs: (patch: Partial<TravelPrefs>) => void
  generate: () => void
  loadTestCase: () => void
  setNights: (index: number, nights: number) => void
  toggleLock: (index: number) => void
  removeStop: (index: number) => void
  moveStop: (from: number, to: number) => void
  /** Puts the stops in a new order (indexes into the current stops); nights are re-fitted. */
  reorderStops: (order: number[]) => void
  addCity: (cityId: string) => void
  rebalance: () => void
  reoptimize: () => void
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
  setPriceCompare: (iso2: string) => void
  /** Opens a city panel tab, and with `part` one of its sub-tabs. */
  setCityTab: (tab: CityTab, part?: string) => void
  /** Shows a saved trip (or a new, empty one when `data` is null) and fits the map to it; with `keepView`, keeps the
   *  open panel, map layer month and map position instead (when reloading the trip that is already on screen). */
  openTrip: (data: TripData | null, keepView?: boolean) => void
  /** Puts back an earlier trip (Undo for the assistant's changes); keeps the view as it is. */
  restore: (data: TripData) => void
  /** Adds a plan, by default a copy of the active one, and switches to it unless `activate` is false. Returns its id,
   *  or null when the trip already has the most plans allowed. */
  addPlan: (options?: { name?: string; from?: { input: TripInput; stops: Stop[] }; activate?: boolean }) => string | null
  switchPlan: (id: string) => void
  renamePlan: (id: string, name: string) => void
  /** Deletes a plan (never the last one); deleting the active plan switches to another. */
  deletePlan: (id: string) => void
}

/** Setup of a new trip: no regions yet, starting in two months. */
export const newTripInput = (): TripInput => {
  const today = new Date().toISOString().slice(0, 10)
  return { ...emptyInput, startDate: addDays(today, 60), endDate: addDays(today, 120) }
}

const emptyInput: TripInput = {
  startDate: '',
  endDate: '',
  groups: [],
  keepGroupOrder: false,
  startCityId: null,
  endCityId: null,
  mustCities: [],
  pace: 'balanced',
  budget: 'backpacker',
  prefs: DEFAULT_PREFS,
  interests: [],
  passport: 'EU',
  schengenDaysBefore: 0,
}

const toStops = (p: Plan): Stop[] => p.stops.map(({ cityId, nights, locked, groupId }) => ({ cityId, nights, locked, groupId }))

/** localStorage can be missing or throw (private mode); fall back to memory. */
const safeStorage = createJSONStorage(() => {
  try {
    localStorage.setItem('__t', '1')
    localStorage.removeItem('__t')
    return localStorage
  } catch {
    const mem = new Map<string, string>()
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) }
  }
})

export const useTrip = create<State>()(
  persist(
    (set, get) => {
      const apply = (plan: Plan, extra: Partial<State> = {}) => set({ plan, stops: toStops(plan), ...extra })
      const edit = (fn: (stops: Stop[]) => Stop[]) => {
        const { input, stops } = get()
        apply(rebalance(ds, input, fn(stops.map((s) => ({ ...s })))))
      }
      const fresh = newTripInput()
      const firstPlan = planId()
      /** The itinerary for a setup and stops, or none if the stops refer to data that no longer exists. */
      const planFor = (input: TripInput, stops: Stop[]): Plan | null => {
        try {
          return stops.length ? evaluatePlan(ds, input, stops) : null
        } catch {
          return null
        }
      }
      return {
        input: fresh,
        stops: [],
        plans: [{ id: firstPlan, name: 'Plan A', input: fresh, stops: [] }],
        activePlanId: firstPlan,
        plan: null,
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
        priceCompare: null,
        cityTab: 'overview',
        cityPart: {},

        setInput: (patch) => {
          const input = { ...get().input, ...patch }
          set({ input })
          if (get().stops.length) set({ plan: evaluatePlan(ds, input, get().stops) })
        },
        setStyle: (budget) => get().setInput({ budget, prefs: stylePrefs(budget, get().input.prefs) }),
        setPrefs: (patch) => get().setInput({ prefs: { ...get().input.prefs, ...patch } }),
        generate: () => {
          const { input } = get()
          if (!input.groups.length) return
          const plan = generatePlan(ds, input)
          // With flexible dates, the plan's dates are the trip's from now on (the dates asked for stay in `flex`).
          apply(plan, {
            input: { ...input, startDate: plan.dates.start, endDate: plan.dates.end },
            panel: 'itinerary', selected: null, fitRequest: get().fitRequest + 1, layerMonth: 0,
          })
        },
        loadTestCase: () => {
          const input = testCaseInput(ds, get().input.passport === 'EU' ? 'TW' : get().input.passport)
          set({ input, stops: [], plan: null, panel: 'setup', selected: null })
        },
        setNights: (index, nights) => edit((stops) => {
          stops[index] = { ...stops[index], nights: Math.max(1, nights), locked: true }
          return stops
        }),
        toggleLock: (index) => {
          const stops = get().stops.map((s, i) => (i === index ? { ...s, locked: !s.locked } : s))
          set({ stops, plan: evaluatePlan(ds, get().input, stops) })
        },
        removeStop: (index) => edit((stops) => stops.filter((_, i) => i !== index)),
        moveStop: (from, to) => edit((stops) => {
          const [s] = stops.splice(from, 1)
          stops.splice(to, 0, s)
          return stops
        }),
        reorderStops: (order) => edit((stops) => order.map((i) => stops[i])),
        addCity: (cityId) => {
          const { input, stops } = get()
          if (stops.some((s) => s.cityId === cityId)) return
          apply(addStop(ds, input, stops, cityId))
        },
        rebalance: () => edit((s) => s),
        reoptimize: () => {
          const { input, stops } = get()
          apply(reoptimize(ds, input, stops))
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
        setTempFeels: (tempFeels) => set({ tempFeels }),
        setPriceCompare: (priceCompare) => set({ priceCompare }),
        setCityTab: (cityTab, part) => set((s) => ({ cityTab, ...(part && { cityPart: { ...s.cityPart, [cityTab]: part } }) })),
        openTrip: (data, keepView = false) => {
          const norm = (x: { input: TripInput; stops?: Stop[] }) => ({ input: { ...newTripInput(), ...withPrefs(x.input) }, stops: x.stops ?? [] })
          // Trips saved before plans existed have one plan.
          const plans: TripPlan[] = data?.plans?.length
            ? data.plans.map((p) => ({ ...p, ...norm(p) }))
            : [{ id: planId(), name: 'Plan A', ...(data ? norm(data) : { input: newTripInput(), stops: [] }) }]
          const activePlanId = plans.some((p) => p.id === data?.activePlanId) ? data!.activePlanId! : plans[0].id
          // The saved setup and stops at the top are the active plan's latest.
          const { input, stops } = data && data.plans?.length ? norm(data) : plans.find((p) => p.id === activePlanId)!
          const plan = planFor(input, stops)
          if (stops.length && !plan) {
            // The trip refers to data that no longer exists: keep its setup, drop the itinerary.
            set({ input, stops: [], plan: null, plans, activePlanId, selected: null, panel: 'setup', layerMonth: 0, fitRequest: get().fitRequest + 1 })
            return
          }
          if (keepView) {
            const { selected } = get()
            set({ input, stops, plan, plans, activePlanId, selected: selected?.type === 'leg' && !plan?.legs[selected.index] ? null : selected })
            return
          }
          set({ input, stops, plan, plans, activePlanId, selected: null, panel: plan ? get().panel : 'setup', layerMonth: 0, fitRequest: get().fitRequest + 1 })
        },
        restore: ({ input, stops, plans, activePlanId }) =>
          set({ input, stops, plan: planFor(input, stops), ...(plans?.length && activePlanId && { plans, activePlanId }) }),
        addPlan: ({ name, from, activate = true } = {}) => {
          const s = get()
          const plans = tripPlans(s)
          if (plans.length >= MAX_PLANS) return null
          const source = from ?? { input: s.input, stops: s.stops }
          const added: TripPlan = { id: planId(), name: name?.trim().slice(0, 40) || nextPlanName(plans), ...structuredClone(source) }
          set({ plans: [...plans, added] })
          if (activate) get().switchPlan(added.id)
          return added.id
        },
        switchPlan: (id) => {
          const s = get()
          const plans = tripPlans(s)
          const target = plans.find((p) => p.id === id)
          if (!target || id === s.activePlanId) return
          const plan = planFor(target.input, target.stops)
          set({ plans, activePlanId: id, input: target.input, stops: plan ? target.stops : [], plan, selected: null })
        },
        renamePlan: (id, name) => {
          if (!name.trim()) return
          set({ plans: get().plans.map((p) => (p.id === id ? { ...p, name: name.trim().slice(0, 40) } : p)) })
        },
        deletePlan: (id) => {
          const { plans, activePlanId } = get()
          if (plans.length <= 1 || !plans.some((p) => p.id === id)) return
          if (id === activePlanId) get().switchPlan(plans.find((p) => p.id !== id)!.id)
          set({ plans: get().plans.filter((p) => p.id !== id) })
        },
      }
    },
    {
      name: 'rtw-map-trip',
      version: 1,
      storage: safeStorage,
      partialize: (s) => ({ input: s.input, stops: s.stops, plans: tripPlans(s), activePlanId: s.activePlanId, panel: s.panel, layer: s.layer, currency: s.currency, tempUnit: s.tempUnit, tempFeels: s.tempFeels, priceCompare: s.priceCompare, cityTab: s.cityTab, cityPart: s.cityPart }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<State>) }
        // A map view that has since been removed (Cards, English, Safety).
        if (!MAP_LAYERS.includes(merged.layer)) merged.layer = 'none'
        try {
          merged.input = withPrefs(merged.input)
          // Trips saved before plans existed: one plan, the trip itself.
          if (!merged.plans?.length) merged.plans = [{ id: merged.activePlanId, name: 'Plan A', input: merged.input, stops: merged.stops }]
          else if (!merged.plans.some((p) => p.id === merged.activePlanId)) merged.activePlanId = merged.plans[0].id
          merged.plans = merged.plans.map((p) => ({ ...p, input: withPrefs(p.input) }))
          merged.plan = merged.stops.length ? evaluatePlan(ds, merged.input, merged.stops) : null
        } catch {
          // Saved trip refers to data that no longer exists; start fresh.
          return current
        }
        return merged
      },
    },
  ),
)
