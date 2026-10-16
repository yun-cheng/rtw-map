import { describe, expect, it } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { dailyCost, stylePrefs } from '../planner'
import { anyOwnCost, cityMetrics } from './cityMetric'

const id = Object.keys(ds.cities).find((c) => dailyCost(ds, c, { prefs: stylePrefs('backpacker') }) > 0)!
const input = { prefs: stylePrefs('backpacker') }
const state = (over: object = {}) => ({
  plan: null, input, layer: 'cost', layerMonth: 0, nearbyKind: 'supermarket',
  costKind: 'day', weatherBy: 'high', currency: 'EUR', tempUnit: 'C', tempFeels: false, seenPrices: {}, ...over,
}) as unknown as Parameters<typeof cityMetrics>[0]
const line = (over?: object) => cityMetrics(state(over))(id).lines?.join(' | ')

describe("the Cost view's * on a city's cost", () => {
  it("marks a cost that is the user's", () => {
    expect(line()).not.toContain('*')
    expect(line({ seenPrices: { [id]: { day: 99 } } })).toBe('~€99/day*')
    expect(line({ seenPrices: { [id]: { coffee: 50 } } })).toMatch(/\*$/)
    expect(line({ input: { ...input, cityCosts: { [id]: { coffees: 2 } } } })).toMatch(/\*$/)
    expect(line({ costKind: 'dorm', seenPrices: { [id]: { dormBed: 7 } } })).toBe('~€7.00/night*')
  })

  it("leaves a cost unmarked when the price seen isn't part of it", () => {
    expect(line({ costKind: 'dorm', seenPrices: { [id]: { coffee: 50 } } })).not.toContain('*')
  })

  it('says what the * means in the legend only when a city has one', () => {
    expect(anyOwnCost('day', input, {})).toBe(false)
    expect(anyOwnCost('day', { ...input, cityCosts: { [id]: { coffees: 2 } } })).toBe(true)
    expect(anyOwnCost('dorm', { ...input, cityCosts: { [id]: { coffees: 2 } } })).toBe(false)
    expect(anyOwnCost('dorm', input, { [id]: { dormBed: 7 } })).toBe(true)
  })
})
