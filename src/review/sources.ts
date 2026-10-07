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
import shoppingJson from '../../data/seed/shopping.json'
import fxJson from '../../data/gen/fx.json'
import priceLevelsJson from '../../data/gen/price-levels.json'
import { parseCsv } from '../data/csv'
import { GROCERY_KEYS, costSanity, costsInEur, groceryDay } from '../planner/cost'
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
    dormBed: Number(r.dormBed), privateRoom: Number(r.privateRoom), mealCheap: Number(r.mealCheap), mealMid: Number(r.mealMid),
    localTransportDay: Number(r.localTransportDay),
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
        key: 'id', links: { iso2: 'country' },
        rule: both(required(['id', 'name', 'iso2', 'daysMin', 'daysIdeal', 'daysMax']), ordered([['daysMin', 'daysIdeal'], ['daysIdeal', 'daysMax']])),
      }),
    },
  },
  {
    id: 'connections', label: 'Routes', file: 'data/seed/connections.csv',
    about: 'Ground and air routes between cities: minutes, price range (EUR) and how often.',
    tables: {
      all: table('Routes', { ...connections, where: csvLines(connections.rows.length) }, {
        key: (r) => `${r.from}|${r.to}|${r.mode}`, links: { from: 'city', to: 'city' }, money: { priceMin: 'EUR', priceMax: 'EUR' },
        rule: both(required(['from', 'to', 'mode', 'durationMin']), ordered([['priceMin', 'priceMax']]), (r): Record<string, string> => (r.from !== null && r.from === r.to ? { to: 'Same as "from"' } : {})),
      }),
    },
  },
  {
    id: 'costs', label: 'Costs', file: 'data/seed/costs.csv',
    about: 'Typical prices per country in local money (the "currency" column): beds, meals, a day of local transport and 10 shop items. The last two columns are worked out here: a day of groceries (in the same currency), and all the prices compared with the national price level (1 = in line).',
    tables: {
      all: table('Costs', { ...costs, where: csvLines(costs.rows.length) }, {
        key: 'iso2', links: { iso2: 'country' }, expect: countryIds,
        money: Object.fromEntries(['dormBed', 'privateRoom', 'mealCheap', 'mealMid', 'localTransportDay', ...GROCERY_KEYS, 'groceryDay'].map((c) => [c, 'row' as const])),
        rule: both(required(['currency', ...GROCERY_KEYS]), ordered([['dormBed', 'privateRoom'], ['mealCheap', 'mealMid']]), (r): Record<string, string> => {
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
    const j = noticesJson as Meta & { notices: Record<string, unknown>[] }
    const rows = j.notices.map((n) => flatten(n))
    return {
      id: 'notices', label: 'Notices', file: 'data/seed/notices.json', about: j._meta?.source, updatedAt: j._meta?.updatedAt,
      tables: { all: table('Notices', { rows, where: rows.map((r) => String(r.id)) }, { key: 'id', rule: required(['id', 'title', 'text']) }) },
    }
  })(),
]

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
