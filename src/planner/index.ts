import { allocate, type AllocItem } from './allocate'
import { dailyCost, dayChoices, dayCost } from './cost'
import { addDays, daysBetween, monthOf } from './dates'
import { AIRPORT_MIN, buildGraph, legBetween, travelWeight, type Graph } from './graph'
import { TAP_WATER_LABELS, airBand, tapWater } from './health'
import { ENGLISH_LABELS, englishLevel } from './language'
import { CARD_LABELS, cardLevel } from './payments'
import { orderRoute } from './route'
import { SCHENGEN_LIMIT, schengenApplies, schengenSummary } from './schengen'
import type { Dataset, Leg, Pace, Plan, PlanWarning, ScheduledStop, Stop, TripInput } from './types'

export * from './types'
export { COST_HINTS, COST_KINDS, MEAL_HINTS, GROCERY_KEYS, comparePrices, costOf, costProfile, costSanity, costsInEur, dailyCost, dayChoices, dayCost, estimatedCosts, groceryDay, groceryMeal, prefsDay, type CostInput, type CostItem, type CostKind } from './cost'
export { schengenApplies } from './schengen'
export { ENGLISH_LABELS, englishLevel } from './language'
export { RENTAL_INFO, TRANSIT_LABELS, taxiEstimate } from './transport'
export { AIR_BANDS, TAP_WATER_LABELS, airBand, tapWater, vaccinesFor } from './health'
export { CARD_LABELS, cardLevel } from './payments'
export { PHRASES, phrasesFor } from './phrases'
export { MOBILE_BANDS, mobileInternet } from './mobile'
export { DEFAULT_PREFS, DEFAULT_TEMP_BREAKS, STYLES, matchesStyle, stylePrefs, tidyBreaks, withPrefs } from './prefs'
export { NEARBY_BANDS, nearby, nearbyLevel, roughCount, roughKm } from './nearby'
export { addDays, daysBetween, monthOf, tripDay } from './dates'
export { AIRPORT_MIN } from './graph'

const PACE_MULT: Record<Pace, number> = { chill: 1.4, balanced: 1, fast: 0.7 }
const LONG_LEG_MIN: Record<Pace, number> = { chill: 240, balanced: 300, fast: 420 }

type Ctx = {
  ds: Dataset
  input: TripInput
  graph: Graph
  totalNights: number
  groupIndex: Map<string, number> // iso2 → group index
  candidates: string[]
  required: Set<string>
  blocked: { iso2: string; reason: string }[]
  /** Each candidate's daily cost on the trip's travel style, relative to the median candidate (1 = typical). */
  costRatio: Map<string, number>
  /** The days asked for in places: countries and regions with a fewest or a most set. */
  areas: Area[]
}

/** A country or a region with the days asked for there: the fewest and most nights at its stops, all told. */
type Area = { name: string; countries: Set<string>; min: number; max: number; iso2?: string }
const areaOf = (name: string, countries: string[], r: { minDays?: number | null; maxDays?: number | null }, iso2?: string): Area =>
  ({ name, countries: new Set(countries), min: r.minDays || 0, max: Math.max(r.minDays || 0, r.maxDays || Infinity), iso2 })

// ---------------------------------------------------------------- context

function makeContext(ds: Dataset, input: TripInput, extraCities: string[] = []): Ctx {
  const groupIndex = new Map<string, number>()
  const areas: Area[] = []
  const blocked: Ctx['blocked'] = []
  const mustCountries: string[] = []
  const groupCountries: string[][] = input.groups.map(() => [])
  input.groups.forEach((g, gi) => {
    for (const c of g.countries) {
      if (c.mode === 'excluded' || groupIndex.has(c.iso2)) continue
      if (ds.visa.rules[input.passport]?.[c.iso2]?.req === 'no_admission') {
        blocked.push({ iso2: c.iso2, reason: 'not admitted on this passport' })
        continue
      }
      groupIndex.set(c.iso2, input.keepGroupOrder ? gi : 0)
      if (c.minDays || c.maxDays) areas.push(areaOf(ds.countries[c.iso2]?.name ?? c.iso2, [c.iso2], c, c.iso2))
      groupCountries[gi].push(c.iso2)
      if (c.mode === 'must') mustCountries.push(c.iso2)
    }
    if ((g.minDays || g.maxDays) && groupCountries[gi].length) areas.push(areaOf(g.name, groupCountries[gi], g))
  })
  // Cities added by hand from other countries join the last group.
  const lastGroup = input.keepGroupOrder ? Math.max(0, input.groups.length - 1) : 0
  for (const id of extraCities) {
    const iso2 = ds.cities[id]?.iso2
    if (iso2 && !groupIndex.has(iso2)) groupIndex.set(iso2, lastGroup)
  }

  const candidates = Object.values(ds.cities).filter((c) => groupIndex.has(c.iso2)).map((c) => c.id)
  const graph = buildGraph(ds, new Set(candidates))
  const totalNights = Math.max(1, daysBetween(input.startDate, input.endDate))

  const required = new Set<string>()
  for (const id of [...input.mustCities, input.startCityId, input.endCityId]) {
    if (id && candidates.includes(id)) required.add(id)
  }
  const daily = candidates.map((id) => dailyCost(ds, id, input)).filter((d) => d > 0).sort((a, b) => a - b)
  const median = daily[daily.length >> 1] || 1
  const costRatio = new Map(candidates.map((id) => [id, (dailyCost(ds, id, input) || median) / median]))
  const ctx: Ctx = { ds, input, graph, totalNights, groupIndex, candidates, required, blocked, costRatio, areas }
  const requireBestIn = (countries: string[]) => {
    if ([...required].some((id) => countries.includes(ds.cities[id].iso2))) return
    const best = candidates.filter((id) => countries.includes(ds.cities[id].iso2)).sort((a, b) => baseScore(ctx, b) - baseScore(ctx, a))[0]
    if (best) required.add(best)
  }
  for (const iso2 of mustCountries) requireBestIn([iso2])
  // Every region the user added is visited, even when all its countries are optional; a country added on its own as
  // optional is the planner's choice (one marked must visit is required above).
  groupCountries.forEach((countries, gi) => {
    if (input.groups[gi].countries.length > 1) requireBestIn(countries)
  })
  return ctx
}

/** The countries the app has cities in. */
const covered = new WeakMap<Dataset, Set<string>>()
export function citiesIn(ds: Dataset): Set<string> {
  let set = covered.get(ds)
  if (!set) covered.set(ds, (set = new Set(Object.values(ds.cities).map((c) => c.iso2))))
  return set
}

const groupOf = (ctx: Ctx, cityId: string) => ctx.groupIndex.get(ctx.ds.cities[cityId].iso2) ?? 0
const isoOf = (ctx: Ctx, cityId: string) => ctx.ds.cities[cityId].iso2
const inSchengen = (ctx: Ctx, cityId: string) => !!ctx.ds.countries[ctx.ds.cities[cityId].iso2]?.schengen

// ---------------------------------------------------------------- scoring

/** Daily cost this far above the trip's typical one counts as expensive (for the "expensive places" preference). */
const EXPENSIVE = 1.3

function baseScore(ctx: Ctx, cityId: string): number {
  const city = ctx.ds.cities[cityId]
  const { interests, prefs } = ctx.input
  const match = interests.length ? city.tags.filter((t) => interests.includes(t)).length / Math.min(2, interests.length) : 1
  // "Top highlights" weighs popularity more, so famous places win over pleasant smaller ones.
  const popular = (city.popularity / 5) ** (prefs.focus === 'highlights' ? 2.5 : 1)
  const expensive = prefs.expensive === 'skip' && (ctx.costRatio.get(cityId) ?? 1) > EXPENSIVE ? 0.3 : 1
  return popular * (0.6 + 0.4 * Math.min(1, match)) * expensive
}

function score(ctx: Ctx, cityId: string, month: number): number {
  const m = ctx.ds.climate[cityId]?.[month - 1]
  if (!m) return baseScore(ctx, cityId)
  const { tempBreaks: [cool, , , hot], avoidCold, avoidHot, avoidRain } = ctx.input.prefs
  // Months the traveller avoids (cold or hot by their temperature bands, rainy) count more than the general comfort score.
  const limits = ((avoidCold && m.tHigh < cool) || (avoidHot && m.tHigh >= hot) ? 0.35 : 1) * (avoidRain && m.rainDays >= 14 ? 0.6 : 1)
  return baseScore(ctx, cityId) * (0.5 + 0.5 * m.comfort) * limits
}

/** First guess of when each group is visited: time split evenly. */
function guessMonths(ctx: Ctx): Map<string, number> {
  const n = ctx.input.keepGroupOrder ? ctx.input.groups.length : 1
  const months = new Map<string, number>()
  for (const id of ctx.candidates) {
    const mid = ((groupOf(ctx, id) + 0.5) / n) * ctx.totalNights
    months.set(id, monthOf(addDays(ctx.input.startDate, Math.round(mid))))
  }
  return months
}

// ---------------------------------------------------------------- nights

function arrivalPenalty(leg: Leg | undefined, pace: Pace): number {
  if (!leg || leg.overnight) return 0
  if (leg.durationMin > LONG_LEG_MIN[pace]) return 1
  return leg.durationMin > 180 ? 0.5 : 0
}

function allocItem(ctx: Ctx, stop: Stop, legIn: Leg | undefined, s: number): AllocItem {
  const city = ctx.ds.cities[stop.cityId]
  const pace = PACE_MULT[ctx.input.pace]
  const pen = arrivalPenalty(legIn, ctx.input.pace)
  // "Shorter stays in expensive places": fewer nights the pricier a place is, down to 60%.
  const ratio = ctx.costRatio.get(stop.cityId) ?? 1
  const thrift = ctx.input.prefs.expensive === 'shorter' && ratio > EXPENSIVE ? Math.max(0.6, 1 / ratio) : 1
  const base = Math.max(1, city.days.ideal * pace * thrift) + pen
  return {
    base,
    lo: Math.max(1, Math.round(city.days.min * Math.min(1, pace))) + (pen >= 1 ? 1 : 0),
    // "Top highlights" lets famous places take longer stays instead of adding lesser-known ones.
    hi: Math.max(base, city.days.max * (ctx.input.pace === 'chill' ? 1.3 : 1) * (ctx.input.prefs.focus === 'highlights' && city.popularity > 3 ? 1.5 : 1) + pen),
    locked: stop.locked ? stop.nights : null,
    spill: (city.longStay ? 3 : 1) * s,
  }
}

let everywhere: { ds: Dataset; graph: Graph } | null = null

/** The best way between any two cities in the app, through any others (the planner's routing, without its region limits). */
export function routeBetween(ds: Dataset, from: string, to: string): Leg {
  if (everywhere?.ds !== ds) everywhere = { ds, graph: buildGraph(ds, new Set(Object.keys(ds.cities))) }
  return legBetween(everywhere.graph, from, to)
}

/** Great-circle distance in km. */
function kmBetween(ds: Dataset, a: string, b: string): number {
  const [p, q] = [ds.cities[a], ds.cities[b]]
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(q.lat - p.lat) / 2) ** 2 + Math.cos(r(p.lat)) * Math.cos(r(q.lat)) * Math.sin(r(q.lon - p.lon) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/**
 * Getting between home and a city of the trip. Long-haul flights aren't in the connection data, so unless the app
 * has a reasonable route this is an estimated flight: ~800 km/h plus take-off and landing, one change on very long
 * flights, and a fare range that grows with distance (one way, economy).
 */
export function homeLeg(ds: Dataset, from: string, to: string): Leg {
  const km = kmBetween(ds, from, to)
  const changes = km > 7000 ? 1 : 0
  const air = Math.round((km / 800) * 60 + 30 + changes * 180)
  const hop = {
    from, to, mode: 'flight', durationMin: air, priceMin: Math.round(60 + 0.045 * km), priceMax: Math.round(120 + 0.09 * km),
    overnight: air > 8 * 60, estimated: true, note: changes ? 'Usually with one change' : undefined,
  }
  const flight: Leg = { from, to, hops: [hop], durationMin: air + AIRPORT_MIN, priceMin: hop.priceMin, priceMax: hop.priceMax, overnight: hop.overnight, estimated: true, reachable: true }
  const routed = routeBetween(ds, from, to)
  return routed.reachable && routed.durationMin <= flight.durationMin * 1.5 ? routed : flight
}

/** The month a stop is mostly in: the month of the middle night (used for its weather). */
export const stayMonth = (s: Pick<ScheduledStop, 'arrive' | 'nights'>) => monthOf(addDays(s.arrive, Math.floor(s.nights / 2)))

/**
 * The month you'd likely be at a city on this trip: its own stay if it's a stop, else the stay at the nearest stop
 * (where you'd be when passing close by), else the trip's start month.
 */
export function likelyMonth(ds: Dataset, plan: Plan | null, input: Pick<TripInput, 'startDate'>, cityId: string): number {
  const stops = plan?.stops ?? []
  const own = stops.find((s) => s.cityId === cityId)
  if (own) return stayMonth(own)
  const c = ds.cities[cityId]
  if (!c || !stops.length) return monthOf(input.startDate)
  const dist = (id: string) => {
    const o = ds.cities[id]
    const dx = (o.lon - c.lon) * Math.cos((c.lat * Math.PI) / 180)
    return dx * dx + (o.lat - c.lat) ** 2
  }
  return stayMonth(stops.reduce((best, s) => (dist(s.cityId) < dist(best.cityId) ? s : best)))
}

/**
 * Suggested days in a city for each pace, before travel time is taken into account: the same starting point the
 * planner uses when it assigns nights.
 */
export function suggestedDays(ds: Dataset, cityId: string): Record<Pace, number> {
  const city = ds.cities[cityId]
  const days = (pace: Pace) => {
    const mult = PACE_MULT[pace]
    const lo = Math.max(1, Math.round(city.days.min * Math.min(1, mult)))
    const hi = city.days.max * (pace === 'chill' ? 1.3 : 1)
    return Math.max(1, Math.round(Math.min(hi, Math.max(lo, city.days.ideal * mult))))
  }
  return { chill: days('chill'), balanced: days('balanced'), fast: days('fast') }
}

const legsFor = (ctx: Ctx, stops: Stop[]) => stops.slice(1).map((s, i) => legBetween(ctx.graph, stops[i].cityId, s.cityId))

function schedule(ctx: Ctx, stops: Stop[], legs: Leg[]): ScheduledStop[] {
  let date = ctx.input.startDate
  return stops.map((s, i) => {
    const arrive = date
    const depart = addDays(arrive, s.nights)
    date = addDays(depart, legs[i]?.overnight ? 1 : 0)
    return { ...s, arrive, depart }
  })
}

const availableNights = (ctx: Ctx, legs: Leg[]) => ctx.totalNights - legs.filter((l) => l.overnight).length

/** Cheapest place to insert a city without breaking group order. */
function insertCheapest(ctx: Ctx, stops: Stop[], cityId: string, groupId: string): Stop[] {
  const g = groupOf(ctx, cityId)
  const w = (a: string, b: string) => travelWeight(ctx.graph, a, b)
  let best = -1
  let bestCost = Infinity
  for (let pos = 0; pos <= stops.length; pos++) {
    const prev = stops[pos - 1]
    const next = stops[pos]
    if (prev && groupOf(ctx, prev.cityId) > g) continue
    if (next && groupOf(ctx, next.cityId) < g) continue
    if (pos === 0 && ctx.input.startCityId && stops.length) continue
    if (pos === stops.length && ctx.input.endCityId && stops.length) continue
    const cost = (prev ? w(prev.cityId, cityId) : 0) + (next ? w(cityId, next.cityId) : 0) - (prev && next ? w(prev.cityId, next.cityId) : 0)
    if (cost < bestCost) { bestCost = cost; best = pos }
  }
  const out = [...stops]
  out.splice(best < 0 ? stops.length : best, 0, { cityId, nights: 1, locked: false, groupId })
  return out
}

const groupIdFor = (ctx: Ctx, cityId: string) => ctx.input.groups.find((g) => g.countries.some((c) => c.iso2 === ctx.ds.cities[cityId].iso2))?.id ?? ''

// ---------------------------------------------------------------- fitting

type Fit = { stops: Stop[]; dropped: string[] }

/** Adds/drops cities until the minimum and maximum stays fit the trip, then assigns nights. */
function fit(ctx: Ctx, initial: Stop[], scores: Map<string, number>, canChangeSet: boolean): Fit {
  let stops = initial
  const dropped: string[] = []
  const sc = (id: string) => scores.get(id) ?? baseScore(ctx, id)

  for (let iter = 0; iter < 80; iter++) {
    const legs = legsFor(ctx, stops)
    const avail = availableNights(ctx, legs)
    const items = stops.map((s, i) => allocItem(ctx, s, legs[i - 1], sc(s.cityId)))
    const loSum = items.reduce((t, x) => t + (x.locked ?? x.lo), 0)
    const hiSum = items.reduce((t, x) => t + (x.locked ?? x.hi), 0)

    if (canChangeSet && loSum > avail) {
      const droppable = stops.filter((s) => !s.locked && !ctx.required.has(s.cityId))
      if (droppable.length) {
        const worst = droppable.reduce((a, b) => (sc(a.cityId) <= sc(b.cityId) ? a : b))
        stops = stops.filter((s) => s !== worst)
        dropped.push(worst.cityId)
        continue
      }
    }
    if (canChangeSet && hiSum < avail && stops.length < stopRange(ctx).max) {
      const inPlan = new Set(stops.map((s) => s.cityId))
      const next = ctx.candidates
        .filter((id) => !inPlan.has(id) && !dropped.includes(id) && legBetween(ctx.graph, stops[0]?.cityId ?? id, id).reachable)
        .filter((id) => roomIn(ctx, stops, items, id))
        .filter((id) => ctx.input.prefs.focus !== 'highlights' || ctx.ds.cities[id].popularity > 3)
        .sort((a, b) => sc(b) - sc(a))[0]
      if (next) {
        stops = insertCheapest(ctx, stops, next, groupIdFor(ctx, next))
        continue
      }
    }
    const nights = allocate(items, avail)
    stops = keepAreaDays(ctx, stops.map((s, i) => ({ ...s, nights: nights[i] })), items)
    break
  }
  return { stops: enforceSchengen(ctx, stops, sc, canChangeSet, dropped), dropped }
}

const inArea = (ctx: Ctx, a: Area, cityId: string) => a.countries.has(isoOf(ctx, cityId))
const nightsIn = (ctx: Ctx, stops: Stop[], a: Area) => stops.reduce((t, s) => t + (inArea(ctx, a, s.cityId) ? s.nights : 0), 0)
const areasOf = (ctx: Ctx, cityId: string) => ctx.areas.filter((a) => inArea(ctx, a, cityId))
/** Whether a stop can give up a night without its country or region going under the days asked for there. */
const canGive = (ctx: Ctx, stops: Stop[], s: Stop) => areasOf(ctx, s.cityId).every((a) => nightsIn(ctx, stops, a) > a.min)
/** Whether a stop can take another night without its country or region going over the days asked for there. */
const canTake = (ctx: Ctx, stops: Stop[], s: Stop) => areasOf(ctx, s.cityId).every((a) => nightsIn(ctx, stops, a) < a.max)

/** Whether a city's country and region have room for another stop's shortest stay within the days asked for there. */
function roomIn(ctx: Ctx, stops: Stop[], items: AllocItem[], cityId: string): boolean {
  const areas = areasOf(ctx, cityId).filter((a) => a.max < Infinity)
  if (!areas.length) return true
  const lo = allocItem(ctx, { cityId, nights: 1, locked: false, groupId: '' }, undefined, 1).lo
  return areas.every((a) => stops.reduce((t, s, i) => t + (inArea(ctx, a, s.cityId) ? (items[i]?.locked ?? items[i]?.lo ?? 1) : 0), 0) + lo <= a.max)
}

/**
 * Moves nights between unlocked stops until each country's and region's days are within the range asked for there,
 * where the trip allows: a place over its most gives nights from its fullest stops to the least full ones elsewhere,
 * and one under its fewest takes them from the fullest stops elsewhere (never below a night, or past another place's
 * range).
 */
function keepAreaDays(ctx: Ctx, input: Stop[], items: AllocItem[]): Stop[] {
  if (!ctx.areas.length) return input
  const stops = input.map((s) => ({ ...s }))
  const fill = (s: Stop) => s.nights / items[stops.indexOf(s)].hi
  const fullest = (list: Stop[]) => list.reduce((a, b) => (fill(b) > fill(a) ? b : a))
  const emptiest = (list: Stop[]) => list.reduce((a, b) => (fill(b) < fill(a) ? b : a))
  const stuck = new Set<Area>()
  for (let iter = 0; iter < 2000; iter++) {
    const a = ctx.areas.find((x) => {
      if (stuck.has(x)) return false
      const n = nightsIn(ctx, stops, x)
      return n > x.max || (n > 0 && n < x.min)
    })
    if (!a) break
    const own = stops.filter((s) => !s.locked && inArea(ctx, a, s.cityId))
    const others = stops.filter((s) => !s.locked && !inArea(ctx, a, s.cityId))
    const over = nightsIn(ctx, stops, a) > a.max
    const from = (over ? own : others).filter((s) => s.nights > 1 && canGive(ctx, stops, s))
    const to = (over ? others : own).filter((s) => canTake(ctx, stops, s))
    if (!from.length || !to.length) {
      stuck.add(a)
      continue
    }
    fullest(from).nights--
    emptiest(to).nights++
  }
  return stops
}

/** Moves nights from Schengen stops to non-Schengen stops until the 90/180 rule holds. */
function enforceSchengen(ctx: Ctx, input: Stop[], sc: (id: string) => number, canChangeSet: boolean, dropped: string[]): Stop[] {
  if (!schengenApplies(ctx.ds, ctx.input.passport)) return input
  let stops = input.map((s) => ({ ...s }))
  for (let iter = 0; iter < 400; iter++) {
    const legs = legsFor(ctx, stops)
    const sum = schengenSummary(ctx.ds, schedule(ctx, stops, legs), ctx.input.passport, ctx.input.schengenDaysBefore)
    if (sum.maxInWindow <= SCHENGEN_LIMIT) break

    // Nights go outside Schengen, to countries with room for them, else to a new stop, else over a country's most
    // (the visa rules come first).
    const outside = stops.filter((s) => !s.locked && !inSchengen(ctx, s.cityId))
    let receivers = outside.filter((s) => canTake(ctx, stops, s))
    if (!receivers.length && canChangeSet) {
      const inPlan = new Set(stops.map((s) => s.cityId))
      const room = (id: string) => areasOf(ctx, id).every((a) => nightsIn(ctx, stops, a) < a.max)
      const extra = ctx.candidates.filter((id) => !inPlan.has(id) && !inSchengen(ctx, id) && room(id)).sort((a, b) => sc(b) - sc(a))[0]
      if (extra) {
        stops = insertCheapest(ctx, stops, extra, groupIdFor(ctx, extra))
        stops = takeNight(stops, stops.find((s) => s.cityId === extra)!) ?? stops
        continue
      }
    }
    if (!receivers.length) receivers = outside
    if (!receivers.length) break

    const donors = stops
      .map((s, i) => ({ s, item: allocItem(ctx, s, legs[i - 1], sc(s.cityId)) }))
      .filter(({ s, item }) => !s.locked && inSchengen(ctx, s.cityId) && s.nights > item.lo && canGive(ctx, stops, s))
    if (!donors.length) {
      const droppable = stops.filter((s) => !s.locked && inSchengen(ctx, s.cityId) && !ctx.required.has(s.cityId))
      if (!canChangeSet || !droppable.length) break
      const worst = droppable.reduce((a, b) => (sc(a.cityId) <= sc(b.cityId) ? a : b))
      const freed = worst.nights
      stops = stops.filter((s) => s !== worst)
      dropped.push(worst.cityId)
      receivers = stops.filter((s) => !s.locked && !inSchengen(ctx, s.cityId) && canTake(ctx, stops, s))
      if (!receivers.length) receivers = stops.filter((s) => !s.locked && !inSchengen(ctx, s.cityId))
      if (!receivers.length) break
      for (let k = 0; k < freed; k++) pickReceiver(ctx, receivers, legs, sc).nights++
      continue
    }
    // Take a night from the fullest, lowest-scoring Schengen stop.
    const give = (d: (typeof donors)[number]) => d.s.nights / d.item.hi / sc(d.s.cityId)
    donors.sort((a, b) => give(b) - give(a))
    donors[0].s.nights--
    pickReceiver(ctx, receivers, legs, sc).nights++
  }
  return stops
}

function pickReceiver(ctx: Ctx, receivers: Stop[], legs: Leg[], sc: (id: string) => number): Stop {
  return receivers.reduce((best, s) => {
    const fill = (x: Stop) => x.nights / (allocItem(ctx, x, legs[0], sc(x.cityId)).hi * (ctx.ds.cities[x.cityId].longStay ? 1.5 : 1))
    return fill(s) < fill(best) ? s : best
  })
}

/** Gives a newly inserted stop one night, taken from the longest unlocked Schengen stop. */
function takeNight(stops: Stop[], target: Stop): Stop[] | null {
  const donor = stops.filter((s) => s !== target && !s.locked && s.nights > 1).sort((a, b) => b.nights - a.nights)[0]
  if (!donor) return null
  return stops.map((s) => (s === donor ? { ...s, nights: s.nights - 1 } : s === target ? { ...s, nights: 1 } : s))
}

// ---------------------------------------------------------------- public API

/**
 * Builds a full plan from the trip input: picks cities, orders them and assigns nights. With flexible dates it plans
 * for the dates asked for, then moves the end (and if that's not enough, the start) by up to the days allowed so the
 * trip is as long as its stops' suggested stays add up to, rather than stretching or squeezing them, and plans again
 * for those dates. (Trying every pair of dates would take seconds: each plan takes a few hundred ms.)
 */
export function generatePlan(ds: Dataset, input: TripInput): Plan {
  const { flex } = input
  if (!flex || (!flex.startDays && !flex.endDays)) return planFor(makeContext(ds, input))
  const asked = { ...input, startDate: flex.start, endDate: flex.end }
  const ctx = makeContext(ds, asked)
  const first = planFor(ctx)
  // The stops' suggested stays, each country's and then each region's kept within the days asked for there.
  const within = (n: number, a?: Area) => (a ? Math.max(a.min, Math.min(a.max, n)) : n)
  const byCountry = new Map<string, number>()
  first.stops.forEach((s, i) => byCountry.set(isoOf(ctx, s.cityId), (byCountry.get(isoOf(ctx, s.cityId)) ?? 0) + allocItem(ctx, s, first.legs[i - 1], 0).base))
  for (const [iso2, n] of byCountry) byCountry.set(iso2, within(n, ctx.areas.find((a) => a.iso2 === iso2)))
  let stays = 0
  for (const a of ctx.areas.filter((x) => !x.iso2)) {
    stays += within([...a.countries].reduce((t, iso2) => t + (byCountry.get(iso2) ?? 0), 0), a)
    a.countries.forEach((iso2) => byCountry.delete(iso2))
  }
  for (const n of byCountry.values()) stays += n
  const wanted = Math.round(stays) + first.legs.filter((l) => l.overnight).length
  const clamp = (n: number, d: number) => Math.max(-d, Math.min(d, n))
  // More nights wanted: end later, then start earlier; fewer: end earlier, then start later.
  let diff = wanted - ctx.totalNights
  const endMove = clamp(diff, flex.endDays)
  diff -= endMove
  const startMove = -clamp(diff, flex.startDays)
  const startDate = addDays(flex.start, startMove)
  const endDate = addDays(flex.end, endMove)
  if ((!startMove && !endMove) || daysBetween(startDate, endDate) < 1) return first
  return planFor(makeContext(ds, { ...input, startDate, endDate }))
}

/** The most days a flexible date may move either way. */
export const MAX_FLEX_DAYS = 14

/** The dates to set when the traveller enters new ones: with flexible dates, those are the dates asked for. */
export function withDates(input: TripInput, startDate: string, endDate: string): Pick<TripInput, 'startDate' | 'endDate' | 'flex'> {
  return { startDate, endDate, flex: input.flex && { ...input.flex, start: startDate, end: endDate } }
}

export const MAX_STOPS = 200
/** The most days that can be asked for in one country. */
export const MAX_COUNTRY_DAYS = 365

function planFor(ctx: Ctx): Plan {
  const { input } = ctx
  let months = guessMonths(ctx)
  let result: Fit = { stops: [], dropped: [] }

  for (let pass = 0; pass < 2; pass++) {
    const scores = new Map(ctx.candidates.map((id) => [id, score(ctx, id, months.get(id) ?? monthOf(input.startDate))]))
    const chosen = select(ctx, scores)
    const ordered = orderRoute(
      ctx.graph,
      chosen.map((id) => ({ cityId: id, group: groupOf(ctx, id) })),
      input.startCityId,
      input.endCityId,
    )
    const stops = ordered.map((x) => ({ cityId: x.cityId, nights: 1, locked: false, groupId: groupIdFor(ctx, x.cityId) }))
    result = fit(ctx, stops, scores, true)
    // Fitting may add or drop cities; re-order the final set, then re-fit nights without changing it.
    const reordered = orderRoute(
      ctx.graph,
      result.stops.map((s) => ({ cityId: s.cityId, group: groupOf(ctx, s.cityId) })),
      input.startCityId,
      input.endCityId,
    ).map((x) => result.stops.find((s) => s.cityId === x.cityId)!)
    result = { stops: fit(ctx, reordered, scores, false).stops, dropped: result.dropped }

    // Second pass: score cities by the month we now expect to be there.
    const sched = schedule(ctx, result.stops, legsFor(ctx, result.stops))
    const byGroup = new Map<number, number>()
    for (const s of sched) {
      const m = stayMonth(s)
      months.set(s.cityId, m)
      if (!byGroup.has(groupOf(ctx, s.cityId))) byGroup.set(groupOf(ctx, s.cityId), m)
    }
    months = new Map(ctx.candidates.map((id) => [id, months.get(id) ?? byGroup.get(groupOf(ctx, id)) ?? monthOf(input.startDate)]))
  }
  return evaluate(ctx, result.stops, result.dropped)
}

/** Keeps the user's stops and order; re-assigns nights to unlocked stops. */
export function rebalance(ds: Dataset, input: TripInput, stops: Stop[]): Plan {
  const ctx = makeContext(ds, input, stops.map((s) => s.cityId))
  const res = fit(ctx, stops, new Map(), false)
  return evaluate(ctx, res.stops, [])
}

/** Re-orders the user's current stops for the shortest route, then rebalances. */
export function reoptimize(ds: Dataset, input: TripInput, stops: Stop[]): Plan {
  const ctx = makeContext(ds, input, stops.map((s) => s.cityId))
  const ordered = orderRoute(ctx.graph, stops.map((s) => ({ cityId: s.cityId, group: groupOf(ctx, s.cityId) })), input.startCityId, input.endCityId)
  const byId = new Map(stops.map((s) => [s.cityId, s]))
  return rebalance(ds, input, ordered.map((x) => byId.get(x.cityId)!))
}

/** Adds a city where it fits best in the route, with its usual stay at the trip's pace; the other stops stay as they
 *  are (the trip may then have more nights than its dates, until the plan is updated). */
export function addStop(ds: Dataset, input: TripInput, stops: Stop[], cityId: string): Plan {
  const ctx = makeContext(ds, input, [...stops.map((s) => s.cityId), cityId])
  const nights = suggestedDays(ds, cityId)[input.pace]
  return evaluate(ctx, insertCheapest(ctx, stops, cityId, groupIdFor(ctx, cityId)).map((s) => (s.cityId === cityId ? { ...s, nights } : s)), [])
}

/** Dates, legs, warnings and costs for stops exactly as given (no changes). */
export function evaluatePlan(ds: Dataset, input: TripInput, stops: Stop[]): Plan {
  return evaluate(makeContext(ds, input, stops.map((s) => s.cityId)), stops, [])
}

/** A country's days asked for, as words: "5–7 days", "at least 5 days", "at most 7 days". */
export function dayRangeText(r: { min?: number | null; max?: number | null }): string {
  const max = r.max === Infinity ? null : r.max
  if (r.min && max) return r.min === max ? `${max} days` : `${r.min}–${max} days`
  return r.min ? `at least ${r.min} days` : max ? `at most ${max} days` : 'any number of days'
}

/** The trip's range of stops, made consistent: at most one stop per night, and the minimum no higher than the maximum. */
function stopRange(ctx: Ctx): { min: number; max: number } {
  const max = Math.min(ctx.input.maxStops || Infinity, ctx.totalNights)
  return { min: Math.min(ctx.input.minStops || 0, max), max }
}

function select(ctx: Ctx, scores: Map<string, number>): string[] {
  const pace = PACE_MULT[ctx.input.pace]
  const range = stopRange(ctx)
  const { focus } = ctx.input.prefs
  // "More countries" plans shorter stays, so more places fit.
  const short = focus === 'countries' ? 0.75 : 1
  const cost = (id: string) => Math.max(1, ctx.ds.cities[id].days.ideal * pace * short) + 0.5
  const chosen = [...ctx.required]
  let used = chosen.reduce((s, id) => s + cost(id), 0)
  const rest = ctx.candidates.filter((id) => !ctx.required.has(id)).sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0))
  // The days asked for in a country or region: no more cities there than fit its most (though always one), and more
  // cities in one visited for fewer days than its fewest.
  const taken = (a: Area) => chosen.filter((id) => inArea(ctx, a, id)).reduce((t, id) => t + cost(id), 0)
  const full = (id: string) => areasOf(ctx, id).some((a) => {
    const now = taken(a)
    return now > 0 && now + cost(id) > a.max
  })
  const fillAreas = () => {
    for (const a of ctx.areas) {
      for (const id of rest) {
        const now = taken(a)
        if (!now || now >= a.min || chosen.length >= range.max) break
        if (inArea(ctx, a, id) && !chosen.includes(id) && !full(id)) {
          chosen.push(id)
          used += cost(id)
        }
      }
    }
  }
  fillAreas()
  if (focus === 'countries') {
    // Best city in each country not yet visited first, then the rest by score.
    const countries = new Set(chosen.map((id) => ctx.ds.cities[id].iso2))
    for (const id of rest) {
      const iso2 = ctx.ds.cities[id].iso2
      if (chosen.length >= range.max) break
      if (countries.has(iso2) || used + cost(id) > ctx.totalNights || full(id)) continue
      chosen.push(id)
      countries.add(iso2)
      used += cost(id)
    }
  }
  for (const id of rest) {
    if (chosen.length >= range.max) break
    if (chosen.includes(id) || used + cost(id) > ctx.totalNights || full(id)) continue
    // "Top highlights" leaves out lesser-known places (unless picked by hand), giving their time to the famous ones.
    if (focus === 'highlights' && ctx.ds.cities[id].popularity <= 3) continue
    chosen.push(id)
    used += cost(id)
  }
  fillAreas()
  // Fewer stops than the minimum: add the next best places anyway; every stop then gets a shorter stay.
  for (const id of rest) {
    if (chosen.length >= range.min) break
    if (!chosen.includes(id) && !full(id)) chosen.push(id)
  }
  return chosen
}

// ---------------------------------------------------------------- evaluation

function evaluate(ctx: Ctx, stops: Stop[], dropped: string[]): Plan {
  const { ds, input } = ctx
  const legs = legsFor(ctx, stops)
  const sched = schedule(ctx, stops, legs)
  const schengen = schengenSummary(ds, sched, input.passport, input.schengenDaysBefore)
  const warnings: PlanWarning[] = []
  const assignedNights = stops.reduce((s, x) => s + x.nights, 0) + legs.filter((l) => l.overnight).length

  // Time
  if (assignedNights !== ctx.totalNights) {
    const diff = ctx.totalNights - assignedNights
    warnings.push({
      kind: 'time', severity: 'warn',
      title: diff > 0 ? `${diff} night${diff > 1 ? 's' : ''} not assigned` : `${-diff} night${diff < -1 ? 's' : ''} over the trip length`,
      detail: 'Press Update plan to fit the stops to your dates.',
    })
  }

  // Schengen
  if (schengen.applies && schengen.maxInWindow > SCHENGEN_LIMIT) {
    warnings.push({
      kind: 'schengen', severity: 'error',
      title: `Schengen limit exceeded: ${schengen.maxInWindow}/${SCHENGEN_LIMIT} days`,
      detail: `You would pass 90 days in a 180-day window on ${schengen.firstViolation}. Spend more time outside the Schengen area.`,
    })
  }

  // Visa, advisories and notices per country (in visiting order)
  const countries = [...new Set(sched.map((s) => ds.cities[s.cityId].iso2))]
  for (const iso2 of countries) {
    const country = ds.countries[iso2]
    const rule = ds.visa.rules[input.passport]?.[iso2]
    const days = sched.filter((s) => ds.cities[s.cityId].iso2 === iso2).reduce((t, s) => t + s.nights + 1, 0)
    const reqText: Record<string, string> = {
      e_visa: 'needs an e-visa', eta: 'needs an electronic travel authorisation (ETA)',
      visa_on_arrival: 'visa on arrival', visa_required: 'needs a visa arranged in advance',
      no_admission: 'does not admit this passport', unknown: 'visa rules unknown',
    }
    if (rule && reqText[rule.req]) {
      warnings.push({
        kind: 'visa', severity: rule.req === 'no_admission' ? 'error' : rule.req === 'visa_on_arrival' ? 'info' : 'warn',
        iso2, title: `${country.name} ${reqText[rule.req]}`,
        detail: 'Check the official government website for current rules and processing times.',
      })
    }
    if (rule?.req === 'visa_free' && rule.days && !country.schengen && days > rule.days) {
      warnings.push({ kind: 'visa', severity: 'error', iso2, title: `${country.name}: ${days} days planned, visa-free stay is ${rule.days}` })
    }
    const adv = ds.advisories[iso2]
    if (adv?.excludedByDefault) {
      const who = [
        adv.alertStatus.includes('avoid_all_travel_to_whole_country') && 'UK FCDO',
        adv.us?.level === 4 && 'US State Dept',
      ].filter(Boolean).join(' and ')
      warnings.push({
        kind: 'advisory', severity: 'error', iso2, url: adv.url,
        title: `${who} advise${who.includes(' and ') ? '' : 's'} against all travel to ${country.name}`,
        detail: 'Travel insurance may not cover you. Read the full advice before going.',
      })
    } else if (adv) {
      const notes = [
        adv.alertStatus.some((x) => x.endsWith('_to_parts')) && 'UK FCDO advises against travel to parts of the country',
        adv.us && adv.us.level >= 2 && `US: ${adv.us.title.split(': ')[1] ?? `level ${adv.us.level}`}`,
      ].filter(Boolean)
      if (notes.length) {
        warnings.push({ kind: 'advisory', severity: 'info', iso2, url: adv.url, title: `${country.name}: ${notes.join('; ')}` })
      }
    }
  }
  // Language: countries where getting by in English is hard
  for (const iso2 of countries) {
    const country = ds.countries[iso2]
    const hard = sched.filter((s) => ds.cities[s.cityId].iso2 === iso2 && englishLevel(ds, s.cityId).level <= 2)
    if (hard.length) {
      const worst = Math.min(...hard.map((s) => englishLevel(ds, s.cityId).level))
      const also = country.english.otherLanguages.length ? ` ${country.english.otherLanguages[0]} also helps.` : ''
      warnings.push({
        kind: 'language', severity: 'info', iso2, cityId: hard[0].cityId,
        title: `English is ${ENGLISH_LABELS[worst].short.toLowerCase()} in ${hard.map((s) => ds.cities[s.cityId].name).join(', ')}`,
        detail: `Get an offline translator app (${country.languages[0]}).${also} Script: ${country.english.script}.`,
      })
    }
  }
  // Health: tap water you shouldn't drink, and polluted air during the stay
  for (const iso2 of countries) {
    const water = sched.map((s) => s.cityId).filter((id) => ds.cities[id].iso2 === iso2).map((id) => tapWater(ds, id))
    const worst = water.find((w) => w?.level === 'bottled') ?? water.find((w) => w?.level === 'boil')
    if (worst) {
      warnings.push({ kind: 'health', severity: 'info', iso2, title: `${ds.countries[iso2].name}: ${TAP_WATER_LABELS[worst.level].short.toLowerCase()}`, detail: worst.note })
    }
  }
  // Malaria medicine has to be prescribed before the trip, so it's worth a reminder.
  for (const iso2 of countries) {
    if (ds.cdc[iso2]?.malaria) {
      warnings.push({
        kind: 'health', severity: 'info', iso2, url: ds.cdc[iso2].url,
        title: `${ds.countries[iso2].name}: malaria medicine for some areas`,
        detail: 'CDC recommends prescription medicine to prevent malaria in certain areas. See a travel clinic 4–6 weeks before going.',
      })
    }
  }
  for (const s of sched) {
    const month = stayMonth(s)
    const air = ds.air.byCity[s.cityId]?.[month - 1]
    if (air && air.pm25 > 25) {
      warnings.push({
        kind: 'health', severity: 'warn', cityId: s.cityId,
        title: `${ds.cities[s.cityId].name}: ${airBand(air.pm25).short.toLowerCase()} air quality (PM2.5 ~${Math.round(air.pm25)} µg/m³)`,
        detail: `About ${Math.round(air.daysOverWho)} days that month above the WHO daily guideline. Consider a mask if you have asthma or heart/lung conditions.`,
      })
    }
  }
  // Money: countries where foreign cards don't work, and stops where you mostly need cash
  for (const iso2 of countries) {
    const pay = ds.payments.countries[iso2]
    if (pay && !pay.foreignCardsWork) {
      warnings.push({ kind: 'money', severity: 'warn', iso2, title: `${ds.countries[iso2].name}: foreign bank cards don't work`, detail: pay.atm })
    }
  }
  const cashStops = sched.filter((s) => ds.payments.countries[ds.cities[s.cityId].iso2]?.foreignCardsWork !== false && cardLevel(ds, s.cityId).level <= 2)
  if (cashStops.length) {
    warnings.push({
      kind: 'money', severity: 'info', cityId: cashStops[0].cityId,
      title: `Mostly cash in ${cashStops.map((s) => ds.cities[s.cityId].name).join(', ')}`,
      detail: CARD_LABELS[2].long + '.',
    })
  }
  for (const b of ctx.blocked) {
    warnings.push({ kind: 'visa', severity: 'warn', iso2: b.iso2, title: `${ds.countries[b.iso2]?.name ?? b.iso2} left out: ${b.reason}` })
  }
  // Countries picked that the app has no cities in yet (it covers the world region by region).
  const uncovered = [...new Set(input.groups.flatMap((g) => g.countries.filter((c) => c.mode !== 'excluded').map((c) => c.iso2)))]
    .filter((iso2) => !citiesIn(ds).has(iso2))
  if (uncovered.length) {
    const names = uncovered.map((iso2) => ds.world[iso2] ?? iso2)
    warnings.push({
      kind: 'coverage', severity: 'warn',
      title: `No cities yet in ${names.length > 4 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ')}`,
      detail: `The app doesn't cover ${uncovered.length > 1 ? 'these countries' : 'this country'} yet, so the plan leaves ${uncovered.length > 1 ? 'them' : 'it'} out. ${uncovered.length > 1 ? 'They stay' : 'It stays'} in your trip for when it does.`,
    })
  }
  if (schengen.applies && sched.some((s) => inSchengen(ctx, s.cityId))) {
    for (const n of ds.notices) {
      const visaFree = ds.visa.rules[input.passport]?.PL?.req === 'visa_free'
      if (n.appliesTo === 'schengen-non-eu' || (n.appliesTo === 'schengen-visa-free' && visaFree)) {
        warnings.push({ kind: 'notice', severity: 'info', title: n.title, detail: n.text, url: n.url })
      }
    }
  }

  // Borders: Kosovo → Serbia when Kosovo was entered from elsewhere
  legs.forEach((leg, i) => {
    const path = [leg.from, ...leg.hops.map((h) => h.to)].map((id) => ds.cities[id].iso2)
    for (let k = 1; k < path.length; k++) {
      if (path[k - 1] === 'XK' && path[k] === 'RS') {
        const prevLeg = legs[i - 1]
        const enteredFrom = prevLeg ? ds.cities[prevLeg.from].iso2 : null
        if (enteredFrom !== 'RS') {
          warnings.push({
            kind: 'border', severity: 'warn', cityId: leg.to,
            title: 'Kosovo → Serbia crossing may be refused',
            detail: 'Serbia does not recognise entry into Kosovo from other countries. Go via North Macedonia or Montenegro instead.',
          })
        }
      }
    }
  })

  // Reachability and estimated legs
  legs.forEach((l) => {
    if (!l.reachable) {
      warnings.push({
        kind: 'unreachable', severity: 'error', cityId: l.to,
        title: `No known route ${ds.cities[l.from].name} → ${ds.cities[l.to].name}`,
        detail: 'Add a stop in between or reorder the trip.',
      })
    }
  })
  const estimated = legs.filter((l) => l.reachable && l.estimated).length
  if (estimated) {
    warnings.push({ kind: 'notice', severity: 'info', title: `${estimated} leg${estimated > 1 ? 's use' : ' uses'} estimated travel times`, detail: 'Based on road distance; no timetable data yet.' })
  }

  // Weather in the month of the stay
  for (const s of sched) {
    const m = ds.climate[s.cityId]?.[stayMonth(s) - 1]
    if (!m) continue
    const name = ds.cities[s.cityId].name
    // Hot and cold by the traveller's temperature bands; a warning when they avoid it, a note otherwise.
    const { tempBreaks: [cool, , , hot], avoidCold, avoidHot } = input.prefs
    if (m.tHigh >= hot) {
      warnings.push({ kind: 'weather', severity: avoidHot ? 'warn' : 'info', cityId: s.cityId, title: `${name}: hot`, tempC: m.tHigh })
    } else if (m.tHigh < cool) {
      warnings.push({ kind: 'weather', severity: avoidCold ? 'warn' : 'info', cityId: s.cityId, title: `${name}: cold`, tempC: m.tHigh })
    } else if (m.rainDays >= 14) {
      warnings.push({ kind: 'weather', severity: input.prefs.avoidRain ? 'warn' : 'info', cityId: s.cityId, title: `${name}: often wet (~${Math.round(m.rainDays)} days with rain that month)`, detail: 'Counts days with at least 1 mm; in summer these are often short showers.' })
    }
  }

  // The preferences: the daily budget, the most per night and expensive places, at each stop
  const { dailyBudget, maxPerNight, expensive, maxTravelHours, overnight } = input.prefs
  for (const s of sched) {
    const name = ds.cities[s.cityId].name
    const day = dayCost(ds, s.cityId, dayChoices(input, s.cityId))
    if (!day) continue
    const overBudget = !!dailyBudget && day.total > dailyBudget
    if (overBudget) {
      warnings.push({
        kind: 'budget', severity: 'warn', cityId: s.cityId, title: `${name}: over your daily budget`,
        amount: { eur: day.total, limitEur: dailyBudget, per: 'day' },
        detail: 'Cheaper day choices for this city, fewer nights here, or a cheaper place instead.',
      })
    }
    const bed = day.items.find((i) => i.key === 'bed')!.eur
    if (maxPerNight && bed > maxPerNight) {
      warnings.push({
        kind: 'budget', severity: 'warn', cityId: s.cityId, title: `${name}: ${dayChoices(input, s.cityId).bed === 'dorm' ? 'a dorm bed' : 'a private room'} is over your most per night`,
        amount: { eur: bed, limitEur: maxPerNight, per: 'night' },
      })
    }
    // Expensive places (well above the trip's typical day): skipped where optional, or shorter stays than usual.
    const ratio = ctx.costRatio.get(s.cityId) ?? 1
    if (!overBudget && ratio > EXPENSIVE && (expensive === 'skip' || (expensive === 'shorter' && s.nights > suggestedDays(ds, s.cityId)[input.pace]))) {
      warnings.push({
        kind: 'budget', severity: 'warn', cityId: s.cityId,
        title: `${name}: expensive, about ${Math.round((ratio - 1) * 100)}% above the trip's typical day`,
        detail: expensive === 'skip' ? 'You prefer to skip expensive places where they are optional.' : 'You prefer shorter stays in expensive places; this one is longer than its usual stay.',
      })
    }
  }
  // Travel days: longer than the longest you'd like, or overnight when you'd rather not
  legs.forEach((l, i) => {
    if (!l.reachable) return
    const route = `${ds.cities[l.from].name} → ${ds.cities[l.to].name}`
    if (l.overnight && !overnight) {
      warnings.push({ kind: 'travel', severity: 'warn', cityId: l.to, leg: i, title: `${route}: overnight, which you'd rather avoid`, detail: 'Another route or a stop in between.' })
    } else if (!l.overnight && maxTravelHours && l.durationMin > maxTravelHours * 60) {
      warnings.push({
        kind: 'travel', severity: 'warn', cityId: l.to, leg: i,
        title: `${route}: ${Math.round(l.durationMin / 6) / 10} h, over your ${maxTravelHours} h a travel day`,
        detail: 'A stop in between, another order, or a faster way (flights when travelling "fastest").',
      })
    }
  })

  // The number of stops the user asked for
  const { minStops, maxStops } = input
  if ((minStops && stops.length < minStops) || (maxStops && stops.length > maxStops)) {
    const range = minStops && maxStops ? `${minStops}–${maxStops}` : minStops ? `at least ${minStops}` : `at most ${maxStops}`
    warnings.push({
      kind: 'pace', severity: 'info',
      title: `${stops.length} stops, outside your range (${range})`,
      detail: maxStops && stops.length > maxStops
        ? 'Places you required (must-visit countries, start and end cities, cities added by hand) or the Schengen limit need more stops.'
        : 'There are not enough nights or cities in the chosen regions for more stops.',
    })
  }

  // The days asked for in a country or region (one visited)
  for (const a of ctx.areas) {
    const n = nightsIn(ctx, stops, a)
    if (n && (n < a.min || n > a.max)) {
      warnings.push({
        kind: 'time', severity: 'warn', iso2: a.iso2,
        title: `${a.name}: ${n} day${n === 1 ? '' : 's'}, you asked for ${dayRangeText(a)}`,
        detail: n > a.max
          ? 'Locked stops, cities added by hand or the Schengen limit need the time there.'
          : 'There are not enough nights left after the other places\' days and locked stops.',
      })
    }
  }

  // Pace: three or more one-night stops in a row
  for (let i = 0, run = 0; i < stops.length; i++) {
    run = stops[i].nights <= 1 ? run + 1 : 0
    if (run === 3) {
      warnings.push({ kind: 'pace', severity: 'info', cityId: stops[i].cityId, title: 'Three one-night stops in a row', detail: 'This can be tiring; consider dropping a stop.' })
    }
  }

  if (dropped.length) {
    warnings.push({
      kind: 'dropped', severity: 'info',
      title: `Left out to fit your dates: ${dropped.map((id) => ds.cities[id].name).join(', ')}`,
    })
  }

  // Getting there from home and back
  const { homeCityId, returnHome } = input.prefs
  const homeKnown = !!homeCityId && !!ds.cities[homeCityId] && sched.length > 0
  const first = sched[0]?.cityId
  const last = sched.at(-1)?.cityId
  const home = {
    out: homeKnown && first !== homeCityId ? homeLeg(ds, homeCityId!, first!) : null,
    back: homeKnown && returnHome && last !== homeCityId ? homeLeg(ds, last!, homeCityId!) : null,
  }

  // Cost
  const stay = sched.reduce((t, s) => t + dailyCost(ds, s.cityId, input) * s.nights, 0)
  const allLegs = [...legs, ...(home.out ? [home.out] : []), ...(home.back ? [home.back] : [])]
  const legMin = allLegs.reduce((t, l) => t + l.priceMin, 0)
  const legMax = allLegs.reduce((t, l) => t + l.priceMax, 0)
  const cost = {
    min: Math.round(stay * 0.85 + legMin),
    max: Math.round(stay * 1.2 + legMax),
    perDay: Math.round((stay + (legMin + legMax) / 2) / Math.max(1, ctx.totalNights)),
  }
  if (dailyBudget && cost.perDay > dailyBudget) {
    warnings.push({
      kind: 'budget', severity: 'warn', title: 'The trip is over your daily budget on average',
      amount: { eur: cost.perDay, limitEur: dailyBudget, per: 'day' },
      detail: 'Counting travel between cities and from home.',
    })
  }

  return { stops: sched, legs, warnings, schengen, cost, home, dates: { start: input.startDate, end: input.endDate }, totalNights: ctx.totalNights, assignedNights, dropped }
}
