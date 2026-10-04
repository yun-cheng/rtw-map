import { describe, expect, it } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { testCaseInput } from '../data/testCase'
import { allocate } from './allocate'
import { daysBetween } from './dates'
import { airBand, cardLevel, englishLevel, evaluatePlan, generatePlan, rebalance, tapWater, taxiEstimate, type TripInput } from './index'
import { schengenSummary } from './schengen'

/** The end-to-end test case from PLAN.md §3.3. */
const testTrip = (passport: string, overrides: Partial<TripInput> = {}): TripInput => ({ ...testCaseInput(ds, passport), ...overrides })

const iso = (cityId: string) => ds.cities[cityId].iso2

describe('allocate', () => {
  it('assigns exactly the available nights, respecting locks', () => {
    const items = [
      { base: 3, lo: 1, hi: 5, locked: null, spill: 1 },
      { base: 2, lo: 1, hi: 4, locked: 7, spill: 1 },
      { base: 4, lo: 2, hi: 6, locked: null, spill: 1 },
    ]
    const out = allocate(items, 20)
    expect(out.reduce((a, b) => a + b, 0)).toBe(20)
    expect(out[1]).toBe(7)
  })
})

describe('schengen counter', () => {
  it('counts entry and exit days and flags day 91', () => {
    const stops = [
      { cityId: 'krakow', nights: 90, locked: false, groupId: '', arrive: '2027-06-01', depart: '2027-08-30' },
      { cityId: 'stpetersburg', nights: 5, locked: false, groupId: '', arrive: '2027-08-30', depart: '2027-09-04' },
    ]
    const s = schengenSummary(ds, stops, 'US', 0)
    expect(s.days).toBe(91)
    expect(s.firstViolation).toBe('2027-08-30')
  })
  it('does not apply to EU citizens', () => {
    expect(schengenSummary(ds, [], 'EU', 0).applies).toBe(false)
  })
})

describe.each(['TW', 'US', 'EU'])('test case trip, %s passport', (passport) => {
  const input = testTrip(passport)
  const plan = generatePlan(ds, input)
  const total = daysBetween(input.startDate, input.endDate)

  it('fills the whole trip', () => {
    expect(plan.assignedNights).toBe(total)
    expect(plan.stops.at(-1)!.depart).toBe(input.endDate)
  })

  it('visits the regions in the given order', () => {
    const groupOrder = plan.stops.map((s) => input.groups.findIndex((g) => g.id === s.groupId))
    expect([...groupOrder].sort((a, b) => a - b)).toEqual(groupOrder)
  })

  it('stays within Schengen 90/180', () => {
    expect(plan.schengen.maxInWindow).toBeLessThanOrEqual(passport === 'EU' ? Infinity : 90)
  })

  it('gives Poland more time per city than the average', () => {
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const pl = plan.stops.filter((s) => iso(s.cityId) === 'PL').map((s) => s.nights)
    const other = plan.stops.filter((s) => iso(s.cityId) !== 'PL').map((s) => s.nights)
    expect(pl.length).toBeGreaterThan(0)
    expect(avg(pl)).toBeGreaterThan(avg(other))
  })

  it('reaches Russia and warns about the advisory', () => {
    expect(plan.stops.some((s) => iso(s.cityId) === 'RU')).toBe(true)
    expect(plan.warnings.filter((w) => w.kind === 'unreachable')).toEqual([])
    expect(plan.warnings.some((w) => w.kind === 'advisory' && w.iso2 === 'RU')).toBe(true)
  })

  it('leaves out countries excluded by default', () => {
    expect(plan.stops.some((s) => ['UA', 'BY'].includes(iso(s.cityId)))).toBe(false)
  })
})

describe('passport-specific rules', () => {
  it('drops countries that do not admit the passport, with a warning', () => {
    const plan = generatePlan(ds, testTrip('TW'))
    const md = ds.visa.rules.TW.MD
    if (md.req === 'no_admission') {
      expect(plan.stops.some((s) => iso(s.cityId) === 'MD')).toBe(false)
      expect(plan.warnings.some((w) => w.iso2 === 'MD' && w.title.includes('left out'))).toBe(true)
    }
  })
})

describe('edits', () => {
  it('rebalance keeps locked nights and fills the trip', () => {
    const input = testTrip('US')
    const plan = generatePlan(ds, input)
    const stops = plan.stops.map((s, i) => (i === 2 ? { ...s, nights: 9, locked: true } : s))
    const next = rebalance(ds, input, stops)
    expect(next.stops[2].nights).toBe(9)
    expect(next.assignedNights).toBe(next.totalNights)
  })

  it('evaluate reports unassigned nights after a manual change', () => {
    const input = testTrip('US')
    const plan = generatePlan(ds, input)
    const stops = plan.stops.map((s, i) => (i === 0 ? { ...s, nights: s.nights + 3 } : s))
    expect(evaluatePlan(ds, input, stops).warnings.some((w) => w.kind === 'time')).toBe(true)
  })
})

describe('english level', () => {
  it('is easier in big cities and harder in small towns than the country estimate', () => {
    const ru = ds.countries.RU.english.level
    expect(englishLevel(ds, 'moscow').level).toBe(Math.min(5, ru + 1))
    const sigulda = englishLevel(ds, 'sigulda')
    expect(sigulda.level).toBe(Math.max(1, ds.countries.LV.english.level - 1))
    expect(sigulda.reason).toMatch(/small town/)
  })

  it('adds a language note for stops where English is limited', () => {
    const input = testTrip('US')
    const stop = (cityId: string) => ({ cityId, nights: 3, locked: false, groupId: '' })
    expect(englishLevel(ds, 'pskov').level).toBeLessThanOrEqual(2)
    const ru = evaluatePlan(ds, input, [stop('stpetersburg'), stop('pskov')])
    expect(ru.warnings.find((w) => w.kind === 'language')?.title).toMatch(/Pskov/)
    const ee = evaluatePlan(ds, input, [stop('tallinn'), stop('tartu')])
    expect(ee.warnings.some((w) => w.kind === 'language')).toBe(false)
  })
})

describe('local transport', () => {
  it('has transport info for every city and taxi info for every country', () => {
    for (const id of Object.keys(ds.cities)) expect(ds.localTransport.cities[id], id).toBeDefined()
    for (const iso2 of Object.keys(ds.countries)) expect(ds.localTransport.countries[iso2], iso2).toBeDefined()
  })

  it('lists rentals for every city, with prices for car and scooter rentals', () => {
    for (const [id, c] of Object.entries(ds.localTransport.cities)) {
      expect(Array.isArray(c.rentals), id).toBe(true)
      const country = ds.localTransport.countries[ds.cities[id].iso2].rentals
      if (c.rentals.includes('car')) expect(country.carDay[0], id).toBeLessThan(country.carDay[1])
      if (c.rentals.includes('moto')) expect(country.motoDay, id).toBeDefined()
    }
  })

  it('estimates a 5 km taxi ride from start fare and per-km price', () => {
    const taxi = ds.localTransport.countries.PL.taxi
    const est = taxiEstimate(ds, 'krakow')!
    expect(est.min).toBeCloseTo(taxi.flagFall + 5 * taxi.perKm)
    expect(est.max).toBeGreaterThan(est.min)
  })
})

describe('weather checks', () => {
  it('warns about heat for a midsummer stay in Athens', () => {
    const input = { ...testTrip('US'), startDate: '2027-07-10', endDate: '2027-07-20' }
    const plan = evaluatePlan(ds, input, [{ cityId: 'athens', nights: 10, locked: false, groupId: '' }])
    expect(plan.warnings.some((w) => w.kind === 'weather' && w.title.includes('hot'))).toBe(true)
  })
})

describe('health checks', () => {
  const stop = (cityId: string, nights = 4) => ({ cityId, nights, locked: false, groupId: '' })

  it('uses city-specific tap water notes over the country default', () => {
    expect(tapWater(ds, 'stpetersburg')?.note).toMatch(/giardia/)
    expect(tapWater(ds, 'tirana')?.level).toBe('bottled')
    expect(tapWater(ds, 'prague')?.level).toBe('safe')
  })

  it('notes countries where you should not drink the tap water', () => {
    const plan = evaluatePlan(ds, testTrip('US'), [stop('tirana'), stop('prague')])
    const health = plan.warnings.filter((w) => w.kind === 'health')
    expect(health.some((w) => w.iso2 === 'AL')).toBe(true)
    expect(health.some((w) => w.iso2 === 'CZ')).toBe(false)
  })

  it('warns about polluted air during the stay', () => {
    const smoggy = { month: 1, pm25: 40, daysOverWho: 25 }
    const data = { ...ds, air: { whoDaily: 15, byCity: { sarajevo: Array.from({ length: 12 }, (_, m) => ({ ...smoggy, month: m + 1 })) } } }
    const input = { ...testTrip('US'), startDate: '2027-01-10', endDate: '2027-01-14' }
    const plan = evaluatePlan(data, input, [stop('sarajevo')])
    expect(plan.warnings.find((w) => w.kind === 'health' && w.cityId === 'sarajevo')?.title).toMatch(/very poor air/)
  })

  it('bands PM2.5 against the WHO daily guideline', () => {
    expect(airBand(8).short).toBe('Good')
    expect(airBand(15).short).toBe('OK')
    expect(airBand(30).short).toBe('Poor')
  })
})

describe('money & payments', () => {
  const stop = (cityId: string, nights = 3) => ({ cityId, nights, locked: false, groupId: '' })

  it('has payment info for every country', () => {
    for (const iso2 of Object.keys(ds.countries)) expect(ds.payments.countries[iso2], iso2).toBeDefined()
  })

  it('rates card use per city: country level, city size, overrides, and countries where foreign cards fail', () => {
    expect(cardLevel(ds, 'moscow').level).toBe(1) // foreign cards don't work, however big the city
    expect(cardLevel(ds, 'theth').level).toBe(1) // city override: cash only
    expect(cardLevel(ds, 'tirana').level).toBe(ds.payments.countries.AL.cardLevel + 1) // capital: easier
    expect(cardLevel(ds, 'prague').level).toBe(5)
  })

  it('warns where foreign cards fail and lists cash-only stops', () => {
    const plan = evaluatePlan(ds, testTrip('US'), [stop('theth'), stop('prague'), stop('stpetersburg')])
    const money = plan.warnings.filter((w) => w.kind === 'money')
    expect(money.some((w) => w.iso2 === 'RU' && w.severity === 'warn')).toBe(true)
    const cash = money.find((w) => w.title.startsWith('Mostly cash'))
    expect(cash?.title).toMatch(/Theth/)
    expect(cash?.title).not.toMatch(/Prague|Saint Petersburg/)
  })
})
