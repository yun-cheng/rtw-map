// Each destination's allowed stay for the supported passports, how the limit counts, the notes (fees, extensions)
// and the official site to apply on, from Wikipedia's "Visa requirements for … citizens" articles (CC BY-SA 4.0).
// Whether a visa is needed stays the Passport Index's (build-visa.ts). Always verify with official sources.
import { join } from 'node:path'
import { ARTICLES, articleTitle, parseVisaPage, sectionsOf } from '../src/data/visaWiki'
import type { VisaStay } from '../src/planner/types'
import { GEN, readJson, today, writeJson } from './lib.ts'

const SECTIONS = 'Template:Transcluded sections for the visa articles'

async function wikitext(title: string) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&redirects=1&format=json&formatversion=2`
  const res = await fetch(url, { headers: { 'User-Agent': 'rtw-map data build (https://github.com/yun-cheng/rtw-map)' } })
  if (!res.ok) throw new Error(`${title}: ${res.status}`)
  const json = (await res.json()) as { parse?: { wikitext: string; revid?: number }; error?: { info: string } }
  if (!json.parse) throw new Error(`${title}: ${json.error?.info}`)
  return json.parse.wikitext
}

// Country names as the articles write them, to ISO codes: English names for every code, the map's names, and the
// articles' own.
const names = new Map<string, string>()
const key = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^the /, '').replace(/[^a-z]/g, '')
const display = new Intl.DisplayNames(['en'], { type: 'region' })
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
  const code = String.fromCharCode(a, b)
  const name = display.of(code)
  if (name && name !== code) names.set(key(name), code)
}
for (const { properties: p } of readJson<{ features: { properties: { iso2: string; name: string } }[] }>(join(GEN, 'boundaries.json')).features) names.set(key(p.name), p.iso2)
const ALIASES: Record<string, string> = {
  'Ivory Coast': 'CI', 'Republic of the Congo': 'CG', 'Democratic Republic of the Congo': 'CD', 'DR Congo': 'CD', 'East Timor': 'TL',
  'Cape Verde': 'CV', 'Czech Republic': 'CZ', 'Eswatini': 'SZ', 'Swaziland': 'SZ', 'Federated States of Micronesia': 'FM', 'Micronesia': 'FM',
  'Vatican City': 'VA', 'Burma': 'MM', 'Myanmar': 'MM', 'Turkey': 'TR', 'Türkiye': 'TR', 'North Korea': 'KP', 'South Korea': 'KR',
  'Palestine': 'PS', 'State of Palestine': 'PS', 'Gambia': 'GM', 'The Gambia': 'GM', 'Bahamas': 'BS', 'Kosovo': 'XK', 'Macau': 'MO', 'Macao': 'MO',
  'Hong Kong': 'HK', 'Taiwan': 'TW', 'People\'s Republic of China': 'CN', 'China': 'CN', 'Russia': 'RU', 'Laos': 'LA', 'Vietnam': 'VN',
  'Brunei': 'BN', 'Syria': 'SY', 'Iran': 'IR', 'Moldova': 'MD', 'Bolivia': 'BO', 'Venezuela': 'VE', 'Tanzania': 'TZ', 'North Macedonia': 'MK',
  'São Tomé and Príncipe': 'ST', 'Saint Kitts and Nevis': 'KN', 'Saint Lucia': 'LC', 'Saint Vincent and the Grenadines': 'VC',
}
for (const [name, code] of Object.entries(ALIASES)) names.set(key(name), code)
const isoOf = (name: string) => names.get(key(name)) ?? null

const sections = sectionsOf(await wikitext(SECTIONS))
const stays: Record<string, Record<string, VisaStay>> = {}
for (const passport of Object.keys(ARTICLES)) {
  const page = parseVisaPage(await wikitext(articleTitle(passport)), sections, isoOf)
  stays[passport] = page.stays
  const n = Object.values(page.stays)
  console.log(`${passport}: ${n.length} destinations, ${n.filter((s) => s.days).length} with a stay, ${n.filter((s) => s.window || s.perEntry).length} with how it counts, ${n.filter((s) => s.apply).length} with a site${page.unmatched.length ? `; not matched: ${page.unmatched.join(', ')}` : ''}`)
}

writeJson(join(GEN, 'visa-stays.json'), {
  _meta: {
    source: 'Wikipedia, "Visa requirements for … citizens" articles (CC BY-SA 4.0); EU / EEA / Swiss by German citizens\'.',
    updatedAt: today(),
  },
  stays,
})
