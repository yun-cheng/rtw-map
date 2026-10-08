// Converts the hand-curated seed files (countries, costs, connections, notices) into app-ready JSON.
import { join } from 'node:path'
import { GROCERY_KEYS } from '../src/planner/cost'
import { GEN, SEED, readCsv, readJson, writeJson } from './lib.ts'

const SEED_DATE = '2026-10-04'
const COSTS_DATE = '2026-10-08'
const num = (s: string) => Number(s)

const countries = readJson<{ _meta: unknown; countries: unknown[] }>(join(SEED, 'countries.json'))
writeJson(join(GEN, 'countries.json'), countries)
writeJson(join(GEN, 'notices.json'), readJson(join(SEED, 'notices.json')))

// Prices in the money they're quoted in (the country's currency; US dollars in Cambodia). The app converts them to
// EUR with the current exchange rates (costsInEur), so they don't go stale when a currency moves.
const costs = Object.fromEntries(
  readCsv(join(SEED, 'costs.csv')).map((r) => {
    const profile = {
      currency: r.currency,
      dormBed: num(r.dormBed), privateRoom: num(r.privateRoom), mealLocal: num(r.mealLocal), mealDinner: num(r.mealDinner),
      localTransportDay: num(r.localTransportDay), coffee: num(r.coffee), beerBar: num(r.beerBar),
      groceries: Object.fromEntries(GROCERY_KEYS.map((k) => [k, num(r[k])])),
    }
    const bad = [...Object.entries(profile), ...Object.entries(profile.groceries)].filter(([, v]) => typeof v === 'number' && !(v > 0))
    if (!/^[A-Z]{3}$/.test(r.currency) || bad.length) throw new Error(`costs.csv ${r.iso2}: ${bad.length ? `bad ${bad.map(([k]) => k).join(', ')}` : 'no currency'}`)
    return [r.iso2, profile]
  }),
)
writeJson(join(GEN, 'costs.json'), {
  _meta: { source: 'Seed estimates in local currency, not yet verified', updatedAt: COSTS_DATE, confidence: 'low' },
  costs,
})

const connections = readCsv(join(SEED, 'connections.csv')).map((r) => ({
  from: r.from, to: r.to, mode: r.mode, durationMin: num(r.durationMin),
  priceMin: num(r.priceMin), priceMax: num(r.priceMax), frequency: r.frequency,
  overnight: r.overnight === '1', note: r.note || undefined,
}))
writeJson(join(GEN, 'connections.json'), {
  _meta: { source: 'Seed estimates (Wikivoyage, operator sites); verify before booking', updatedAt: SEED_DATE, confidence: 'low' },
  connections,
})

// Local transport and taxis: every city and country must have an entry.
type LocalTransport = {
  _meta: unknown
  countries: Record<string, { rentals?: unknown }>
  cities: Record<string, { modes: string[]; rentals?: string[] }>
}
const MODES = new Set(['metro', 'tram', 'trolleybus', 'bus', 'minibus', 'train', 'ferry', 'funicular', 'cablecar'])
const RENTALS = new Set(['bikeShare', 'eScooter', 'bike', 'car', 'moto'])
const lt = readJson<LocalTransport>(join(SEED, 'local-transport.json'))
const cityIds = readCsv(join(SEED, 'cities.csv')).map((r) => r.id)
const isoCodes = (countries.countries as { iso2: string }[]).map((c) => c.iso2)
const problems = [
  ...cityIds.filter((id) => !lt.cities[id]).map((id) => `missing city ${id}`),
  ...Object.keys(lt.cities).filter((id) => !cityIds.includes(id)).map((id) => `unknown city ${id}`),
  ...isoCodes.filter((c) => !lt.countries[c]).map((c) => `missing country ${c}`),
  ...Object.entries(lt.cities).flatMap(([id, c]) => c.modes.filter((m) => !MODES.has(m)).map((m) => `${id}: unknown mode ${m}`)),
  ...Object.entries(lt.cities).filter(([, c]) => !c.rentals).map(([id]) => `${id}: missing rentals`),
  ...Object.entries(lt.cities).flatMap(([id, c]) => (c.rentals ?? []).filter((r) => !RENTALS.has(r)).map((r) => `${id}: unknown rental ${r}`)),
  ...isoCodes.filter((c) => lt.countries[c] && !lt.countries[c].rentals).map((c) => `${c}: missing rentals`),
]
if (problems.length) {
  console.error(`local-transport.json: ${problems.join('; ')}`)
  process.exit(1)
}
writeJson(join(GEN, 'local-transport.json'), lt)

// Health (tap water, vaccines, risks), shopping (chains, opening hours) and payments: every country needs an entry.
for (const name of ['health', 'shopping', 'payments']) {
  const data = readJson<{ countries: Record<string, unknown> }>(join(SEED, `${name}.json`))
  const missing = isoCodes.filter((c) => !data.countries[c])
  if (missing.length) {
    console.error(`${name}.json: missing countries ${missing.join(', ')}`)
    process.exit(1)
  }
  writeJson(join(GEN, `${name}.json`), data)
}
