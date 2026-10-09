import { describe, expect, it } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { makeGroup } from '../data/presets'
import { testCaseInput } from '../data/testCase'
import { allocate } from './allocate'
import { addDays, daysBetween } from './dates'
import { GROCERY_KEYS, airBand, cardLevel, comparePrices, costProfile, costSanity, costsInEur, dailyCost, dayChoices, dayRangeText, dayCost, englishLevel, groceryDay, groceryMeal, prefsDay, evaluatePlan, generatePlan, withDates, likelyMonth, rebalance, stayMonth, suggestedDays, tapWater, taxiEstimate, vaccinesFor, mobileInternet, nearby, roughCount, roughKm, matchesStyle, homeLeg, stylePrefs, withPrefs, PHRASES, phrasesFor, type LocalCostProfile, type TripInput } from './index'
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

  it('keeps Poland to the 14–21 days asked for', () => {
    const pl = plan.stops.filter((s) => iso(s.cityId) === 'PL').reduce((t, s) => t + s.nights, 0)
    expect(pl).toBeGreaterThanOrEqual(14)
    expect(pl).toBeLessThanOrEqual(21)
    expect(plan.warnings.some((w) => w.iso2 === 'PL' && w.kind === 'time')).toBe(false)
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

describe('country defaults', () => {
  it('starts region countries as optional, a single country as must-visit, and do-not-travel countries as excluded', () => {
    const region = makeGroup(ds, 'Central & Eastern Europe', ['HU', 'AT', 'UA'])
    expect(region.countries.map((c) => c.mode)).toEqual(['optional', 'optional', 'excluded'])
    expect(makeGroup(ds, 'Poland', ['PL']).countries[0].mode).toBe('must')
  })

  it('still visits a region whose countries are all optional, even on a short trip', () => {
    const plan = generatePlan(ds, testTrip('US', {
      startDate: '2027-06-01',
      endDate: '2027-06-10',
      groups: [makeGroup(ds, 'Poland', ['PL']), makeGroup(ds, 'Baltic States', ['LT', 'LV', 'EE'])],
    }))
    const visited = plan.stops.map((s) => iso(s.cityId))
    expect(visited).toContain('PL')
    expect(visited.some((c) => ['LT', 'LV', 'EE'].includes(c))).toBe(true)
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

describe('phrases', () => {
  it('has every phrase, with how to say it, in every language of every city', () => {
    for (const id of Object.keys(ds.cities)) {
      const p = phrasesFor(ds, id)
      expect(p, id).not.toBeNull()
      if (!p!.languages.length) expect(p!.note, id).toBeTruthy()
      for (const l of p!.languages) for (const { key } of PHRASES) expect(l.phrases[key].text && l.phrases[key].say, `${id} ${l.tag} ${key}`).toBeTruthy()
    }
  })
  it("lists the country's languages, main one first, and none where English is the common one", () => {
    expect(phrasesFor(ds, 'tokyo')!.languages[0].phrases.thanks.text).toBe('ありがとうございます')
    expect(phrasesFor(ds, 'minsk')!.languages.map((l) => l.tag)).toEqual(['ru', 'be'])
    expect(phrasesFor(ds, 'singapore')!.languages).toEqual([])
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

describe('vaccines and medicines', () => {
  it("uses CDC's advice, recommended first, and leaves out what CDC doesn't recommend", () => {
    const th = vaccinesFor(ds, 'TH')
    expect(th.source).toBe('cdc')
    expect(th.items.map((v) => v.name)).toContain('Malaria')
    expect(th.items.findIndex((v) => v.advice === 'consider')).toBeGreaterThan(th.items.findLastIndex((v) => v.advice === 'recommended'))
    expect(vaccinesFor(ds, 'AT').items.map((v) => v.name)).not.toContain('Yellow Fever')
  })

  it('falls back to our own list without CDC data', () => {
    const v = vaccinesFor({ ...ds, cdc: {} }, 'TH')
    expect(v.source).toBe('ours')
    expect(v.items.some((x) => x.name.startsWith('Malaria'))).toBe(true)
  })

  it('reminds about malaria medicine for a stop in Thailand', () => {
    const input = { ...testTrip('US'), startDate: '2027-01-10', endDate: '2027-01-15' }
    const plan = evaluatePlan(ds, input, [{ cityId: 'bangkok', nights: 5, locked: false, groupId: '' }])
    expect(plan.warnings.some((w) => w.kind === 'health' && w.title.includes('malaria'))).toBe(true)
  })
})

describe('mobile internet', () => {
  it('puts each city with data in a speed band, and has none where there are no measurements', () => {
    const z = mobileInternet(ds, 'zagreb')!
    expect(z.downMbps).toBeGreaterThan(0)
    expect(z.short).toBe(z.downMbps >= 200 ? 'Very fast' : z.downMbps >= 100 ? 'Fast' : z.downMbps >= 50 ? 'Good' : z.downMbps >= 25 ? 'OK' : 'Slow')
    expect(mobileInternet(ds, 'moscow')).toBeNull()
    expect(Object.keys(ds.mobile).length).toBeGreaterThan(100)
  })
})

describe('places near the centre', () => {
  it('shows counts as a rough scale', () => {
    expect([0, 3, 7, 12, 30, 250].map(roughCount)).toEqual(['None found', '1–4', '5+', '5+', '20+', '50+'])
    expect([null, 0.4, 2.6].map(roughKm)).toEqual(['>40 km', '<1 km', '~3 km'])
  })

  it('takes the higher count of the two sources', () => {
    const osm = { supermarket: 1, convenience: 0, pharmacy: 2, clinic: 0, atm: 30, nearestHospitalKm: 1.2 }
    const listed = { supermarket: 9, convenience: 4, pharmacy: 1, clinic: 3, atm: 2 }
    const n = nearby({ ...ds, amenities: { radiusKm: 1.5, byCity: { x: osm } }, businesses: { x: listed } }, 'x')
    expect(n).toEqual({ supermarket: 9, convenience: 4, pharmacy: 2, clinic: 3, atm: 30, nearestHospitalKm: 1.2 })
    // Without OpenStreetMap, the listings only tell whether there's a hospital within the radius.
    const listedOnly = { ...ds, amenities: { radiusKm: 1.5, byCity: {} }, businesses: { x: { ...listed, hospital: 2 }, y: listed } }
    expect(nearby(listedOnly, 'x')).toMatchObject({ hospitalWithin: 1.5 })
    expect(nearby(listedOnly, 'y')).not.toHaveProperty('nearestHospitalKm')
    expect(nearby({ ...ds, amenities: { radiusKm: 1.5, byCity: {} }, businesses: {} }, 'x')).toBeNull()
  })
})

describe('travel preferences', () => {
  it("fills in a travel style's preferences and keeps the traveller's own", () => {
    const p = stylePrefs('comfort', { ...stylePrefs('backpacker'), homeCityId: 'krakow', dailyBudget: 80 })
    expect(p).toMatchObject({ room: 'private', dinner: 'restaurant', homeCityId: 'krakow', dailyBudget: 80 })
    expect(matchesStyle(p, 'comfort')).toBe(true)
    expect(matchesStyle({ ...p, dinner: 'diy' }, 'comfort')).toBe(false)
  })

  it('turns a saved breakfast "with the room" into a local one', () => {
    const input = testTrip('US')
    const saved = { ...input, prefs: { ...input.prefs, breakfast: 'included' as never } }
    expect(withPrefs(saved).prefs.breakfast).toBe('local')
    expect(withPrefs({ ...input, prefs: { ...input.prefs, dinner: 'cook' as never } }).prefs.dinner).toBe('diy')
  })

  it("gives trips saved before preferences existed those of their travel style", () => {
    const { prefs: _, ...old } = { ...testTrip('US'), budget: 'midrange' as const }
    expect(withPrefs(old).prefs).toMatchObject({ room: 'private', dinner: 'restaurant' })
  })

  it('leaves out a number of travellers saved before the option was removed', () => {
    const input = testTrip('US')
    expect(withPrefs({ ...input, prefs: { ...input.prefs, travellers: 2 } as never }).prefs).not.toHaveProperty('travellers')
  })

  it('costs the budget private style between backpacker and mid-range', () => {
    const [b, p, m] = (['backpacker', 'private', 'midrange'] as const).map((x) => dailyCost(ds, 'krakow', { prefs: stylePrefs(x) }))
    expect(p).toBeGreaterThan(b)
    expect(p).toBeLessThan(m)
  })
})

describe('daily cost from your choices', () => {
  const prefs = stylePrefs('backpacker')
  const c = ds.costs.PL
  const f = ds.cities.krakow.costFactor

  it('adds up the bed, each meal, drinks and getting around', () => {
    const day = dayCost(ds, 'krakow', prefsDay(prefs))!
    expect(day.items.map((i) => i.key)).toEqual(['bed', 'breakfast', 'lunch', 'dinner', 'coffee', 'beer', 'transport', 'taxi'])
    expect(day.total).toBeCloseTo(day.items.reduce((t, i) => t + i.eur, 0))
    expect(day.items[0].eur).toBeCloseTo(c.dormBed * f)
    expect(day.items[1].eur).toBeCloseTo(groceryMeal(c, 'breakfast'))
    // DIY meals and 1.5 L of water make up the day of groceries: a smaller breakfast, and lunch the same as dinner.
    const [b, l, d] = (['breakfast', 'lunch', 'dinner'] as const).map((m) => groceryMeal(c, m))
    expect(b + l + d + c.groceries.water15).toBeCloseTo(groceryDay(c))
    expect(b).toBeLessThan(l)
    expect(l).toBe(d)
    expect(day.items[2].eur).toBeCloseTo(c.mealLocal * f)
    expect(day.items[4].eur).toBeCloseTo(c.coffee * f)
    expect(day.items[5].eur).toBeCloseTo(c.beerBar * f)
  })

  it('counts nothing for a skipped meal', () => {
    const day = (d: Partial<ReturnType<typeof prefsDay>>) => dayCost(ds, 'krakow', { ...prefsDay(prefs), ...d })!
    expect(day({ breakfast: 'skip' }).items[1].eur).toBe(0)
    expect(day({ bed: 'private' }).items[0].eur).toBeCloseTo(c.privateRoom * f)
    expect(day({}).items[6].eur).toBeCloseTo(c.localTransportDay)
    expect(day({}).items[7].eur).toBe(0)
    const ride = taxiEstimate(ds, 'krakow')!
    expect(day({ taxis: 2 }).items[7].eur).toBeCloseTo(ride.min + ride.max)
  })

  it("uses the trip's changes for one city and the preferences elsewhere", () => {
    const input = { prefs, cityCosts: { krakow: { dinner: 'restaurant' as const } } }
    expect(dayChoices(input, 'krakow').dinner).toBe('restaurant')
    expect(dayChoices(input, 'warsaw').dinner).toBe(prefs.dinner)
    expect(dailyCost(ds, 'krakow', input)).toBeCloseTo(dailyCost(ds, 'krakow', { prefs }) + (c.mealDinner - c.mealLocal) * f)
  })

  it("counts a city's changes in the trip total", () => {
    const input = testTrip('US')
    const plan = generatePlan(ds, input)
    const city = plan.stops[0].cityId
    const changed = generatePlan(ds, { ...input, cityCosts: { [city]: { bed: 'private', dinner: 'restaurant' } } })
    expect(changed.stops.map((s) => s.cityId)).toContain(city)
    expect(changed.cost.max).toBeGreaterThan(plan.cost.max)
  })
})

describe('trip goals', () => {
  const plan = (prefs: Partial<TripInput['prefs']>) => {
    const input = testTrip('US')
    return generatePlan(ds, { ...input, prefs: { ...input.prefs, ...prefs } })
  }
  const balanced = plan({})
  const countries = (p: ReturnType<typeof plan>) => new Set(p.stops.map((s) => iso(s.cityId))).size
  const daily = (id: string) => dailyCost(ds, id, { prefs: stylePrefs('backpacker') })
  const median = [...balanced.stops.map((s) => daily(s.cityId))].sort((a, b) => a - b)[balanced.stops.length >> 1]
  const pricey = (p: ReturnType<typeof plan>) => p.stops.filter((s) => daily(s.cityId) > 1.3 * median)

  it('"more countries" visits at least as many countries, in more places', () => {
    const p = plan({ focus: 'countries' })
    expect(countries(p)).toBeGreaterThanOrEqual(countries(balanced))
    expect(p.stops.length).toBeGreaterThan(balanced.stops.length)
  })

  it('"top highlights" leaves out lesser-known places', () => {
    expect(plan({ focus: 'highlights' }).stops.filter((s) => ds.cities[s.cityId].popularity <= 3)).toHaveLength(0)
  })

  it('skips expensive places, or stays there for less time', () => {
    expect(pricey(plan({ expensive: 'skip' })).length).toBeLessThan(pricey(balanced).length)
    const nights = (p: ReturnType<typeof plan>) => pricey(p).reduce((n, s) => n + s.nights, 0)
    expect(nights(plan({ expensive: 'shorter' }))).toBeLessThan(nights(balanced))
  })

  it("warns about cold below the traveller's own limit", () => {
    const input = { ...testTrip('US'), startDate: '2027-04-01', endDate: '2027-04-05' }
    const stay = [{ cityId: 'krakow', nights: 4, locked: false, groupId: '' }]
    const cold = (minHighC: 10 | 15 | null) => evaluatePlan(ds, { ...input, prefs: { ...input.prefs, minHighC } }, stay).warnings.some((w) => w.title.includes('cold'))
    expect(cold(null)).toBe(false)
    expect(cold(15)).toBe(true)
  })

  it('warns about nights outside the comfortable range', () => {
    const input = { ...testTrip('US'), startDate: '2027-07-10', endDate: '2027-07-14' }
    const stay = [{ cityId: 'athens', nights: 4, locked: false, groupId: '' }]
    const nights = (maxLowC: number | null) => evaluatePlan(ds, { ...input, prefs: { ...input.prefs, maxHeatC: 40, maxLowC } }, stay).warnings.some((w) => w.title.includes('warm nights'))
    expect(nights(null)).toBe(false)
    expect(nights(18)).toBe(true)
  })
})

describe('number of stops', () => {
  const plan = (minStops: number | null, maxStops: number | null) => generatePlan(ds, { ...testTrip('US'), minStops, maxStops })

  it('keeps to the maximum, giving the nights to fewer places', () => {
    const p = plan(null, 20)
    expect(p.stops.length).toBeLessThanOrEqual(20)
    expect(p.assignedNights).toBe(p.totalNights)
    expect(p.warnings.some((w) => w.title.includes('outside your range'))).toBe(false)
  })

  it('adds places to reach the minimum, with shorter stays', () => {
    const p = plan(55, null)
    expect(p.stops.length).toBeGreaterThanOrEqual(55)
    expect(p.assignedNights).toBe(p.totalNights)
  })

  it('says so when the plan ends up outside the range', () => {
    const input = { ...testTrip('US'), maxStops: 1 }
    const p = evaluatePlan(ds, input, [{ cityId: 'krakow', nights: 3, locked: false, groupId: '' }, { cityId: 'warsaw', nights: 3, locked: false, groupId: '' }])
    expect(p.warnings.some((w) => w.title === '2 stops, outside your range (at most 1)')).toBe(true)
  })
})

describe('home city', () => {
  const stops = [{ cityId: 'athens', nights: 4, locked: false, groupId: '' }, { cityId: 'sofia', nights: 3, locked: false, groupId: '' }]
  const withHome = (homeCityId: string | null, returnHome = true) => {
    const input = testTrip('TW')
    return evaluatePlan(ds, { ...input, prefs: { ...input.prefs, homeCityId, returnHome } }, stops)
  }

  it('adds the flight from home and back, with its cost, without making home a stop', () => {
    const none = withHome(null)
    const p = withHome('taipei')
    expect(p.stops.map((s) => s.cityId)).toEqual(['athens', 'sofia'])
    expect(p.home.out).toMatchObject({ from: 'taipei', to: 'athens', estimated: true })
    expect(p.home.back).toMatchObject({ from: 'sofia', to: 'taipei' })
    expect(p.home.out!.durationMin / 60).toBeGreaterThan(12)
    expect(p.cost.min).toBe(none.cost.min + p.home.out!.priceMin + p.home.back!.priceMin)
    expect(withHome('taipei', false).home.back).toBeNull()
    expect(none.home).toEqual({ out: null, back: null })
  })

  it("uses the app's own routes when home is near", () => {
    expect(homeLeg(ds, 'taipei', 'tokyo').estimated).toBe(false)
    expect(homeLeg(ds, 'taipei', 'athens').hops[0].note).toMatch(/one change/)
  })
})

describe('month for the weather map', () => {
  const input = testTrip('US')
  const plan = generatePlan(ds, input)
  const nearest = (cityId: string) => {
    const c = ds.cities[cityId]
    const d = (id: string) => (ds.cities[id].lat - c.lat) ** 2 + ((ds.cities[id].lon - c.lon) * Math.cos((c.lat * Math.PI) / 180)) ** 2
    return plan.stops.reduce((a, b) => (d(b.cityId) < d(a.cityId) ? b : a))
  }

  it('uses the month of the middle night of a stop', () => {
    expect(stayMonth({ arrive: '2027-06-28', nights: 6 })).toBe(7)
    expect(stayMonth({ arrive: '2027-06-20', nights: 6 })).toBe(6)
    for (const s of plan.stops) expect(likelyMonth(ds, plan, input, s.cityId)).toBe(stayMonth(s))
  })

  it('gives a city off the route the month of the nearest stop, or the start month without a plan', () => {
    const off = Object.keys(ds.cities).find((id) => !plan.stops.some((s) => s.cityId === id))!
    expect(likelyMonth(ds, plan, input, off)).toBe(stayMonth(nearest(off)))
    expect(likelyMonth(ds, null, input, off)).toBe(Number(input.startDate.slice(5, 7)))
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

describe('price levels and estimated costs', () => {
  it('has a price level for every country we cover', () => {
    for (const iso2 of Object.keys(ds.countries)) expect(ds.priceLevels.levels[iso2]?.level, iso2).toBeGreaterThan(0)
  })

  it('describes price differences in plain language', () => {
    expect(comparePrices(0.51, 0.8, 'Germany')).toBe('about 35% cheaper than Germany')
    expect(comparePrices(1.12, 0.8, 'Germany')).toBe('about 40% more expensive than Germany')
    expect(comparePrices(0.81, 0.8, 'Germany')).toBe('about the same as Germany')
  })

  it('estimates costs from the price level for a country without hand-entered prices', () => {
    const { PL: _removed, ...costs } = ds.costs
    const noPoland = { ...ds, costs }
    const info = costProfile(noPoland, 'PL')
    expect(info?.estimated).toBe(true)
    expect(dailyCost(noPoland, 'krakow', { prefs: stylePrefs('backpacker') })).toBeGreaterThan(0)
    // The estimate should land near our hand-entered Polish prices.
    expect(info!.profile.dormBed).toBeGreaterThan(ds.costs.PL.dormBed * 0.7)
    expect(info!.profile.dormBed).toBeLessThan(ds.costs.PL.dormBed * 1.3)
  })

  it('converts costs from local money at the current exchange rate', () => {
    const groceries = Object.fromEntries(GROCERY_KEYS.map((k) => [k, 100])) as LocalCostProfile['groceries']
    const local: LocalCostProfile = { currency: 'JPY', dormBed: 4000, privateRoom: 10000, mealLocal: 1000, mealDinner: 3000, localTransportDay: 800, coffee: 500, beerBar: 700, groceries }
    const eur = costsInEur({ JP: local }, { JPY: 200 }).JP
    expect(eur.dormBed).toBe(20)
    expect(eur.groceries.coke05).toBe(0.5)
    expect(() => costsInEur({ JP: local }, {})).toThrow('No exchange rate for JPY')
    // Every country's prices are in a currency we have a rate for.
    for (const c of Object.values(ds.costs)) expect(c.groceries.water15).toBeGreaterThan(0)
  })

  it('compares hand-entered costs with the price level', () => {
    const ratio = costSanity(ds, 'PL')!
    expect(ratio).toBeGreaterThan(0.8)
    expect(ratio).toBeLessThan(1.25)
  })
})

describe('days in a country', () => {
  const nightsIn = (plan: ReturnType<typeof generatePlan>, iso2: string) => plan.stops.filter((s) => iso(s.cityId) === iso2).reduce((t, s) => t + s.nights, 0)
  const withDays = (iso2: string, minDays: number | null, maxDays: number | null) => {
    const input = testTrip('US')
    return { ...input, groups: input.groups.map((g) => ({ ...g, countries: g.countries.map((c) => (c.iso2 === iso2 ? { ...c, mode: 'must' as const, minDays, maxDays } : c)) })) }
  }

  it('keeps a country to its most', () => {
    const plan = generatePlan(ds, withDays('HR', null, 3))
    expect(nightsIn(plan, 'HR')).toBeGreaterThan(0)
    expect(nightsIn(plan, 'HR')).toBeLessThanOrEqual(3)
  })

  it('gives a country at least its fewest, with more cities there', () => {
    const plain = generatePlan(ds, testTrip('US'))
    const plan = generatePlan(ds, withDays('RO', 18, null))
    expect(nightsIn(plan, 'RO')).toBeGreaterThanOrEqual(18)
    expect(plan.stops.filter((s) => iso(s.cityId) === 'RO').length).toBeGreaterThan(plain.stops.filter((s) => iso(s.cityId) === 'RO').length)
    expect(plan.assignedNights).toBe(plan.totalNights)
  })

  it('warns when the trip has no room for the days asked for', () => {
    const plan = generatePlan(ds, { ...withDays('RO', 40, null), endDate: '2027-05-30' })
    // A 29-night trip.
    expect(nightsIn(plan, 'RO')).toBeLessThan(40)
    expect(plan.warnings.some((w) => w.kind === 'time' && w.iso2 === 'RO')).toBe(true)
  })

  it('says the range in words', () => {
    expect(dayRangeText({ min: 5, max: 7 })).toBe('5–7 days')
    expect(dayRangeText({ min: 5, max: 5 })).toBe('5 days')
    expect(dayRangeText({ min: 5 })).toBe('at least 5 days')
    expect(dayRangeText({ max: 7 })).toBe('at most 7 days')
    expect(dayRangeText({ min: 5, max: Infinity })).toBe('at least 5 days')
  })
})

describe('suggested days per pace', () => {
  it('gives more days for a chill pace and fewer for fast, within the city limits', () => {
    for (const id of Object.keys(ds.cities)) {
      const s = suggestedDays(ds, id)
      expect(s.chill, id).toBeGreaterThanOrEqual(s.balanced)
      expect(s.balanced, id).toBeGreaterThanOrEqual(s.fast)
      expect(s.fast, id).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('Asia trip (Taiwan → Japan → Southeast Asia)', () => {
  const asia: TripInput = {
    ...testTrip('US'),
    startDate: '2027-10-01',
    endDate: '2027-12-15',
    groups: [
      { id: 'ea', name: 'East Asia', countries: [{ iso2: 'TW', mode: 'must' }, { iso2: 'JP', mode: 'must' }] },
      { id: 'sea', name: 'Southeast Asia', countries: ['TH', 'VN', 'MY', 'SG', 'KH'].map((iso2) => ({ iso2, mode: 'must' as const })) },
    ],
  }
  const plan = generatePlan(ds, asia)

  it('fills the dates and keeps the region order', () => {
    expect(plan.assignedNights).toBe(plan.totalNights)
    const groups = plan.stops.map((s) => s.groupId)
    expect(groups.lastIndexOf('ea')).toBeLessThan(groups.indexOf('sea'))
  })

  it('visits every must-visit country and can reach every stop', () => {
    const visited = new Set(plan.stops.map((s) => iso(s.cityId)))
    for (const c of ['TW', 'JP', 'TH', 'VN', 'MY', 'SG', 'KH']) expect(visited.has(c), c).toBe(true)
    expect(plan.warnings.filter((w) => w.kind === 'unreachable')).toEqual([])
  })

  it('flags the e-visa for Vietnam and no Schengen limit', () => {
    expect(plan.warnings.some((w) => w.kind === 'visa' && w.iso2 === 'VN')).toBe(true)
    expect(plan.schengen.days).toBe(0)
  })
})

describe('flexible dates', () => {
  const flex = { start: '2027-05-01', end: '2027-09-30', startDays: 7, endDays: 7 }
  // How far the stays are from what each city suggests, per night.
  const misfit = (input: TripInput) => {
    const plan = generatePlan(ds, input)
    return plan.stops.reduce((t, s) => t + Math.abs(s.nights - suggestedDays(ds, s.cityId)[input.pace]), 0) / plan.totalNights
  }

  it('picks dates within the flexible range, and fills them', () => {
    const plan = generatePlan(ds, testTrip('TW', { flex }))
    expect(daysBetween(addDays(flex.start, -7), plan.dates.start)).toBeGreaterThanOrEqual(0)
    expect(daysBetween(plan.dates.start, addDays(flex.start, 7))).toBeGreaterThanOrEqual(0)
    expect(daysBetween(addDays(flex.end, -7), plan.dates.end)).toBeGreaterThanOrEqual(0)
    expect(daysBetween(plan.dates.end, addDays(flex.end, 7))).toBeGreaterThanOrEqual(0)
    expect(plan.assignedNights).toBe(plan.totalNights)
    expect(plan.stops[0].arrive).toBe(plan.dates.start)
  })

  it('fits the stops at least as well as the exact dates', () => {
    for (const passport of ['TW', 'US']) {
      expect(misfit(testTrip(passport, { flex }))).toBeLessThanOrEqual(misfit(testTrip(passport)) + 1e-9)
    }
  })

  it('plans for the dates asked for when no days are allowed either way', () => {
    const plan = generatePlan(ds, testTrip('TW', { startDate: '2027-05-03', flex: { ...flex, startDays: 0, endDays: 0 } }))
    expect(plan.dates).toEqual({ start: '2027-05-03', end: '2027-09-30' })
  })

  it('moves the dates asked for along with new dates', () => {
    const input = testTrip('TW', { flex })
    expect(withDates(input, '2027-06-01', '2027-10-01')).toEqual({ startDate: '2027-06-01', endDate: '2027-10-01', flex: { ...flex, start: '2027-06-01', end: '2027-10-01' } })
    expect(withDates(testTrip('TW'), '2027-06-01', '2027-10-01').flex).toBeUndefined()
  })
})

describe('a country added on its own as optional', () => {
  it('may be left out, unlike one that is a must visit', () => {
    const japan = (mode: 'must' | 'optional') => {
      const g = makeGroup(ds, 'Japan', ['JP'])
      g.countries[0].mode = mode
      return g
    }
    // A short trip already full with must-visit countries.
    const balkans = makeGroup(ds, 'Balkans', ['AL', 'ME', 'HR', 'GR', 'MK', 'RS'])
    balkans.countries.forEach((c) => (c.mode = 'must'))
    const trip = (mode: 'must' | 'optional') => testTrip('TW', { endDate: '2027-05-08', keepGroupOrder: false, groups: [balkans, japan(mode)] })
    expect(generatePlan(ds, trip('must')).stops.some((s) => iso(s.cityId) === 'JP')).toBe(true)
    expect(generatePlan(ds, trip('optional')).stops.some((s) => iso(s.cityId) === 'JP')).toBe(false)
  })
})

describe('countries without cities', () => {
  it('plans the rest of the trip and says which countries were left out', () => {
    const input = testTrip('TW', { groups: [makeGroup(ds, 'Balkans', ['AL', 'ME', 'HR']), makeGroup(ds, 'Brazil', ['BR'])] })
    const plan = generatePlan(ds, input)
    expect(plan.stops.length).toBeGreaterThan(0)
    expect(plan.stops.every((s) => ['AL', 'ME', 'HR'].includes(iso(s.cityId)))).toBe(true)
    expect(plan.warnings.find((w) => w.kind === 'coverage')?.title).toBe('No cities yet in Brazil')
  })
})

