import { taxiEstimate } from './transport'
import type { CostProfile, Dataset, DayChoices, GroceryKey, LocalCostProfile, MealChoice, TravelPrefs, TripInput } from './types'

/** The shop items, in the order the city panel lists them. */
export const GROCERY_KEYS: GroceryKey[] = ['water15', 'coke05', 'beer05', 'bread', 'eggs10', 'milk1l', 'pasta500g', 'bananas1kg', 'tomatoes1kg', 'chicken500g']

/** What the meal and grocery prices count, for one person; shown in the city panel and on the review page. */
export const COST_HINTS = {
  mealLocal: "One person's lunch or dinner at a simple place where locals eat every day (a street stall, food court, canteen, noodle or kebab shop), not a fast-food chain: one main dish with water or a soft drink. What you actually pay, including tax and any usual tip.",
  mealDinner: "One person's dinner at a sit-down restaurant with table service, the kind locals choose for a nice evening out (not fast food, not fine dining, not a tourist trap): one main course and one drink (a beer, a glass of wine or a soft drink). What you actually pay, including tax, any service charge and the usual tip.",
  coffee: 'A cappuccino, or the usual café coffee, at an ordinary café (sit-down or takeaway). What you actually pay.',
  beerBar: 'Half a litre of local beer at an ordinary bar or pub (smaller bottles and glasses are scaled to 0.5 L). What you actually pay, including any service charge or usual tip.',
  groceryDay: 'Supermarket food for one person for a day of DIY meals, and 1.5 L of drinking water. Breakfast: 2 slices of bread (⅙ of a 500 g loaf), an egg and a banana. Lunch and dinner, each: 125 g of pasta, 150 g of chicken breast and 200 g of tomatoes.',
}

/** What a meal choice counts, shown for the chosen one (skipping a meal needs no explanation). */
export const MEAL_HINTS: { breakfast: Partial<Record<MealChoice, string>>; lunchDinner: Partial<Record<MealChoice, string>> } = {
  breakfast: {
    diy: '2 slices of bread, an egg and a banana from the supermarket.',
    local: 'Breakfast at a simple local place, priced like a local meal.',
  },
  lunchDinner: {
    diy: '125 g of pasta, 150 g of chicken breast and 200 g of tomatoes from the supermarket.',
    local: 'One main dish with water or a soft drink at a simple place where locals eat.',
    restaurant: 'A main course and a drink at a sit-down restaurant.',
  },
}

/**
 * A DIY meal from the supermarket (see COST_HINTS.groceryDay): breakfast is 2 slices of bread, an egg and a banana
 * (~400 kcal); lunch and dinner are the same, 125 g of pasta, 150 g of chicken breast and 200 g of tomatoes (~650 kcal).
 */
export function groceryMeal(c: CostProfile, meal: 'breakfast' | 'lunch' | 'dinner'): number {
  const g = c.groceries
  return meal === 'breakfast' ? g.bread / 6 + g.eggs10 / 10 + g.bananas1kg / 8 : g.pasta500g / 4 + g.chicken500g * 0.3 + g.tomatoes1kg / 5
}

/** A day of DIY meals from the supermarket (groceryMeal), and 1.5 L of drinking water (not counted in the meals). */
export function groceryDay(c: CostProfile): number {
  return groceryMeal(c, 'breakfast') + groceryMeal(c, 'lunch') + groceryMeal(c, 'dinner') + c.groceries.water15
}

/**
 * Countries' prices from local money into EUR at the current exchange rates (`rates`: units per EUR), so they follow
 * the rates instead of going stale when a currency moves. Throws for a currency without a rate.
 */
export function costsInEur(costs: Record<string, LocalCostProfile>, rates: Record<string, number>): Record<string, CostProfile> {
  return Object.fromEntries(Object.entries(costs).map(([iso2, { currency, groceries, ...rest }]) => {
    const rate = rates[currency]
    if (!rate) throw new Error(`No exchange rate for ${currency} (costs for ${iso2})`)
    const eur = (v: number) => v / rate
    const base = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, eur(v)])) as Omit<CostProfile, 'groceries'>
    return [iso2, { ...base, groceries: Object.fromEntries(GROCERY_KEYS.map((k) => [k, eur(groceries[k])])) as CostProfile['groceries'] }]
  }))
}

const estimates = new WeakMap<Dataset, Map<string, CostProfile | null>>()

/**
 * Cost profile estimated from the national price level, for countries without hand-entered prices:
 * the average of our curated profiles per unit of price level, scaled to this country's level.
 */
export function estimatedCosts(ds: Dataset, iso2: string): CostProfile | null {
  let cache = estimates.get(ds)
  if (!cache) estimates.set(ds, (cache = new Map()))
  if (cache.has(iso2)) return cache.get(iso2)!
  const level = ds.priceLevels.levels[iso2]?.level
  const curated = Object.entries(ds.costs).filter(([c]) => ds.priceLevels.levels[c])
  let result: CostProfile | null = null
  if (level && curated.length) {
    const scale = (get: (p: CostProfile) => number) =>
      Math.round((curated.reduce((s, [c, p]) => s + get(p) / ds.priceLevels.levels[c].level, 0) / curated.length) * level * 100) / 100
    result = {
      dormBed: scale((p) => p.dormBed), privateRoom: scale((p) => p.privateRoom), mealLocal: scale((p) => p.mealLocal),
      mealDinner: scale((p) => p.mealDinner), localTransportDay: scale((p) => p.localTransportDay),
      coffee: scale((p) => p.coffee), beerBar: scale((p) => p.beerBar),
      groceries: Object.fromEntries(GROCERY_KEYS.map((k) => [k, scale((p) => p.groceries[k])])) as CostProfile['groceries'],
    }
  }
  cache.set(iso2, result)
  return result
}

/** The cost profile for a country: hand-entered if we have it, otherwise estimated from the price level. */
export function costProfile(ds: Dataset, iso2: string): { profile: CostProfile; estimated: boolean } | null {
  if (ds.costs[iso2]) return { profile: ds.costs[iso2], estimated: false }
  const est = estimatedCosts(ds, iso2)
  return est ? { profile: est, estimated: true } : null
}

/** The day choices the preferences give every city (no taxis: those are chosen per city). */
export function prefsDay(p: TravelPrefs): DayChoices {
  return {
    bed: p.room,
    breakfast: p.breakfast, lunch: p.lunch, dinner: p.dinner, coffees: p.coffees, beers: p.beers, taxis: 0,
  }
}

/** The day choices for a city on this trip: the preferences, with the trip's changes for that city. */
export function dayChoices(input: CostInput, cityId: string): DayChoices {
  return { ...prefsDay(input.prefs), ...input.cityCosts?.[cityId] }
}

/** What the daily cost depends on: the preferences and the trip's changes per city. */
export type CostInput = Pick<TripInput, 'prefs' | 'cityCosts'>

export type CostItem = { key: 'bed' | 'breakfast' | 'lunch' | 'dinner' | 'coffee' | 'beer' | 'transport' | 'taxi'; label: string; eur: number }

const MEAL_LABELS: Record<MealChoice, string> = {
  skip: 'skipped', diy: 'DIY', local: 'local meal', restaurant: 'restaurant',
}

/**
 * One traveller's day in a city, item by item, in EUR: the bed (a private room is shared by two travellers, also
 * when 3–4 take two rooms), each meal, café coffees, bar beers, a day of public transport (always) and taxi rides of
 * ~5 km (none where we have no taxi prices). Beds, meals and drinks follow the city's cost factor; groceries, transport
 * and taxis are national. Null without cost data.
 */
export function dayCost(ds: Dataset, cityId: string, d: DayChoices, travellers: TravelPrefs['travellers'] = 1): { items: CostItem[]; total: number } | null {
  const city = ds.cities[cityId]
  const c = costProfile(ds, city.iso2)?.profile
  if (!c) return null
  const f = city.costFactor
  const meal = (m: MealChoice, slot: 'breakfast' | 'lunch' | 'dinner') =>
    m === 'diy' ? groceryMeal(c, slot) : m === 'local' ? c.mealLocal * f : m === 'restaurant' ? c.mealDinner * f : 0
  const taxi = taxiEstimate(ds, cityId)
  const ride = taxi ? (taxi.min + taxi.max) / 2 : 0
  const items: CostItem[] = [
    { key: 'bed', label: d.bed === 'dorm' ? 'Dorm bed' : travellers > 1 ? 'Private room, half' : 'Private room', eur: d.bed === 'dorm' ? c.dormBed * f : (c.privateRoom * f) / (travellers > 1 ? 2 : 1) },
    { key: 'breakfast', label: `Breakfast: ${MEAL_LABELS[d.breakfast]}`, eur: meal(d.breakfast, 'breakfast') },
    { key: 'lunch', label: `Lunch: ${MEAL_LABELS[d.lunch]}`, eur: meal(d.lunch, 'lunch') },
    { key: 'dinner', label: `Dinner: ${MEAL_LABELS[d.dinner]}`, eur: meal(d.dinner, 'dinner') },
    { key: 'coffee', label: `Café coffee × ${d.coffees}`, eur: c.coffee * f * d.coffees },
    { key: 'beer', label: `Beer in a bar × ${d.beers}`, eur: c.beerBar * f * d.beers },
    { key: 'transport', label: 'Public transport, a day', eur: c.localTransportDay },
    { key: 'taxi', label: `Taxi ride × ${d.taxis}`, eur: ride * d.taxis },
  ]
  return { items, total: items.reduce((t, i) => t + i.eur, 0) }
}

/** One traveller's spend per day in a city on this trip, in EUR (0 without cost data). */
export function dailyCost(ds: Dataset, cityId: string, input: CostInput): number {
  return dayCost(ds, cityId, dayChoices(input, cityId), input.prefs.travellers)?.total ?? 0
}

/** The kinds of cost the map's Cost view can show. */
export type CostKind = 'day' | 'dorm' | 'private' | 'meal' | 'groceries' | 'transport'
export const COST_KINDS: CostKind[] = ['day', 'dorm', 'private', 'meal', 'groceries', 'transport']

/**
 * One kind of cost in a city, in EUR: a day on this trip's choices (dailyCost), a night in a dorm or a private room, a
 * local meal, a day of groceries or a day of local transport. Beds and meals follow the city's cost factor; groceries and
 * transport are national. 0 without cost data.
 */
export function costOf(ds: Dataset, cityId: string, kind: CostKind, input: CostInput): number {
  if (kind === 'day') return dailyCost(ds, cityId, input)
  const city = ds.cities[cityId]
  const c = costProfile(ds, city.iso2)?.profile
  if (!c) return 0
  const f = city.costFactor
  switch (kind) {
    case 'dorm': return c.dormBed * f
    case 'private': return c.privateRoom * f
    case 'meal': return c.mealLocal * f
    case 'groceries': return groceryDay(c)
    case 'transport': return c.localTransportDay
  }
}

/**
 * How our hand-entered costs compare with what the national price level suggests (1.0 = in line).
 * Used to flag estimates that look too high or too low.
 */
export function costSanity(ds: Dataset, iso2: string): number | null {
  const curated = ds.costs[iso2]
  const est = estimatedCosts(ds, iso2)
  if (!curated || !est) return null
  const total = (p: CostProfile) => p.dormBed + p.mealLocal * 2 + p.localTransportDay + groceryDay(p)
  return Math.round((total(curated) / total(est)) * 100) / 100
}

/**
 * Plain-language comparison of two price levels, e.g. "about 35% cheaper than Germany".
 * Within ±5% counts as "about the same".
 */
export function comparePrices(level: number, otherLevel: number, otherName: string): string {
  const ratio = level / otherLevel
  const pct = Math.round(Math.abs(1 - ratio) * 100 / 5) * 5
  if (pct < 5) return `about the same as ${otherName}`
  return ratio < 1 ? `about ${pct}% cheaper than ${otherName}` : `about ${pct}% more expensive than ${otherName}`
}
