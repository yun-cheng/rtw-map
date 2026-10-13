// Public holidays from Google Calendar's public holiday calendars (the "Holidays in …" ones anyone can add), all the years
// Google has (about five back and five ahead; past trips can be kept in the app, so years it no longer has are kept
// from earlier runs): its entries marked "Public holiday", nationwide, and
// "Public holiday in <regions>", those of some of a country's states or provinces, with their names (shown for the
// whole country: cities don't say which they're in). Days off set each year (bridge days, substitute days, holidays
// that wait for the moon to be seen) come in as governments announce them, so later years have fewer.
// A country Google has none for gets none (the city panel says so); one whose calendar can't be reached keeps its
// holidays from the last run.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GEN, readJson, today, writeJson } from './lib.ts'

/** (regions: the states or provinces it's a holiday in; none: all of the country.) */
type Holiday = { date: string; name: string; regions?: string[] }
type Country = { years: number[]; days: Holiday[] }

const { countries } = readJson<{ countries: { iso2: string }[] }>(join(GEN, 'countries.json'))

const FILE = join(GEN, 'holidays.json')
const before = existsSync(FILE) ? readJson<{ countries: Record<string, Partial<Country>> }>(FILE).countries : {}

// Calendars older than the ones named by country code (en.al, en.th…) have names of their own.
const NAMES: Record<string, string> = {
  AT: 'austrian', AU: 'australian', BG: 'bulgarian', BR: 'brazilian', CA: 'canadian', CN: 'china', CZ: 'czech', DE: 'german',
  DK: 'danish', ES: 'spain', FI: 'finnish', FR: 'french', GB: 'uk', GR: 'greek', HK: 'hong_kong', HR: 'croatian',
  HU: 'hungarian', ID: 'indonesian', IE: 'irish', IL: 'jewish', IN: 'indian', IT: 'italian', JP: 'japanese', KR: 'south_korea',
  LT: 'lithuanian', LV: 'latvian', MX: 'mexican', MY: 'malaysia', NL: 'dutch', NO: 'norwegian', NZ: 'new_zealand', PH: 'philippines',
  PL: 'polish', PT: 'portuguese', RO: 'romanian', RU: 'russian', SE: 'swedish', SG: 'singapore', SI: 'slovenian', SK: 'slovak',
  TR: 'turkish', TW: 'taiwan', UA: 'ukrainian', US: 'usa', VN: 'vietnamese', ZA: 'sa',
}
const calendarUrl = (iso2: string) =>
  `https://calendar.google.com/calendar/ical/${encodeURIComponent(`en.${NAMES[iso2] ?? iso2.toLowerCase()}#holiday@group.v.calendar.google.com`)}/public/basic.ics`

/** A calendar's events: their day, name and kind (the first line of the description: "Public holiday", "Observance"…). */
type CalendarEvent = { date: string; name: string; kind: string }
function events(ics: string): CalendarEvent[] {
  // (Unescaped, without zero-width spaces.)
  const text = (s = '') => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').replace(/​/g, '').trim()
  const out: CalendarEvent[] = []
  let e: Record<string, string> | null = null
  // (Long lines go on in the next one, starting with a space.)
  for (const line of ics.replace(/\r/g, '').replace(/\n[ \t]/g, '').split('\n')) {
    if (line === 'BEGIN:VEVENT') e = {}
    else if (line === 'END:VEVENT' && e) {
      const d = e.DTSTART ?? ''
      if (/^\d{8}$/.test(d)) out.push({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, name: text(e.SUMMARY), kind: text(e.DESCRIPTION).split('\n')[0] })
      e = null
    } else if (e) {
      const i = line.indexOf(':')
      e[line.slice(0, i).split(';')[0]] = line.slice(i + 1)
    }
  }
  return out
}

const REGIONAL = /^Public holiday in (.+)$/
/** A country's holidays, all of Google's years; throws when its calendar can't be reached. */
async function holidaysOf(iso2: string): Promise<Country> {
  // (A calendar that doesn't answer fails rather than holding the run up.)
  const r = await fetch(calendarUrl(iso2), { signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`${r.status}`)
  const days: Holiday[] = []
  for (const e of events(await r.text())) {
    if (e.kind === 'Public holiday') days.push({ date: e.date, name: e.name })
    else {
      const regions = e.kind.match(REGIONAL)?.[1].split(', ')
      // (Its name without "(regional holiday)": the regions say so.)
      if (regions) days.push({ date: e.date, name: e.name.replace(/\s*\(regional holiday\)$/i, ''), regions })
    }
  }
  // (In date order; the same holiday twice on a day only once.)
  const seen = new Set<string>()
  const sorted = days.sort((a, b) => a.date.localeCompare(b.date)).filter((h) => !seen.has(h.date + h.name) && seen.add(h.date + h.name))
  return { years: [...new Set(sorted.map((h) => +h.date.slice(0, 4)))], days: sorted }
}

const out: Record<string, Country> = {}
const queue = [...countries]
// (A few countries at a time.)
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let c = queue.shift(); c; c = queue.shift()) {
    try {
      const got = await holidaysOf(c.iso2)
      // (Years only an earlier run has: Google's go on moving forward.)
      const kept = (before[c.iso2]?.days ?? []).filter((h) => !got.years.includes(+h.date.slice(0, 4)))
      const days = [...kept, ...got.days].sort((a, b) => a.date.localeCompare(b.date))
      if (days.length) out[c.iso2] = { years: [...new Set(days.map((h) => +h.date.slice(0, 4)))], days }
    } catch (e) {
      const kept = before[c.iso2]
      console.warn(`${c.iso2}: calendar unavailable (${(e as Error).message.slice(0, 100)})${kept?.years ? '; kept last run\'s' : ''}`)
      if (kept?.years) out[c.iso2] = kept as Country
    }
  }
}))
const none = countries.filter((c) => !out[c.iso2]).map((c) => c.iso2)
console.log(`${Object.keys(out).length} countries; none for ${none.length}: ${none.join(' ')}`)

writeJson(FILE, {
  _meta: { source: "Google Calendar's public holiday calendars", updatedAt: today() },
  countries: Object.fromEntries(countries.filter((c) => out[c.iso2]).map((c) => [c.iso2, out[c.iso2]])),
}, true)
