import type { Budget, CostProfile, Dataset, GroceryKey, LocalCostProfile } from './types'

/** The shop items, in the order the city panel lists them. */
export const GROCERY_KEYS: GroceryKey[] = ['water15', 'coke05', 'beer05', 'bread', 'eggs10', 'milk1l', 'pasta500g', 'bananas1kg', 'tomatoes1kg', 'chicken500g']

/** What the meal, drink and grocery prices count, for one person; shown in the city panel and on the review page. */
export const COST_HINTS = {
  mealLocal: "One person's lunch or dinner at a simple place where locals eat every day (a street stall, food court, canteen, noodle or kebab shop), not a fast-food chain: one main dish with water or a soft drink. What you actually pay, including tax and any usual tip.",
  mealDinner: "One person's dinner at a sit-down restaurant with table service, the kind locals choose for a nice evening out (not fast food, not fine dining, not a tourist trap): one main course and one drink (a beer, a glass of wine or a soft drink). What you actually pay, including tax, any service charge and the usual tip.",
  coffee: 'A cappuccino, or the usual café coffee, at an ordinary café (sit-down or takeaway). What you actually pay.',
  beerBar: 'Half a litre of local beer at an ordinary bar or pub (smaller bottles and glasses are scaled to 0.5 L). What you actually pay, including any service charge or usual tip.',
  groceryDay: 'Supermarket food for one person cooking all their own meals for a day: a loaf of bread, 6 eggs, ½ L of milk, 250 g of pasta, 2 bananas, about 330 g each of chicken breast and tomatoes, and 1.5 L of water.',
}

/**
 * Groceries to cook your own meals for one day: a loaf of bread, 6 eggs, ½ L of milk, 250 g of pasta, 2 bananas
 * (~250 g), ~330 g of chicken breast and of tomatoes, and 1.5 L of water (COST_HINTS.groceryDay says the same).
 */
export function groceryDay(c: CostProfile): number {
  const g = c.groceries
  return g.bread + g.eggs10 * 0.6 + g.milk1l / 2 + g.pasta500g / 2 + g.bananas1kg / 4 + (g.chicken500g * 2) / 3 + g.tomatoes1kg / 3 + g.water15
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

/** Estimated spend per day in EUR for a city and travel style. */
export function dailyCost(ds: Dataset, cityId: string, budget: Budget): number {
  const city = ds.cities[cityId]
  const c = costProfile(ds, city.iso2)?.profile
  if (!c) return 0
  const f = city.costFactor
  switch (budget) {
    case 'shoestring': return c.dormBed * f + groceryDay(c) + c.localTransportDay * 0.5 + 3
    case 'backpacker': return c.dormBed * f + groceryDay(c) * 0.5 + c.mealLocal * f * 1.5 + c.localTransportDay + 8
    case 'private': return c.privateRoom * f * 0.75 + c.mealLocal * f * 2 + groceryDay(c) * 0.3 + c.localTransportDay + 10
    case 'midrange': return c.privateRoom * f + (c.mealLocal + c.mealDinner) * f + c.localTransportDay + 15
    case 'comfort': return c.privateRoom * f * 2 + c.mealDinner * f * 2.5 + c.localTransportDay * 2 + 30
  }
}

/** The kinds of cost the map's Cost view can show. */
export type CostKind = 'day' | 'dorm' | 'private' | 'meal' | 'groceries' | 'transport'
export const COST_KINDS: CostKind[] = ['day', 'dorm', 'private', 'meal', 'groceries', 'transport']

/**
 * One kind of cost in a city, in EUR: a day on the budget (dailyCost), a night in a dorm or a private room, a local
 * meal, a day of groceries or a day of local transport. Beds and meals follow the city's cost factor; groceries and
 * transport are national. 0 without cost data.
 */
export function costOf(ds: Dataset, cityId: string, kind: CostKind, budget: Budget): number {
  if (kind === 'day') return dailyCost(ds, cityId, budget)
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
