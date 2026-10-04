// Converts the hand-curated seed files (countries, costs, connections, notices) into app-ready JSON.
import { join } from 'node:path'
import { GEN, SEED, readCsv, readJson, writeJson } from './lib.ts'

const SEED_DATE = '2026-10-04'
const num = (s: string) => Number(s)

const countries = readJson<{ _meta: unknown; countries: unknown[] }>(join(SEED, 'countries.json'))
writeJson(join(GEN, 'countries.json'), countries)
writeJson(join(GEN, 'notices.json'), readJson(join(SEED, 'notices.json')))

const costs = Object.fromEntries(
  readCsv(join(SEED, 'costs.csv')).map((r) => [
    r.iso2,
    {
      dormBed: num(r.dormBed), privateRoom: num(r.privateRoom), mealCheap: num(r.mealCheap), mealMid: num(r.mealMid),
      localTransportDay: num(r.localTransportDay),
      groceries: {
        bread: num(r.bread), eggs12: num(r.eggs12), milk1l: num(r.milk1l), rice1kg: num(r.rice1kg),
        chicken1kg: num(r.chicken1kg), tomatoes1kg: num(r.tomatoes1kg), beer05: num(r.beer05), water15: num(r.water15),
      },
    },
  ]),
)
writeJson(join(GEN, 'costs.json'), {
  _meta: { source: 'Seed estimates in EUR, not yet verified', updatedAt: SEED_DATE, confidence: 'low' },
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
