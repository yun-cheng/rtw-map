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
