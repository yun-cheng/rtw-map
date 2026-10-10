// A trip's data and the changes made to it (setup, preferences, stops and plans), without anything about the screen.
// The app's store (trip.ts) is built on it, and the trip assistant's tools change a trip through it, in the browser
// or on the server (createTripStore), where a run works on a saved trip.
import { createStore, type StoreApi } from 'zustand/vanilla'
import { dataset as ds } from '../data/dataset'
import {
  DEFAULT_PREFS, addDays, addStop, evaluatePlan, stylePrefs, withPrefs,
  type Budget, type Plan, type Stop, type TravelPrefs, type TripInput,
} from '../planner'
import type { TempUnit } from '../ui/format'

/** One version of a trip's itinerary, with the setup and preferences it was made with. */
export type TripPlan = { id: string; name: string; input: TripInput; stops: Stop[] }
/** A trip as saved: the active plan's setup and stops (what the trip list reads), and all of its plans. */
export type TripData = { input: TripInput; stops: Stop[]; plans?: TripPlan[]; activePlanId?: string }
export const MAX_PLANS = 8

/** How the user reads amounts and temperatures (the assistant answers the same way). */
export type Display = {
  /** Display currency for all prices (US dollars by default; prices are converted from the stored EUR or local amounts). */
  currency: string
  /** Temperatures in Celsius or Fahrenheit (data is stored in °C). */
  tempUnit: TempUnit
  /** Temperatures shown as how they feel (heat with humidity, cold with wind) rather than measured; one setting for the
   *  map, the city panel and the timeline. Planning and the preference limits use measured temperatures. */
  tempFeels: boolean
}
export const DEFAULT_DISPLAY: Display = { currency: 'USD', tempUnit: 'C', tempFeels: true }

export type TripCore = Display & {
  /** The active plan's setup and stops; the other plans are in `plans`. */
  input: TripInput
  stops: Stop[]
  plans: TripPlan[]
  activePlanId: string
  plan: Plan | null

  setInput: (patch: Partial<TripInput>) => void
  /** Picks a travel style: its preferences replace the style fields, and daily costs use its price level. */
  setStyle: (style: Budget) => void
  setPrefs: (patch: Partial<TravelPrefs>) => void
  /** Puts in a whole new itinerary (the assistant's), as given. */
  setStops: (stops: Stop[]) => void
  /** Notes that the plan now fits the setup and its stops as they are (after the assistant planned or changed it). */
  markPlanned: () => void
  /** Sets a stop's nights, locked unless `lock` is false (the user's own choice). Nothing else changes: the trip
   *  may then have more or fewer nights than its dates, until the plan is updated. */
  setNights: (index: number, nights: number, lock?: boolean) => void
  toggleLock: (index: number) => void
  removeStop: (index: number) => void
  moveStop: (from: number, to: number) => void
  /** Puts the stops in a new order (indexes into the current stops). */
  reorderStops: (order: number[]) => void
  /** Adds a city where it fits the route, with its usual stay. */
  addCity: (cityId: string) => void
  /** Puts back an earlier trip (Undo for the assistant's changes). */
  restore: (data: TripData) => void
  /** Adds a plan, by default a copy of the active one, and switches to it unless `activate` is false. Returns its id,
   *  or null when the trip already has the most plans allowed. */
  addPlan: (options?: { name?: string; from?: { input: TripInput; stops: Stop[] }; activate?: boolean }) => string | null
  switchPlan: (id: string) => void
  renamePlan: (id: string, name: string) => void
  /** Deletes a plan (never the last one); deleting the active plan switches to another. */
  deletePlan: (id: string) => void
}

export const planId = () => Math.random().toString(36).slice(2, 10)
/** "Plan A", "Plan B", …: the first name not in use. */
export function nextPlanName(plans: { name: string }[]): string {
  for (let i = 0; i < 26; i++) {
    const name = `Plan ${String.fromCharCode(65 + i)}`
    if (!plans.some((p) => p.name === name)) return name
  }
  return `Plan ${plans.length + 1}`
}

/** All plans of the trip, with the active one up to date (its setup and stops live in `input` and `stops`). */
export const tripPlans = (s: { plans: TripPlan[]; activePlanId: string; input: TripInput; stops: Stop[] }): TripPlan[] =>
  s.plans.map((p) => (p.id === s.activePlanId ? { ...p, input: s.input, stops: s.stops } : p))

/** The trip as saved, from its state. */
export const tripData = (s: { plans: TripPlan[]; activePlanId: string; input: TripInput; stops: Stop[] }): TripData =>
  ({ input: s.input, stops: s.stops, plans: tripPlans(s), activePlanId: s.activePlanId })

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

/** A setup without what it was planned from. */
const setupOf = ({ planned: _, plannedStops: __, ...input }: TripInput): NonNullable<TripInput['planned']> => structuredClone(input)

const toStops = (p: Plan): Stop[] => p.stops.map(({ cityId, nights, locked, groupId }) => ({ cityId, nights, locked, groupId }))

/** The itinerary for a setup and stops, or none if the stops refer to data that no longer exists. */
export function planFor(input: TripInput, stops: Stop[]): Plan | null {
  try {
    return stops.length ? evaluatePlan(ds, input, stops) : null
  } catch {
    return null
  }
}

/** A saved trip (or a new, empty one) as state; `broken` when its stops refer to data that no longer exists (they
 *  are dropped, the setup kept). */
export function loadTrip(data: TripData | null): Pick<TripCore, 'input' | 'stops' | 'plan' | 'plans' | 'activePlanId'> & { broken: boolean } {
  const norm = (x: { input: TripInput; stops?: Stop[] }) => ({ input: { ...newTripInput(), ...withPrefs(x.input) }, stops: x.stops ?? [] })
  // Trips saved before plans existed have one plan.
  const plans: TripPlan[] = data?.plans?.length
    ? data.plans.map((p) => ({ ...p, ...norm(p) }))
    : [{ id: planId(), name: 'Plan A', ...(data ? norm(data) : { input: newTripInput(), stops: [] }) }]
  const activePlanId = plans.some((p) => p.id === data?.activePlanId) ? data!.activePlanId! : plans[0].id
  // The saved setup and stops at the top are the active plan's latest.
  const { input, stops } = data && data.plans?.length ? norm(data) : plans.find((p) => p.id === activePlanId)!
  const plan = planFor(input, stops)
  const broken = stops.length > 0 && !plan
  return { input, stops: broken ? [] : stops, plan, plans, activePlanId, broken }
}

type Get = () => TripCore
type Set = (patch: Partial<TripCore>) => void

/** The changes, for a store holding a `TripCore` (or more: the app's store adds what's on screen). */
export function tripActions(set: Set, get: Get): Omit<TripCore, keyof Display | 'input' | 'stops' | 'plans' | 'activePlanId' | 'plan'> {
  const apply = (plan: Plan, extra: Partial<TripCore> = {}) => set({ plan, stops: toStops(plan), ...extra })
  // Edits change only what they touch: the plan is updated (by the assistant) when the user asks.
  const edit = (fn: (stops: Stop[]) => Stop[]) => {
    const { input, stops } = get()
    apply(evaluatePlan(ds, input, fn(stops.map((s) => ({ ...s })))))
  }
  return {
    setInput: (patch) => {
      const input = { ...get().input, ...patch }
      set({ input })
      if (get().stops.length) set({ plan: evaluatePlan(ds, input, get().stops) })
    },
    setStyle: (budget) => get().setInput({ budget, prefs: stylePrefs(budget, get().input.prefs) }),
    setPrefs: (patch) => get().setInput({ prefs: { ...get().input.prefs, ...patch } }),
    setStops: (stops) => edit(() => stops),
    markPlanned: () => set({ input: { ...get().input, planned: setupOf(get().input), plannedStops: structuredClone(get().stops) } }),
    setNights: (index, nights, lock = true) => edit((stops) => {
      stops[index] = { ...stops[index], nights: Math.max(1, nights), locked: lock || stops[index].locked }
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
      set({ plans, activePlanId: id, input: target.input, stops: plan ? target.stops : [], plan })
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
}

/** A trip of its own, outside the app's store: what a run of the assistant on the server changes. */
export function createTripStore(data: TripData | null, display: Display = DEFAULT_DISPLAY): StoreApi<TripCore> {
  const { broken: _, ...trip } = loadTrip(data)
  return createStore<TripCore>()((set, get) => ({ ...display, ...trip, ...tripActions(set, get) }))
}
