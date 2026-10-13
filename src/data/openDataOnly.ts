// The dataset with some countries cut back to what build-capitals.ts gives a country without curated data: its cities
// marked `auto` with plain defaults, and none of the curated profile, prices, routes, health, payments, transport,
// shops or phrases. Every country has curated data now, so tests use this to check that views, tools and plans still
// work for one that doesn't (a country added to the map later starts that way).
import type { Dataset } from '../planner/types'

export function openDataOnly(ds: Dataset, iso2s: string[]): Dataset {
  const gone = new Set(iso2s)
  const ids = new Set(Object.values(ds.cities).filter((c) => gone.has(c.iso2)).map((c) => c.id))
  const without = <T>(r: Record<string, T>, drop: Set<string>) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.has(k)))
  return {
    ...ds,
    countries: Object.fromEntries(Object.entries(ds.countries).map(([k, c]) => {
      if (!gone.has(k)) return [k, c]
      const { iso2, name, schengen, eu, currency, languages, plugs, voltage, emergency } = c
      return [k, { iso2, name, schengen, eu, currency, languages, plugs, voltage, emergency, notes: [], auto: true as const }]
    })),
    cities: Object.fromEntries(Object.entries(ds.cities).map(([id, c]) => [id, ids.has(id)
      ? { ...c, tags: [], popularity: 3, days: { min: 1, ideal: 2, max: 3 }, costFactor: 1, longStay: false, auto: true as const }
      : c])),
    costs: without(ds.costs, gone),
    connections: ds.connections.filter((c) => !ids.has(c.from) && !ids.has(c.to)),
    localTransport: { cities: without(ds.localTransport.cities, ids), countries: without(ds.localTransport.countries, gone) },
    health: { countries: without(ds.health.countries, gone), cities: without(ds.health.cities, ids) },
    shopping: without(ds.shopping, gone),
    payments: { ...ds.payments, countries: without(ds.payments.countries, gone), cities: without(ds.payments.cities, ids) },
    phrases: { ...ds.phrases, countries: without(ds.phrases.countries, gone), cities: without(ds.phrases.cities ?? {}, ids) },
  }
}
