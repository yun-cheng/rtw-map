import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SEED = join(ROOT, 'data/seed')
export const GEN = join(ROOT, 'data/gen')
export const CACHE = join(ROOT, '.cache')

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export function writeJson(path: string, data: unknown, compact = false) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, compact ? undefined : 1) + '\n')
  console.log(`wrote ${path.replace(ROOT + '/', '')}`)
}

/** Minimal CSV parser: comma-separated, double-quoted fields, header row. */
export function readCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, 'utf8').trim()
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  row.push(field)
  rows.push(row)
  const [header, ...body] = rows
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

export async function fetchCached(url: string, cacheName: string): Promise<string> {
  const path = join(CACHE, cacheName)
  if (existsSync(path)) return readFileSync(path, 'utf8')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  const text = await res.text()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
  return text
}

/**
 * One indicator from the IMF DataMapper API (country ISO3 → year → value), or null when the IMF can't be reached.
 * The IMF blocks some cloud servers (e.g. GitHub Actions) with an HTML "access denied" page; callers then keep
 * their previous values, which change only once a year.
 */
export async function fetchImf(indicator: string): Promise<Record<string, Record<string, number>> | null> {
  try {
    const res = await fetch(`https://www.imf.org/external/datamapper/api/v1/${indicator}`)
    return ((await res.json()) as { values: Record<string, Record<string, Record<string, number>>> }).values[indicator]
  } catch (e) {
    console.warn(`IMF ${indicator} unavailable (${(e as Error).message.slice(0, 80)}); keeping previous values`)
    return null
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const today = () => new Date().toISOString().slice(0, 10)

export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').toLowerCase().trim()
}
