// Runs the trip assistant's tools on the trip in the browser, using the same store actions as the app's own buttons,
// and describes the trip for the assistant.
import { dataset as ds } from '../data/dataset'
import { INTERESTS, REGION_PRESETS, makeGroup } from '../data/presets'
import {
  CARD_LABELS, ENGLISH_LABELS, TAP_WATER_LABELS, TRANSIT_LABELS, airBand, cardLevel, costProfile, dailyCost, englishLevel,
  monthOf, suggestedDays, tapWater, type Budget, type Pace, type Stop, type TripInput,
} from '../planner'
import { useTrip } from '../store/trip'

type Args = Record<string, unknown>
export type ToolResult = Record<string, unknown>

const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').toLowerCase().replace(/[^a-z0-9]/g, '')
const cityName = (id: string) => ds.cities[id]?.name ?? id
const countryName = (iso2: string) => ds.countries[iso2]?.name ?? iso2

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
  throw new ToolError(`"${ref}" is not a country in the app. Use get_options to see the countries.`)
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
    `${i + 1}. ${g.name}${g.longer ? ' (longer)' : ''}: ${g.countries.map((c) => `${countryName(c.iso2)} ${c.mode}`).join(', ')}`).join('\n')
}

/** A compact description of the trip, sent with every message so the assistant knows the current state. */
export function tripContext(): string {
  const { input, plan } = useTrip.getState()
  const passport = ds.visa.passports.find((p) => p.code === input.passport)?.name ?? input.passport
  const lines = [
    `Dates: ${input.startDate} to ${input.endDate}. Pace: ${input.pace}. Budget: ${input.budget}. Interests: ${input.interests.join(', ') || 'none'}. Passport: ${passport}.`,
    `Visit regions in order: ${input.keepGroupOrder ? 'yes' : 'no'}.${input.startCityId ? ` Start: ${cityName(input.startCityId)}.` : ''}${input.endCityId ? ` End: ${cityName(input.endCityId)}.` : ''}`,
    `Regions:\n${regionsText(input)}`,
  ]
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
    if (warnings.length) lines.push(`Problems:\n${warnings.slice(0, 15).map((w) => `- ${w.title}`).join('\n')}`)
  }
  return lines.join('\n')
}

function tripDetails(): ToolResult {
  const { input, plan } = useTrip.getState()
  return {
    settings: {
      start_date: input.startDate, end_date: input.endDate, pace: input.pace, budget: input.budget, interests: input.interests,
      passport: input.passport, keep_region_order: input.keepGroupOrder, start_city: input.startCityId && cityName(input.startCityId),
      end_city: input.endCityId && cityName(input.endCityId), schengen_days_before: input.schengenDaysBefore,
    },
    regions: input.groups.map((g) => ({ name: g.name, longer: g.longer, countries: g.countries.map((c) => ({ country: countryName(c.iso2), mode: c.mode })) })),
    itinerary: plan && {
      stops: plan.stops.map((s) => ({ city: cityName(s.cityId), id: s.cityId, country: countryName(ds.cities[s.cityId].iso2), arrive: s.arrive, depart: s.depart, nights: s.nights, locked: s.locked })),
      legs: plan.legs.map((l) => ({
        from: cityName(l.from), to: cityName(l.to), reachable: l.reachable, hours: Math.round(l.durationMin / 6) / 10,
        modes: l.hops.map((h) => h.mode), price_eur: [l.priceMin, l.priceMax], overnight: l.overnight, estimated: l.estimated,
      })),
      nights: { total: plan.totalNights, assigned: plan.assignedNights },
      cost_eur: { min: Math.round(plan.cost.min), max: Math.round(plan.cost.max), per_day: Math.round(plan.cost.perDay) },
      schengen: plan.schengen,
      warnings: plan.warnings.map((w) => ({ severity: w.severity, title: w.title, detail: w.detail, city: w.cityId && cityName(w.cityId) })),
    },
  }
}

// ---------------------------------------------------------------- reading

function findCities(args: Args): ToolResult {
  const { input, stops } = useTrip.getState()
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
      suggested_days: suggestedDays(ds, input, c.id), in_itinerary: stops.some((s) => s.cityId === c.id),
    })),
  }
}

function cityInfo(args: Args): ToolResult {
  const id = cityId(args.city)
  const { input, plan } = useTrip.getState()
  const city = ds.cities[id]
  const country = ds.countries[city.iso2]
  const stop = plan?.stops.find((s) => s.cityId === id)
  const month = Number(args.month) >= 1 && Number(args.month) <= 12 ? Number(args.month) : monthOf(stop?.arrive ?? input.startDate)
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
    suggested_days: suggestedDays(ds, input, id),
    in_itinerary: stop ? { arrive: stop.arrive, depart: stop.depart, nights: stop.nights, locked: stop.locked } : false,
    weather: clim && {
      month: monthName(month),
      ...(clim[month - 1] && { high_c: clim[month - 1].tHigh, low_c: clim[month - 1].tLow, rain_days: clim[month - 1].rainDays, sun_hours: clim[month - 1].sunHours }),
      all_months: clim.map((m) => `${monthName(m.month)} ${Math.round(m.tLow)}–${Math.round(m.tHigh)}°C, ${Math.round(m.rainDays)} rain days`),
    },
    air_quality: air && { month: monthName(month), pm25: air.pm25, level: airBand(air.pm25).short },
    daily_cost_eur: Object.fromEntries((['shoestring', 'backpacker', 'midrange', 'comfort'] as Budget[]).map((b) => [b, Math.round(dailyCost(ds, id, b))])),
    prices_eur: cost && { dorm_bed: cost.profile.dormBed, private_room: cost.profile.privateRoom, cheap_meal: cost.profile.mealCheap, estimated: cost.estimated },
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
    connections: ds.connections
      .filter((c) => c.from === id || c.to === id)
      .map((c) => ({ to: cityName(c.from === id ? c.to : c.from), mode: c.mode, hours: Math.round(c.durationMin / 6) / 10, price_eur: [c.priceMin, c.priceMax], frequency: c.frequency, overnight: c.overnight })),
  }
}

function options(): ToolResult {
  return {
    region_presets: REGION_PRESETS.map((p) => ({ name: p.name, countries: p.countries.map(countryName) })),
    countries: Object.values(ds.countries).map((c) => ({ code: c.iso2, name: c.name })),
    interests: INTERESTS,
    passports: ds.visa.passports,
    paces: ['chill', 'balanced', 'fast'],
    budgets: ['shoestring', 'backpacker', 'midrange', 'comfort'],
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
  if (args.pace !== undefined) {
    if (!['chill', 'balanced', 'fast'].includes(String(args.pace))) throw new ToolError('pace must be chill, balanced or fast')
    patch.pace = args.pace as Pace
  }
  if (args.budget !== undefined) {
    if (!['shoestring', 'backpacker', 'midrange', 'comfort'].includes(String(args.budget))) throw new ToolError('Unknown budget')
    patch.budget = args.budget as Budget
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
    const preset = REGION_PRESETS.find((p) => key(p.name) === key(String(args.preset)))
    if (!preset) throw new ToolError(`Unknown preset. Presets: ${REGION_PRESETS.map((p) => p.name).join(', ')}`)
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
  setInput({ groups: [...input.groups, makeGroup(ds, name, fresh, Boolean(args.longer))] })
  return `Added region ${name}`
}

function updateRegion(args: Args): string {
  const g = findRegion(args.region)
  const { input, setInput } = useTrip.getState()
  if (args.remove) {
    setInput({ groups: input.groups.filter((x) => x.id !== g.id) })
    return `Removed region ${g.name}`
  }
  if (args.longer === undefined) throw new ToolError('Nothing to change')
  setInput({ groups: input.groups.map((x) => (x.id === g.id ? { ...x, longer: Boolean(args.longer) } : x)) })
  return `${g.name}: ${args.longer ? 'longer' : 'normal'} stay`
}

function setCountryMode(args: Args): string {
  const iso2 = countryCode(args.country)
  const mode = String(args.mode)
  if (!['must', 'optional', 'excluded'].includes(mode)) throw new ToolError('mode must be must, optional or excluded')
  const { input, setInput } = useTrip.getState()
  if (!input.groups.some((g) => g.countries.some((c) => c.iso2 === iso2))) throw new ToolError(`${countryName(iso2)} is in no region; add it with add_region first`)
  setInput({ groups: input.groups.map((g) => ({ ...g, countries: g.countries.map((c) => (c.iso2 === iso2 ? { ...c, mode: mode as 'must' } : c)) })) })
  return `${countryName(iso2)}: ${mode}`
}

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
    case 'update_settings': return updateSettings(args)
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

// ---------------------------------------------------------------- what changed (shown under the reply, with Undo)

export type TripSnapshot = { input: TripInput; stops: Stop[] }

export const snapshot = (): TripSnapshot => {
  const { input, stops } = useTrip.getState()
  return structuredClone({ input, stops })
}

/** Plain-language list of differences between two versions of the trip. */
export function describeChanges(before: TripSnapshot, after: TripSnapshot): string[] {
  const out: string[] = []
  const a = before.input
  const b = after.input
  if (a.startDate !== b.startDate || a.endDate !== b.endDate) out.push(`Dates: ${a.startDate} – ${a.endDate} → ${b.startDate} – ${b.endDate}`)
  if (a.pace !== b.pace) out.push(`Pace: ${a.pace} → ${b.pace}`)
  if (a.budget !== b.budget) out.push(`Budget: ${a.budget} → ${b.budget}`)
  if (a.passport !== b.passport) out.push(`Passport: ${a.passport} → ${b.passport}`)
  if (a.interests.join() !== b.interests.join()) out.push(`Interests: ${b.interests.join(', ') || 'none'}`)
  if (a.startCityId !== b.startCityId) out.push(`Start city: ${b.startCityId ? cityName(b.startCityId) : 'any'}`)
  if (a.endCityId !== b.endCityId) out.push(`End city: ${b.endCityId ? cityName(b.endCityId) : 'any'}`)
  if (a.keepGroupOrder !== b.keepGroupOrder) out.push(`Visit regions in order: ${b.keepGroupOrder ? 'yes' : 'no'}`)
  for (const g of b.groups) {
    const old = a.groups.find((x) => x.id === g.id)
    if (!old) { out.push(`Added region ${g.name}`); continue }
    if (old.longer !== g.longer) out.push(`${g.name}: ${g.longer ? 'longer stay' : 'normal stay'}`)
    for (const c of g.countries) {
      const was = old.countries.find((x) => x.iso2 === c.iso2)?.mode
      if (was && was !== c.mode) out.push(`${countryName(c.iso2)}: ${was} → ${c.mode}`)
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
