import type { Budget, CostProfile, Dataset } from './types'

/** Groceries to cook your own meals for one day. */
export function groceryDay(c: CostProfile): number {
  const g = c.groceries
  return g.bread + g.eggs12 / 2 + g.milk1l / 2 + g.rice1kg / 4 + g.chicken1kg / 3 + g.tomatoes1kg / 3 + g.water15
}

/** Estimated spend per day in EUR for a city and travel style. */
export function dailyCost(ds: Dataset, cityId: string, budget: Budget): number {
  const city = ds.cities[cityId]
  const c = ds.costs[city.iso2]
  if (!c) return 0
  const f = city.costFactor
  switch (budget) {
    case 'shoestring': return c.dormBed * f + groceryDay(c) + c.localTransportDay * 0.5 + 3
    case 'backpacker': return c.dormBed * f + groceryDay(c) * 0.5 + c.mealCheap * f * 1.5 + c.localTransportDay + 8
    case 'midrange': return c.privateRoom * f + (c.mealCheap + c.mealMid) * f + c.localTransportDay + 15
    case 'comfort': return c.privateRoom * f * 2 + c.mealMid * f * 2.5 + c.localTransportDay * 2 + 30
  }
}
