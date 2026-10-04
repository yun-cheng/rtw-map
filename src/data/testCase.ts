import type { Dataset, TripInput } from '../planner/types'
import { REGION_PRESETS, makeGroup } from './presets'

const preset = (name: string) => REGION_PRESETS.find((p) => p.name === name)!.countries

/**
 * The end-to-end test case from PLAN.md §3.3:
 * May–Sept 2027, Balkans → Eastern Europe → Poland (longer) → Baltic States → Russia.
 */
export function testCaseInput(ds: Dataset, passport = 'TW'): TripInput {
  const russia = makeGroup(ds, 'Russia', preset('Russia'))
  russia.countries[0].mode = 'must' // explicitly chosen despite the advisory
  return {
    startDate: '2027-05-01',
    endDate: '2027-09-30',
    groups: [
      makeGroup(ds, 'Balkans', preset('Balkans')),
      makeGroup(ds, 'Eastern Europe', preset('Eastern Europe')),
      makeGroup(ds, 'Poland', preset('Poland'), true),
      makeGroup(ds, 'Baltic States', preset('Baltic States')),
      russia,
    ],
    keepGroupOrder: true,
    startCityId: null,
    endCityId: null,
    mustCities: [],
    pace: 'balanced',
    budget: 'backpacker',
    interests: [],
    passport,
    schengenDaysBefore: 0,
  }
}
