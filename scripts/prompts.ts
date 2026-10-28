// Runs the data prompts (prompts/*.md) with AI models, and checks and keeps each answer as a run
// (data/runs/<dataset>/v<version>/<month>/<model>/<name>.json) to compare with the other sources on the review page.
// Nothing here changes the app's data. A prompt asks about cities (by their id in cities.csv) or countries (by their
// code); the list is made from the data each time, so a city added later is simply asked about next time. A prompt's
// `version` (its front matter) goes up when what it asks changes, so answers to an older one are kept apart.
//
// For an agent that splits the work itself, on any computer, the prompts go to the prompts repo (rtw-map-prompts,
// beside this project, or RTW_PROMPTS_DIR): <dataset>/v<version>/prompt.md and its list, and the agent writes its
// answers there, in answers/<month>/<model>/<id>.json, and pushes them.
//
//   npx tsx scripts/prompts.ts render costs --agent          the prompt and its list into the prompts repo; again
//                                                            after adding cities (the answers so far stay)
//   npx tsx scripts/prompts.ts check costs --agent           check and keep every model's answers there, this version's
//
// One city (--city <id>) or country (--country <code>) at a time, with Gemini CLI or a chat:
//
//   npx tsx scripts/prompts.ts list costs [--model <name>]   the cities, and which a model has answered this month
//   npx tsx scripts/prompts.ts run costs --city tirana       with Gemini CLI (--model <id> to pick its model; the run's
//   npx tsx scripts/prompts.ts run costs --all               name, else gemini-cli); --all: every city not yet run
//   npx tsx scripts/prompts.ts render costs --city tirana    to paste into a chat…
//   npx tsx scripts/prompts.ts check costs reply.json --city tirana --model gemini-app   …and keep its reply
//   npx tsx scripts/prompts.ts render costs --all --out <folder>      every city's prompt as a file (tirana.md…)
//   npx tsx scripts/prompts.ts check costs <folder> --model <name>    and the answers beside them (tirana.json…)
//
// Each run is kept under its id, so adding or removing cities never mixes runs up. --month YYYY-MM files a run under
// another month (default: this one).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CITY_KEYS, NATIONAL_KEYS, capitalOf } from '../src/data/promptRuns'
import { GEN, ROOT, SEED, readCsv, readJson, today } from './lib.ts'

// (Output cut short, e.g. by head, ends the script quietly.)
process.stdout.on('error', (e: NodeJS.ErrnoException) => { if (e.code === 'EPIPE') process.exit(0); else throw e })

const PROMPTS = join(ROOT, 'prompts')
const RUNS = join(ROOT, 'data/runs')
/** The prompts repo (rtw-map-prompts): what agents on any computer run, and their answers. */
const REPO = process.env.RTW_PROMPTS_DIR ?? join(ROOT, '..', 'rtw-map-prompts')

type City = { id: string; name: string; iso2: string; costFactor: number; population: number | null; capital?: true }
type Country = { iso2: string; name: string }

/** What a dataset asks about: each city, or each country. Its prompt's list is {{cities}} or {{countries}}, an
 *  answer's entries are under "cities" or "countries", and an agent's list is cities.csv or countries.csv. */
type Unit = { one: 'city'; many: 'cities'; key: 'id' } | { one: 'country'; many: 'countries'; key: 'code' }
const CITY: Unit = { one: 'city', many: 'cities', key: 'id' }
const COUNTRY: Unit = { one: 'country', many: 'countries', key: 'code' }

/** A dataset the prompts fill: what it asks about, what it tells the prompt of each, and what each answer must hold. */
type Dataset = {
  unit: Unit
  /** The ids asked about (cities' ids or countries' codes), in order. */
  ids: () => string[]
  /** One row of the prompt's list for one of them. */
  asked: (id: string) => Record<string, string>
  /** Problems in one answer (the id's), to the prompt's version that was asked. */
  check: (answer: unknown, id: string, version: number) => string[]
}

const cities = readJson<{ cities: City[] }>(join(GEN, 'cities.json')).cities
const cityById = new Map(cities.map((c) => [c.id, c]))
const rates = readJson<{ rates: Record<string, number> }>(join(GEN, 'fx.json')).rates
const countryNames = Object.fromEntries(readJson<{ countries: Country[] }>(join(GEN, 'countries.json')).countries.map((c) => [c.iso2, c.name]))
const currencyOf = Object.fromEntries(readCsv(join(SEED, 'costs.csv')).map((r) => [r.iso2, r.currency]))

/** Problems in one value of an answer. */
function checkValue(key: string, v: Record<string, unknown>): string[] {
  const out: string[] = []
  if (v.value !== null && (typeof v.value !== 'number' || v.value < 0)) out.push(`${key}: value ${JSON.stringify(v.value)} isn't a number`)
  if (v.currency !== undefined && !rates[String(v.currency)]) out.push(`${key}: no exchange rate for ${JSON.stringify(v.currency)}`)
  if (v.source !== null && (typeof v.source !== 'string' || !/^https?:\/\//.test(v.source))) out.push(`${key}: source ${JSON.stringify(v.source)} isn't a web address`)
  if (v.seen !== null && (typeof v.seen !== 'string' || !/^\d{4}-\d{2}$/.test(v.seen))) out.push(`${key}: seen ${JSON.stringify(v.seen)} isn't YYYY-MM`)
  if (!['high', 'medium', 'low'].includes(String(v.confidence))) out.push(`${key}: confidence ${JSON.stringify(v.confidence)}`)
  // (An estimate is fine when it says so; a value with no page and no word of how it was worked out isn't.)
  if (v.estimated !== undefined && v.estimated !== true) out.push(`${key}: estimated ${JSON.stringify(v.estimated)}`)
  if (v.estimated && !v.basis) out.push(`${key}: estimated, but no basis`)
  if (v.value !== null && !v.source && !v.estimated) out.push(`${key}: ${v.value} with no source and not marked estimated`)
  // (Doesn't exist here: no price, and not an estimate.)
  if (v.none !== undefined && v.none !== true) out.push(`${key}: none ${JSON.stringify(v.none)}`)
  if (v.none && (v.value !== null || v.estimated)) out.push(`${key}: none, but with a value`)
  return out
}

/** Whether a city is the one its country's national prices are asked in: its capital. */
const isNational = (c: City) => capitalOf(cities, c.iso2)?.id === c.id

const PLACE_KINDS = ['museum', 'palace', 'religious', 'monument', 'area', 'landmark', 'market', 'park', 'nature', 'beach', 'theme park', 'activity', 'evening']

/** Problems in one place of a city's list. */
function checkPlace(p: Record<string, unknown>, at: string): string[] {
  const out: string[] = []
  const text = (k: string, needed = true) => (typeof p[k] === 'string' && p[k] ? null : !needed && (p[k] === undefined || p[k] === null) ? null : `${at}: ${k} ${JSON.stringify(p[k])}`)
  out.push(...[text('name'), text('local', false), text('why'), text('note', false), text('getThere', false)].filter((x): x is string => !!x))
  if (!Number.isInteger(p.rank) || (p.rank as number) < 1) out.push(`${at}: rank ${JSON.stringify(p.rank)}`)
  if (!['must', 'worth', 'extra'].includes(String(p.tier))) out.push(`${at}: tier ${JSON.stringify(p.tier)}`)
  if (!PLACE_KINDS.includes(String(p.kind))) out.push(`${at}: kind ${JSON.stringify(p.kind)}`)
  if (typeof p.minutes !== 'number' || p.minutes < 0) out.push(`${at}: minutes ${JSON.stringify(p.minutes)}`)
  if (typeof p.dayTrip !== 'boolean') out.push(`${at}: dayTrip ${JSON.stringify(p.dayTrip)}`)
  if (p.km !== undefined && p.km !== null && (typeof p.km !== 'number' || p.km < 0)) out.push(`${at}: km ${JSON.stringify(p.km)}`)
  if (p.dayTrip === true && !p.getThere) out.push(`${at}: a day trip with no getThere`)
  if (p.wikipedia !== null && (typeof p.wikipedia !== 'string' || !p.wikipedia)) out.push(`${at}: wikipedia ${JSON.stringify(p.wikipedia)}`)
  if (!['high', 'medium', 'low'].includes(String(p.sure))) out.push(`${at}: sure ${JSON.stringify(p.sure)}`)
  return out
}

const DESTINATION_KINDS = ['city', 'town', 'island', 'beach', 'mountains', 'nature']
const TAGS = ['city', 'culture', 'history', 'food', 'nightlife', 'nature', 'hiking', 'beach']
const countryList = readJson<{ countries: Country[] }>(join(GEN, 'countries.json')).countries

/** Problems in one place to stay of a country's list. */
function checkDestination(p: Record<string, unknown>, at: string, version: number): string[] {
  const out: string[] = []
  for (const k of ['name', 'why']) if (typeof p[k] !== 'string' || !p[k]) out.push(`${at}: ${k} ${JSON.stringify(p[k])}`)
  for (const k of ['local', 'note']) if (p[k] !== undefined && p[k] !== null && (typeof p[k] !== 'string' || !p[k])) out.push(`${at}: ${k} ${JSON.stringify(p[k])}`)
  if (!Number.isInteger(p.rank) || (p.rank as number) < 1) out.push(`${at}: rank ${JSON.stringify(p.rank)}`)
  // From v3 a place is scored against the whole world (world, 1 to 5) instead of a tier within its country.
  if (version < 3 && !['must', 'worth', 'extra'].includes(String(p.tier))) out.push(`${at}: tier ${JSON.stringify(p.tier)}`)
  if (version >= 3 && (!Number.isInteger(p.world) || (p.world as number) < 1 || (p.world as number) > 5)) out.push(`${at}: world ${JSON.stringify(p.world)}`)
  if (!DESTINATION_KINDS.includes(String(p.kind))) out.push(`${at}: kind ${JSON.stringify(p.kind)}`)
  const d = p.days as { min?: unknown; ideal?: unknown; max?: unknown } | undefined
  const day = (v: unknown) => typeof v === 'number' && v > 0 && v * 2 === Math.round(v * 2)
  if (!d || !day(d.min) || !day(d.ideal) || !day(d.max)) out.push(`${at}: days ${JSON.stringify(p.days)}`)
  else if ((d.min as number) > (d.ideal as number) || (d.ideal as number) > (d.max as number)) out.push(`${at}: days not min ≤ ideal ≤ max`)
  if (!Array.isArray(p.tags) || !p.tags.length || p.tags.some((t) => !TAGS.includes(String(t)))) out.push(`${at}: tags ${JSON.stringify(p.tags)}`)
  if (p.wikipedia !== null && (typeof p.wikipedia !== 'string' || !p.wikipedia)) out.push(`${at}: wikipedia ${JSON.stringify(p.wikipedia)}`)
  if (!['high', 'medium', 'low'].includes(String(p.sure))) out.push(`${at}: sure ${JSON.stringify(p.sure)}`)
  // An area (a park, a bay…) has the town visitors stay in as its base; a city or town is its own.
  const base = p.base as { name?: unknown; local?: unknown; wikipedia?: unknown } | undefined
  if (base !== undefined && (typeof base?.name !== 'string' || !base.name || (base.wikipedia !== null && typeof base.wikipedia !== 'string'))) out.push(`${at}: base ${JSON.stringify(p.base)}`)
  if (version >= 2 && p.kind === 'nature' && !base) out.push(`${at}: a nature area with no base`)
  if (version >= 2 && (p.kind === 'city' || p.kind === 'town') && base) out.push(`${at}: a ${p.kind} with a base`)
  return out
}

const DATASETS: Record<string, Dataset> = {
  destinations: {
    unit: COUNTRY,
    // Every country on the map, as countries.json lists them.
    ids: () => countryList.map((c) => c.iso2),
    asked: (code) => ({ code, country: countryNames[code] ?? code }),
    check: (answer, _id, version) => {
      const a = answer as { places?: unknown }
      if (!Array.isArray(a?.places) || !a.places.length) return ['no places']
      const places = a.places as Record<string, unknown>[]
      const out = places.flatMap((p, i) => checkDestination(p, `place ${i + 1} (${String(p?.name ?? '?')})`, version))
      const ranks = places.map((p) => p.rank).sort((x, y) => Number(x) - Number(y))
      if (ranks.some((r, i) => r !== i + 1)) out.push(`ranked ${ranks.join(', ')}, not 1, 2, 3…`)
      if (places.length > 25) out.push(`${places.length} places, more than 25`)
      return out
    },
  },
  places: {
    unit: CITY,
    // Every city, country by country.
    ids: () => [...new Set(cities.map((c) => c.iso2))].flatMap((iso2) => cities.filter((c) => c.iso2 === iso2).map((c) => c.id)),
    asked: (id) => {
      const c = cityById.get(id)!
      return { id, city: c.name, country: countryNames[c.iso2] ?? c.iso2 }
    },
    check: (answer) => {
      const a = answer as { places?: unknown }
      if (!Array.isArray(a?.places)) return ['no places list']
      const places = a.places as Record<string, unknown>[]
      const out = places.flatMap((p, i) => checkPlace(p, `place ${i + 1} (${String(p?.name ?? '?')})`))
      // Each list (the city's, its day trips') ranked 1, 2, 3… with no gaps or repeats; not over the numbers asked.
      for (const [trips, most, what] of [[false, 15, 'places in the city'], [true, 5, 'day trips']] as const) {
        const ranks = places.filter((p) => p?.dayTrip === trips).map((p) => p.rank).sort((x, y) => Number(x) - Number(y))
        if (ranks.some((r, i) => r !== i + 1)) out.push(`${what} ranked ${ranks.join(', ')}, not 1, 2, 3…`)
        if (ranks.length > most) out.push(`${ranks.length} ${what}, more than ${most}`)
      }
      if (!places.some((p) => p?.dayTrip === false)) out.push('no places in the city')
      return out
    },
  },
  costs: {
    unit: CITY,
    // Every city in a country with prices, country by country as costs.csv has them, the capital first.
    ids: () => Object.keys(currencyOf).flatMap((iso2) => cities.filter((c) => c.iso2 === iso2)
      .sort((a, b) => Number(isNational(b)) - Number(isNational(a)) || a.name.localeCompare(b.name)).map((c) => c.id)),
    asked: (id) => {
      const c = cityById.get(id)!
      return { id, city: c.name, country: countryNames[c.iso2] ?? c.iso2, currency: currencyOf[c.iso2], shop_and_rentals: isNational(c) ? 'yes' : 'no' }
    },
    check: (answer, id) => {
      const a = answer as { currency?: unknown; values?: Record<string, Record<string, unknown>> }
      const c = cityById.get(id)!
      const keys: readonly string[] = isNational(c) ? [...CITY_KEYS, ...NATIONAL_KEYS] : CITY_KEYS
      const out: string[] = []
      if (a?.currency !== currencyOf[c.iso2]) out.push(`currency is ${String(a?.currency)}, asked for ${currencyOf[c.iso2]}`)
      for (const key of keys) {
        const v = a?.values?.[key]
        if (!v) out.push(`${key} missing`)
        else out.push(...checkValue(key, v))
      }
      const extra = Object.keys(a?.values ?? {}).filter((k) => !keys.includes(k))
      if (extra.length) out.push(`not asked for here: ${extra.join(', ')}`)
      return out
    },
  },
}

// ---------------------------------------------------------------- prompts

function args() {
  const [command, dataset, ...rest] = process.argv.slice(2)
  const opt = (name: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 && !rest[i + 1]?.startsWith('--') ? rest[i + 1] : undefined }
  const flag = (name: string) => rest.includes(`--${name}`)
  const file = rest.find((r, i) => !r.startsWith('--') && !(rest[i - 1]?.startsWith('--') && opt(rest[i - 1].slice(2)) === r))
  return { command, dataset, file, opt, flag }
}

/** The prompt file: its settings (front matter), its version and its text, with today's date in it (`date`), or, for
 *  an agent that may run it any day, told to use the day it runs. */
function promptFile(dataset: string, date: 'today' | 'when run' = 'today') {
  const text = readFileSync(join(PROMPTS, `${dataset}.md`), 'utf8')
  const [, head, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? ['', '', text]
  const settings = Object.fromEntries(head.split('\n').map((l) => l.split(/:\s*/, 2)).filter((p) => p.length === 2))
  const version = Number(settings.version)
  if (!Number.isInteger(version) || version < 1) throw new Error(`prompts/${dataset}.md needs a version (version: 1) in its front matter`)
  const dated = date === 'today' ? body.replaceAll('{{date}}', today()) : body.replaceAll('Today is {{date}}.', "Today is the day you run this: use today's date.")
  return { settings, version, body: dated }
}

/** The city or country a command is about (--city or --country), and the name its run is kept under: its id. */
function chosen(dataset: string, opt: (n: string) => string | undefined): { name: string; ids: string[] } {
  const { one, many } = DATASETS[dataset].unit
  const id = opt(one)
  if (!id || !DATASETS[dataset].ids().includes(id)) throw new Error(`--${one} <id>, one of the ${many} in "list ${dataset}"${id ? ` (no "${id}")` : ''}`)
  return { name: id, ids: [id] }
}

const table = (rows: Record<string, string>[]) => {
  const cols = Object.keys(rows[0])
  return [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${cols.map((c) => r[c]).join(' | ')} |`)].join('\n')
}

/** A prompt's parts marked <!-- shop and rentals --> … <!-- /shop and rentals -->: kept (without the marks) or left out. */
const shopAndRentals = (text: string, keep: boolean, heading: string) =>
  text.replace(/<!-- shop and rentals -->\n([\s\S]*?)<!-- \/shop and rentals -->\n/g, keep ? '$1' : '')
    .replaceAll('{{shopAndRentals}}', heading)

/** One city's prompt. The shop and rentals, asked once per country, are only in its capital's prompt, and
 *  said to be for the whole country there; the other cities' prompts don't have them. */
export function render(dataset: string, ids: string[]): string {
  const rows = ids.map((id) => DATASETS[dataset].asked(id))
  const national = rows.some((r) => r.shop_and_rentals === 'yes')
  const shown = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'shop_and_rentals')))
  const body = shopAndRentals(promptFile(dataset).body, national,
    "**Also, for the whole country** (these cost about the same across it, so they're asked once, in this city):")
  return body.replaceAll(`{{${DATASETS[dataset].unit.many}}}`, table(shown)).trim() + '\n'
}

/** The prompt for an agent that splits the work itself (an IDE's or a CLI's): one prompt for every city (or country),
 *  the list in cities.csv (countries.csv) beside it, and one answer file each (answers/<id>.json), written as it goes. */
export function renderForAgent(dataset: string): { prompt: string; csv: string } {
  const { one, many, key } = DATASETS[dataset].unit
  const rows = DATASETS[dataset].ids().map((id) => DATASETS[dataset].asked(id))
  const cols = Object.keys(rows[0])
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => (/[",]/.test(r[c]) ? `"${r[c].replace(/"/g, '""')}"` : r[c])).join(','))].join('\n') + '\n'
  const body = shopAndRentals(promptFile(dataset, 'when run').body, true,
    "**Only for the cities with `shop_and_rentals` yes in `cities.csv`** (one per country: these cost about the same across a country, so they're asked once, in that city; leave them out for the other cities):")
    .replaceAll(`{{${many}}}`, `The ${many} are in \`${many}.csv\` beside this file (${cols.join(', ')}): ${rows.length} of them.`)
  const [rules, answer] = body.split(/^## Answer$/m)
  // The prompt's example, one entry as its file holds it (each value, or each place, on one line).
  const shown = JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1)) as Record<string, Record<string, unknown>>
  const [id, entry] = Object.entries(shown[many])[0]
  const example = JSON.stringify(entry, null, 2).replace(/\{\n\s+([^{}[\]]*?)\n\s+\}/g, (_, inner: string) => `{ ${inner.replace(/\n\s+/g, ' ')} }`)
  return {
    csv,
    prompt: `${rules.trim()}

## Working through the list

- **Where your answers go:** \`answers/<month>/<model>/\`, the month the run started (\`2026-10\`) and the model you
  are, in lowercase with dashes (\`gemini-2.5-pro\`), unless you're told another folder. Keep to that one folder for
  the whole run, also when you carry on in a later session or month.
- Take the ${many} in \`${many}.csv\` one at a time, in order. For each, do what's asked above, then write its
  answer to \`<${key}>.json\` in that folder (\`answers/2026-10/gemini-2.5-pro/${id}.json\`) straight away, before
  starting the next ${one}.
- Skip a ${one} whose answer is already in that folder: the list may be done over several sessions, and ${many} may
  be added to it.
- The rules above hold for the last ${one} as much as the first: take the same care with it, however long the list.
- Change nothing else: not this file, not \`${many}.csv\`, not other models' answers.

## Answer

Each file is one JSON object, with nothing before or after it, every key asked for the ${one} in it.
\`${id}.json\` would look like this:

\`\`\`json
${example}
\`\`\`
`,
  }
}

/** Where an agent's prompt, its list and its answers are: the dataset's folder for this version, in the prompts repo. */
const agentFolder = (dataset: string) => join(REPO, dataset, `v${promptFile(dataset).version}`)

// ---------------------------------------------------------------- answers

/** The JSON object in an answer (also inside a ```json block, or after a line or two of text). */
function parseAnswer(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  return JSON.parse(raw)
}

/** Where a model's runs of a dataset's prompt (this version, or another) in a month are kept. */
const runsDir = (dataset: string, month: string, model: string, version = promptFile(dataset).version) => join(RUNS, dataset, `v${version}`, month, model)

/** Checks the answers to what was asked and keeps them as a run (also with problems, to see what went wrong).
 *  Returns the problems. */
function keep(dataset: string, got: Record<string, unknown>, run: { name: string; ids: string[] }, model: string, month: string, version = promptFile(dataset).version): string[] {
  const problems = [
    ...run.ids.filter((c) => !(c in got)).map((c) => `${c}: missing`),
    ...Object.keys(got).filter((c) => !run.ids.includes(c)).map((c) => `${c}: not asked for`),
    ...run.ids.filter((c) => c in got).flatMap((c) => DATASETS[dataset].check(got[c], c, version).map((p) => `${c}: ${p}`)),
  ]
  const path = join(runsDir(dataset, month, model, version), `${run.name}.json`)
  mkdirSync(dirname(path), { recursive: true })
  const kept = Object.fromEntries(Object.entries(got).filter(([c]) => run.ids.includes(c)))
  writeFileSync(path, JSON.stringify({ dataset, version, model, month, keptAt: today(), asked: run.ids, problems, [DATASETS[dataset].unit.many]: kept }, null, 1) + '\n')
  console.log(`${problems.length ? 'kept, with problems' : 'kept'}: ${path.replace(ROOT + '/', '')}`)
  return problems
}

/** An answer's entries (its "cities" or "countries"), or what's wrong when it isn't JSON. */
function answerEntries(dataset: string, text: string): Record<string, unknown> | string {
  try { return (parseAnswer(text) as Record<string, Record<string, unknown>>)[DATASETS[dataset].unit.many] ?? {} } catch (e) { return `not JSON: ${(e as Error).message}` }
}

/** The ids a model has answered this month, in runs kept one at a time. */
const done = (dataset: string, model: string, month: string) => {
  const dir = runsDir(dataset, month, model)
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')) : []
}
const report = (problems: string[]) => problems.forEach((p) => console.log(`  ${p}`))

// ---------------------------------------------------------------- commands

const { command, dataset, file, opt, flag } = args()
const month = opt('month') ?? today().slice(0, 7)
if (command !== 'list' && !DATASETS[dataset]) throw new Error(`Dataset: one of ${Object.keys(DATASETS).join(', ')}`)

const unit = DATASETS[dataset]?.unit ?? CITY
/** How a city or country is named in the output: "Tirana, Albania", "Albania". */
const label = (name: string, id: string) => {
  const a = DATASETS[name].asked(id)
  return a.city ? `${a.city}, ${a.country}` : a.country
}
/** A model's name as a folder: lowercase, dashes ("Gemini 2.5 Pro" → "gemini-2.5-pro"). */
const modelName = (m: string) => m.trim().toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '')
/** The model a command's run is kept under: --model, else the given default, else a request for it. */
const modelOf = (fallback?: string) => {
  const m = opt('model') ?? fallback
  if (!m) throw new Error('--model <name>: the model that answered (gemini-2.5-pro, gpt-5-codex…), the folder its run is kept in')
  return modelName(m)
}

/** The prompts repo's README: what an agent there needs to know, without this project. */
const REPO_README = `# Prompts for rtw-map's data

Each folder is one prompt, \`<dataset>/v<version>/\`: \`prompt.md\` says what to do, and the list beside it
(\`cities.csv\` or \`countries.csv\`) what to do it for. Answers go in that folder's \`answers/<month>/<model>/\`, one
file per city or country, as \`prompt.md\` describes.

If you're an agent asked to run one:

1. \`git pull\` first: another computer or model may have added answers.
2. Follow \`prompt.md\` in the folder you're given. Write each answer as soon as it's done.
3. Commit and push every few answers (\`git add\`, \`git commit -m "costs v1: gemini-2.5-pro, 12 cities"\`, \`git push\`),
   so nothing is lost if the session stops. Commit only your own answers folder.
4. Don't change \`prompt.md\`, the lists, or other models' answers.

A new version of a prompt is a new folder; answers to an older one stay where they are.
`

if (command === 'list') {
  const model = modelName(opt('model') ?? 'gemini-cli')
  for (const name of dataset ? [dataset] : Object.keys(DATASETS)) {
    const ran = new Set(done(name, model, month))
    const ids = DATASETS[name].ids()
    console.log(`${name} v${promptFile(name).version}: ${ids.length} ${DATASETS[name].unit.many}; ${model} ${month}: ${ids.filter((id) => ran.has(id)).length} run one at a time`)
    for (const id of ids) {
      const a = DATASETS[name].asked(id)
      console.log(`  ${ran.has(id) ? '✓' : ' '} ${id.padEnd(16)} ${label(name, id)}${a.shop_and_rentals === 'yes' ? ' (+ shop and rentals for the country)' : ''}`)
    }
  }
} else if (command === 'render' && flag('agent')) {
  // Into the prompts repo (or --out): the prompt and its list, for this version. Made again after adding cities, it
  // lists them too; the answers already there stay.
  if (!opt('out') && !existsSync(REPO)) throw new Error(`No prompts repo at ${REPO}: clone rtw-map-prompts there, or set RTW_PROMPTS_DIR`)
  const out = opt('out') ?? agentFolder(dataset)
  const { prompt, csv } = renderForAgent(dataset)
  mkdirSync(join(out, 'answers'), { recursive: true })
  writeFileSync(join(out, 'prompt.md'), prompt)
  writeFileSync(join(out, `${unit.many}.csv`), csv)
  if (!opt('out')) writeFileSync(join(REPO, 'README.md'), REPO_README)
  console.log(`wrote ${out}/prompt.md and ${unit.many}.csv (${csv.trim().split('\n').length - 1} ${unit.many}); commit and push the prompts repo for the agent`)
} else if (command === 'render' && flag('all')) {
  // Every city's (or country's) prompt as its own file (tirana.md…), to run somewhere else; their answers come back
  // beside them (tirana.json…).
  const out = opt('out')
  if (!out) throw new Error('render <dataset> --all --out <folder>')
  mkdirSync(out, { recursive: true })
  const ids = DATASETS[dataset].ids()
  for (const id of ids) writeFileSync(join(out, `${id}.md`), render(dataset, [id]))
  console.log(`wrote ${ids.length} prompts to ${out}; save each answer beside its prompt as ${ids[0]}.json…`)
} else if (command === 'render') {
  process.stdout.write(render(dataset, chosen(dataset, opt).ids))
} else if (command === 'check' && (flag('agent') || (file && existsSync(join(file, 'answers'))))) {
  // Every model's answers in the prompts repo's folder for this version (answers/<month>/<model>/<id>.json), each
  // month and model kept as one run (agent.json); --month and --model check just those. Answers for cities or
  // countries no longer in the list are left out.
  const folder = file && existsSync(join(file, 'answers')) ? file : opt('out') ?? agentFolder(dataset)
  const answers = join(folder, 'answers')
  if (!existsSync(answers)) throw new Error(`No ${answers}: pull the prompts repo, or make it with render ${dataset} --agent`)
  // (An older version's folder, e.g. destinations/v1, is kept as that version's runs.)
  const version = Number(folder.replace(/\/$/, '').match(/\/v(\d+)$/)?.[1]) || promptFile(dataset).version
  const listed = new Set(DATASETS[dataset].ids())
  const runs = readdirSync(answers).filter((m) => /^\d{4}-\d{2}$/.test(m) && (!opt('month') || m === opt('month')))
    .flatMap((m) => readdirSync(join(answers, m)).filter((x) => statSync(join(answers, m, x)).isDirectory() && (!opt('model') || x === modelName(opt('model')!))).map((x) => [m, x]))
  if (!runs.length) console.log(`no answers yet in ${answers}`)
  let total = 0
  for (const [m, model] of runs) {
    const dir = join(answers, m, model)
    const files = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
    const got: Record<string, unknown> = {}
    const unreadable: string[] = []
    for (const id of files.filter((id) => listed.has(id))) {
      try {
        const a = parseAnswer(readFileSync(join(dir, `${id}.json`), 'utf8')) as Record<string, Record<string, unknown>>
        got[id] = a[unit.many]?.[id] ?? a
      } catch { unreadable.push(`${id}: not JSON`) }
    }
    console.log(`${model} ${m}:`)
    const gone = files.filter((id) => !listed.has(id))
    if (gone.length) console.log(`  not in the list any more, left out: ${gone.join(', ')}`)
    const asked = Object.keys(got)
    const problems = [...unreadable, ...keep(dataset, got, { name: 'agent', ids: asked }, model, m, version)]
    report(problems)
    const left = [...listed].filter((id) => !files.includes(id)).length
    console.log(`  ${asked.length} ${unit.many} answered${left ? `, ${left} not yet` : ''}; ${problems.length} problems`)
    total += problems.length
  }
  process.exitCode = total ? 1 : 0
} else if (command === 'check' && file && statSync(file).isDirectory()) {
  // A folder of answers named by id (tirana.json…), as render --all names the prompts.
  const model = modelOf()
  const listed = new Set(DATASETS[dataset].ids())
  const answers = readdirSync(file).filter((f) => /\.(json|txt)$/.test(f) && listed.has(f.replace(/\.(json|txt)$/, ''))).sort()
  if (!answers.length) throw new Error(`No answers (<id>.json) in ${file}`)
  let withProblems = 0
  for (const name of answers) {
    const run = chosen(dataset, (o) => (o === unit.one ? name.replace(/\.(json|txt)$/, '') : undefined))
    const got = answerEntries(dataset, readFileSync(join(file, name), 'utf8'))
    const problems = typeof got === 'string' ? [got] : keep(dataset, got, run, model, month)
    report(problems)
    if (problems.length) withProblems++
  }
  console.log(`${answers.length} answers, ${withProblems} with problems`)
  process.exitCode = withProblems ? 1 : 0
} else if (command === 'check') {
  if (!file) throw new Error(`check <dataset> <answer file> --${unit.one} <id> --model <name>, check <dataset> <folder> --model <name>, or check <dataset> --agent`)
  const got = answerEntries(dataset, readFileSync(file, 'utf8'))
  const problems = typeof got === 'string' ? [got] : keep(dataset, got, chosen(dataset, opt), modelOf(), month)
  report(problems)
  process.exitCode = problems.length ? 1 : 0
} else if (command === 'run') {
  // Gemini CLI, with its own default model unless --model names one (which is then the run's name too).
  const cliModel = opt('model')
  const model = modelOf('gemini-cli')
  const ran = new Set(done(dataset, model, month))
  const todo = flag('all') ? DATASETS[dataset].ids().filter((id) => !ran.has(id)).map((id) => ({ name: id, ids: [id] })) : [chosen(dataset, opt)]
  for (const run of todo) {
    console.log(`${dataset}: ${label(dataset, run.name)} (${run.name})`)
    // The prompt on stdin; web search and fetching pages allowed without asking, nothing else.
    const res = spawnSync('gemini', [...(cliModel ? ['-m', cliModel] : []), '--allowed-tools', 'google_web_search,web_fetch', 'Follow the instructions above.'], {
      input: render(dataset, run.ids), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'inherit'],
    })
    if (res.status !== 0) { console.log(`  Gemini CLI stopped (${res.status}); run it again to carry on`); break }
    const raw = join(runsDir(dataset, month, model), 'answers', `${run.name}.txt`)
    mkdirSync(dirname(raw), { recursive: true })
    writeFileSync(raw, res.stdout)
    const got = answerEntries(dataset, res.stdout)
    report(typeof got === 'string' ? [got] : keep(dataset, got, run, model, month))
  }
} else {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'))
}
