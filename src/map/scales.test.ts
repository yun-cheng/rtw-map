import { describe, expect, it } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { airBand, dailyCost } from '../planner'
import { airLegend, costScale } from './scales'

describe('map legends', () => {
  it('shows the PM2.5 range of each of the five air bands', () => {
    expect(airLegend().map((l) => l.label)).toEqual(['0–10', '10–15', '15–25', '25–35', '35+'])
    expect([10, 10.1, 25, 35.1].map((v) => airBand(v).short)).toEqual(['Good', 'OK', 'Moderate', 'Very poor'])
  })

  it('splits daily costs into five bands of about a fifth of the cities each, in the display currency', () => {
    for (const budget of ['shoestring', 'comfort'] as const) {
      const scale = costScale(budget, 'EUR')
      expect(scale.legend).toHaveLength(5)
      const counts = new Map<string, number>()
      for (const id of Object.keys(ds.cities)) {
        const c = scale.color(dailyCost(ds, id, budget))
        counts.set(c, (counts.get(c) ?? 0) + 1)
      }
      expect(counts.size).toBe(5)
      for (const n of counts.values()) expect(n).toBeGreaterThan(Object.keys(ds.cities).length / 10)
    }
    expect(costScale('backpacker', 'EUR').legend.map((l) => l.label)).toEqual(['<€26', '€26–35', '€35–42', '€42–54', '€54+'])
    expect(costScale('backpacker', 'USD').legend[1].label).toMatch(/^\$\d+–\d+$/)
  })
})
