import { allocate, type AllocItem } from './allocate'
import { dailyCost } from './cost'
import { addDays, daysBetween, monthOf } from './dates'
import { buildGraph, legBetween, travelWeight, type Graph } from './graph'
import { TAP_WATER_LABELS, airBand, tapWater } from './health'
import { ENGLISH_LABELS, englishLevel } from './language'
import { CARD_LABELS, cardLevel } from './payments'
import { orderRoute } from './route'
import { SCHENGEN_LIMIT, schengenApplies, schengenSummary } from './schengen'
import type { Dataset, Leg, Pace, Plan, PlanWarning, ScheduledStop, Stop, TripInput } from './types'

export * from './types'
export { comparePrices, costProfile, costSanity, dailyCost, estimatedCosts, groceryDay } from './cost'
export { schengenApplies } from './schengen'
export { ENGLISH_LABELS, englishLevel } from './language'
export { RENTAL_INFO, TRANSIT_LABELS, taxiEstimate } from './transport'
export { TAP_WATER_LABELS, airBand, tapWater } from './health'
export { CARD_LABELS, cardLevel } from './payments'
export { addDays, daysBetween, monthOf, tripDay } from './dates'
export { AIRPORT_MIN } from './graph'

const PACE_MULT: Record<Pace, number> = { chill: 1.4, balanced: 1, fast: 0.7 }
const LONG_LEG_MIN: Record<Pace, number> = { chill: 240, balanced: 300, fast: 420 }
const LONGER_MULT = 1.6

type Ctx = {
  ds: Dataset
  input: TripInput
  graph: Graph
  totalNights: number
  groupIndex: Map<string, number> // iso2 → group index
  candidates: string[]
  required: Set<string>
  blocked: { iso2: string; reason: string }[]
}

// ---------------------------------------------------------------- context

function makeContext(ds: Dataset, input: TripInput, extraCities: string[] = []): Ctx {
  const groupIndex = new Map<string, number>()
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
      groupCountries[gi].push(c.iso2)
      if (c.mode === 'must') mustCountries.push(c.iso2)
    }
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
  const ctx: Ctx = { ds, input, graph, totalNights, groupIndex, candidates, required, blocked }
  const requireBestIn = (countries: string[]) => {
    if ([...required].some((id) => countries.includes(ds.cities[id].iso2))) return
    const best = candidates.filter((id) => countries.includes(ds.cities[id].iso2)).sort((a, b) => baseScore(ctx, b) - baseScore(ctx, a))[0]
    if (best) required.add(best)
  }
  for (const iso2 of mustCountries) requireBestIn([iso2])
  // Every region the user added is visited, even when all its countries are optional.
  for (const countries of groupCountries) requireBestIn(countries)
  return ctx
}

const groupOf = (ctx: Ctx, cityId: string) => ctx.groupIndex.get(ctx.ds.cities[cityId].iso2) ?? 0
const isLonger = (ctx: Ctx, cityId: string) => {
  const g = ctx.input.groups[groupOf(ctx, cityId)]
  return ctx.input.keepGroupOrder ? !!g?.longer : ctx.input.groups.some((x) => x.longer && x.countries.some((c) => c.iso2 === ctx.ds.cities[cityId].iso2))
}
const inSchengen = (ctx: Ctx, cityId: string) => !!ctx.ds.countries[ctx.ds.cities[cityId].iso2]?.schengen

// ---------------------------------------------------------------- scoring

function baseScore(ctx: Ctx, cityId: string): number {
  const city = ctx.ds.cities[cityId]
  const { interests } = ctx.input
  const match = interests.length ? city.tags.filter((t) => interests.includes(t)).length / Math.min(2, interests.length) : 1
  return (city.popularity / 5) * (0.6 + 0.4 * Math.min(1, match)) * (isLonger(ctx, cityId) ? 1.3 : 1)
}

function score(ctx: Ctx, cityId: string, month: number): number {
  const m = ctx.ds.climate[cityId]?.[month - 1]
  const climateFit = m ? 0.5 + 0.5 * m.comfort : 1
  return baseScore(ctx, cityId) * climateFit
}

/** First guess of when each group is visited: time split evenly, longer groups get more. */
function guessMonths(ctx: Ctx): Map<string, number> {
  const n = ctx.input.keepGroupOrder ? ctx.input.groups.length : 1
  const weights = Array.from({ length: n }, (_, i) => (ctx.input.keepGroupOrder && ctx.input.groups[i]?.longer ? LONGER_MULT : 1))
  const total = weights.reduce((a, b) => a + b, 0)
  const months = new Map<string, number>()
  for (const id of ctx.candidates) {
    const gi = groupOf(ctx, id)
    const before = weights.slice(0, gi).reduce((a, b) => a + b, 0)
    const mid = ((before + weights[gi] / 2) / total) * ctx.totalNights
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
  const w = isLonger(ctx, stop.cityId) ? LONGER_MULT : 1
  const pen = arrivalPenalty(legIn, ctx.input.pace)
  const base = Math.max(1, city.days.ideal * pace * w) + pen
  return {
    base,
    lo: Math.max(1, Math.round(city.days.min * Math.min(1, pace))) + (pen >= 1 ? 1 : 0),
    hi: Math.max(base, city.days.max * (ctx.input.pace === 'chill' ? 1.3 : 1) * w + pen),
    locked: stop.locked ? stop.nights : null,
    spill: (city.longStay ? 3 : 1) * s,
  }
}

/**
 * Suggested days in a city for each pace, before travel time is taken into account: the same
 * starting point the planner uses when it assigns nights. Includes the extra time for regions
 * marked "Longer" (`longer` names that region).
 */
let everywhere: { ds: Dataset; graph: Graph } | null = null

/** The best way between any two cities in the app, through any others (the planner's routing, without its region limits). */
export function routeBetween(ds: Dataset, from: string, to: string): Leg {
  if (everywhere?.ds !== ds) everywhere = { ds, graph: buildGraph(ds, new Set(Object.keys(ds.cities))) }
  return legBetween(everywhere.graph, from, to)
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

export function suggestedDays(ds: Dataset, input: TripInput, cityId: string): Record<Pace, number> & { longer: string | null } {
  const city = ds.cities[cityId]
  const group = input.groups.find((g) => g.longer && g.countries.some((c) => c.iso2 === city.iso2 && c.mode !== 'excluded'))
  const w = group ? LONGER_MULT : 1
  const days = (pace: Pace) => {
    const mult = PACE_MULT[pace]
    const lo = Math.max(1, Math.round(city.days.min * Math.min(1, mult)))
    const hi = city.days.max * (pace === 'chill' ? 1.3 : 1) * w
    return Math.max(1, Math.round(Math.min(hi, Math.max(lo, city.days.ideal * mult * w))))
  }
  return { chill: days('chill'), balanced: days('balanced'), fast: days('fast'), longer: group?.name ?? null }
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
    if (canChangeSet && hiSum < avail) {
      const inPlan = new Set(stops.map((s) => s.cityId))
      const next = ctx.candidates
        .filter((id) => !inPlan.has(id) && !dropped.includes(id) && legBetween(ctx.graph, stops[0]?.cityId ?? id, id).reachable)
        .sort((a, b) => sc(b) - sc(a))[0]
      if (next) {
        stops = insertCheapest(ctx, stops, next, groupIdFor(ctx, next))
        continue
      }
    }
    const nights = allocate(items, avail)
    stops = stops.map((s, i) => ({ ...s, nights: nights[i] }))
    break
  }
  return { stops: enforceSchengen(ctx, stops, sc, canChangeSet, dropped), dropped }
}

/** Moves nights from Schengen stops to non-Schengen stops until the 90/180 rule holds. */
function enforceSchengen(ctx: Ctx, input: Stop[], sc: (id: string) => number, canChangeSet: boolean, dropped: string[]): Stop[] {
  if (!schengenApplies(ctx.ds, ctx.input.passport)) return input
  let stops = input.map((s) => ({ ...s }))
  for (let iter = 0; iter < 400; iter++) {
    const legs = legsFor(ctx, stops)
    const sum = schengenSummary(ctx.ds, schedule(ctx, stops, legs), ctx.input.passport, ctx.input.schengenDaysBefore)
    if (sum.maxInWindow <= SCHENGEN_LIMIT) break

    let receivers = stops.filter((s) => !s.locked && !inSchengen(ctx, s.cityId))
    if (!receivers.length && canChangeSet) {
      const inPlan = new Set(stops.map((s) => s.cityId))
      const extra = ctx.candidates.filter((id) => !inPlan.has(id) && !inSchengen(ctx, id)).sort((a, b) => sc(b) - sc(a))[0]
      if (!extra) break
      stops = insertCheapest(ctx, stops, extra, groupIdFor(ctx, extra))
      stops = takeNight(stops, stops.find((s) => s.cityId === extra)!) ?? stops
      continue
    }
    if (!receivers.length) break

    const donors = stops
      .map((s, i) => ({ s, item: allocItem(ctx, s, legs[i - 1], sc(s.cityId)) }))
      .filter(({ s, item }) => !s.locked && inSchengen(ctx, s.cityId) && s.nights > item.lo)
    if (!donors.length) {
      const droppable = stops.filter((s) => !s.locked && inSchengen(ctx, s.cityId) && !ctx.required.has(s.cityId))
      if (!canChangeSet || !droppable.length) break
      const worst = droppable.reduce((a, b) => (sc(a.cityId) <= sc(b.cityId) ? a : b))
      const freed = worst.nights
      stops = stops.filter((s) => s !== worst)
      dropped.push(worst.cityId)
      receivers = stops.filter((s) => !s.locked && !inSchengen(ctx, s.cityId))
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

/** Builds a full plan from the trip input: picks cities, orders them and assigns nights. */
export function generatePlan(ds: Dataset, input: TripInput): Plan {
  const ctx = makeContext(ds, input)
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

/** Adds a city where it fits best in the route, then rebalances. */
export function addStop(ds: Dataset, input: TripInput, stops: Stop[], cityId: string): Plan {
  const ctx = makeContext(ds, input, [...stops.map((s) => s.cityId), cityId])
  return rebalance(ds, input, insertCheapest(ctx, stops, cityId, groupIdFor(ctx, cityId)))
}

/** Dates, legs, warnings and costs for stops exactly as given (no changes). */
export function evaluatePlan(ds: Dataset, input: TripInput, stops: Stop[]): Plan {
  return evaluate(makeContext(ds, input, stops.map((s) => s.cityId)), stops, [])
}

function select(ctx: Ctx, scores: Map<string, number>): string[] {
  const pace = PACE_MULT[ctx.input.pace]
  const cost = (id: string) => Math.max(1, ctx.ds.cities[id].days.ideal * pace * (isLonger(ctx, id) ? LONGER_MULT : 1)) + 0.5
  const chosen = [...ctx.required]
  let used = chosen.reduce((s, id) => s + cost(id), 0)
  const rest = ctx.candidates.filter((id) => !ctx.required.has(id)).sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0))
  for (const id of rest) {
    if (used + cost(id) > ctx.totalNights) continue
    chosen.push(id)
    used += cost(id)
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
      detail: 'Use "Rebalance" to fit the stops to your dates.',
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
    if (m.tHigh >= 32) {
      warnings.push({ kind: 'weather', severity: 'warn', cityId: s.cityId, title: `${name}: very hot`, tempC: m.tHigh })
    } else if (m.tHigh < 12) {
      warnings.push({ kind: 'weather', severity: 'warn', cityId: s.cityId, title: `${name}: cold`, tempC: m.tHigh })
    } else if (m.rainDays >= 14) {
      warnings.push({ kind: 'weather', severity: 'info', cityId: s.cityId, title: `${name}: often wet (~${Math.round(m.rainDays)} days with rain that month)`, detail: 'Counts days with at least 1 mm; in summer these are often short showers.' })
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

  // Cost
  const stay = sched.reduce((t, s) => t + dailyCost(ds, s.cityId, input.budget) * s.nights, 0)
  const legMin = legs.reduce((t, l) => t + l.priceMin, 0)
  const legMax = legs.reduce((t, l) => t + l.priceMax, 0)
  const cost = {
    min: Math.round(stay * 0.85 + legMin),
    max: Math.round(stay * 1.2 + legMax),
    perDay: Math.round((stay + (legMin + legMax) / 2) / Math.max(1, ctx.totalNights)),
  }

  return { stops: sched, legs, warnings, schengen, cost, totalNights: ctx.totalNights, assignedNights, dropped }
}
