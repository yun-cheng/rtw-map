import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { dataset as ds } from '../data/dataset'
import { testCaseInput } from '../data/testCase'
import {
  addDays, addStop, evaluatePlan, generatePlan, monthOf, rebalance, reoptimize,
  type Plan, type Stop, type TripInput,
} from '../planner'

export type Selection = { type: 'city'; id: string } | { type: 'leg'; index: number } | null
export type CityTab = 'overview' | 'entry' | 'transport' | 'weather' | 'money' | 'safety' | 'daily'
export type MapLayer = 'none' | 'climate' | 'air' | 'cost' | 'cards' | 'english' | 'schengen' | 'advisory'

type State = {
  input: TripInput
  stops: Stop[]
  plan: Plan | null
  selected: Selection
  layer: MapLayer
  layerMonth: number
  panel: 'setup' | 'itinerary' | 'assistant'
  fitRequest: number
  /** Display currency for all prices (data is stored in EUR). */
  currency: string
  /** Country to compare price levels with; null = guess from the display currency. */
  priceCompare: string | null
  /** Selected tab of the city panel; kept when switching cities so they're easy to compare. */
  cityTab: CityTab

  setInput: (patch: Partial<TripInput>) => void
  generate: () => void
  loadTestCase: () => void
  setNights: (index: number, nights: number) => void
  toggleLock: (index: number) => void
  removeStop: (index: number) => void
  moveStop: (from: number, to: number) => void
  addCity: (cityId: string) => void
  rebalance: () => void
  reoptimize: () => void
  select: (s: Selection) => void
  setLayer: (l: MapLayer) => void
  setLayerMonth: (m: number) => void
  setPanel: (p: State['panel']) => void
  setCurrency: (c: string) => void
  setPriceCompare: (iso2: string) => void
  setCityTab: (tab: CityTab) => void
  importTrip: (data: { input: TripInput; stops: Stop[] }) => void
  /** Puts back an earlier trip (Undo for the assistant's changes); keeps the view as it is. */
  restore: (data: { input: TripInput; stops: Stop[] }) => void
}

const today = new Date().toISOString().slice(0, 10)
const emptyInput: TripInput = {
  startDate: addDays(today, 60),
  endDate: addDays(today, 120),
  groups: [],
  keepGroupOrder: true,
  startCityId: null,
  endCityId: null,
  mustCities: [],
  pace: 'balanced',
  budget: 'backpacker',
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
      return {
        input: emptyInput,
        stops: [],
        plan: null,
        selected: null,
        layer: 'none',
        layerMonth: monthOf(emptyInput.startDate),
        panel: 'setup',
        fitRequest: 0,
        currency: 'EUR',
        priceCompare: null,
        cityTab: 'overview',

        setInput: (patch) => {
          const input = { ...get().input, ...patch }
          set({ input })
          if (get().stops.length) set({ plan: evaluatePlan(ds, input, get().stops) })
        },
        generate: () => {
          const { input } = get()
          if (!input.groups.length) return
          apply(generatePlan(ds, input), { panel: 'itinerary', selected: null, fitRequest: get().fitRequest + 1, layerMonth: monthOf(input.startDate) })
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
        setPanel: (panel) => set({ panel }),
        setCurrency: (currency) => set({ currency }),
        setPriceCompare: (priceCompare) => set({ priceCompare }),
        setCityTab: (cityTab) => set({ cityTab }),
        importTrip: ({ input, stops }) => {
          set({ input, stops, plan: stops.length ? evaluatePlan(ds, input, stops) : null, selected: null, fitRequest: get().fitRequest + 1 })
        },
        restore: ({ input, stops }) => set({ input, stops, plan: stops.length ? evaluatePlan(ds, input, stops) : null }),
      }
    },
    {
      name: 'rtw-map-trip',
      version: 1,
      storage: safeStorage,
      partialize: (s) => ({ input: s.input, stops: s.stops, panel: s.panel, layer: s.layer, currency: s.currency, priceCompare: s.priceCompare, cityTab: s.cityTab }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<State>) }
        try {
          merged.plan = merged.stops.length ? evaluatePlan(ds, merged.input, merged.stops) : null
          merged.layerMonth = monthOf(merged.input.startDate)
        } catch {
          // Saved trip refers to data that no longer exists; start fresh.
          return current
        }
        return merged
      },
    },
  ),
)

/** Downloads the trip as a JSON file (also a backup). */
export function exportTrip() {
  const { input, stops } = useTrip.getState()
  const blob = new Blob([JSON.stringify({ app: 'rtw-map', version: 1, input, stops }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `trip-${input.startDate}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
