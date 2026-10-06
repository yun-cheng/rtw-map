// Businesses near each city centre from Overture Maps Places (business listings merged from Meta, Microsoft and
// Foursquare; https://docs.overturemaps.org). Much fuller than OpenStreetMap outside Central Europe, but weaker on
// ATMs, so the app uses the higher of the two counts (see nearby() in src/planner/health.ts).
// The data is ~11 GB of Parquet files sorted by location; only the parts covering each city centre are downloaded
// (a few MB per city). Every category found within the radius (Overture's detailed taxonomy, e.g. "supermarket"
// rather than the broad "food_and_beverage_store") is cached per city in .cache/overture/<release>, so the
// categories counted below can change without downloading again.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects, type FileMetaData } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { CACHE, GEN, readJson, today, writeJson } from './lib.ts'

const RADIUS_KM = 1.5
const BASE = 'https://overturemaps-us-west-2.s3.amazonaws.com/'

/** Overture's detailed categories (taxonomy.primary) counted for each kind of place. */
const COUNTED: Record<string, string[]> = {
  supermarket: ['grocery_store', 'supermarket', 'hypermarket', 'organic_grocery_store'],
  convenience: ['convenience_store'],
  pharmacy: ['pharmacy', 'drugstore'],
  // Doctors and general clinics; dentists, specialists and the vague "health_care" are left out.
  clinic: ['doctors_office', 'family_practice', 'pediatric_clinic', 'walk_in_clinic', 'urgent_care_clinic', 'medical_center'],
  atm: ['atm'],
  hospital: ['hospital'],
}

type City = { id: string; lat: number; lon: number }
const { cities } = readJson<{ cities: City[] }>(join(GEN, 'cities.json'))

const keys = async (prefix: string, delimiter = '') =>
  [...(await (await fetch(`${BASE}?list-type=2&prefix=${prefix}${delimiter && `&delimiter=${delimiter}`}`)).text())
    .matchAll(delimiter ? /<Prefix>([^<]+)<\/Prefix>/g : /<Key>([^<]+)<\/Key>/g)].map((m) => m[1])

const release = (await keys('release/', '/')).filter((p) => p !== 'release/').sort().at(-1)!.split('/')[1]
const dir = join(CACHE, 'overture', `${release}-taxonomy`)
mkdirSync(dir, { recursive: true })

const kmBetween = (lat1: number, lon1: number, lat2: number, lon2: number) =>
  6371 * Math.hypot(((lat2 - lat1) * Math.PI) / 180, ((lon2 - lon1) * Math.PI) / 180 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180))

type Part = { file: Awaited<ReturnType<typeof asyncBufferFromUrl>>; metadata: FileMetaData; groups: { start: number; end: number; box: number[] }[] }
let parts: Part[] | null = null

/** Each file's index: where each chunk (row group) starts and the area it covers. Read once, only when needed. */
async function loadParts(): Promise<Part[]> {
  const files = await keys(`release/${release}/theme=places/type=place/`)
  console.log(`reading the index of ${files.length} files (${release})…`)
  return Promise.all(files.map(async (key) => {
    const file = await asyncBufferFromUrl({ url: BASE + key })
    const metadata = await parquetMetadataAsync(file)
    let row = 0
    const groups = metadata.row_groups.map((rg) => {
      const stat = (path: string, which: 'min_value' | 'max_value') =>
        Number(rg.columns.find((c) => c.meta_data!.path_in_schema.join('.') === path)!.meta_data!.statistics![which])
      const start = row
      row += Number(rg.num_rows)
      return { start, end: row, box: [stat('bbox.xmin', 'min_value'), stat('bbox.xmax', 'max_value'), stat('bbox.ymin', 'min_value'), stat('bbox.ymax', 'max_value')] }
    })
    return { file, metadata, groups }
  }))
}

/** How many places of each category lie within the radius of a city centre (open ones only). */
async function categoriesNear(c: City): Promise<Record<string, number>> {
  const path = join(dir, `${c.id}.json`)
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  parts ??= await loadParts()
  const dLat = RADIUS_KM / 111
  const dLon = dLat / Math.cos((c.lat * Math.PI) / 180)
  const counts: Record<string, number> = {}
  for (const { file, metadata, groups } of parts) {
    for (const g of groups) {
      const [xmin, xmax, ymin, ymax] = g.box
      if (xmax < c.lon - dLon || xmin > c.lon + dLon || ymax < c.lat - dLat || ymin > c.lat + dLat) continue
      const rows = (await parquetReadObjects({
        file, metadata, rowStart: g.start, rowEnd: g.end, compressors,
        columns: ['bbox', 'taxonomy', 'operating_status'],
      })) as { bbox: { xmin: number; ymin: number }; taxonomy: { primary: string | null } | null; operating_status: string | null }[]
      for (const r of rows) {
        const category = r.taxonomy?.primary
        if (!category || (r.operating_status && r.operating_status !== 'open')) continue
        if (kmBetween(c.lat, c.lon, r.bbox.ymin, r.bbox.xmin) > RADIUS_KM) continue
        counts[category] = (counts[category] ?? 0) + 1
      }
    }
  }
  writeFileSync(path, JSON.stringify(counts))
  return counts
}

const places: Record<string, Record<string, number>> = {}
for (const [i, c] of cities.entries()) {
  const cached = existsSync(join(dir, `${c.id}.json`))
  if (!cached) console.log(`[${i + 1}/${cities.length}] ${c.id}`)
  const found = await categoriesNear(c)
  places[c.id] = Object.fromEntries(Object.entries(COUNTED).map(([kind, cats]) => [kind, cats.reduce((n, cat) => n + (found[cat] ?? 0), 0)]))
}
writeJson(join(GEN, 'overture.json'), {
  _meta: { source: `Overture Maps Places ${release}`, updatedAt: today(), radiusKm: RADIUS_KM },
  places,
})
