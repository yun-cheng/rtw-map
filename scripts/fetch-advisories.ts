// Travel advisories from two official sources:
// - UK FCDO travel advice (Open Government Licence v3.0) via the GOV.UK Content API
// - US State Department travel advisory levels (public domain)
// A country is excluded from routes by default if either says "do not travel" for the whole country.
import { join } from 'node:path'
import { GEN, normalize, readJson, sleep, today, writeJson } from './lib.ts'

// Every country the app has cities in (built by build-seed): the curated ones name their FCDO page; the others are
// found in GOV.UK's index of travel advice by name (FCDO_NAMES where it calls them otherwise).
type Country = { iso2: string; name: string; fcdoSlug?: string }
const { countries } = readJson<{ countries: Country[] }>(join(GEN, 'countries.json'))

const FCDO_NAMES: Record<string, string> = {
  CD: 'Democratic Republic of the Congo', CK: 'Cook Islands, Tokelau and Niue', NU: 'Cook Islands, Tokelau and Niue',
  CV: 'Cape Verde', FM: 'Federated States of Micronesia', GM: 'The Gambia', KN: 'St Kitts and Nevis', LC: 'St Lucia',
  MF: 'St Martin and St Barthélemy', BL: 'St Martin and St Barthélemy', MM: 'Myanmar (Burma)', PM: 'St Pierre & Miquelon',
  PN: 'Pitcairn Island', SH: 'St Helena, Ascension and Tristan da Cunha', SX: 'St Maarten', US: 'USA',
  VC: 'St Vincent and the Grenadines',
}
const key = (s: string) => normalize(s).replace(/[^a-z]/g, '')
const fcdoIndex = new Map<string, string>()
{
  const res = await fetch('https://www.gov.uk/api/content/foreign-travel-advice')
  if (!res.ok) throw new Error(`FCDO index: ${res.status}`)
  const children = ((await res.json()).links?.children ?? []) as { base_path: string; details?: { country?: { name?: string } } }[]
  for (const c of children) if (c.details?.country?.name) fcdoIndex.set(key(c.details.country.name), c.base_path.split('/').pop()!)
}
const slugOf = (c: Country) => c.fcdoSlug ?? fcdoIndex.get(key(FCDO_NAMES[c.iso2] ?? c.name))

// Higher = more severe. Level 4 for the whole country means "excluded from routes by default".
const LEVELS: Record<string, number> = {
  avoid_all_travel_to_whole_country: 4,
  avoid_all_but_essential_travel_to_whole_country: 3,
  avoid_all_travel_to_parts: 3,
  avoid_all_but_essential_travel_to_parts: 2,
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

// US titles look like "Russia - Level 4: Do Not Travel".
const US_ALIASES: Record<string, string[]> = {
  CZ: ['Czechia', 'Czech Republic'], BA: ['Bosnia and Herzegovina', 'Bosnia & Herzegovina'], BS: ['The Bahamas'],
  CD: ['Democratic Republic of the Congo'], CG: ['Republic of Congo'], CI: ['Côte d’Ivoire', "Côte d'Ivoire"],
  FM: ['Federated States of Micronesia'], GM: ['The Gambia'], MM: ['Burma'], MO: ['Macau'], DK: ['Kingdom of Denmark'],
  KG: ['The Kyrgyz Republic'], MX: ['Mexico', 'Mexico Travel Advisory'], PS: ['West Bank'],
}
type UsAdvisory = { Title: string; Link: string; Updated: string; Published: string }
const usRes = await fetch('https://cadataapi.state.gov/api/TravelAdvisories')
const usList: UsAdvisory[] = usRes.ok ? await usRes.json() : []
if (!usRes.ok) console.error(`US advisories: ${usRes.status}`)
function usFor(c: Country) {
  const names = US_ALIASES[c.iso2] ?? [c.name]
  const hit = usList.find((x) => names.some((n) => x.Title.split(' - ')[0].trim() === n))
  const level = Number(hit?.Title.match(/Level (\d)/)?.[1])
  return hit && level ? { level, title: hit.Title, url: hit.Link, updatedAt: hit.Updated || hit.Published } : null
}

const advisories: Record<string, unknown> = {}
for (const c of countries) {
  const us = usFor(c)
  if (!us) console.error(`US advisory not found for ${c.name}`)
  const slug = slugOf(c)
  // None for the UK itself, its crown dependencies, and territories the FCDO covers with their country.
  if (!slug) { console.error(`No FCDO advice for ${c.name}`); continue }
  const res = await fetch(`https://www.gov.uk/api/content/foreign-travel-advice/${slug}`)
  if (!res.ok) { console.error(`FCDO ${slug}: ${res.status}`); continue }
  const d = await res.json()
  const status: string[] = d.details?.alert_status ?? []
  const level = Math.max(1, ...status.map((s) => LEVELS[s] ?? 1))
  const parts = (d.details?.parts ?? []) as { title: string; slug: string; body: string }[]
  const body = (slug: string) => parts.find((x) => x.slug === slug)?.body ?? ''
  // Split a part into its <h2>/<h3> sections, e.g. "Crime", "Protests", "Scams".
  const sections = (html: string) =>
    html
      .split(/<h[23][^>]*>/)
      .slice(1)
      .map((chunk) => {
        const [heading, ...rest] = chunk.split(/<\/h[23]>/)
        return { heading: stripHtml(heading), text: stripHtml(rest.join(' ')).slice(0, 500) }
      })
      .filter((x) => x.text && x.heading !== 'Terrorism')
  advisories[c.iso2] = {
    issuer: 'UK FCDO',
    level: Math.max(level, us?.level ?? 1),
    alertStatus: status,
    excludedByDefault: status.includes('avoid_all_travel_to_whole_country') || us?.level === 4,
    us,
    summary: stripHtml(d.description ?? ''),
    warnings: stripHtml(body('warnings-and-insurance')).slice(0, 1500),
    safety: sections(body('safety-and-security')).slice(0, 14),
    url: `https://www.gov.uk/foreign-travel-advice/${slug}`,
    updatedAt: d.public_updated_at,
  }
  console.log(`${c.iso2} FCDO ${level} ${status.join(',')} | US ${us?.level ?? '?'}`)
  await sleep(300)
}

writeJson(join(GEN, 'advisories.json'), {
  _meta: { source: 'UK FCDO travel advice (OGL v3.0) and US State Department travel advisories', updatedAt: today() },
  advisories,
})
