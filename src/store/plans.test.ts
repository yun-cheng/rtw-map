import { beforeEach, describe, expect, it } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { testCaseInput } from '../data/testCase'
import { MAX_PLANS, planMark, tripPlans, useTrip } from './trip'

const state = () => useTrip.getState()
const stopIds = () => state().stops.map((s) => s.cityId)

beforeEach(() => {
  state().openTrip({ input: testCaseInput(ds, 'US'), stops: [] })
  state().generate()
})

describe('plans in a trip', () => {
  it('opens a trip saved before plans existed as one plan', () => {
    expect(state().plans).toHaveLength(1)
    expect(state().plans[0].name).toBe('Plan A')
  })

  it('tries a change on a copy, keeping the original', () => {
    const original = stopIds()
    const a = state().activePlanId
    const b = state().addPlan({ name: 'Short' })!
    expect(state().activePlanId).toBe(b)
    state().removeStop(0)
    state().setInput({ pace: 'fast' })
    expect(stopIds()).toHaveLength(original.length - 1)

    state().switchPlan(a)
    expect(stopIds()).toEqual(original)
    expect(state().input.pace).toBe('balanced')
    state().switchPlan(b)
    expect(stopIds()).toEqual(original.slice(1))
    expect(state().input.pace).toBe('fast')
    expect(tripPlans(state()).map((p) => p.name)).toEqual(['Plan A', 'Short'])
  })

  it('renames and deletes plans, never the last one, switching away from a deleted active plan', () => {
    const a = state().activePlanId
    const b = state().addPlan()!
    expect(state().plans.find((p) => p.id === b)?.name).toBe('Plan B')
    state().renamePlan(b, 'Beach')
    expect(state().plans.find((p) => p.id === b)?.name).toBe('Beach')
    state().deletePlan(b)
    expect(state().activePlanId).toBe(a)
    expect(state().plans).toHaveLength(1)
    state().deletePlan(a)
    expect(state().plans).toHaveLength(1)
  })

  it('keeps every plan when a trip is saved and opened again', () => {
    state().addPlan({ name: 'Other' })
    state().removeStop(0)
    const s = state()
    const saved = JSON.parse(JSON.stringify({ input: s.input, stops: s.stops, plans: tripPlans(s), activePlanId: s.activePlanId }))
    state().openTrip(null)
    state().openTrip(saved)
    expect(state().plans.map((p) => p.name)).toEqual(['Plan A', 'Other'])
    expect(state().plans.find((p) => p.id === state().activePlanId)?.name).toBe('Other')
    expect(state().stops).toEqual(saved.stops)
  })

  it(`allows up to ${MAX_PLANS} plans`, () => {
    for (let i = 1; i < MAX_PLANS; i++) expect(state().addPlan({ activate: false })).not.toBeNull()
    expect(state().addPlan()).toBeNull()
  })

  it('gives each plan a short mark for the folded panel', () => {
    expect(['Plan A', 'Plan B', 'Slow version', ' Beach  '].map(planMark)).toEqual(['A', 'B', 'Sl', 'Be'])
  })
})

describe('flexible dates', () => {
  // A flexible plan is two plans: about 4 s on CI.
  it('keeps the dates asked for, and uses the dates the plan picked', () => {
    state().openTrip({ input: { ...testCaseInput(ds, 'US'), flex: { start: '2027-05-01', end: '2027-09-30', startDays: 5, endDays: 5 } }, stops: [] })
    state().generate()
    const { input, plan } = state()
    expect(input.flex!.start).toBe('2027-05-01')
    expect({ start: input.startDate, end: input.endDate }).toEqual(plan!.dates)
  }, 20_000)
})

describe('adding places', () => {
  const groups = () => state().input.groups
  const modeOf = (iso2: string) => groups().flatMap((g) => g.countries).find((c) => c.iso2 === iso2)?.mode

  it('adds and removes a whole region', () => {
    state().openTrip(null)
    state().toggleRegion('Caucasus')
    expect(groups().map((g) => g.name)).toEqual(['Caucasus'])
    expect(groups()[0].countries.map((c) => c.mode)).toEqual(['optional', 'optional', 'optional'])
    state().toggleRegion('Caucasus')
    expect(groups()).toEqual([])
  })

  it('adds a country on its own, and excludes or includes one in a region', () => {
    state().openTrip(null)
    state().toggleCountry('JP')
    expect(groups().map((g) => g.name)).toEqual(['Japan'])
    expect(modeOf('JP')).toBe('must')
    // A region added later leaves Japan where it is.
    state().toggleRegion('East Asia')
    expect(groups()[1].countries.some((c) => c.iso2 === 'JP')).toBe(false)
    state().toggleCountry('KR')
    expect(modeOf('KR')).toBe('excluded')
    state().toggleCountry('KR')
    expect(modeOf('KR')).toBe('must')
    state().toggleCountry('JP')
    expect(groups().map((g) => g.name)).toEqual(['East Asia'])
  })

  it('adds a country as optional when asked', () => {
    state().openTrip(null)
    state().setAddAs('optional')
    state().toggleCountry('JP')
    expect(modeOf('JP')).toBe('optional')
    state().setAddAs('must')
  })

  it('starts a new trip with the regions in no particular order', () => {
    state().openTrip(null)
    expect(state().input.keepGroupOrder).toBe(false)
  })
})
