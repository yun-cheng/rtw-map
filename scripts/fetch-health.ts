// Vaccines and medicines for each country from CDC Travelers' Health destination pages (US government, public
// domain): https://wwwnc.cdc.gov/travel/destinations/traveler/none/<slug>. Each row of the page's vaccine table is
// written in a fixed form ("Recommended for unvaccinated travelers…", "Vaccine is not recommended", "Dogs infected
// with rabies are not commonly found…"), which is turned into "recommended" or "consider" with a short note of
// our own, or left out when CDC doesn't recommend it. Rows in a form we don't know are kept as "consider" with
// CDC's first sentence, and listed at the end so the rules can be extended.
// A country whose page can't be read keeps its previous entry.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GEN, SEED, readJson, sleep, today, writeJson } from './lib.ts'

type Advice = 'recommended' | 'consider'
export type CdcItem = { name: string; advice: Advice; note: string }
type Entry = { url: string; items: CdcItem[]; malaria: boolean }

const health = readJson<{ countries: Record<string, { cdcSlug: string }> }>(join(SEED, 'health.json'))
const OUT = join(GEN, 'cdc.json')
const previous: Record<string, Entry> = existsSync(OUT) ? readJson<{ countries: Record<string, Entry> }>(OUT).countries : {}

const text = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim()

/** Diseases on every page with the same advice; the app shows one "routine vaccines" line instead. */
const EVERYWHERE = new Set(['Routine vaccines', 'COVID-19', 'Measles', 'Monkeypox', 'Mpox'])
const unknown: string[] = []

/** Our reading of one row: advice and note, or null when CDC doesn't recommend anything for travellers. */
function classify(iso2: string, name: string, cdc: string): CdcItem | null {
  const item = (advice: Advice, note: string): CdcItem => ({ name, advice, note })
  switch (name) {
    case 'Yellow Fever':
      return /CDC recommendations: Vaccine is not recommended/.test(cdc) ? null : item('recommended', 'Required or recommended for some travellers: check with a travel clinic')
    case 'Cholera':
      return /not recommended/.test(cdc) ? null : item('consider', 'Only for higher-risk travel, such as aid work in outbreak areas')
    case 'Hepatitis A':
      if (/^Recommended for unvaccinated/.test(cdc)) return item('recommended', 'For unvaccinated travellers aged 1 and over')
      if (/^Consider/.test(cdc)) return item('consider', 'Recommended for small towns, rural areas and eating where hygiene is poor')
      break
    case 'Hepatitis B':
      if (/^Recommended for unvaccinated/.test(cdc)) {
        return item('recommended', /60 years/.test(cdc) ? 'For unvaccinated travellers under 60 (older travellers can discuss it)' : 'For unvaccinated travellers')
      }
      break
    case 'Rabies': {
      const dogs = cdc.match(/Dogs infected with rabies are (not commonly|sometimes|commonly) found/)?.[1]
      if (dogs) {
        const how = { 'not commonly': 'are rare', sometimes: 'are sometimes found', commonly: 'are common' }[dogs]
        return item('consider', `Dogs with rabies ${how}; consider it if you'll be around animals or far from medical care`)
      }
      break
    }
    case 'Tick-borne Encephalitis':
      // Japan's row only says to avoid bug bites.
      if (/^Avoid bug bites/.test(cdc)) return null
      if (/TBE vaccine is recommended/.test(cdc)) return item('consider', "If you'll spend time in forests or fields where ticks live, spring to autumn")
      break
    case 'Typhoid':
      if (/^Recommended for most travelers/.test(cdc)) return item('recommended', 'For most travellers')
      if (/Consider getting a typhoid vaccine/.test(cdc)) return item('consider', 'If you’ll eat or drink where sanitation is poor, or stay with friends or family')
      break
    case 'Japanese Encephalitis':
      if (/^Recommended for travelers who/.test(cdc)) return item('consider', 'For stays of a month or more, or lots of time outdoors in rural areas')
      break
    case 'Chikungunya':
      if (/generally not recommended/.test(cdc)) return null
      if (/elevated chikungunya risk/.test(cdc)) return item('consider', 'Higher risk here: may be considered for long stays; avoid mosquito bites')
      break
    case 'Malaria':
      if (/take prescription medicine to prevent malaria/.test(cdc)) return item('consider', 'Prescription medicine for certain areas: ask a travel clinic which ones')
      if (/not recommended|No malaria/i.test(cdc)) return null
      break
    case 'Polio':
      if (/increased risk/.test(cdc)) return item('recommended', 'Poliovirus found recently: adults may need a one-time booster')
      break
  }
  unknown.push(`${iso2} ${name}: ${cdc.slice(0, 120)}`)
  return item('consider', cdc.split(/(?<=\.) /)[0].slice(0, 200))
}

const countries: Record<string, Entry> = {}
for (const [iso2, { cdcSlug }] of Object.entries(health.countries)) {
  const url = `https://wwwnc.cdc.gov/travel/destinations/traveler/none/${cdcSlug}`
  const res = await fetch(url, { headers: { 'User-Agent': 'rtw-map data refresh (https://github.com/)' } }).catch(() => null)
  // The first table on the page is "Vaccines and Medicines".
  const table = res?.ok ? (await res.text()).match(/<table[^>]*id="dest-vm-a"[^>]*>([\s\S]*?)<\/table>/)?.[1] : undefined
  if (!table) {
    console.error(`CDC ${cdcSlug}: ${res ? res.status : 'no response'}${res?.ok ? ', no vaccine table' : ''}; keeping the previous entry`)
    if (previous[iso2]) countries[iso2] = previous[iso2]
    continue
  }
  const items: CdcItem[] = []
  for (const [, row] of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]))
    if (cells.length < 2 || EVERYWHERE.has(cells[0])) continue
    const item = classify(iso2, cells[0], cells[1])
    if (item) items.push(item)
  }
  // Recommended first, then CDC's order.
  items.sort((a, b) => (a.advice === b.advice ? 0 : a.advice === 'recommended' ? -1 : 1))
  countries[iso2] = { url, items, malaria: items.some((i) => i.name === 'Malaria') }
  await sleep(300)
}

if (unknown.length) console.warn(`CDC rows in a form we don't know yet (kept as "consider"):\n  ${unknown.join('\n  ')}`)
writeJson(OUT, { _meta: { source: "CDC Travelers' Health destination pages (public domain)", updatedAt: today() }, countries })
