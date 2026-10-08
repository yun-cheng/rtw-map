import { describe, expect, it } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { COST_KINDS, airBand, costOf, dailyCost, stylePrefs } from '../planner'
import { airLegend, costScale } from './scales'

const BACKPACKER = { prefs: stylePrefs('backpacker') }

describe('map legends', () => {
  it('shows the PM2.5 range of each of the five air bands', () => {
    expect(airLegend().map((l) => l.label)).toEqual(['0–10', '10–15', '15–25', '25–35', '35+'])
    expect([10, 10.1, 25, 35.1].map((v) => airBand(v).short)).toEqual(['Good', 'OK', 'Moderate', 'Very poor'])
  })

  it('splits daily costs into five bands of about a fifth of the cities each, in the display currency', () => {
    for (const budget of ['shoestring', 'comfort'] as const) {
      const input = { prefs: stylePrefs(budget) }
      const scale = costScale('day', input, 'EUR')
      expect(scale.legend).toHaveLength(5)
      const counts = new Map<string, number>()
      for (const id of Object.keys(ds.cities)) {
        const c = scale.color(dailyCost(ds, id, input))
        counts.set(c, (counts.get(c) ?? 0) + 1)
      }
      expect(counts.size).toBe(5)
      for (const n of counts.values()) expect(n).toBeGreaterThan(Object.keys(ds.cities).length / 10)
    }
    // The splits move as cities are added, so only the format is fixed.
    const labels = costScale('day', BACKPACKER, 'EUR').legend.map((l) => l.label)
    expect(labels[0]).toMatch(/^<€\d+$/)
    expect(labels.slice(1, 4)).toEqual(labels.slice(1, 4).map((l) => l.match(/^€\d+–\d+$/)?.[0]))
    expect(labels[4]).toMatch(/^€\d+\+$/)
    expect(costScale('day', BACKPACKER, 'USD').legend[1].label).toMatch(/^\$\d+–\d+$/)
  })

  it('bands each kind of cost, keeping cents for small amounts', () => {
    for (const kind of COST_KINDS) {
      const scale = costScale(kind, BACKPACKER, 'EUR')
      expect(scale.legend.length, kind).toBeGreaterThanOrEqual(3)
      expect(costOf(ds, 'tirana', kind, BACKPACKER), kind).toBeGreaterThan(0)
    }
    expect(costOf(ds, 'tirana', 'day', BACKPACKER)).toBe(dailyCost(ds, 'tirana', BACKPACKER))
    expect(costScale('transport', BACKPACKER, 'EUR').legend[0].label).toMatch(/^<€\d+\.\d\d$/)
    // Beds follow the city: Dubrovnik's dorm costs more than Zagreb's on the same national prices.
    expect(costOf(ds, 'dubrovnik', 'dorm', BACKPACKER)).toBeGreaterThan(costOf(ds, 'zagreb', 'dorm', BACKPACKER))
  })
})
