import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { makeGroup } from '../data/presets'
import { testCaseInput } from '../data/testCase'
import { cityMetrics } from '../map/cityMetric'
import { evaluatePlan, generatePlan } from '../planner'
import { MAP_LAYERS, useTrip } from '../store/trip'
import { CITY_SECTIONS, COMPARE_FIELDS, bindTrip, runTool } from './tools'

// A capital added from open data only (build-capitals.ts) has none of the curated data (tags, health, payments, local
// transport, phrases, connections), and its country none of what's written for the app: every tool, view and check
// must work without it, and say nothing made up. Every country has curated data now, so these countries are cut back
// to open data for the test (openDataOnly).
const OPEN_DATA_ONLY = vi.hoisted(() => ['DE', 'KE', 'BR', 'FJ', 'US', 'IN', 'EG', 'MX', 'AU', 'IS', 'SO', 'TV'])
vi.mock('../data/dataset', async (importOriginal) => {
  const { dataset } = await importOriginal<typeof import('../data/dataset')>()
  const { openDataOnly } = await import('../data/openDataOnly')
  return { dataset: openDataOnly(dataset, OPEN_DATA_ONLY) }
})
const auto = Object.values(ds.cities).filter((c) => c.auto)

beforeEach(() => {
  bindTrip(useTrip)
  useTrip.getState().openTrip({ input: testCaseInput(ds, 'US'), stops: [] })
})

describe('capitals from open data only', () => {
  it('are marked, with no curated profile', () => {
    const curated = new Set(Object.values(ds.cities).filter((c) => !c.auto).map((c) => c.iso2))
    expect(new Set(auto.map((c) => c.iso2))).toEqual(new Set(OPEN_DATA_ONLY))
    for (const c of auto) {
      expect(curated.has(c.iso2), c.id).toBe(false)
      expect(ds.countries[c.iso2]?.auto, c.iso2).toBe(true)
      expect(c.tags).toEqual([])
    }
  })

  it('answer every assistant tool, with no English or card level made up', () => {
    for (const c of auto) {
      const info = runTool('get_city_info', { city: c.id })
      expect(info.ok, `${c.id}: ${JSON.stringify(info.result).slice(0, 200)}`).toBe(true)
      expect(info.result.english).toBeUndefined()
      expect(runTool('get_city_info', { city: c.id, sections: [...CITY_SECTIONS] }).ok, c.id).toBe(true)
    }
    const compared = runTool('compare_cities', { cities: auto.slice(0, 20).map((c) => c.id), fields: [...COMPARE_FIELDS] })
    expect(compared.ok).toBe(true)
    expect(runTool('find_cities', { country: 'Kenya' }).result).toMatchObject({ cities: [expect.objectContaining({ name: 'Nairobi' })] })
  })

  it('show in every map view', () => {
    const s = useTrip.getState()
    for (const layer of MAP_LAYERS) {
      const metric = cityMetrics({ ...s, layer })
      for (const c of auto) expect(() => metric(c.id), `${layer} ${c.id}`).not.toThrow()
    }
  })

  it('are never planned, even where a road reaches them, and the assistant can\'t add them', () => {
    const input = { ...testCaseInput(ds, 'US'), groups: [makeGroup(ds, 'Central Europe', ['DE', 'CZ', 'PL'])] }
    input.groups[0].countries.forEach((c) => (c.mode = 'must'))
    const plan = generatePlan(ds, input)
    expect(plan.stops.length).toBeGreaterThan(0)
    expect(plan.stops.some((s) => ds.cities[s.cityId].auto)).toBe(false)
    expect(plan.warnings.map((w) => w.title)).toContain('Germany left out: no curated cities there yet')
    const add = runTool('add_stop', { city: 'Berlin' })
    expect(add.ok).toBe(false)
    expect(add.result.error).toMatch(/only open data/)
  })

  it('have no made-up prices, stays or routes', () => {
    const info = runTool('get_city_info', { city: 'Nairobi' }).result
    expect(info.daily_cost_eur).toMatch(/no prices/)
    expect(info.suggested_days).toBeUndefined()
    expect(runTool('get_route', { from: 'Berlin', to: 'Prague' }).result).not.toHaveProperty('price_eur')
  })

  it('are checked in a plan without errors', () => {
    const input = testCaseInput(ds, 'US')
    const stops = auto.map((c) => ({ cityId: c.id, nights: 2, locked: false, groupId: '' }))
    expect(() => evaluatePlan(ds, input, stops)).not.toThrow()
  })
})
