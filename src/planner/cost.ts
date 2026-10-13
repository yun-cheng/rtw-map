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

/**
 * The cost profile for a country: hand-entered, or none. (No estimate from the price level for the others: that
 * would be our curated prices scaled, made-up numbers for a country we have no prices for.)
 */
export function costProfile(ds: Dataset, iso2: string): { profile: CostProfile; estimated: boolean } | null {
  return ds.costs[iso2] ? { profile: ds.costs[iso2], estimated: false } : null
}

/**
 * What a price the user saw in a city is the price of (the city panel's Daily cost and Prices): a dorm bed, a meal, a
 * coffee, a supermarket item, a day of public transport, a ~5 km taxi ride, a DIY meal (`diyBreakfast`, or `diyMeal`
 * for lunch or dinner), a day of groceries, or the whole day (`day`: what a day there really costs them).
 */
export type PriceKey = Exclude<keyof CostProfile, 'groceries'> | GroceryKey | 'taxiRide' | 'diyBreakfast' | 'diyMeal' | 'groceryDay' | 'day'

/** What each seen price is the price of, in a few words. */
export const PRICE_LABELS: Record<PriceKey, string> = {
  dormBed: 'a dorm bed', privateRoom: 'a private room', mealLocal: 'a local meal', mealDinner: 'a restaurant dinner',
  coffee: 'a café coffee', beerBar: 'a beer in a bar (0.5 L)', localTransportDay: 'a day of public transport',
  water15: 'water (1.5 L)', coke05: 'Coca-Cola (0.5 L)', beer05: 'beer (0.5 L, shop)', bread: 'bread (loaf)', eggs10: 'eggs (10)',
  milk1l: 'milk (1 L)', pasta500g: 'pasta (500 g)', bananas1kg: 'bananas (1 kg)', tomatoes1kg: 'tomatoes (1 kg)', chicken500g: 'chicken breast (500 g)',
  taxiRide: 'a taxi ride of ~5 km', diyBreakfast: 'a DIY breakfast', diyMeal: 'a DIY lunch or dinner', groceryDay: 'groceries for a day',
  day: 'a whole day',
}

/** Prices the user saw, per city id, in EUR (My visit keeps them in the money they were seen in). */
export type SeenPrices = Record<string, Partial<Record<PriceKey, number>>>

/** A city's prices in EUR, ours or the user's where they saw one (`seen`): beds, meals and drinks with the city's cost
 *  factor; groceries, transport and taxis national. */
export type CityPrices = CostProfile & {
  /** A ~5 km taxi ride (the middle of our range); null where we have no taxi prices. */
  taxiRide: number | null
  diyBreakfast: number
  diyMeal: number
  groceryDay: number
  seen: Partial<Record<PriceKey, number>>
}

/** A city's prices (CityPrices), the user's replacing ours; null without cost data. A supermarket price seen changes
 *  the DIY meals and the day of groceries made from it, unless those were seen too. */
export function cityPrices(ds: Dataset, cityId: string, prices?: SeenPrices): CityPrices | null {
  const city = ds.cities[cityId]
  const c = costProfile(ds, city.iso2)?.profile
  if (!c) return null
  const seen = prices?.[cityId] ?? {}
  const f = city.costFactor
  const own = (k: PriceKey, ours: number) => seen[k] ?? ours
  const shop = { ...c, groceries: Object.fromEntries(GROCERY_KEYS.map((k) => [k, own(k, c.groceries[k])])) as CostProfile['groceries'] }
  const taxi = taxiEstimate(ds, cityId)
  const diyBreakfast = own('diyBreakfast', groceryMeal(shop, 'breakfast'))
  const diyMeal = own('diyMeal', groceryMeal(shop, 'lunch'))
  return {
    dormBed: own('dormBed', c.dormBed * f), privateRoom: own('privateRoom', c.privateRoom * f),
    mealLocal: own('mealLocal', c.mealLocal * f), mealDinner: own('mealDinner', c.mealDinner * f),
    coffee: own('coffee', c.coffee * f), beerBar: own('beerBar', c.beerBar * f),
    localTransportDay: own('localTransportDay', c.localTransportDay),
    groceries: shop.groceries,
    taxiRide: seen.taxiRide ?? (taxi ? (taxi.min + taxi.max) / 2 : null),
    diyBreakfast, diyMeal,
    groceryDay: own('groceryDay', diyBreakfast + diyMeal * 2 + shop.groceries.water15),
    seen,
  }
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

/** What the daily cost depends on: the preferences, the trip's changes per city and the prices the user saw there. */
export type CostInput = Pick<TripInput, 'prefs' | 'cityCosts'> & { prices?: SeenPrices }

export type CostItem = { key: 'bed' | 'breakfast' | 'lunch' | 'dinner' | 'coffee' | 'beer' | 'transport' | 'taxi'; label: string; eur: number }

const MEAL_LABELS: Record<MealChoice, string> = {
  skip: 'skipped', diy: 'DIY', local: 'local meal', restaurant: 'restaurant',
}

/**
 * One traveller's day in a city, item by item, in EUR: the bed, each meal, café coffees, bar beers, a day of public
 * transport (always) and taxi rides of ~5 km (none where we have no taxi prices), at the city's prices (cityPrices: the
 * user's where they saw one). `total` is their own cost of a day there when they gave one (`own`), else the items'
 * `sum`. Null without cost data.
 */
export function dayCost(ds: Dataset, cityId: string, d: DayChoices, prices?: SeenPrices): { items: CostItem[]; sum: number; total: number; own: boolean } | null {
  const p = cityPrices(ds, cityId, prices)
  if (!p) return null
  const meal = (m: MealChoice, slot: 'breakfast' | 'lunch' | 'dinner') =>
    m === 'diy' ? (slot === 'breakfast' ? p.diyBreakfast : p.diyMeal) : m === 'local' ? p.mealLocal : m === 'restaurant' ? p.mealDinner : 0
  const items: CostItem[] = [
    { key: 'bed', label: d.bed === 'dorm' ? 'Dorm bed' : 'Private room', eur: d.bed === 'dorm' ? p.dormBed : p.privateRoom },
    { key: 'breakfast', label: `Breakfast: ${MEAL_LABELS[d.breakfast]}`, eur: meal(d.breakfast, 'breakfast') },
    { key: 'lunch', label: `Lunch: ${MEAL_LABELS[d.lunch]}`, eur: meal(d.lunch, 'lunch') },
    { key: 'dinner', label: `Dinner: ${MEAL_LABELS[d.dinner]}`, eur: meal(d.dinner, 'dinner') },
    { key: 'coffee', label: `Café coffee × ${d.coffees}`, eur: p.coffee * d.coffees },
    { key: 'beer', label: `Beer in a bar × ${d.beers}`, eur: p.beerBar * d.beers },
    { key: 'transport', label: 'Public transport, a day', eur: p.localTransportDay },
    { key: 'taxi', label: `Taxi ride × ${d.taxis}`, eur: (p.taxiRide ?? 0) * d.taxis },
  ]
  const sum = items.reduce((t, i) => t + i.eur, 0)
  return { items, sum, total: p.seen.day ?? sum, own: p.seen.day !== undefined }
}

/** One traveller's spend per day in a city on this trip, in EUR (0 without cost data). */
export function dailyCost(ds: Dataset, cityId: string, input: CostInput): number {
  return dayCost(ds, cityId, dayChoices(input, cityId), input.prices)?.total ?? 0
}

/** The kinds of cost the map's Cost view can show. */
export type CostKind = 'day' | 'dorm' | 'private' | 'meal' | 'restaurant' | 'coffee' | 'beer' | 'groceries' | 'transport' | 'taxi' | 'car' | 'scooter'
export const COST_KINDS: CostKind[] = ['day', 'dorm', 'private', 'meal', 'restaurant', 'coffee', 'beer', 'groceries', 'transport', 'taxi', 'car', 'scooter']

/**
 * One kind of cost in a city, in EUR: a day on this trip's choices (dailyCost), a night in a dorm or a private room, a
 * local meal, a restaurant dinner, a café coffee, a beer in a bar, a day of groceries, a day of local transport or a
 * taxi ride of ~5 km (as in the daily cost), or a day's car or scooter rental (the middle of the usual range, only where
 * the city's transport lists that rental), at the city's prices (cityPrices: the user's where they saw one; rentals
 * always ours). 0 without cost data.
 */
export function costOf(ds: Dataset, cityId: string, kind: CostKind, input: CostInput): number {
  if (kind === 'day') return dailyCost(ds, cityId, input)
  const p = cityPrices(ds, cityId, input.prices)
  if (!p) return 0
  switch (kind) {
    case 'dorm': return p.dormBed
    case 'private': return p.privateRoom
    case 'meal': return p.mealLocal
    case 'restaurant': return p.mealDinner
    case 'coffee': return p.coffee
    case 'beer': return p.beerBar
    case 'groceries': return p.groceryDay
    case 'transport': return p.localTransportDay
    case 'taxi': return p.taxiRide ?? 0
    case 'car':
    case 'scooter': {
      const city = ds.cities[cityId]
      const range = ds.localTransport.countries[city.iso2]?.rentals?.[kind === 'car' ? 'carDay' : 'motoDay']
      const rented = ds.localTransport.cities[cityId]?.rentals?.includes(kind === 'car' ? 'car' : 'moto')
      return range && rented ? (range[0] + range[1]) / 2 : 0
    }
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
