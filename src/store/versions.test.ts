import { describe, expect, it } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { draftStops, testCaseInput } from '../data/testCase'
import type { TripData } from './tripCore'
import { versionChanges } from './versions'

const input = testCaseInput(ds, 'US')
const stops = draftStops(ds, input)
const trip: TripData = { input, stops }

describe('what changed in a version', () => {
  it("names the trip's start", () => {
    expect(versionChanges(null, trip)).toEqual([`Started the trip: ${stops.length} stops`])
    expect(versionChanges(null, { input, stops: [] })).toEqual(['Started the trip'])
  })

  it('lists the changes to the plan shown, in plain language', () => {
    const [first, second] = stops
    const after: TripData = { input: { ...input, endDate: '2027-09-29' }, stops: [{ ...first, nights: first.nights + 1 }, ...stops.slice(2)] }
    const lines = versionChanges(trip, after)
    expect(lines).toContain(`Dates: ${input.startDate} – ${input.endDate} → ${input.startDate} – 2027-09-29`)
    expect(lines).toContain(`${ds.cities[first.cityId].name}: ${first.nights} → ${first.nights + 1} nights`)
    expect(lines).toContain(`Removed ${ds.cities[second.cityId].name}`)
  })

  it("names another plan changed, and the trip made read-only", () => {
    const plans = [{ id: 'a', name: 'Plan A', input, stops }, { id: 'b', name: 'Plan B', input, stops }]
    const before: TripData = { input, stops, plans, activePlanId: 'a' }
    const after: TripData = { input, stops, plans: [plans[0], { ...plans[1], stops: stops.slice(1) }], activePlanId: 'a', readOnly: true }
    expect(versionChanges(before, after)).toEqual(['Changed Plan B', 'Made read-only'])
    expect(versionChanges(before, before)).toEqual([])
    // (From a trip saved before plans: no plan made up.)
    expect(versionChanges(trip, before)).toEqual([])
  })
})
