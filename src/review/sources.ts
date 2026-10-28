// The hand-curated seed files (data/seed) as flat tables for the data review page, with simple checks: links to
// cities and countries that don't exist, repeated keys, values out of order and rows missing for a country or city.
// Read straight from the files, so the page updates as you edit them.
import citiesCsv from '../../data/seed/cities.csv?raw'
import connectionsCsv from '../../data/seed/connections.csv?raw'
import costsCsv from '../../data/seed/costs.csv?raw'
import countriesJson from '../../data/seed/countries.json'
import healthJson from '../../data/seed/health.json'
import localTransportJson from '../../data/seed/local-transport.json'
import noticesJson from '../../data/seed/notices.json'
import paymentsJson from '../../data/seed/payments.json'
import phrasesJson from '../../data/seed/phrases.json'
import shoppingJson from '../../data/seed/shopping.json'
import fxJson from '../../data/gen/fx.json'
import priceLevelsJson from '../../data/gen/price-levels.json'
import { parseCsv } from '../data/csv'
import { CITY_KEYS, CITY_SCALED, COST_KEYS, nameKey, capitalOf, type RunDestination, type RunFile, type RunPlace } from '../data/promptRuns'
import genCitiesJson from '../../data/gen/cities.json'
import { COST_HINTS, GROCERY_KEYS, costSanity, costsInEur, groceryDay } from '../planner/cost'
import type { Dataset, LocalCostProfile } from '../planner/types'

/** A cell: text, number, yes/no, a list, or nothing. */
export type Value = string | number | boolean | Value[] | null
export type Row = Record<string, Value>

export type Table = {
  label: string
  /** Column names in file order (nested JSON fields as "taxi.perKm"). */
  columns: string[]
  rows: Row[]
  /** Where each row is in the file: "line 12" (CSV, shown as the first column) or its key (JSON). */
  where: string[]
  /** Show `where` as a column (CSV line numbers). */
  lines: boolean
  /** Per row, the problems found, by column. */
  issues: Record<string, string>[]
  /** Columns that link to a city or a country, shown with its name on hover. */
  links: Record<string, 'city' | 'country'>
  /** Countries or cities that should have a row here but don't. */
  missing: string[]
  /** Money columns: in EUR, or in the row's own `currency`. */
  money?: Record<string, 'EUR' | 'row'>
  /** Columns pinned at the left by default (after the line number): what each row is about. */
  pinned: string[]
}

export type Source = { id: string; label: string; file: string; about?: string; updatedAt?: string; notes?: string[]; tables: Record<string, Table> }

type Meta = { _meta?: { source?: string; updatedAt?: string } }
type Rule = (row: Row) => Record<string, string>

/** Rounded for reading: whole numbers from 100, one decimal from 10, else two. */
const tidy = (v: number) => (v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100)

// ---------------------------------------------------------------- reading

/** CSV cells as numbers where the whole column is numeric, lists where it's "a;b;c", else text; empty cells as null. */
function csvRows(text: string): { columns: string[]; rows: Row[] } {
  const raw = parseCsv(text)
  const columns = Object.keys(raw[0] ?? {})
  const filled = (c: string) => raw.map((r) => r[c]).filter((v) => v !== '')
  const numeric = new Set(columns.filter((c) => filled(c).length && filled(c).every((v) => v.trim() !== '' && !isNaN(Number(v)))))
  const lists = new Set(columns.filter((c) => filled(c).some((v) => v.includes(';')) && filled(c).every((v) => /^[\w-]+(;[\w-]+)*$/.test(v))))
  const rows = raw.map((r) => Object.fromEntries(columns.map((c): [string, Value] => {
    const v = r[c]
    if (v === '') return [c, null]
    return [c, numeric.has(c) ? Number(v) : lists.has(c) ? v.split(';') : v]
  })))
  return { columns, rows }
}

/** A JSON record as one row: nested objects become "parent.child" columns; lists stay lists. */
function flatten(o: Record<string, unknown>, prefix = '', out: Row = {}): Row {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v as Record<string, unknown>, `${prefix}${k}.`, out)
    else out[`${prefix}${k}`] = (v ?? null) as Value
  }
  return out
}

/** Records keyed by country or city ({ "AL": {...} }) as rows, with the key as the first column. */
function keyedRows(records: Record<string, object> | undefined, key: string) {
  const rows = Object.entries(records ?? {}).map(([k, v]) => ({ [key]: k, ...flatten(v as Record<string, unknown>) }))
  return { rows, where: Object.keys(records ?? {}) }
}

/** Columns in order of first appearance. */
const columnsOf = (rows: Row[]) => [...new Set(rows.flatMap((r) => Object.keys(r)))]

// ---------------------------------------------------------------- the files

const cities = csvRows(citiesCsv)
const connections = csvRows(connectionsCsv)
const costs = withCostColumns(csvRows(costsCsv))
const countryList = (countriesJson as Meta & { countries: Record<string, unknown>[] }).countries

/**
 * Costs are in local money; two columns are added: a day of groceries (in the row's currency, see groceryDay), and
 * how all the prices compare with the national price level (1 = in line; the city panel warns below 0.8 or above 1.25).
 */
function withCostColumns(data: { columns: string[]; rows: Row[] }) {
  const rates = fxJson.rates as Record<string, number>
  const local = Object.fromEntries(data.rows.filter((r) => rates[String(r.currency)]).map((r) => [String(r.iso2), {
    currency: String(r.currency),
    dormBed: Number(r.dormBed), privateRoom: Number(r.privateRoom), mealLocal: Number(r.mealLocal), mealDinner: Number(r.mealDinner),
    localTransportDay: Number(r.localTransportDay), coffee: Number(r.coffee), beerBar: Number(r.beerBar),
    groceries: Object.fromEntries(GROCERY_KEYS.map((k) => [k, Number(r[k])])),
  } as LocalCostProfile]))
  const ds = { costs: costsInEur(local, rates), priceLevels: priceLevelsJson } as unknown as Dataset
  const rows = data.rows.map((r): Row => {
    const own = local[String(r.iso2)]
    // In the row's own currency, like the prices it adds up.
    return { ...r, groceryDay: own ? tidy(groceryDay(own)) : null, 'vs price level': own ? costSanity(ds, String(r.iso2)) : null }
  })
  return { columns: [...data.columns, 'groceryDay', 'vs price level'], rows }
}

/** Known ids, with names for hover text. */
export const cityNames = new Map(cities.rows.map((r) => [String(r.id), String(r.name)]))
export const countryNames = new Map(countryList.map((c) => [String(c.iso2), String(c.name)]))
const cityIds = [...cityNames.keys()]
const countryIds = [...countryNames.keys()]

export function table(label: string, data: { columns?: string[]; rows: Row[]; where: string[] }, opts: {
  key?: string | ((r: Row) => string)
  links?: Table['links']
  rule?: Rule
  /** Every one of these should have a row (matched on `key`). */
  expect?: string[]
  money?: Table['money']
  /** Default: the first column. */
  pinned?: string[]
} = {}): Table {
  const { rows, where } = data
  const links = opts.links ?? {}
  const keyOf = typeof opts.key === 'function' ? opts.key : opts.key ? (r: Row) => String(r[opts.key as string] ?? '') : null
  const seen = new Map<string, number>()
  const issues = rows.map((r, i) => {
    const found: Record<string, string> = {}
    for (const [col, kind] of Object.entries(links)) {
      const v = r[col]
      if (v === null) continue
      const known = kind === 'city' ? cityNames : countryNames
      if (!known.has(String(v))) found[col] = `No ${kind} "${v}" in ${kind === 'city' ? 'cities.csv' : 'countries.json'}`
    }
    if (keyOf) {
      const k = keyOf(r)
      const first = seen.get(k)
      const firstCol = typeof opts.key === 'string' ? opts.key : Object.keys(r)[0]
      if (first !== undefined) found[firstCol] = `Repeats the row at ${where[first]}`
      else seen.set(k, i)
    }
    return { ...opts.rule?.(r), ...found }
  })
  const present = new Set(keyOf ? rows.map(keyOf) : [])
  return {
    label, rows, where, issues, links, lines: where[0]?.startsWith('line ') ?? false, money: opts.money,
    pinned: opts.pinned ?? (data.columns ?? columnsOf(rows)).slice(0, 1),
    columns: data.columns ?? columnsOf(rows),
    missing: (opts.expect ?? []).filter((k) => !present.has(k)),
  }
}

const num = (v: Value) => (typeof v === 'number' ? v : null)
/** "a ≤ b" checks: for each pair, a message on the second column when the first is larger. */
const ordered = (pairs: [string, string][]): Rule => (r) => {
  const out: Record<string, string> = {}
  for (const [a, b] of pairs) {
    const x = num(r[a]), y = num(r[b])
    if (x !== null && y !== null && x > y) out[b] = `${b} (${y}) is less than ${a} (${x})`
  }
  return out
}
/** Columns that must not be empty. */
const required = (cols: string[]): Rule => (r) => Object.fromEntries(cols.filter((c) => r[c] === null || r[c] === '').map((c) => [c, 'Empty']))
const both = (...rules: Rule[]): Rule => (r) => Object.assign({}, ...rules.map((f) => f(r)))

const csvLines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 2}`)

function keyedSource(id: string, label: string, json: unknown, opts: { cities?: string; notes?: string[]; money?: Table['money'] }): Source {
  const j = json as Meta & { countries?: Record<string, object>; cities?: Record<string, object> }
  const tables: Record<string, Table> = {}
  if (j.countries) tables.countries = table('Countries', keyedRows(j.countries, 'iso2'), { key: 'iso2', links: { iso2: 'country' }, expect: countryIds, money: opts.money })
  if (j.cities) tables.cities = table('Cities', keyedRows(j.cities, 'city'), {
    key: 'city', links: { city: 'city' }, expect: opts.cities === 'all' ? cityIds : undefined,
  })
  return { id, label, file: `data/seed/${id}.json`, about: j._meta?.source, updatedAt: j._meta?.updatedAt, notes: opts.notes, tables }
}

export const SOURCES: Source[] = [
  {
    id: 'cities', label: 'Cities', file: 'data/seed/cities.csv',
    about: 'One row per city. Empty lat/lon are looked up from GeoNames by the "geoname" name.',
    tables: {
      all: table('Cities', { ...cities, where: csvLines(cities.rows.length) }, {
        key: 'id', links: { iso2: 'country' }, pinned: ['id', 'name'],
        rule: both(required(['id', 'name', 'iso2', 'daysMin', 'daysIdeal', 'daysMax']), ordered([['daysMin', 'daysIdeal'], ['daysIdeal', 'daysMax']])),
      }),
    },
  },
  {
    id: 'connections', label: 'Routes', file: 'data/seed/connections.csv',
    about: 'Ground and air routes between cities: minutes, price range (EUR) and how often.',
    tables: {
      all: table('Routes', { ...connections, where: csvLines(connections.rows.length) }, {
        key: (r) => `${r.from}|${r.to}|${r.mode}`, links: { from: 'city', to: 'city' }, money: { priceMin: 'EUR', priceMax: 'EUR' }, pinned: ['from', 'to'],
        rule: both(required(['from', 'to', 'mode', 'durationMin']), ordered([['priceMin', 'priceMax']]), (r): Record<string, string> => (r.from !== null && r.from === r.to ? { to: 'Same as "from"' } : {})),
      }),
    },
  },
  {
    id: 'costs', label: 'Costs', file: 'data/seed/costs.csv',
    about: 'Typical prices per country in local money (the "currency" column): beds, meals, a day of local transport and 10 shop items. The last two columns are worked out here: a day of groceries (in the same currency), and all the prices compared with the national price level (1 = in line).',
    notes: [`mealLocal: ${COST_HINTS.mealLocal}`, `mealDinner: ${COST_HINTS.mealDinner}`, `coffee: ${COST_HINTS.coffee}`, `beerBar: ${COST_HINTS.beerBar}`, `groceryDay: ${COST_HINTS.groceryDay}`],
    tables: {
      all: table('Costs', { ...costs, where: csvLines(costs.rows.length) }, {
        key: 'iso2', links: { iso2: 'country' }, expect: countryIds,
        money: Object.fromEntries(['dormBed', 'privateRoom', 'mealLocal', 'mealDinner', 'localTransportDay', 'coffee', 'beerBar', ...GROCERY_KEYS, 'groceryDay'].map((c) => [c, 'row' as const])),
        rule: both(required(['currency', 'coffee', 'beerBar', ...GROCERY_KEYS]), ordered([['dormBed', 'privateRoom'], ['mealLocal', 'mealDinner']]), (r): Record<string, string> => {
          const out: Record<string, string> = {}
          if (r.currency !== null && !(fxJson.rates as Record<string, number>)[String(r.currency)]) out.currency = `No exchange rate for ${r.currency} in fx.json`
          const v = r['vs price level']
          if (typeof v === 'number' && (v < 0.8 || v > 1.25)) out['vs price level'] = `About ${Math.round(Math.abs(v - 1) * 100)}% ${v > 1 ? 'above' : 'below'} what the price level suggests (the city panel warns about this)`
          return out
        }),
      }),
    },
  },
  {
    id: 'countries', label: 'Countries', file: 'data/seed/countries.json', about: (countriesJson as Meta)._meta?.source, updatedAt: (countriesJson as Meta)._meta?.updatedAt,
    tables: {
      all: table('Countries', { rows: countryList.map((c) => flatten(c)), where: countryList.map((c) => String(c.iso2)) }, { key: 'iso2', rule: required(['iso2', 'name', 'currency']) }),
    },
  },
  keyedSource('health', 'Health', healthJson, {}),
  keyedSource('local-transport', 'Local transport', localTransportJson, {
    cities: 'all', money: { 'taxi.flagFall': 'EUR', 'taxi.perKm': 'EUR', 'rentals.carDay': 'EUR', 'rentals.motoDay': 'EUR' },
  }),
  keyedSource('payments', 'Payments', paymentsJson, { notes: (paymentsJson as { tips?: string[] }).tips }),
  keyedSource('shopping', 'Shopping', shoppingJson, {}),
  (() => {
    // Each country's language, and each language's phrases (one row per language, a column per phrase and its pronunciation).
    const source = keyedSource('phrases', 'Phrases', phrasesJson, {})
    source.tables.languages = table('Languages', keyedRows(phrasesJson.languages, 'language'), { key: 'language', pinned: ['language', 'name'] })
    return source
  })(),
  (() => {
    const j = noticesJson as Meta & { notices: Record<string, unknown>[] }
    const rows = j.notices.map((n) => flatten(n))
    return {
      id: 'notices', label: 'Notices', file: 'data/seed/notices.json', about: j._meta?.source, updatedAt: j._meta?.updatedAt,
      tables: { all: table('Notices', { rows, where: rows.map((r) => String(r.id)) }, { key: 'id', rule: required(['id', 'title', 'text']) }) },
    }
  })(),
]

// ---------------------------------------------------------------- prompt runs

/** The runs of the data prompts kept so far (scripts/prompts.ts: data/runs/<dataset>/v<version>/<month>/<model>/), by
 *  dataset and then "model month version", newest first: each answer by city id (or country code). */
const runFiles = import.meta.glob<RunFile>('../../data/runs/*/*/*/*/*.json', { eager: true, import: 'default' })
const runsBy = (dataset: string) => {
  const out = new Map<string, RunFile['cities']>()
  for (const [path, run] of Object.entries(runFiles)) {
    const [name, version, month, model] = path.split('/').slice(-5, -1)
    // (Each answer under "cities", or "countries" for a prompt per country.)
    const entries = run.cities ?? (run as unknown as { countries?: RunFile['cities'] }).countries
    if (name !== dataset || !entries) continue
    const label = `${model} ${month} ${version}`
    out.set(label, { ...out.get(label), ...entries })
  }
  return new Map([...out].sort(([a], [b]) => b.split(' ')[1].localeCompare(a.split(' ')[1]) || a.localeCompare(b)))
}

/**
 * Costs from every source side by side: one row per city and price (the national prices once, in the capital they're
 * asked in), ours and each run's, with how far it is from ours, its source, when it's from, how sure, and how it was
 * worked out where it's an estimate. Ours for a city is the app's: the country's price (costs.csv; taxis and rentals
 * from local-transport.json), times the city's cost factor where the app scales it. More than a third off is marked,
 * and so is an estimate.
 */
function costRuns(): Source | null {
  const runs = runsBy('costs')
  if (!runs.size) return null
  type GenCity = Parameters<typeof capitalOf>[0][number]
  const genCities = (genCitiesJson as { cities: GenCity[] }).cities
  const rates = fxJson.rates as Record<string, number>
  /** An amount in another currency, in `to`, at the current rates (null without a rate for either). */
  const convert = (v: number, from: string, to: string) => (rates[from] && rates[to] ? (v / rates[from]) * rates[to] : null)
  // Our taxis and rentals (local-transport.json, in EUR; a rental as the middle of its range), in the row's money.
  type Transport = { taxi?: { flagFall?: number; perKm?: number }; rentals?: { carDay?: number[]; motoDay?: number[] } }
  const middle = (r?: number[]) => (r?.length ? (r[0] + r[r.length - 1]) / 2 : null)
  const ourTransport = (iso2: string, key: string, currency: string): number | null => {
    const t = (localTransportJson as { countries: Record<string, Transport> }).countries[iso2]
    const eur = { taxiStart: t?.taxi?.flagFall, taxiPerKm: t?.taxi?.perKm, carDay: middle(t?.rentals?.carDay), scooterDay: middle(t?.rentals?.motoDay) }[key]
    return typeof eur === 'number' ? convert(eur, 'EUR', currency) : null
  }
  const rows: Row[] = []
  const issues: Record<string, string>[] = []
  for (const seed of costs.rows) {
    const iso2 = String(seed.iso2)
    const currency = String(seed.currency)
    const national = capitalOf(genCities, iso2)
    for (const city of genCities.filter((c) => c.iso2 === iso2)) {
      const keys: readonly string[] = city.id === national?.id ? COST_KEYS : CITY_KEYS
      for (const key of keys) {
        const country = key in seed ? seed[key] : ourTransport(iso2, key, currency)
        const ours = typeof country === 'number' ? tidy(CITY_SCALED.includes(key) ? country * city.costFactor : country) : null
        const row: Row = { city: city.id, iso2, price: key, currency, factor: city.costFactor, ours }
        const issue: Record<string, string> = {}
        for (const [name, answers] of runs) {
          const answer = answers[city.id]
          const v = answer?.values[key]
          // (A price the source gave in another currency is converted here, at the current rates.)
          const local = v?.value != null ? (v.currency && v.currency !== currency ? convert(v.value, v.currency, currency) : v.value) : null
          const value = local !== null ? tidy(local) : null
          row[name] = value
          row[`${name} vs ours`] = value !== null && ours ? tidy(value / ours) : null
          row[`${name} source`] = v?.source ?? null
          row[`${name} seen`] = v?.seen ?? null
          row[`${name} confidence`] = v?.confidence ?? null
          row[`${name} estimated`] = v?.estimated ? v.basis ?? 'yes' : null
          row[`${name} note`] = [v?.none && "Doesn't exist here.", v?.currency && v.currency !== currency && v.value != null && `${v.value} ${v.currency} on the source.`, v?.note].filter(Boolean).join(' ') || null
          if (answer && answer.currency !== currency) issue[name] = `In ${answer.currency}, not ${currency}`
          else if (answer && value === null && !v?.none) issue[name] = v?.note ?? 'No value'
          else if (v?.estimated) issue[name] = `Estimated: ${v.basis ?? 'no basis given'}`
          const r = row[`${name} vs ours`]
          if (typeof r === 'number' && (r < 0.75 || r > 1.33)) issue[`${name} vs ours`] = `${Math.round(Math.abs(r - 1) * 100)}% ${r > 1 ? 'above' : 'below'} ours`
        }
        rows.push(row)
        issues.push(issue)
      }
    }
  }
  const t = table('Costs: all sources', { rows, where: rows.map((r) => `${r.city} ${r.price}`) }, {
    links: { city: 'city', iso2: 'country' }, pinned: ['city', 'price'],
    money: Object.fromEntries(['ours', ...runs.keys()].map((c) => [c, 'row' as const])),
  })
  return {
    id: 'runs-costs', label: 'Costs: all sources', file: 'data/runs/costs',
    about: `Each city's prices from every source, in its country's money: ours as the app works them out (the country's price in costs.csv, or local-transport.json for taxis and rentals, times the city's cost factor for rooms, meals, coffee and beer), and each prompt run's (prompts/costs.md), asked in the city itself; the supermarket and rentals once per country, in its capital. "vs ours" is the run over ours: more than a third off is marked, and so is an estimate (its basis in "estimated"). The meals asked for are the dish alone, ours include a drink.`,
    tables: { all: { ...t, issues } },
  }
}

/**
 * The places to see from every run (prompts/places.md), one row per run, city and place, the city's places and then
 * its day trips, each in rank order; "also in" names the other runs that list the same place (by its Wikipedia
 * article, else its name), the surest sign it belongs. A place its run is unsure of is marked.
 */
function placeRuns(): Source | null {
  const runs = runsBy('places') as unknown as Map<string, Record<string, { city: string; places: RunPlace[] }>>
  if (!runs.size) return null
  const same = (p: RunPlace) => (p.wikipedia ?? p.name).toLowerCase()
  const rows: Row[] = []
  const issues: Record<string, string>[] = []
  for (const [name, answers] of runs) {
    for (const [city, answer] of Object.entries(answers)) {
      const places = [...(answer.places ?? [])].sort((a, b) => Number(a.dayTrip) - Number(b.dayTrip) || a.rank - b.rank)
      for (const p of places) {
        const also = [...runs].filter(([other, a]) => other !== name && a[city]?.places?.some((q) => same(q) === same(p))).map(([other]) => other)
        rows.push({
          run: name, city, trip: p.dayTrip, rank: p.rank, name: p.name, local: p.local ?? null, tier: p.tier, kind: p.kind,
          minutes: p.minutes, km: p.km ?? null, getThere: p.getThere ?? null,
          wikipedia: p.wikipedia ? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.wikipedia.replace(/ /g, '_'))}` : null,
          why: p.why, sure: p.sure, note: p.note ?? null, 'also in': also,
        })
        issues.push(p.sure === 'low' ? { sure: 'The run is unsure of this place' } : {})
      }
    }
  }
  const t = table('Places: all sources', { rows, where: rows.map((r) => `${r.run} ${r.city} ${r.trip ? 'trip ' : ''}${r.rank}`) }, {
    links: { city: 'city' }, pinned: ['city', 'rank', 'name'],
  })
  return {
    id: 'runs-places', label: 'Places: all sources', file: 'data/runs/places',
    about: 'The places to see in each city from every run of prompts/places.md: one row per run, city and place (trip: a day trip), in rank order. "also in" is the other runs that list the same place (by its Wikipedia article, else its name). A place the run was unsure of is marked.',
    tables: { all: { ...t, issues } },
  }
}

/**
 * Each country's places to stay from every run (prompts/destinations.md) against our cities (cities.csv), matched by
 * name (accents, case and punctuation aside; the local name too): one row per run and place, in rank order, then our
 * cities that run doesn't list. "status" says which: in both, only the run's (one to consider adding) or only ours
 * (one to consider dropping), both marked; our days, tags and popularity sit beside the run's, and a "world" score
 * (v3 on) 2 or more from our popularity is marked. "also in" names the other runs that list the place.
 */
function destinationRuns(): Source | null {
  const runs = runsBy('destinations') as unknown as Map<string, Record<string, { country: string; places: RunDestination[] }>>
  if (!runs.size) return null
  const ours = (iso2: string) => cities.rows.filter((r) => r.iso2 === iso2)
  /** Our city a run's place is, if any: the same name, or one that starts with the other's (5 letters or more:
   *  "Hạ Long Bay" is our Ha Long). */
  const alike = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)))
  const match = (iso2: string, p: RunDestination) => {
    const keys = [p.name, p.local, p.wikipedia, p.base?.name, p.base?.local, p.base?.wikipedia].filter((x): x is string => !!x).map(nameKey).filter(Boolean)
    return ours(iso2).find((r) => [String(r.id), String(r.name), String(r.geoname ?? '')].map(nameKey).some((k) => keys.some((key) => alike(k, key))))
  }
  const rows: Row[] = []
  const issues: Record<string, string>[] = []
  const days = (r: Row) => (r.daysMin === null ? null : `${r.daysMin}–${r.daysIdeal}–${r.daysMax}`)
  for (const [name, answers] of runs) {
    for (const [iso2, answer] of Object.entries(answers)) {
      const places = [...(answer.places ?? [])].sort((a, b) => a.rank - b.rank)
      const matched = new Set<string>()
      for (const p of places) {
        const city = match(iso2, p)
        if (city) matched.add(String(city.id))
        const also = [...runs].filter(([other, a]) => other !== name && a[iso2]?.places?.some((q) => nameKey(q.name) === nameKey(p.name))).map(([other]) => other)
        rows.push({
          run: name, iso2, status: city ? 'both' : 'run only', rank: p.rank, name: p.name, local: p.local ?? null, world: p.world ?? null, tier: p.tier ?? null, kind: p.kind,
          base: p.base ? [p.base.name, p.base.local].filter(Boolean).join(' / ') : null,
          days: `${p.days?.min}–${p.days?.ideal}–${p.days?.max}`, tags: p.tags ?? [], ours: city ? String(city.id) : null,
          'our days': city ? days(city) : null, 'our tags': city ? city.tags : null, 'our popularity': city ? city.popularity : null,
          wikipedia: p.wikipedia ? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.wikipedia.replace(/ /g, '_'))}` : null,
          why: p.why, sure: p.sure, note: p.note ?? null, 'also in': also,
        })
        issues.push({
          ...(!city && { status: 'Not one of our cities: one to consider adding' }),
          ...(p.sure === 'low' && { sure: 'The run is unsure of this place' }),
          ...(city && p.world !== undefined && Math.abs(p.world - Number(city.popularity)) >= 2 && { world: `${p.world} worldwide, our popularity ${city.popularity}` }),
        })
      }
      for (const city of ours(iso2).filter((r) => !matched.has(String(r.id)))) {
        rows.push({
          run: name, iso2, status: 'ours only', rank: null, name: city.name, local: null, world: null, tier: null, kind: null, base: null, days: null, tags: [],
          ours: String(city.id), 'our days': days(city), 'our tags': city.tags, 'our popularity': city.popularity,
          wikipedia: null, why: city.blurb, sure: null, note: null, 'also in': [],
        })
        issues.push({ status: "Not in this run's list: one to consider dropping (or the names differ)" })
      }
    }
  }
  const t = table('Destinations: all sources', { rows, where: rows.map((r) => `${r.run} ${r.iso2} ${r.rank ?? r.ours}`) }, {
    links: { iso2: 'country', ours: 'city' }, pinned: ['iso2', 'status', 'name'],
  })
  return {
    id: 'runs-destinations', label: 'Destinations: all sources', file: 'data/runs/destinations',
    about: "Each country's places to stay from every run of prompts/destinations.md, against our cities (cities.csv), matched by name: one row per run and place in rank order, then our cities the run doesn't list. \"status\": both, run only (one to consider adding) or ours only (one to consider dropping, or the names differ). Days are min–ideal–max; ours sit beside the run's.",
    tables: { all: { ...t, issues } },
  }
}

const runSources = [costRuns(), placeRuns(), destinationRuns()].filter((s): s is Source => !!s)
SOURCES.push(...runSources)

/** The table with its money columns in one currency (`to`), at the current exchange rates; null when it has none. */
export function inCurrency(t: Table, to: string): Table | null {
  const rates = fxJson.rates as Record<string, number>
  if (!t.money || !rates[to]) return null
  const convert = (v: Value, from: string): Value =>
    typeof v === 'number' ? tidy((v / rates[from]) * rates[to]) : Array.isArray(v) ? v.map((x) => convert(x, from)) : v
  const rows = t.rows.map((r) => {
    const out: Row = { ...r }
    for (const [col, kind] of Object.entries(t.money!)) {
      const from = kind === 'EUR' ? 'EUR' : String(r.currency)
      if (rates[from] && col in r) out[col] = convert(r[col], from)
    }
    if ('currency' in r) out.currency = to
    return out
  })
  return { ...t, rows }
}
