// Reads a "Visa requirements for … citizens" article's main table (Wikipedia, CC BY-SA 4.0) into each destination's
// allowed stay, how the limit counts, the notes (fees among them) and the official site to apply on; used by
// scripts/fetch-visa-stays.ts. Whether a visa is needed stays the Passport Index's (build-visa.ts).
import type { VisaStay } from '../planner/types'

/** The article for each passport, by its citizens; EU / EEA / Swiss citizens by Germany's, as build-visa.ts does. */
export const ARTICLES: Record<string, string> = {
  EU: 'German', GB: 'British', US: 'United States', CA: 'Canadian', AU: 'Australian', NZ: 'New Zealand',
  JP: 'Japanese', KR: 'South Korean', TW: 'Taiwanese',
}
export const articleTitle = (passport: string) => `Visa requirements for ${ARTICLES[passport]} citizens`
/** The passport's article on Wikipedia. */
export const articleUrl = (passport: string) => ARTICLES[passport] && `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle(passport).replace(/ /g, '_'))}`

/** Templates whose text is their last parameter (the requirement cells' colours: {{yes|Visa not required}}). */
const LAST = new Set(['yes', 'yes2', 'no', 'no2', 'optional', 'free', 'partial', 'n/a', 'na', 'maybe', 'lang', 'tooltip', 'small', 'big'])
/** Templates whose text is their first parameter. */
const FIRST = new Set(['flag', 'flagcountry', 'flagu', 'abbr', 'nowrap', 'nobr', 'nbsp', 'ill', 'visa'])

function template(body: string): string {
  const [name, ...params] = body.split('|').map((p) => p.trim())
  const key = name.toLowerCase()
  const positional = params.filter((p) => !/^[\w-]+\s*=/.test(p))
  if (key === 'sort') return positional[1] ?? ''
  if (key === 'convert') return positional.slice(0, 2).join(' ')
  if (key === 'us$') return `US$${positional[0] ?? ''}`
  if (LAST.has(key)) return positional.at(-1) ?? ''
  if (FIRST.has(key) || key.startsWith('flag')) return positional[0] ?? ''
  return ''
}

/** Wikitext as plain text: no references, templates read or dropped, links as their text. */
export function plain(s: string): string {
  // (Links first: a link's | inside a template isn't the template's.)
  let t = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
  for (let prev = ''; prev !== t;) {
    prev = t
    t = t.replace(/\{\{([^{}]*)\}\}/g, (_, body: string) => template(body))
  }
  return t
    .replace(/\[https?:\/\/\S+\s([^\]]*)\]/g, '$1')
    .replace(/\[https?:\/\/[^\]]*\]/g, '')
    .replace(/'{2,}/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Templates written over several lines, read before the notes are split into points: footnotes dropped, a {{trim|…}}
 *  as its text. */
export function unwrap(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const m = /\{\{\s*(refn|efn|efn-ua|notetag|trim)\s*\|/i.exec(s.slice(i))
    if (!m) { out += s.slice(i); break }
    const start = i + m.index
    out += s.slice(i, start)
    let depth = 0
    let j = start
    for (; j < s.length; j++) {
      if (s.startsWith('{{', j)) { depth++; j++ } else if (s.startsWith('}}', j)) { depth--; j++; if (!depth) break }
    }
    out += m[1].toLowerCase() === 'trim' ? unwrap(s.slice(start + m[0].length, j - 1)) : ''
    i = j + 1
  }
  return out
}

/** A cell's content without its attributes (`data-sort-value="60" | 30 days`). */
const content = (cell: string) => cell.replace(/^\s*(?:[\w-]+\s*=\s*(?:"[^"|]*"?|[^\s|]+)\s*)+\|(?!\|)/, '')

const UNIT: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 }
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, six: 6, twelve: 12 }
const num = (s: string) => WORDS[s.toLowerCase()] ?? Number(s)

/** The longest stay a text allows, in days ("30 days / 60 days" → 60, "3 months" → 90, "1 year" → 365). */
export function stayDays(text: string): number | undefined {
  const all = [...text.matchAll(/(\d+|one|two|three|four|six|twelve)\s*(day|week|month|year)s?\b/gi)].map((m) => num(m[1]) * UNIT[m[2].toLowerCase()])
  return all.length ? Math.max(...all) : undefined
}

/** How the limit counts, from the stay and its notes: at most so many days in any period (90 in 180), or per entry. */
export function limitRule(text: string): { window?: { days: number; in: number }; perEntry?: true } {
  const m = text.match(/(\d+)\s*days?\s*(?:within|in|per|during|out of|every)\s*(?:any|a|an|each|one|every|the)?\s*(?:period of\s*)?(\d+|one|six|twelve)?\s*[- ]?(?:calendar\s*)?(day|month|year)s?\b/i)
  const window = m && { days: Number(m[1]), in: (m[2] ? num(m[2]) : 1) * UNIT[m[3].toLowerCase()] }
  const perEntry = /per (entry|visit|stay|trip)\b|each (entry|visit)\b/i.test(text)
  return { ...(window && window.days < window.in && { window }), ...(perEntry && { perEntry: true as const }) }
}

/** Whether a note says the stay can be extended (true), can't (false), or says nothing of it. */
export function extendable(notes: string[]): boolean | undefined {
  const about = notes.filter((n) => /extendable|extension|\b(be|been|get|is|are) extended|\bextend (the|your|their|it|a|one's)\b|prolong/i.test(n))
  if (!about.length) return undefined
  return !about.some((n) => /\b(cannot|can ?not|can't|not be|non[- ]?extendable|no extension|not extendable|not possible)\b/i.test(n))
}

/** A government's parts of an address (whole parts only: a look-alike such as evisa.govn.tr or
 *  vietnam-immigration.vn is no official site). */
const OFFICIAL = new Set(['gov', 'gob', 'gouv', 'go', 'govt', 'gv', 'gub', 'gc', 'admin', 'mfa', 'mofa', 'mid', 'kdmid', 'mvd', 'immigration', 'imigrasi', 'migracion', 'migraciones', 'police'])
const CC_TLD: Record<string, string> = { GB: 'uk' }

/** The official site to apply on, among the addresses a row cites: on the destination's own domain (.gov for the
 *  US), and one about visas where there's a choice. */
export function applySite(raw: string, iso2: string): string | undefined {
  const tld = iso2 === 'US' ? 'gov' : CC_TLD[iso2] ?? iso2.toLowerCase()
  const urls = [...raw.matchAll(/https?:\/\/[^\s|}\]<>"]+/g)].map((m) => m[0])
  const ok = urls.filter((u) => {
    try {
      const host = new URL(u).hostname.toLowerCase()
      return host.endsWith(`.${tld}`) && (iso2 === 'US' || host.split('.').slice(0, -1).some((part) => OFFICIAL.has(part)))
    } catch { return false }
  })
  return ok.find((u) => /visa|eta|immigra|migra/i.test(u)) ?? ok[0]
}

/** The notes kept on another page (Template:Transcluded sections for the visa articles), by heading. */
export function sectionsOf(wikitext: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of wikitext.split(/^==(?!=)/m).slice(1)) {
    const [head, ...body] = part.split('\n')
    out[head.replace(/=+\s*$/, '').trim()] = body.join('\n')
  }
  return out
}

/** Each destination's row of the article's main table (the first table with flags), by its ISO code. */
export function parseVisaPage(wikitext: string, sections: Record<string, string>, isoOf: (name: string) => string | null) {
  const table = wikitext.split(/\n\{\|/).slice(1).find((t) => /\{\{flag/i.test(t))?.split(/\n\|\}/)[0] ?? ''
  const stays: Record<string, VisaStay> = {}
  const unmatched: string[] = []
  for (const row of table.split(/\n\|-[^\n]*\n/)) {
    const name = row.match(/\{\{flag\w*\|([^|}]+)/i)?.[1]?.trim()
    if (!name) continue
    const iso2 = isoOf(name)
    if (!iso2) { unmatched.push(name); continue }
    const cells = row.split(/\n\|(?!\})/)
    const [req = '', stayCell = '', notesCell = ''] = cells.slice(1).map(content)
    // Notes kept on the shared page are written in place.
    const notesRaw = unwrap(notesCell.replace(/<!--[\s\S]*?(-->|$)/g, '').replace(/\{\{#section-h::[^|}]*\|([^}]*)\}\}/g, (_, h: string) => sections[h.trim()] ?? ''))
    const notes = notesRaw.split(/\n(?=[*#])/).map((n) => plain(n.replace(/^[*#:\s]+/, ''))).filter((n) => n.length > 1)
    const text = plain(stayCell)
    const days = /unlimited|indefinite|freedom of movement/i.test(text) ? undefined : stayDays(text)
    const stay: VisaStay = {
      ...(text && { text }),
      ...(days && { days }),
      ...limitRule([text, ...notes].join(' \n ')),
      notes,
    }
    const extend = extendable(notes)
    if (extend !== undefined) stay.extend = extend
    const apply = applySite(`${req}\n${stayCell}\n${notesRaw}`, iso2)
    if (apply) stay.apply = apply
    stays[iso2] = stay
  }
  return { stays, unmatched }
}
