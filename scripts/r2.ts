// Syncs the data folder (hand-curated seed and generated files) with a private Cloudflare R2 bucket,
// so the data lives outside the git repository.
//   tsx scripts/r2.ts pull              download every file under data/ in the bucket into data/
//   tsx scripts/r2.ts push              upload files in data/ that are new or changed
//   tsx scripts/r2.ts snapshots         list the dated copies of the hand-curated seed data
//   tsx scripts/r2.ts restore <date>    put that day's seed copy back into data/seed/ (then push to make it current)
// When a push changes any seed file, the whole seed folder is also copied to snapshots/<date>/seed/, so earlier
// versions of the hand-curated data can be restored. Generated data needs no copies: the scripts rebuild it.
// Credentials come from the environment or .env.local (git-ignored):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { AwsClient } from 'aws4fetch'
import { ROOT } from './lib.ts'

const DATA = join(ROOT, 'data')
const PREFIX = 'data/'
const SNAPSHOTS = 'snapshots/'
const CONTENT_TYPES: Record<string, string> = { json: 'application/json', csv: 'text/csv' }

const envFile = join(ROOT, '.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error('Missing R2 settings. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET in .env.local (see README, "Data storage").')
  process.exit(1)
}

const r2 = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' })
const base = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`
const objectUrl = (key: string) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`

async function call(url: string, init?: RequestInit) {
  const res = await r2.fetch(url, init)
  if (!res.ok) throw new Error(`R2 ${init?.method ?? 'GET'} ${url.replace(base, '')}: ${res.status} ${(await res.text()).slice(0, 300)}`)
  return res
}

/** Every object under a prefix, with its ETag (the MD5 of the content for single-part uploads). */
async function listRemote(prefix = PREFIX): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  let token: string | undefined
  do {
    const q = new URLSearchParams({ 'list-type': '2', prefix, ...(token ? { 'continuation-token': token } : {}) })
    const xml = await (await call(`${base}?${q}`)).text()
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = m[1].match(/<Key>(.*?)<\/Key>/)?.[1]
      const etag = m[1].match(/<ETag>(.*?)<\/ETag>/)?.[1]?.replace(/&quot;|"/g, '')
      if (key) out.set(decodeXml(key), etag ?? '')
    }
    token = xml.includes('<IsTruncated>true</IsTruncated>') ? decodeXml(xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/)?.[1] ?? '') : undefined
  } while (token)
  return out
}

const decodeXml = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")

function localFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name.startsWith('.')) return []
    return statSync(path).isDirectory() ? localFiles(path) : [path]
  })
}

const md5 = (buf: Buffer) => createHash('md5').update(buf).digest('hex')

const put = (key: string, body: Buffer) =>
  call(objectUrl(key), { method: 'PUT', body: new Uint8Array(body), headers: { 'Content-Type': CONTENT_TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream' } })

const keyOf = (path: string) => `${PREFIX}${relative(DATA, path).split('\\').join('/')}`

async function push() {
  const remote = await listRemote()
  let uploaded = 0
  let seedChanged = false
  for (const path of localFiles(DATA)) {
    const key = keyOf(path)
    const body = readFileSync(path)
    if (remote.get(key) === md5(body)) continue
    await put(key, body)
    console.log(`uploaded ${key}`)
    uploaded++
    if (key.startsWith(`${PREFIX}seed/`)) seedChanged = true
  }
  console.log(`${uploaded} file(s) uploaded, ${remote.size} already in the bucket before`)

  // Keep a dated copy of the whole seed folder (one per day; a later push the same day replaces it).
  if (seedChanged) {
    const date = new Date().toISOString().slice(0, 10)
    for (const path of localFiles(join(DATA, 'seed'))) await put(`${SNAPSHOTS}${date}/${keyOf(path).slice(PREFIX.length)}`, readFileSync(path))
    console.log(`seed data changed: saved a copy as ${SNAPSHOTS}${date}/seed/`)
  }
}

async function snapshots() {
  const dates = [...new Set([...(await listRemote(SNAPSHOTS)).keys()].map((k) => k.split('/')[1]))].sort()
  console.log(dates.length ? dates.join('\n') : 'No snapshots yet.')
}

async function restore(date: string | undefined) {
  if (!date) throw new Error('Usage: tsx scripts/r2.ts restore <date>   (see: tsx scripts/r2.ts snapshots)')
  const files = await listRemote(`${SNAPSHOTS}${date}/seed/`)
  if (!files.size) throw new Error(`No snapshot for ${date}.`)
  for (const key of files.keys()) {
    const path = join(DATA, key.slice(`${SNAPSHOTS}${date}/`.length))
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, Buffer.from(await (await call(objectUrl(key))).arrayBuffer()))
  }
  console.log(`Restored ${files.size} seed file(s) from ${date} into data/seed/. Check them, then run "npm run data:push" to make them current.`)
}

async function pull() {
  const remote = await listRemote()
  if (!remote.size) throw new Error(`The bucket ${R2_BUCKET} has no files under ${PREFIX}; run "npm run data:push" first.`)
  let downloaded = 0
  for (const [key, etag] of remote) {
    const path = join(DATA, key.slice(PREFIX.length))
    if (existsSync(path) && md5(readFileSync(path)) === etag) continue
    const body = Buffer.from(await (await call(objectUrl(key))).arrayBuffer())
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, body)
    downloaded++
  }
  console.log(`${downloaded} file(s) downloaded, ${remote.size - downloaded} already up to date`)
}

const command = process.argv[2]
if (command === 'push') await push()
else if (command === 'pull') await pull()
else if (command === 'snapshots') await snapshots()
else if (command === 'restore') await restore(process.argv[3])
else {
  console.error('Usage: tsx scripts/r2.ts pull | push | snapshots | restore <date>')
  process.exit(1)
}
