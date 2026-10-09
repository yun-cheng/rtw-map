// Runs the trip assistant's tools on the trip in the browser, using the same store actions as the app's own buttons,
// and describes the trip for the assistant.
import { dataset as ds } from '../data/dataset'
import { INTERESTS, makeGroup } from '../data/presets'
import { REGIONS } from '../data/regions'
import {
  CARD_LABELS, ENGLISH_LABELS, TAP_WATER_LABELS, TRANSIT_LABELS, airBand, cardLevel, costOf, costProfile, dailyCost, dayRangeText, englishLevel,
  groceryDay, likelyMonth, MAX_COUNTRY_DAYS, MAX_FLEX_DAYS, MAX_STOPS, mobileInternet, PHRASES, phrasesFor, STYLES, stylePrefs, nearby, routeBetween, schengenApplies, suggestedDays, tapWater, vaccinesFor, withDates, type Budget, type CountryMode, type TravelPrefs, type TripCountry, type Leg, type Pace, type Stop, type TripInput,
} from '../planner'
import { MAX_PLANS, tripPlans, useTrip, type CityTab, type TripData, type TripPlan } from '../store/trip'
import { rainShare, warningTitle } from '../ui/format'
import { sharedView, type ViewRef } from './view'

type Args = Record<string, unknown>
export type ToolResult = Record<string, unknown>

const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').toLowerCase().replace(/[^a-z0-9]/g, '')
const cityName = (id: string) => ds.cities[id]?.name ?? id
const countryName = (iso2: string) => ds.countries[iso2]?.name ?? ds.world[iso2] ?? iso2

class ToolError extends Error {}

function cityId(ref: unknown): string {
  const k = key(String(ref ?? ''))
  const city = Object.values(ds.cities).find((c) => c.id === k || key(c.name) === k)
  if (city) return city.id
  throw new ToolError(`"${ref}" is not a city in the app. Use find_cities to see which cities exist.`)
}

function countryCode(ref: unknown): string {
  const k = key(String(ref ?? ''))
  const c = Object.values(ds.countries).find((x) => key(x.iso2) === k || key(x.name) === k)
  if (c) return c.iso2
  // Any country in the world can be part of a trip, even with no cities in the app yet.
  const other = Object.entries(ds.world).find(([iso2, name]) => key(iso2) === k || key(name) === k)
  if (other) return other[0]
  throw new ToolError(`"${ref}" is not a country. Use get_options to see the countries.`)
}

function stopIndex(ref: unknown): number {
  const id = cityId(ref)
  const i = useTrip.getState().stops.findIndex((s) => s.cityId === id)
  if (i < 0) throw new ToolError(`${cityName(id)} is not in the itinerary.`)
  return i
}

const monthName = (m: number) => new Date(2000, m - 1).toLocaleString('en', { month: 'short' })
const shortDate = (iso: string) => `${Number(iso.slice(8))} ${monthName(Number(iso.slice(5, 7)))}`

// ---------------------------------------------------------------- describing the trip

function regionsText(input: TripInput): string {
  if (!input.groups.length) return 'none yet'
  return input.groups.map((g, i) =>
    `${i + 1}. ${g.name}: ${g.countries.map((c) => `${countryName(c.iso2)} ${c.mode}${hasDays(c) ? ` (${dayRangeText({ min: c.minDays, max: c.maxDays })})` : ''}`).join(', ')}`).join('\n')
}

/** A compact description of the trip, sent with every message so the assistant knows the current state. */
/** One traveller's daily cost in a city on this trip's choices, and on each travel style's for comparison (EUR). */
function dailyCosts(input: TripInput, id: string) {
  return {
    this_trip: Math.round(dailyCost(ds, id, input)),
    ...Object.fromEntries(BUDGETS.map((b) => [b, Math.round(dailyCost(ds, id, { prefs: stylePrefs(b, input.prefs) }))])),
  }
}

/** The traveller's preferences in a line, for the assistant (amounts in EUR). */
function prefsText(p: TravelPrefs): string {
  return [
    ...(p.homeCityId ? [`home: ${cityName(p.homeCityId)} (starts there${p.returnHome ? ' and returns' : ', one way'}; not a stop)`] : []),
    `${p.travellers === 1 ? 'solo' : p.travellers === 2 ? 'two sharing a room' : '3–4 people'}`,
    `bed: ${p.room === 'dorm' ? 'dorm bed' : 'private room'}${p.maxPerNight ? `, up to €${p.maxPerNight}/night` : ''}`,
    `breakfast: ${p.breakfast}, lunch: ${p.lunch}, dinner: ${p.dinner}; café coffees a day: ${p.coffees}, bar beers a day: ${p.beers}`,
    `between cities: ${p.betweenCities}${p.overnight ? ', overnight travel OK' : ', no overnight travel'}${p.maxTravelHours ? `, at most ${p.maxTravelHours} h a travel day` : ''}`,
    `paid sights: ${p.sights}`,
    `planner focus: ${p.focus === 'countries' ? 'as many countries as fit' : p.focus === 'highlights' ? 'the most popular places' : 'balanced'}`,
    ...(p.expensive !== 'ignore' ? [`expensive places: ${p.expensive === 'shorter' ? 'shorter stays' : 'skip where optional'}`] : []),
    ...(p.minHighC != null || p.maxHeatC != null ? [`comfortable daily highs: ${p.minHighC ?? 'any'} to ${p.maxHeatC ?? 'any'}°C`] : []),
    ...(p.minLowC != null || p.maxLowC != null ? [`comfortable nightly lows: ${p.minLowC ?? 'any'} to ${p.maxLowC ?? 'any'}°C`] : []),
    ...(p.avoidRain ? ['avoid rainy months'] : []),
    ...(p.needInternet ? ['needs fast internet'] : []),
    ...(p.dailyBudget ? [`daily budget €${p.dailyBudget} per person`] : []),
  ].join('; ')
}

/** The number of stops wanted, as the assistant reads it. */
function stopsText(input: TripInput): string {
  const { minStops: min, maxStops: max } = input
  return !min && !max ? 'any' : min === max ? `${max}` : `${min ?? 'any'} to ${max ?? 'any'}`
}

/** Flexible dates, as the assistant reads them. */
function flexText(input: TripInput): string {
  const f = input.flex
  if (!f || (!f.startDays && !f.endDays)) return ''
  return ` (flexible: asked for ${f.start} ±${f.startDays} days to ${f.end} ±${f.endDays} days; generating a plan picks the dates within that)`
}

export function tripContext(): string {
  const { input, plan } = useTrip.getState()
  const passport = ds.visa.passports.find((p) => p.code === input.passport)?.name ?? input.passport
  const lines = [
    `Dates: ${input.startDate} to ${input.endDate}${flexText(input)}. Pace: ${input.pace}. Preferences: ${prefsText(input.prefs)}. Interests: ${input.interests.join(', ') || 'none'}. Passport: ${passport}.`,
    ...(useTrip.getState().plans.length > 1 ? [`Plans in this trip: ${useTrip.getState().plans.map((p) => `${p.name}${p.id === useTrip.getState().activePlanId ? ' (active: the one shown and changed)' : ''}`).join(', ')}.`] : []),
    ...(input.minStops || input.maxStops ? [`Number of stops wanted: ${stopsText(input)} (the planner keeps to this when it makes a plan).`] : []),
    ...(input.wishes?.trim() ? [`The user's wishes for this trip, in their words: "${input.wishes.trim()}"`] : []),
    `Visit regions in order: ${input.keepGroupOrder ? 'yes' : 'no'}.${input.startCityId ? ` Start: ${cityName(input.startCityId)}.` : ''}${input.endCityId ? ` End: ${cityName(input.endCityId)}.` : ''}`,
    `Regions:\n${regionsText(input)}`,
  ]
  const { currency, tempUnit, tempFeels } = useTrip.getState()
  const rate = currency === 'EUR' ? null : ds.fx.rates[currency]
  lines.push(`The user's units: prices in ${currency}${rate ? ` (1 EUR ≈ ${rate.toFixed(rate < 10 ? 3 : 1)} ${currency})` : ''}, temperatures in °${tempUnit}, shown in the app as ${tempFeels ? '"feels like" (heat with humidity, cold with wind; quote those, saying so)' : 'measured'}.`)
  if (!plan) {
    lines.push('Itinerary: not generated yet.')
  } else {
    lines.push(`Itinerary (${plan.stops.length} stops, ${plan.assignedNights} of ${plan.totalNights} nights):`)
    plan.stops.forEach((s, i) => {
      const leg = i > 0 ? plan.legs[i - 1] : null
      const travel = leg ? ` (from previous: ${leg.reachable ? `${(leg.durationMin / 60).toFixed(1)} h ${leg.hops.map((h) => h.mode).join('+')}` : 'no route'})` : ''
      lines.push(`${i + 1}. ${cityName(s.cityId)}, ${countryName(ds.cities[s.cityId].iso2)}: ${shortDate(s.arrive)}–${shortDate(s.depart)}, ${s.nights} nights${s.locked ? ', locked' : ''}${travel}`)
    })
    lines.push(`Cost estimate: €${Math.round(plan.cost.min)}–€${Math.round(plan.cost.max)} (≈€${Math.round(plan.cost.perDay)}/day).`)
    if (plan.schengen.applies) lines.push(`Schengen: ${plan.schengen.maxInWindow} of ${plan.schengen.limit} days used in the worst 180-day window.`)
    const warnings = plan.warnings.filter((w) => w.severity !== 'info')
    if (warnings.length) lines.push(`Problems:\n${warnings.slice(0, 15).map((w) => `- ${warningTitle(w, 'C')}`).join('\n')}`)
  }
  return lines.join('\n')
}

function tripDetails(): ToolResult {
  const { input, plan } = useTrip.getState()
  return {
    settings: {
      start_date: input.startDate, end_date: input.endDate, pace: input.pace, interests: input.interests,
      passport: input.passport, keep_region_order: input.keepGroupOrder, start_city: input.startCityId && cityName(input.startCityId),
      end_city: input.endCityId && cityName(input.endCityId), schengen_days_before: input.schengenDaysBefore,
    },
    regions: input.groups.map((g) => ({ name: g.name, countries: g.countries.map((c) => ({ country: countryName(c.iso2), mode: c.mode, min_days: c.minDays ?? null, max_days: c.maxDays ?? null })) })),
    itinerary: plan && {
      stops: plan.stops.map((s) => ({ city: cityName(s.cityId), id: s.cityId, country: countryName(ds.cities[s.cityId].iso2), arrive: s.arrive, depart: s.depart, nights: s.nights, locked: s.locked })),
      legs: plan.legs.map((l) => ({
        from: cityName(l.from), to: cityName(l.to), reachable: l.reachable, hours: Math.round(l.durationMin / 6) / 10,
        modes: l.hops.map((h) => h.mode), price_eur: [l.priceMin, l.priceMax], overnight: l.overnight, estimated: l.estimated,
      })),
      home: {
        from_home: plan.home.out && { to: cityName(plan.home.out.to), hours: Math.round(plan.home.out.durationMin / 6) / 10, modes: plan.home.out.hops.map((h) => h.mode), price_eur: [plan.home.out.priceMin, plan.home.out.priceMax], estimated: plan.home.out.estimated },
        back_home: plan.home.back && { from: cityName(plan.home.back.from), hours: Math.round(plan.home.back.durationMin / 6) / 10, modes: plan.home.back.hops.map((h) => h.mode), price_eur: [plan.home.back.priceMin, plan.home.back.priceMax], estimated: plan.home.back.estimated },
      },
      nights: { total: plan.totalNights, assigned: plan.assignedNights },
      cost_eur: { min: Math.round(plan.cost.min), max: Math.round(plan.cost.max), per_day: Math.round(plan.cost.perDay), includes: 'stays, travel between stops and from/to home' },
      schengen: plan.schengen,
      warnings: plan.warnings.map((w) => ({ severity: w.severity, title: warningTitle(w, 'C'), detail: w.detail, city: w.cityId && cityName(w.cityId) })),
    },
  }
}

// ---------------------------------------------------------------- reading

function findCities(args: Args): ToolResult {
  const { stops } = useTrip.getState()
  const iso2 = args.country ? countryCode(args.country) : null
  const tag = args.tag ? String(args.tag).toLowerCase() : null
  const q = args.query ? key(String(args.query)) : null
  const cities = Object.values(ds.cities)
    .filter((c) => (!iso2 || c.iso2 === iso2) && (!tag || c.tags.includes(tag)) && (!q || key(c.name).includes(q)))
    .sort((a, b) => b.popularity - a.popularity)
  return {
    count: cities.length,
    cities: cities.slice(0, 60).map((c) => ({
      id: c.id, name: c.name, country: countryName(c.iso2), tags: c.tags, popularity: c.popularity, blurb: c.blurb,
      suggested_days: suggestedDays(ds, c.id), in_itinerary: stops.some((s) => s.cityId === c.id),
    })),
  }
}

/** Lookups that take many items at once; one bad item gives an error in its place instead of failing all. */
const MAX_CITIES = 8
const MAX_PAIRS = 20

function each<T>(items: T[], max: number, what: string, fn: (item: T) => ToolResult): ToolResult[] {
  if (items.length > max) throw new ToolError(`At most ${max} ${what} at once`)
  return items.map((item) => {
    try {
      return fn(item)
    } catch (e) {
      if (e instanceof ToolError) return { error: e.message }
      throw e
    }
  })
}

function cityInfo(args: Args): ToolResult {
  if (Array.isArray(args.cities) && args.cities.length) {
    return { cities: each(args.cities, MAX_CITIES, 'cities', (city) => cityInfo({ ...args, cities: undefined, city })) }
  }
  if (Array.isArray(args.sections) && args.sections.length) return citySections(cityId(args.city), args.sections.map(String))
  const id = cityId(args.city)
  const { input, plan } = useTrip.getState()
  const city = ds.cities[id]
  const country = ds.countries[city.iso2]
  const stop = plan?.stops.find((s) => s.cityId === id)
  const month = Number(args.month) >= 1 && Number(args.month) <= 12 ? Number(args.month) : likelyMonth(ds, plan, input, id)
  const clim = ds.climate[id]
  const air = ds.air.byCity[id]?.[month - 1]
  const visa = ds.visa.rules[input.passport]?.[city.iso2]
  const adv = ds.advisories[city.iso2]
  const transit = ds.localTransport.cities[id]
  const cost = costProfile(ds, city.iso2)
  const water = tapWater(ds, id)
  const pay = ds.payments.countries[city.iso2]
  return {
    name: city.name, country: country.name, schengen: country.schengen, currency: country.currency, blurb: city.blurb, tags: city.tags,
    suggested_days: suggestedDays(ds, id),
    in_itinerary: stop ? { arrive: stop.arrive, depart: stop.depart, nights: stop.nights, locked: stop.locked } : false,
    weather: clim && {
      month: monthName(month),
      ...(clim[month - 1] && { high_c: clim[month - 1].tHigh, low_c: clim[month - 1].tLow, ...feelsOf(clim[month - 1]), rain_days: clim[month - 1].rainDays, sun_hours: clim[month - 1].sunHours }),
      all_months: clim.map((m) => `${monthName(m.month)} ${Math.round(m.tLow)}–${Math.round(m.tHigh)}°C, ${Math.round(m.rainDays)} rain days`),
    },
    air_quality: air && { month: monthName(month), pm25: air.pm25, level: airBand(air.pm25).short },
    daily_cost_eur: dailyCosts(input, id),
    prices_eur: cost && { dorm_bed: cost.profile.dormBed, private_room: cost.profile.privateRoom, local_meal: cost.profile.mealLocal, estimated: cost.estimated },
    visa: visa ? { passport: input.passport, requirement: visa.req, days: visa.days } : 'unknown',
    travel_advice: adv && {
      uk_level: adv.level, do_not_travel: adv.excludedByDefault, us: adv.us?.title, uk_url: adv.url,
      summary: adv.safety?.slice(0, 3).map((s) => `${s.heading}: ${s.text.slice(0, 200)}`),
    },
    public_transport: transit && { ease: TRANSIT_LABELS[transit.ease]?.short, modes: transit.modes, walkable: transit.walkable, how_to_pay: transit.pay },
    taxi_apps: ds.localTransport.countries[city.iso2]?.taxi?.apps,
    english: ENGLISH_LABELS[englishLevel(ds, id).level]?.short,
    cards: pay && { level: CARD_LABELS[cardLevel(ds, id).level]?.short, foreign_cards_work: pay.foreignCardsWork, cash_for: pay.cashFor },
    tap_water: water && TAP_WATER_LABELS[water.level]?.short,
    vaccines: vaccinesFor(ds, city.iso2).items.map((v) => `${v.name} (${v.advice})`),
    mobile_internet: mobileView(id),
    connections: ds.connections
      .filter((c) => c.from === id || c.to === id)
      .map((c) => ({ to: cityName(c.from === id ? c.to : c.from), mode: c.mode, hours: Math.round(c.durationMin / 6) / 10, price_eur: [c.priceMin, c.priceMax], frequency: c.frequency, overnight: c.overnight })),
  }
}

const BUDGETS: Budget[] = ['shoestring', 'backpacker', 'private', 'midrange', 'comfort']
export const CITY_SECTIONS = ['weather', 'costs', 'entry', 'safety', 'health', 'transport', 'daily'] as const

/** A month's "feels like" high and low (heat with humidity, cold with wind), when the data has them. */
const feelsOf = (m: { feelsHigh?: number; feelsLow?: number }) =>
  m.feelsHigh !== undefined && m.feelsLow !== undefined ? { feels_like_high_c: m.feelsHigh, feels_like_low_c: m.feelsLow } : {}

/** Everything the app has about a city, by section (get_city_info with `sections`). */
function citySections(id: string, sections: string[]): ToolResult {
  const unknown = sections.filter((s) => !(CITY_SECTIONS as readonly string[]).includes(s))
  if (unknown.length) throw new ToolError(`Unknown section ${unknown.join(', ')}; use ${CITY_SECTIONS.join(', ')}`)
  const { input, plan } = useTrip.getState()
  const city = ds.cities[id]
  const country = ds.countries[city.iso2]
  const stop = plan?.stops.find((s) => s.cityId === id)
  const out: ToolResult = {
    name: city.name, country: country.name,
    in_itinerary: stop ? { arrive: stop.arrive, depart: stop.depart, nights: stop.nights } : false,
    likely_month: monthName(likelyMonth(ds, plan, input, id)),
  }
  const amen = nearby(ds, id)
  for (const section of sections) {
    if (section === 'weather') {
      const air = ds.air.byCity[id]
      out.weather = {
        months: (ds.climate[id] ?? []).map((m, i) => ({
          month: monthName(m.month), high_c: m.tHigh, low_c: m.tLow, ...feelsOf(m), rain_days: m.rainDays, rain_mm: m.rainMm, sun_hours: m.sunHours, humidity_pct: m.humidity,
          ...(air?.[i] && { pm25: air[i].pm25, air: airBand(air[i].pm25).short, days_over_who: air[i].daysOverWho }),
        })),
        who_daily_pm25: ds.air.whoDaily,
      }
    }
    if (section === 'costs') {
      const cost = costProfile(ds, city.iso2)
      const big = ds.bigMac.prices[city.iso2]
      out.costs = {
        currency: country.currency,
        daily_cost_eur: dailyCosts(input, id),
        prices_eur: cost && { ...cost.profile, groceries_for_a_day: Math.round(groceryDay(cost.profile) * 10) / 10, estimated_from_price_level: cost.estimated },
        price_level_vs_us: ds.priceLevels.levels[city.iso2]?.level,
        big_mac: big && { local_price: big.localPrice, currency: big.currency },
        shopping: ds.shopping[city.iso2],
        payments: ds.payments.countries[city.iso2] && { ...ds.payments.countries[city.iso2], city_note: ds.payments.cities[id]?.note },
        tips: ds.payments.tips,
      }
    }
    if (section === 'entry') {
      const visa = ds.visa.rules[input.passport]?.[city.iso2]
      const limit = country.schengen && schengenApplies(ds, input.passport)
      out.entry = {
        passport: input.passport, visa: visa ?? 'unknown', schengen: country.schengen, eu: country.eu,
        schengen_90_180_limit_applies: limit,
        notices: limit
          ? ds.notices.filter((n) => n.appliesTo === 'schengen-non-eu' || (n.appliesTo === 'schengen-visa-free' && visa?.req === 'visa_free')).map((n) => ({ title: n.title, text: n.text, url: n.url }))
          : [],
      }
    }
    if (section === 'safety') {
      const adv = ds.advisories[city.iso2]
      out.safety = adv && {
        uk_level: adv.level, do_not_travel: adv.excludedByDefault, alerts: adv.alertStatus, summary: adv.summary, warnings: adv.warnings,
        details: adv.safety, uk_url: adv.url, updated: adv.updatedAt, us: adv.us, emergency_number: country.emergency,
      }
    }
    if (section === 'health') {
      const h = ds.health.countries[city.iso2]
      out.health = {
        tap_water: tapWater(ds, id) ?? undefined, vaccines: vaccinesFor(ds, city.iso2), routine_vaccines: 'up to date, incl. measles (MMR)', risks: h?.risks, healthcare: h?.healthcare,
        nearby: amen && { pharmacies: amen.pharmacy, clinics: amen.clinic, nearest_hospital_km: amen.nearestHospitalKm, within_km: ds.amenities.radiusKm, note: 'rough counts: map data misses places' },
      }
    }
    if (section === 'transport') {
      const t = ds.localTransport.countries[city.iso2]
      out.transport = {
        public_transport: ds.localTransport.cities[id], taxi: t?.taxi, rentals: t?.rentals,
        connections: ds.connections.filter((c) => c.from === id || c.to === id).map((c) => ({
          to: cityName(c.from === id ? c.to : c.from), mode: c.mode, hours: Math.round(c.durationMin / 6) / 10, price_eur: [c.priceMin, c.priceMax],
          frequency: c.frequency, overnight: c.overnight, note: c.note,
        })),
      }
    }
    if (section === 'daily') {
      out.daily = {
        english: { level: ENGLISH_LABELS[englishLevel(ds, id).level]?.short, other_languages: country.english.otherLanguages, script: country.english.script },
        languages: country.languages, religion: country.religion, plugs: country.plugs, voltage: country.voltage, emergency_number: country.emergency,
        notes: country.notes, timezone: city.timezone, population: city.population, mobile_internet: mobileView(id),
        nearby: amen && { supermarkets: amen.supermarket, convenience_stores: amen.convenience, atms: amen.atm, within_km: ds.amenities.radiusKm, note: 'rough counts: map data misses places' },
        phrases: phrasesView(id),
      }
    }
  }
  return out
}

/** The Phrases tab for the assistant: each language spoken there (main one first), its phrases and how to say them. */
function phrasesView(id: string) {
  const p = phrasesFor(ds, id)
  if (!p) return 'no data'
  return {
    note: p.note,
    languages: p.languages.map((l) => ({
      language: l.name, note: l.note,
      phrases: PHRASES.map(({ key, label }) => ({ english: label, ...l.phrases[key] })),
    })),
  }
}

/** Mobile internet in a city for the assistant: its band and typical speeds. */
function mobileView(id: string) {
  const m = mobileInternet(ds, id)
  return m ? { level: m.short, meaning: m.long, download_mbps: m.downMbps, upload_mbps: m.upMbps, latency_ms: m.latencyMs } : 'no data'
}

export const COMPARE_FIELDS = ['weather', 'air', 'daily_cost', 'english', 'cards', 'mobile_internet', 'travel_advice', 'tap_water', 'suggested_days', 'population'] as const
const MAX_ROWS = 80

/** One row per city with the chosen fields, for questions across many cities. */
function compareCities(args: Args): ToolResult {
  const { input, plan } = useTrip.getState()
  const fields = (Array.isArray(args.fields) ? args.fields.map(String) : []).filter((f) => (COMPARE_FIELDS as readonly string[]).includes(f))
  if (!fields.length) throw new ToolError(`Give fields: ${COMPARE_FIELDS.join(', ')}`)
  const ids = new Set<string>()
  for (const c of Array.isArray(args.cities) ? args.cities : []) ids.add(cityId(c))
  for (const ref of Array.isArray(args.countries) ? args.countries : []) {
    const iso2 = countryCode(ref)
    Object.values(ds.cities).filter((c) => c.iso2 === iso2).forEach((c) => ids.add(c.id))
  }
  if (args.in_trip) plan?.stops.forEach((s) => ids.add(s.cityId))
  if (!ids.size) throw new ToolError('Give cities, countries or in_trip: true')
  const month = Number(args.month) >= 1 && Number(args.month) <= 12 ? Number(args.month) : 0
  const rows = [...ids].slice(0, MAX_ROWS).map((id) => {
    const c = ds.cities[id]
    const i = plan?.stops.findIndex((s) => s.cityId === id) ?? -1
    const m = month || likelyMonth(ds, plan, input, id)
    const row: Record<string, unknown> = { city: c.name, country: countryName(c.iso2), stop: i >= 0 ? i + 1 : null }
    if (fields.includes('weather') || fields.includes('air')) row.month = monthName(m)
    for (const f of fields) {
      if (f === 'weather') {
        const w = ds.climate[id]?.[m - 1]
        if (w) Object.assign(row, { high_c: w.tHigh, low_c: w.tLow, ...feelsOf(w), rain_days: w.rainDays, sun_hours: w.sunHours })
      }
      if (f === 'air') {
        const a = ds.air.byCity[id]?.[m - 1]
        if (a) Object.assign(row, { pm25: a.pm25, air: airBand(a.pm25).short })
      }
      if (f === 'daily_cost') row.daily_cost_eur = Math.round(dailyCost(ds, id, input))
      if (f === 'english') row.english = ENGLISH_LABELS[englishLevel(ds, id).level]?.short
      if (f === 'cards') row.cards = CARD_LABELS[cardLevel(ds, id).level]?.short
      if (f === 'mobile_internet') row.mobile_internet = mobileView(id)
      if (f === 'travel_advice') row.uk_advice_level = ds.advisories[c.iso2]?.level
      if (f === 'tap_water') row.tap_water = TAP_WATER_LABELS[tapWater(ds, id)?.level ?? '']?.short
      if (f === 'suggested_days') row.suggested_days = suggestedDays(ds, id)[input.pace]
      if (f === 'population') row.population = c.population
    }
    return row
  })
  return {
    month: month ? monthName(month) : 'each city in the month the user would be there',
    ...(fields.includes('daily_cost') && { daily_cost: 'one traveller, on this trip’s choices' }),
    rows,
    ...(ids.size > MAX_ROWS && { note: `Showing ${MAX_ROWS} of ${ids.size} cities; narrow the request.` }),
  }
}

const legResult = (leg: Leg): ToolResult => ({
  from: cityName(leg.from), to: cityName(leg.to), reachable: leg.reachable,
  ...(leg.reachable && {
    total_hours: Math.round(leg.durationMin / 6) / 10, price_eur: [leg.priceMin, leg.priceMax], overnight: leg.overnight, estimated: leg.estimated,
    parts: leg.hops.map((h) => ({
      from: cityName(h.from), to: cityName(h.to), mode: h.mode, hours: Math.round(h.durationMin / 6) / 10, price_eur: [h.priceMin, h.priceMax],
      overnight: h.overnight, estimated: h.estimated, frequency: h.frequency, note: h.note,
    })),
  }),
})

/** The best way between any two cities in the app (not only stops of the trip). */
function routeTool(args: Args): ToolResult {
  if (Array.isArray(args.pairs) && args.pairs.length) {
    return { routes: each(args.pairs as Args[], MAX_PAIRS, 'routes', (pair) => routeTool({ from: pair?.from, to: pair?.to })) }
  }
  const from = cityId(args.from)
  const to = cityId(args.to)
  if (from === to) throw new ToolError('from and to are the same city')
  return legResult(routeBetween(ds, from, to))
}

/** Which parts of get_city_info each tab of the city panel shows. */
const TAB_FIELDS: Record<CityTab, string[] | null> = {
  overview: null, // a summary of everything
  transport: ['public_transport', 'taxi_apps', 'connections'],
  weather: ['weather', 'air_quality'],
  costs: ['currency', 'daily_cost_eur', 'prices_eur', 'cards'],
  daily: ['english', 'mobile_internet'],
  phrases: ['phrases'], // not in the summary: only when the tab is open
  health: ['vaccines', 'tap_water'],
  safety: ['travel_advice'],
  entry: ['schengen', 'visa'],
}

/** The values on screen for one shared item. */
function viewDetails(ref: ViewRef): ToolResult {
  const { plan, input } = useTrip.getState()
  if (ref.kind === 'city') {
    const info = cityInfo({ city: ref.id })
    const fields = TAB_FIELDS[ref.tab]
    return {
      open: `${info.name} details, ${ref.tab} tab`,
      ...(fields ? { name: info.name, country: info.country, in_itinerary: info.in_itinerary, ...Object.fromEntries(fields.map((f) => [f, f === 'phrases' ? phrasesView(ref.id) : info[f]])) } : info),
    }
  }
  if (ref.kind === 'journey') {
    const i = plan?.legs.findIndex((l) => l.from === ref.from && l.to === ref.to) ?? -1
    const leg = i >= 0 ? plan!.legs[i] : null
    if (!leg) return { open: `Journey ${cityName(ref.from)} → ${cityName(ref.to)}`, error: 'This journey is no longer in the trip.' }
    return { open: `Journey ${cityName(leg.from)} → ${cityName(leg.to)}`, ...legResult(leg) }
  }
  // The map: the value it shows for each stop (other cities are coloured too; get_city_info has their details).
  const value = (cityId: string): Record<string, unknown> => {
    const iso2 = ds.cities[cityId].iso2
    const month = ref.month || likelyMonth(ds, plan, input, cityId)
    switch (ref.layer) {
      case 'none': return {}
      case 'climate': {
        const m = ds.climate[cityId]?.[month - 1]
        return m ? { month: monthName(month), high_c: m.tHigh, low_c: m.tLow, ...feelsOf(m), coloured_by: `${ref.weatherBy ?? 'high'}${useTrip.getState().tempFeels ? ', as it feels' : ''}`, rain_days: m.rainDays, rainy_share_pct: Math.round(rainShare(m.rainDays, month) * 100) } : {}
      }
      case 'air': {
        const a = ds.air.byCity[cityId]?.[month - 1]
        return a ? { month: monthName(month), pm25: a.pm25, level: airBand(a.pm25).short } : {}
      }
      case 'mobile': return { mobile_internet: mobileView(cityId) }
      case 'nearby': {
        const kind = ref.nearbyKind ?? 'pharmacy'
        return { [`${kind}_within_${ds.amenities.radiusKm}_km`]: nearby(ds, cityId)?.[kind] ?? 'no data', note: 'rough counts: map data misses places' }
      }
      case 'cost': {
        const kind = ref.costKind ?? 'day'
        const eur = costOf(ds, cityId, kind, input)
        return kind === 'day' ? { daily_cost_eur: Math.round(eur), on: 'this trip’s choices' } : { [`${kind}_eur`]: Math.round(eur * 100) / 100 }
      }
      case 'schengen': return { schengen_area: !!ds.countries[iso2]?.schengen }
    }
  }
  // The Route view: each stop with its dates and how you get there (line colour = mode, dashed = estimated).
  const arrival = (i: number) => {
    const leg = i > 0 ? plan?.legs[i - 1] : null
    if (!leg) return {}
    return { travel_in: leg.reachable ? { modes: leg.hops.map((h) => h.mode), hours: Math.round(leg.durationMin / 6) / 10, estimated: leg.estimated } : 'no route found' }
  }
  return {
    open: `Map, ${ref.layer === 'none' ? 'route' : ref.layer} view${ref.month ? ` for ${monthName(ref.month)}` : ''}`,
    stops: (plan?.stops ?? []).map((s, i) => ({
      stop: i + 1, city: cityName(s.cityId),
      ...(ref.layer === 'none' ? { arrive: s.arrive, nights: s.nights, ...arrival(i) } : value(s.cityId)),
    })),
  }
}

function sharedViewTool(args: Args): ToolResult {
  const items = sharedView().filter((v) => !args.item || v.ref.kind === args.item)
  if (!items.length) {
    return { error: args.item ? `The user didn't share a ${args.item} view with this message.` : 'The user didn\'t share anything they are looking at with this message.' }
  }
  return { items: items.map((v) => viewDetails(v.ref)) }
}

function options(): ToolResult {
  return {
    regions: REGIONS.map((r) => ({ name: r.name, countries: r.countries.map(countryName) })),
    countries: Object.values(ds.countries).map((c) => ({ code: c.iso2, name: c.name })),
    // Can be added to a trip, but the planner has no cities there yet.
    countries_without_cities: Object.keys(ds.world).filter((iso2) => !ds.countries[iso2]).map(countryName),
    interests: INTERESTS,
    passports: ds.visa.passports,
    paces: ['chill', 'balanced', 'fast'],
    budgets: ['shoestring', 'backpacker', 'private', 'midrange', 'comfort'],
  }
}

// ---------------------------------------------------------------- changing

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

function updateSettings(args: Args): string {
  const t = useTrip.getState()
  const patch: Partial<TripInput> = {}
  if (args.start_date !== undefined) {
    if (!isDate(args.start_date)) throw new ToolError('start_date must be YYYY-MM-DD')
    patch.startDate = String(args.start_date)
  }
  if (args.end_date !== undefined) {
    if (!isDate(args.end_date)) throw new ToolError('end_date must be YYYY-MM-DD')
    patch.endDate = String(args.end_date)
  }
  if ((patch.endDate ?? t.input.endDate) <= (patch.startDate ?? t.input.startDate)) throw new ToolError('The end date must be after the start date')
  if (patch.startDate || patch.endDate) Object.assign(patch, withDates(t.input, patch.startDate ?? t.input.startDate, patch.endDate ?? t.input.endDate))
  if (args.start_flex_days !== undefined || args.end_flex_days !== undefined) {
    const days = (v: unknown, was = 0) => (v === undefined ? was : Math.max(0, Math.min(MAX_FLEX_DAYS, Math.round(Number(v) || 0))))
    const start = patch.startDate ?? t.input.flex?.start ?? t.input.startDate
    const end = patch.endDate ?? t.input.flex?.end ?? t.input.endDate
    const startDays = days(args.start_flex_days, t.input.flex?.startDays)
    const endDays = days(args.end_flex_days, t.input.flex?.endDays)
    patch.flex = startDays || endDays ? { start, end, startDays, endDays } : undefined
  }
  if (args.pace !== undefined) {
    if (!['chill', 'balanced', 'fast'].includes(String(args.pace))) throw new ToolError('pace must be chill, balanced or fast')
    patch.pace = args.pace as Pace
  }
  if (args.budget !== undefined) {
    if (!BUDGETS.includes(args.budget as Budget)) throw new ToolError('Unknown budget')
    patch.budget = args.budget as Budget
    patch.prefs = stylePrefs(patch.budget, t.input.prefs)
  }
  if (args.interests !== undefined) {
    const list = (Array.isArray(args.interests) ? args.interests : []).map((x) => String(x).toLowerCase())
    const unknown = list.filter((x) => !INTERESTS.includes(x))
    if (unknown.length) throw new ToolError(`Unknown interests: ${unknown.join(', ')}. Use: ${INTERESTS.join(', ')}`)
    patch.interests = list
  }
  if (args.passport !== undefined) {
    const p = ds.visa.passports.find((x) => key(x.code) === key(String(args.passport)) || key(x.name) === key(String(args.passport)))
    if (!p) throw new ToolError(`Unknown passport. Use one of: ${ds.visa.passports.map((x) => x.code).join(', ')}`)
    patch.passport = p.code
  }
  if (args.keep_region_order !== undefined) patch.keepGroupOrder = Boolean(args.keep_region_order)
  if (args.start_city !== undefined) patch.startCityId = args.start_city ? cityId(args.start_city) : null
  if (args.end_city !== undefined) patch.endCityId = args.end_city ? cityId(args.end_city) : null
  if (args.min_stops !== undefined || args.max_stops !== undefined) {
    // 0 (or none) for no limit.
    const stops = (v: unknown) => (Number(v) > 0 ? Math.min(MAX_STOPS, Math.round(Number(v))) : null)
    if (args.min_stops !== undefined) patch.minStops = stops(args.min_stops)
    if (args.max_stops !== undefined) patch.maxStops = stops(args.max_stops)
  }
  if (args.wishes !== undefined) patch.wishes = String(args.wishes).slice(0, 1000)
  if (args.schengen_days_before !== undefined) patch.schengenDaysBefore = Math.max(0, Math.min(90, Math.round(Number(args.schengen_days_before) || 0)))
  if (!Object.keys(patch).length) throw new ToolError('Nothing to change')
  t.setInput(patch)
  // New dates change the number of nights: re-fit an existing itinerary so it still fills the trip.
  if ((patch.startDate || patch.endDate) && useTrip.getState().stops.length) useTrip.getState().rebalance()
  return `Updated ${Object.keys(patch).join(', ')}`
}

function findRegion(name: unknown) {
  const { input } = useTrip.getState()
  const g = input.groups.find((x) => key(x.name) === key(String(name ?? '')))
  if (!g) throw new ToolError(`No region "${name}". Regions: ${input.groups.map((x) => x.name).join(', ') || 'none'}`)
  return g
}

function addRegion(args: Args): string {
  const { input, setInput } = useTrip.getState()
  let name: string
  let countries: string[]
  if (args.preset) {
    const preset = REGIONS.find((p) => key(p.name) === key(String(args.preset)))
    if (!preset) throw new ToolError(`Unknown region. Regions: ${REGIONS.map((p) => p.name).join(', ')}`)
    name = preset.name
    countries = preset.countries
  } else {
    countries = (Array.isArray(args.countries) ? args.countries : []).map(countryCode)
    if (!countries.length) throw new ToolError('Give a preset or a list of countries')
    name = args.name ? String(args.name) : countries.map(countryName).join(' & ')
  }
  const taken = new Set(input.groups.flatMap((g) => g.countries.map((c) => c.iso2)))
  const fresh = countries.filter((c) => !taken.has(c))
  if (!fresh.length) throw new ToolError('Those countries are already in the trip')
  setInput({ groups: [...input.groups, makeGroup(ds, name, fresh)] })
  return `Added region ${name}`
}

function updateRegion(args: Args): string {
  const g = findRegion(args.region)
  const { input, setInput } = useTrip.getState()
  if (args.remove) {
    setInput({ groups: input.groups.filter((x) => x.id !== g.id) })
    return `Removed region ${g.name}`
  }
  throw new ToolError('Nothing to change: give remove')
}

function setCountryMode(args: Args): string {
  const iso2 = countryCode(args.country)
  const { input, setInput } = useTrip.getState()
  const country = input.groups.flatMap((g) => g.countries).find((c) => c.iso2 === iso2)
  if (!country) throw new ToolError(`${countryName(iso2)} is in no region; add it with add_region first`)
  const next: TripCountry = { ...country }
  if (args.mode !== undefined) {
    if (!['must', 'optional', 'excluded'].includes(String(args.mode))) throw new ToolError('mode must be must, optional or excluded')
    next.mode = args.mode as CountryMode
  }
  // 0 (or none) for no limit.
  const days = (v: unknown) => (Number(v) > 0 ? Math.min(MAX_COUNTRY_DAYS, Math.round(Number(v))) : null)
  if (args.min_days !== undefined) next.minDays = days(args.min_days)
  if (args.max_days !== undefined) next.maxDays = days(args.max_days)
  if (args.mode === undefined && args.min_days === undefined && args.max_days === undefined) throw new ToolError('Nothing to change')
  setInput({ groups: input.groups.map((g) => ({ ...g, countries: g.countries.map((c) => (c.iso2 === iso2 ? next : c)) })) })
  return `${countryName(iso2)}: ${next.mode}${hasDays(next) ? `, ${dayRangeText({ min: next.minDays, max: next.maxDays })}` : ''}`
}

const hasDays = (c: TripCountry) => !!(c.minDays || c.maxDays)

/** Index to pass to moveStop so that the stop ends up right after `after` ("start" = first). */
function targetIndex(from: number, after: unknown): number {
  if (String(after).toLowerCase() === 'start') return 0
  const a = stopIndex(after)
  if (a === from) throw new ToolError('A stop can\'t go after itself')
  return from < a ? a : a + 1
}

function addStopTool(args: Args): string {
  const id = cityId(args.city)
  const t = useTrip.getState()
  if (!t.plan) throw new ToolError('There is no itinerary yet: set up regions and use generate_plan first')
  if (t.stops.some((s) => s.cityId === id)) throw new ToolError(`${cityName(id)} is already in the itinerary`)
  t.addCity(id)
  if (args.after !== undefined && args.after !== '') {
    const from = stopIndex(id)
    useTrip.getState().moveStop(from, targetIndex(from, args.after))
  }
  if (args.nights !== undefined) useTrip.getState().setNights(stopIndex(id), Math.max(1, Math.round(Number(args.nights))))
  return `Added ${cityName(id)}`
}

function run(name: string, args: Args): string | ToolResult {
  const t = useTrip.getState()
  switch (name) {
    case 'get_trip': return tripDetails()
    case 'find_cities': return findCities(args)
    case 'get_city_info': return cityInfo(args)
    case 'get_options': return options()
    case 'get_shared_view': return sharedViewTool(args)
    case 'compare_cities': return compareCities(args)
    case 'get_route': return routeTool(args)
    case 'update_settings': return updateSettings(args)
    case 'update_preferences': return updatePreferences(args)
    case 'new_plan': {
      const id = t.addPlan({ name: args.name ? String(args.name) : undefined, activate: args.switch_to !== false })
      if (!id) throw new ToolError(`A trip can have up to ${MAX_PLANS} plans: delete one first`)
      const added = useTrip.getState().plans.find((p) => p.id === id)!
      return `Added ${added.name}, a copy of ${planName(t.activePlanId)}${args.switch_to !== false ? `; now on ${added.name}` : ''}`
    }
    case 'switch_plan': {
      const p = findPlan(args.plan)
      t.switchPlan(p.id)
      return `Switched to ${p.name}`
    }
    case 'rename_plan': {
      const p = findPlan(args.plan)
      if (!String(args.name ?? '').trim()) throw new ToolError('Give a name')
      t.renamePlan(p.id, String(args.name))
      return `Renamed ${p.name} to ${String(args.name).trim()}`
    }
    case 'delete_plan': {
      const p = findPlan(args.plan)
      if (t.plans.length <= 1) throw new ToolError('A trip needs at least one plan')
      t.deletePlan(p.id)
      return `Deleted ${p.name}; now on ${planName(useTrip.getState().activePlanId)}`
    }
    case 'add_region': return addRegion(args)
    case 'update_region': return updateRegion(args)
    case 'set_country_mode': return setCountryMode(args)
    case 'generate_plan':
      if (!t.input.groups.length) throw new ToolError('Add at least one region first (add_region)')
      t.generate()
      return 'Generated a new itinerary'
    case 'add_stop': return addStopTool(args)
    case 'remove_stop': {
      const i = stopIndex(args.city)
      t.removeStop(i)
      return `Removed ${cityName(t.stops[i].cityId)}`
    }
    case 'set_nights': {
      const nights = Math.round(Number(args.nights))
      if (!(nights >= 1)) throw new ToolError('nights must be at least 1')
      const i = stopIndex(args.city)
      t.setNights(i, nights)
      return `${cityName(t.stops[i].cityId)}: ${nights} nights (locked)`
    }
    case 'set_locked': {
      const i = stopIndex(args.city)
      if (t.stops[i].locked !== Boolean(args.locked)) t.toggleLock(i)
      return `${cityName(t.stops[i].cityId)} ${args.locked ? 'locked' : 'unlocked'}`
    }
    case 'move_stop': {
      const from = stopIndex(args.city)
      t.moveStop(from, targetIndex(from, args.after))
      return `Moved ${cityName(t.stops[from].cityId)}`
    }
    case 'reorder_stops': {
      if (!t.stops.length) throw new ToolError('There is no itinerary yet')
      if (args.reverse) {
        // Backwards: the regions in reverse order too, and the start and end city swapped, so a new plan agrees.
        t.setInput({ groups: [...t.input.groups].reverse(), startCityId: t.input.endCityId, endCityId: t.input.startCityId })
        t.reorderStops(t.stops.map((_, i) => t.stops.length - 1 - i))
        return `Reversed the trip: it now starts in ${cityName(useTrip.getState().stops[0].cityId)}`
      }
      const order = (Array.isArray(args.order) ? args.order : []).map((c) => stopIndex(c))
      if (order.length !== t.stops.length || new Set(order).size !== order.length) {
        throw new ToolError(`Give every stop of the trip once (${t.stops.length} stops), or reverse: true`)
      }
      t.reorderStops(order)
      return 'Re-ordered the stops'
    }
    case 'optimize_route':
      if (!t.plan) throw new ToolError('There is no itinerary yet')
      t.reoptimize()
      return 'Re-ordered the route'
    case 'refit_nights':
      if (!t.plan) throw new ToolError('There is no itinerary yet')
      t.rebalance()
      return 'Re-fitted the nights'
    default:
      throw new ToolError(`Unknown tool ${name}`)
  }
}

/** Runs one tool call. Changes return what was done plus the updated trip; errors are returned for the assistant to read. */
export function runTool(name: string, args: Args = {}): { result: ToolResult; ok: boolean; summary: string } {
  try {
    const out = run(name, args)
    if (typeof out === 'string') return { ok: true, summary: out, result: { done: out, trip: tripContext() } }
    return { ok: true, summary: '', result: out }
  } catch (e) {
    const message = e instanceof ToolError ? e.message : `Failed: ${(e as Error).message}`
    return { ok: false, summary: message, result: { error: message } }
  }
}

const LUNCH_DINNER = ['skip', 'diy', 'local', 'restaurant'] as const

/** The preferences the assistant can change: argument name, preference, and the values allowed (null = no limit). */
const PREF_ARGS: { arg: string; key: keyof TravelPrefs; values?: readonly unknown[]; amount?: true; flag?: true; temp?: true }[] = [
  { arg: 'return_home', key: 'returnHome', flag: true },
  { arg: 'travellers', key: 'travellers', values: [1, 2, 4] },
  { arg: 'room', key: 'room', values: ['dorm', 'private'] },
  { arg: 'max_per_night_eur', key: 'maxPerNight', amount: true },
  { arg: 'breakfast', key: 'breakfast', values: ['diy', 'local', 'skip'] },
  { arg: 'lunch', key: 'lunch', values: LUNCH_DINNER },
  { arg: 'dinner', key: 'dinner', values: LUNCH_DINNER },
  { arg: 'coffees', key: 'coffees', values: [0, 1, 2] },
  { arg: 'beers', key: 'beers', values: [0, 1, 2] },
  { arg: 'between_cities', key: 'betweenCities', values: ['cheapest', 'balanced', 'fastest'] },
  { arg: 'overnight', key: 'overnight', flag: true },
  { arg: 'max_travel_hours', key: 'maxTravelHours', values: [3, 5, 8, null] },
  { arg: 'sights', key: 'sights', values: ['few', 'daily', 'lots'] },
  { arg: 'focus', key: 'focus', values: ['balanced', 'countries', 'highlights'] },
  { arg: 'expensive', key: 'expensive', values: ['ignore', 'shorter', 'skip'] },
  { arg: 'max_high_c', key: 'maxHeatC', temp: true },
  { arg: 'min_high_c', key: 'minHighC', temp: true },
  { arg: 'max_low_c', key: 'maxLowC', temp: true },
  { arg: 'min_low_c', key: 'minLowC', temp: true },
  { arg: 'avoid_rain', key: 'avoidRain', flag: true },
  { arg: 'need_internet', key: 'needInternet', flag: true },
  { arg: 'daily_budget_eur', key: 'dailyBudget', amount: true },
]

const planName = (id: string) => useTrip.getState().plans.find((p) => p.id === id)?.name ?? 'the plan'
/** A plan of the trip by name (or id). */
function findPlan(ref: unknown): TripPlan {
  const plans = useTrip.getState().plans
  const p = plans.find((x) => key(x.name) === key(String(ref ?? '')) || x.id === ref)
  if (!p) throw new ToolError(`No plan called "${ref}". Plans: ${plans.map((x) => x.name).join(', ')}`)
  return p
}

/** Names of the preferences in the list of changes under a reply. */
const PREF_NAMES: Record<keyof TravelPrefs, string> = {
  homeCityId: 'Home city', returnHome: 'Return home at the end', travellers: 'Travellers', room: 'Bed', maxPerNight: 'Most per night (EUR)', breakfast: 'Breakfast',
  lunch: 'Lunch', dinner: 'Dinner', coffees: 'Café coffees', beers: 'Beers in a bar', betweenCities: 'Between cities',
  overnight: 'Overnight travel', maxTravelHours: 'Longest travel day (h)', sights: 'Paid sights', focus: 'Trip goal',
  expensive: 'Expensive places', maxHeatC: 'Highest comfortable high (°C)', minHighC: 'Lowest comfortable high (°C)', maxLowC: 'Warmest comfortable night (°C)', minLowC: 'Coldest comfortable night (°C)', avoidRain: 'Avoid rainy months',
  needInternet: 'Needs fast internet', dailyBudget: 'Daily budget (EUR)',
}
const prefValue = (v: unknown) => (v === null ? 'no limit' : v === true ? 'yes' : v === false ? 'no' : String(v).replace('_', ' '))

function updatePreferences(args: Args): string {
  const patch: Partial<TravelPrefs> = {}
  for (const p of PREF_ARGS) {
    const raw = args[p.arg]
    if (raw === undefined) continue
    let value: unknown
    if (p.temp) {
      // A temperature in °C, or "none" (or null) for no limit; 0 is a real temperature here.
      value = raw === null || /^(none|any|no limit)?$/i.test(String(raw).trim()) ? null : Math.round(Number(raw))
      if (value !== null && (!Number.isFinite(value) || (value as number) < -30 || (value as number) > 50)) throw new ToolError(`${p.arg} must be a temperature in °C, or "none"`)
    } else if (p.flag) value = Boolean(raw)
    else if (p.amount) value = Number(raw) > 0 ? Math.round(Number(raw)) : null
    else {
      // Numbers may come as strings; 0 means "no limit" where there's one.
      value = typeof p.values![0] === 'number' ? (Number(raw) || null) : String(raw)
      if (!p.values!.includes(value)) throw new ToolError(`${p.arg} must be one of: ${p.values!.map((v) => v ?? 0).join(', ')}`)
    }
    Object.assign(patch, { [p.key]: value })
  }
  // Home: any city the app knows, or "" for none; it is where the trip starts from, not a stop.
  if (args.home_city !== undefined) patch.homeCityId = String(args.home_city).trim() ? cityId(args.home_city) : null
  if (!Object.keys(patch).length) throw new ToolError('Nothing to change')
  useTrip.getState().setPrefs(patch)
  const shapesPlan = ['focus', 'expensive', 'maxHeatC', 'minHighC', 'maxLowC', 'minLowC', 'avoidRain'].some((k) => k in patch)
  return `Updated preferences: ${Object.keys(patch).join(', ')}${shapesPlan && useTrip.getState().stops.length ? '. The itinerary is unchanged until generate_plan runs.' : ''}`
}

// ---------------------------------------------------------------- what changed (shown under the reply, with Undo)

export type TripSnapshot = TripData

export const snapshot = (): TripSnapshot => {
  const s = useTrip.getState()
  return structuredClone({ input: s.input, stops: s.stops, plans: tripPlans(s), activePlanId: s.activePlanId })
}

/** Plain-language list of differences between two versions of the trip. */
export function describeChanges(before: TripSnapshot, after: TripSnapshot): string[] {
  const out: string[] = []
  // The trip's plans: added, removed, renamed, and which one is active.
  const name = (snap: TripSnapshot, id?: string) => snap.plans?.find((p) => p.id === id)?.name ?? 'Plan A'
  for (const p of after.plans ?? []) {
    const old = before.plans?.find((x) => x.id === p.id)
    if (!old && before.plans) out.push(`Added plan ${p.name}`)
    else if (old && old.name !== p.name) out.push(`Renamed plan ${old.name} to ${p.name}`)
  }
  for (const p of before.plans ?? []) if (after.plans && !after.plans.some((x) => x.id === p.id)) out.push(`Deleted plan ${p.name}`)
  if (before.activePlanId !== after.activePlanId) {
    // Another plan is shown: comparing its setup and stops with the previous plan's would only list their differences.
    out.push(`Switched to ${name(after, after.activePlanId)}`)
    return out
  }
  const a = before.input
  const b = after.input
  if (a.startDate !== b.startDate || a.endDate !== b.endDate) out.push(`Dates: ${a.startDate} – ${a.endDate} → ${b.startDate} – ${b.endDate}`)
  if (a.pace !== b.pace) out.push(`Pace: ${a.pace} → ${b.pace}`)
  if (a.budget !== b.budget) out.push(`Travel style: ${a.budget} → ${b.budget}`)
  if (a.passport !== b.passport) out.push(`Passport: ${a.passport} → ${b.passport}`)
  if (a.interests.join() !== b.interests.join()) out.push(`Interests: ${b.interests.join(', ') || 'none'}`)
  if ((a.wishes ?? '') !== (b.wishes ?? '')) out.push('Wishes updated')
  if ((a.minStops ?? null) !== (b.minStops ?? null) || (a.maxStops ?? null) !== (b.maxStops ?? null)) out.push(`Number of stops: ${stopsText(b)}`)
  // A new travel style resets its own preferences; those aren't listed one by one.
  const styleKeys = a.budget !== b.budget ? Object.keys(STYLES[0].prefs) : []
  for (const { key } of PREF_ARGS) {
    if (styleKeys.includes(key)) continue
    const [was, now] = [a.prefs[key], b.prefs[key]]
    if (was !== now) out.push(`${PREF_NAMES[key]}: ${prefValue(was)} → ${prefValue(now)}`)
  }
  if (a.prefs.homeCityId !== b.prefs.homeCityId) out.push(`Home city: ${b.prefs.homeCityId ? cityName(b.prefs.homeCityId) : 'none'}`)
  if (a.startCityId !== b.startCityId) out.push(`Start city: ${b.startCityId ? cityName(b.startCityId) : 'any'}`)
  if (a.endCityId !== b.endCityId) out.push(`End city: ${b.endCityId ? cityName(b.endCityId) : 'any'}`)
  if (a.keepGroupOrder !== b.keepGroupOrder) out.push(`Visit regions in order: ${b.keepGroupOrder ? 'yes' : 'no'}`)
  for (const g of b.groups) {
    const old = a.groups.find((x) => x.id === g.id)
    if (!old) { out.push(`Added region ${g.name}`); continue }
    for (const c of g.countries) {
      const was = old.countries.find((x) => x.iso2 === c.iso2)
      if (was && was.mode !== c.mode) out.push(`${countryName(c.iso2)}: ${was.mode} → ${c.mode}`)
      if (was && ((was.minDays ?? null) !== (c.minDays ?? null) || (was.maxDays ?? null) !== (c.maxDays ?? null))) out.push(`${countryName(c.iso2)}: ${dayRangeText({ min: c.minDays, max: c.maxDays })}`)
    }
  }
  for (const g of a.groups) if (!b.groups.some((x) => x.id === g.id)) out.push(`Removed region ${g.name}`)

  const nights = (stops: Stop[]) => new Map(stops.map((s) => [s.cityId, s]))
  const was = nights(before.stops)
  const now = nights(after.stops)
  if (!before.stops.length && after.stops.length) {
    out.push(`New itinerary: ${after.stops.length} stops`)
    return out
  }
  for (const s of after.stops) {
    const old = was.get(s.cityId)
    if (!old) out.push(`Added ${cityName(s.cityId)} (${s.nights} nights)`)
    else if (old.nights !== s.nights) out.push(`${cityName(s.cityId)}: ${old.nights} → ${s.nights} nights`)
    else if (old.locked !== s.locked) out.push(`${cityName(s.cityId)} ${s.locked ? 'locked' : 'unlocked'}`)
  }
  for (const s of before.stops) if (!now.has(s.cityId)) out.push(`Removed ${cityName(s.cityId)}`)
  const order = (stops: Stop[]) => stops.map((s) => s.cityId).filter((id) => was.has(id) && now.has(id)).join()
  if (order(before.stops) !== order(after.stops)) out.push('Changed the order of stops')
  return out
}
