import { describe, expect, it } from 'vitest'
import type { Dataset, ScheduledStop, VisaRule } from './types'
import { allowedStay, overStay } from './visaStay'

const ds = {
  cities: { hanoi: { iso2: 'VN' }, hue: { iso2: 'VN' }, vientiane: { iso2: 'LA' }, paris: { iso2: 'FR' } },
  countries: { VN: {}, LA: {}, FR: { schengen: true } },
} as unknown as Dataset
const stop = (cityId: string, arrive: string, depart: string) => ({ cityId, arrive, depart, nights: 0, locked: false, groupId: '' }) as ScheduledStop
const stay = (days: number, more: Partial<NonNullable<VisaRule['stay']>> = {}) => ({ days, notes: [], ...more })

describe('the stay a visa rule allows', () => {
  it("is the Passport Index's or Wikipedia's, the shorter where they differ", () => {
    expect(allowedStay({ req: 'visa_free', days: 90 })).toEqual({ days: 90 })
    expect(allowedStay({ req: 'e_visa', stay: stay(30) })).toEqual({ days: 30 })
    expect(allowedStay({ req: 'visa_free', days: 60, stay: stay(30) })).toEqual({ days: 30, differs: [60, 30] })
    // (A few days apart is the same stay: 360 and a year.)
    expect(allowedStay({ req: 'visa_free', days: 360, stay: stay(365) })).toEqual({ days: 360 })
  })

  it('is none without a limit to plan around', () => {
    expect(allowedStay({ req: 'visa_required', stay: stay(30) })).toBeNull()
    expect(allowedStay({ req: 'free_movement' })).toBeNull()
    expect(allowedStay({ req: 'visa_on_arrival' })).toBeNull()
  })
})

describe("the plan's days over it", () => {
  // 20 days in Vietnam, 10 in Laos, 15 more in Vietnam.
  const sched = [
    stop('hanoi', '2027-01-01', '2027-01-10'), stop('hue', '2027-01-10', '2027-01-20'),
    stop('vientiane', '2027-01-20', '2027-01-29'), stop('hanoi', '2027-01-29', '2027-02-12'),
  ]

  it('counts all the days there where the article says nothing of how', () => {
    expect(overStay(ds, sched, 'VN', { req: 'e_visa', stay: stay(30) })).toEqual({ planned: 35, allowed: 30 })
    expect(overStay(ds, sched, 'VN', { req: 'e_visa', stay: stay(45) })).toBeNull()
  })

  it('counts the longest stay where the limit is per entry', () => {
    expect(overStay(ds, sched, 'VN', { req: 'e_visa', stay: stay(30, { perEntry: true }) })).toBeNull()
    expect(overStay(ds, sched, 'VN', { req: 'e_visa', stay: stay(15, { perEntry: true }) })).toEqual({ planned: 20, allowed: 15 })
  })

  it('counts the most days in any period where it counts that way', () => {
    expect(overStay(ds, sched, 'VN', { req: 'visa_free', stay: stay(30, { window: { days: 30, in: 60 } }) })).toEqual({ planned: 35, allowed: 30, window: 60 })
    expect(overStay(ds, sched, 'VN', { req: 'visa_free', stay: stay(30, { window: { days: 30, in: 20 } }) })).toBeNull()
  })

  it('says where the sources differ, and leaves the Schengen area to its own check', () => {
    expect(overStay(ds, sched, 'LA', { req: 'visa_free', days: 15, stay: stay(5) })).toEqual({ planned: 10, allowed: 5, differs: [15, 5] })
    expect(overStay(ds, [stop('paris', '2027-01-01', '2027-06-01')], 'FR', { req: 'visa_free', days: 90 })).toBeNull()
  })
})
