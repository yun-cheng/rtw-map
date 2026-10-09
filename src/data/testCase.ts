import { DEFAULT_PREFS } from '../planner/prefs'
import type { Dataset, TripInput } from '../planner/types'
import { makeGroup } from './presets'

/**
 * The end-to-end test case from PLAN.md §3.3:
 * May–Sept 2027, Balkans → Eastern Europe → Poland (two to three weeks) → Baltic States → Russia.
 */
export function testCaseInput(ds: Dataset, passport = 'TW'): TripInput {
  const poland = makeGroup(ds, 'Poland', ['PL'])
  poland.countries[0] = { ...poland.countries[0], minDays: 14, maxDays: 21 }
  const russia = makeGroup(ds, 'Russia', ['RU'])
  russia.countries[0].mode = 'must' // explicitly chosen despite the advisory
  return {
    startDate: '2027-05-01',
    endDate: '2027-09-30',
    groups: [
      makeGroup(ds, 'Balkans', ['AL', 'ME', 'BA', 'RS', 'XK', 'MK', 'HR', 'SI', 'GR']),
      makeGroup(ds, 'Central & Eastern Europe', ['BG', 'RO', 'MD', 'HU', 'SK', 'CZ', 'AT', 'UA', 'BY']),
      poland,
      makeGroup(ds, 'Baltic States', ['LT', 'LV', 'EE']),
      russia,
    ],
    keepGroupOrder: true,
    startCityId: null,
    endCityId: null,
    mustCities: [],
    pace: 'balanced',
    budget: 'backpacker',
    prefs: DEFAULT_PREFS,
    interests: [],
    passport,
    schengenDaysBefore: 0,
  }
}
