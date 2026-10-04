// Visa requirements for the supported passports from the Passport Index dataset
// (github.com/imorte/passport-index-data, MIT). Always verify with official sources.
import { join } from 'node:path'
import { GEN, SEED, readJson, today, writeJson } from './lib.ts'

const URL = 'https://raw.githubusercontent.com/imorte/passport-index-data/main/passport-index-tidy-iso2.csv'

// EU/EEA/Swiss citizens are one group; Germany's row stands in for non-EU destinations.
const PASSPORTS = [
  { code: 'EU', name: 'EU / EEA / Swiss', proxy: 'DE' },
  { code: 'GB', name: 'United Kingdom', proxy: 'GB' },
  { code: 'US', name: 'United States', proxy: 'US' },
  { code: 'CA', name: 'Canada', proxy: 'CA' },
  { code: 'AU', name: 'Australia', proxy: 'AU' },
  { code: 'NZ', name: 'New Zealand', proxy: 'NZ' },
  { code: 'JP', name: 'Japan', proxy: 'JP' },
  { code: 'KR', name: 'South Korea', proxy: 'KR' },
  { code: 'TW', name: 'Taiwan', proxy: 'TW' },
]

type Country = { iso2: string; eu: boolean }
const { countries } = readJson<{ countries: Country[] }>(join(SEED, 'countries.json'))

const res = await fetch(URL)
if (!res.ok) throw new Error(`visa dataset: ${res.status}`)
const lines = (await res.text()).trim().split('\n').slice(1)
const table = new Map(lines.map((l) => { const [p, d, r] = l.split(','); return [`${p}-${d}`, r.trim()] }))

function normalize(raw: string | undefined) {
  if (raw === undefined) return { req: 'unknown' }
  if (/^\d+$/.test(raw)) return { req: 'visa_free', days: Number(raw) }
  const map: Record<string, string> = {
    'visa free': 'visa_free', 'visa on arrival': 'visa_on_arrival', 'e-visa': 'e_visa', eta: 'eta',
    'visa required': 'visa_required', 'no admission': 'no_admission', '-1': 'own_country',
  }
  return { req: map[raw] ?? 'unknown', raw }
}

const rules: Record<string, Record<string, unknown>> = {}
for (const p of PASSPORTS) {
  rules[p.code] = {}
  for (const c of countries) {
    rules[p.code][c.iso2] =
      p.code === 'EU' && c.eu ? { req: 'free_movement' } : normalize(table.get(`${p.proxy}-${c.iso2}`))
  }
}

writeJson(join(GEN, 'visa.json'), {
  _meta: {
    source: 'Passport Index dataset (github.com/imorte/passport-index-data, MIT). EU group uses Germany as a proxy outside the EU.',
    updatedAt: today(),
  },
  passports: PASSPORTS.map(({ code, name }) => ({ code, name })),
  rules,
})
