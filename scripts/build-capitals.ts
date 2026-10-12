// The capital of every country on the map that has no hand-curated cities yet, and that country's basic facts, from
// open data only (nothing written for the app): GeoNames country info and cities500 (CC-BY 4.0) for the capital, its
// location, population and timezone, and the country's currency and languages; Wikidata (CC0) for the capital's short
// description and the country's plugs, mains voltage and emergency numbers. build-cities adds these cities and
// build-seed these countries, marked `auto`. Writes data/gen/capitals.json.
import { join } from 'node:path'
import { GEN, SEED, fetchCached, loadGeonames, normalize, readCsv, readJson, today, writeJson } from './lib.ts'

const COUNTRY_INFO = 'https://download.geonames.org/export/dump/countryInfo.txt'
const SPARQL = 'https://query.wikidata.org/sparql'

/** Wikidata's plug standards as the plug letters travellers know. */
const PLUG_LETTER: Record<string, string> = {
  'NEMA 1-15': 'A', 'NEMA 5-15': 'B', Europlug: 'C', 'BS 546': 'D', 'Type E': 'E', Schuko: 'F', 'BS 1363': 'G',
  'AC power plugs and sockets: British and related types': 'G', 'Type H': 'H', 'AS/NZS 3112': 'I', 'SN 441011': 'J',
  'Type K': 'K', 'Type L': 'L', 'IEC 60906-1': 'N',
}

type Boundaries = { features: { properties: { iso2: string; name: string } }[] }
const world = readJson<Boundaries>(join(GEN, 'boundaries.json')).features.map((f) => f.properties)
const curated = new Set(readCsv(join(SEED, 'cities.csv')).map((c) => c.iso2))
const todo = world.filter((c) => !curated.has(c.iso2))

// GeoNames country info: ISO, ISO3, numeric, FIPS, name, capital, area, population, continent, tld, currency code,
// currency name, phone, postal format, postal regex, languages, geonameid, neighbours.
const info = new Map(
  (await fetchCached(COUNTRY_INFO, 'countryInfo.txt')).split('\n').filter((l) => l && !l.startsWith('#')).map((l) => {
    const f = l.split('\t')
    return [f[0], { capital: f[5], currency: f[10], languages: f[15] }] as const
  }),
)

const places = (await loadGeonames()).filter((g) => g[6] === 'P')

/** The capital's GeoNames row: the one marked as the capital, else (where that's disputed) the largest place by its name. */
function capitalOf(iso2: string, name: string) {
  const marked = places.find((g) => g[8] === iso2 && g[7] === 'PPLC')
  if (marked) return marked
  const target = normalize(name)
  return places
    .filter((g) => g[8] === iso2 && (normalize(g[1]) === target || normalize(g[2]) === target || g[3].split(',').some((a) => normalize(a) === target)))
    .sort((a, b) => Number(b[14]) - Number(a[14]))[0]
}

async function sparql(query: string): Promise<Record<string, string>[]> {
  const res = await fetch(`${SPARQL}?${new URLSearchParams({ query })}`, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'rtw-map-data-build/1.0 (https://github.com)' },
  })
  if (!res.ok) throw new Error(`Wikidata: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as { results: { bindings: Record<string, { value: string }>[] } }
  return json.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])))
}

const languageName = new Intl.DisplayNames(['en'], { type: 'language' })
const languagesOf = (codes: string) =>
  [...new Set(codes.split(',').map((c) => c.split('-')[0]).filter(Boolean).map((c) => { try { return languageName.of(c) ?? c } catch { return c } }))].slice(0, 4)

/** Unique, lowercase letters-only ids like the curated ones ("stpetersburg"), the country added when one is taken. */
const taken = new Set(readCsv(join(SEED, 'cities.csv')).map((c) => c.id))
function idFor(name: string, iso2: string) {
  const base = normalize(name).replace(/[^a-z]/g, '')
  const id = taken.has(base) ? `${base}${iso2.toLowerCase()}` : base
  taken.add(id)
  return id
}

const missing: string[] = []
const cities = todo.flatMap((c) => {
  const capital = info.get(c.iso2)?.capital
  const g = capital && capitalOf(c.iso2, capital)
  if (!g) { missing.push(`${c.iso2} ${c.name}`); return [] }
  return [{ iso2: c.iso2, name: g[1], lat: Number(g[4]), lon: Number(g[5]), population: Number(g[14]) || null, timezone: g[17] || null, geonameId: Number(g[0]) }]
})
if (missing.length) console.warn(`No capital found, left out: ${missing.join(', ')}`)

const iso = todo.map((c) => `"${c.iso2}"`).join(' ')
const facts = await sparql(`
  SELECT ?iso (GROUP_CONCAT(DISTINCT ?plugLabel; separator="|") AS ?plugs) (GROUP_CONCAT(DISTINCT ?volt; separator="|") AS ?volts)
         (GROUP_CONCAT(DISTINCT ?emLabel; separator="|") AS ?emergency)
  WHERE {
    VALUES ?iso { ${iso} } ?c wdt:P297 ?iso .
    OPTIONAL { ?c wdt:P2853 ?plug . ?plug rdfs:label ?plugLabel FILTER(lang(?plugLabel) = "en") }
    OPTIONAL { ?c wdt:P2884 ?volt }
    OPTIONAL { ?c wdt:P2852 ?e . ?e rdfs:label ?emLabel FILTER(lang(?emLabel) = "en") }
  } GROUP BY ?iso`)
const factsOf = new Map(facts.map((f) => [f.iso, f]))

const gids = cities.map((c) => `"${c.geonameId}"`).join(' ')
const described = await sparql(`
  SELECT ?gid ?d WHERE { VALUES ?gid { ${gids} } ?c wdt:P1566 ?gid ; schema:description ?d FILTER(lang(?d) = "en") }`)
const description = new Map(described.map((d) => [Number(d.gid), d.d]))

const split = (s: string | undefined) => (s ? s.split('|').filter(Boolean) : [])
const countries = cities.map(({ iso2 }) => {
  const f = factsOf.get(iso2)
  const volts = split(f?.volts).map(Number).filter((v) => v > 0).sort((a, b) => b - a)
  return {
    iso2,
    name: world.find((w) => w.iso2 === iso2)!.name,
    currency: info.get(iso2)?.currency || null,
    languages: languagesOf(info.get(iso2)?.languages ?? ''),
    plugs: [...new Set(split(f?.plugs).map((p) => PLUG_LETTER[p]).filter(Boolean))].sort(),
    voltage: volts[0] ?? null,
    emergency: split(f?.emergency).filter((e) => /^[\d ]+$/.test(e)).sort().join(', ') || null,
  }
})

writeJson(join(GEN, 'capitals.json'), {
  _meta: {
    source: 'GeoNames country info and cities500 (CC-BY 4.0): capitals, currencies, languages; Wikidata (CC0): descriptions, plugs, voltage, emergency numbers',
    updatedAt: today(),
  },
  cities: cities.map((c) => ({ id: idFor(c.name, c.iso2), ...c, blurb: description.get(c.geonameId) ?? '' })),
  countries,
})
