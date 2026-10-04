import type { Budget, CostProfile, Dataset } from './types'

/** Groceries to cook your own meals for one day. */
export function groceryDay(c: CostProfile): number {
  const g = c.groceries
  return g.bread + g.eggs12 / 2 + g.milk1l / 2 + g.rice1kg / 4 + g.chicken1kg / 3 + g.tomatoes1kg / 3 + g.water15
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
    const g = (k: keyof CostProfile['groceries']) => scale((p) => p.groceries[k])
    result = {
      dormBed: scale((p) => p.dormBed), privateRoom: scale((p) => p.privateRoom), mealCheap: scale((p) => p.mealCheap),
      mealMid: scale((p) => p.mealMid), localTransportDay: scale((p) => p.localTransportDay),
      groceries: {
        bread: g('bread'), eggs12: g('eggs12'), milk1l: g('milk1l'), rice1kg: g('rice1kg'),
        chicken1kg: g('chicken1kg'), tomatoes1kg: g('tomatoes1kg'), beer05: g('beer05'), water15: g('water15'),
      },
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
    case 'backpacker': return c.dormBed * f + groceryDay(c) * 0.5 + c.mealCheap * f * 1.5 + c.localTransportDay + 8
    case 'midrange': return c.privateRoom * f + (c.mealCheap + c.mealMid) * f + c.localTransportDay + 15
    case 'comfort': return c.privateRoom * f * 2 + c.mealMid * f * 2.5 + c.localTransportDay * 2 + 30
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
  const total = (p: CostProfile) => p.dormBed + p.mealCheap * 2 + p.localTransportDay + groceryDay(p)
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
