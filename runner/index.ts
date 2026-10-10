// The trip assistant's runner: a small Node server on Google Cloud Run that answers messages on the server (run.ts),
// so a run finishes even when the page is closed. Both ends need the RUNNER_SECRET the Worker has.
//   POST /start  from the Worker: queues the run on Cloud Tasks and answers at once
//   POST /run    from Cloud Tasks: runs it to the end, holding the request open meanwhile (Cloud Run gives a
//                request CPU only while it's open, and Cloud Tasks waits up to 30 minutes for it)
// Without TASKS_QUEUE (local development) /start runs it here at once instead.
//
// Settings (environment): RUNNER_SECRET; PORT (Cloud Run sets it); TASKS_QUEUE, the queue's full name
// ("projects/…/locations/…/queues/…").
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { execute } from './run'

const SECRET = process.env.RUNNER_SECRET ?? ''
const QUEUE = process.env.TASKS_QUEUE
/** How long Cloud Tasks waits for /run (its most). */
const DEADLINE = '1800s'

type Job = { origin: string; account: string; run: string }

const parseJob = (raw: unknown): Job | null => {
  const j = (raw ?? {}) as Record<string, unknown>
  const ok = typeof j.origin === 'string' && /^https?:\/\/[\w.:-]+$/.test(j.origin) &&
    typeof j.account === 'string' && /^\w{1,64}$/.test(j.account) && typeof j.run === 'string' && /^[\w-]{1,64}$/.test(j.run)
  return ok ? (j as Job) : null
}

const readBody = (req: IncomingMessage) => new Promise<string>((resolve, reject) => {
  let body = ''
  req.setEncoding('utf8')
  req.on('data', (chunk: string) => {
    body += chunk
    if (body.length > 10_000) req.destroy(new Error('Too large'))
  })
  req.on('end', () => resolve(body))
  req.on('error', reject)
})

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

/** An access token for Google's APIs, from Cloud Run's metadata server (the service's own account). */
async function googleToken(): Promise<string> {
  const res = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' },
  })
  if (!res.ok) throw new Error(`No access token (${res.status})`)
  return ((await res.json()) as { access_token: string }).access_token
}

/** Queues the run on Cloud Tasks, to come back to this service's /run. */
async function enqueue(job: Job, self: string): Promise<void> {
  const res = await fetch(`https://cloudtasks.googleapis.com/v2/${QUEUE}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: {
        dispatchDeadline: DEADLINE,
        httpRequest: {
          httpMethod: 'POST',
          url: `${self}/run`,
          headers: { 'Content-Type': 'application/json', 'X-Runner-Secret': SECRET },
          body: Buffer.from(JSON.stringify(job)).toString('base64'),
        },
      },
    }),
  })
  if (!res.ok) throw new Error(`Cloud Tasks refused the run (${res.status}): ${await res.text()}`)
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') return send(res, 200, { ok: true })
    if (req.method !== 'POST' || (req.url !== '/start' && req.url !== '/run')) return send(res, 404, { error: 'Not found' })
    if (!SECRET || req.headers['x-runner-secret'] !== SECRET) return send(res, 403, { error: 'Not allowed' })
    const job = parseJob(JSON.parse(await readBody(req)))
    if (!job) return send(res, 400, { error: 'Invalid run' })
    if (req.url === '/run') {
      await execute(job.origin, job.account, job.run, SECRET)
      return send(res, 200, { ok: true })
    }
    if (QUEUE) await enqueue(job, `https://${req.headers.host}`)
    else void execute(job.origin, job.account, job.run, SECRET)
    send(res, 202, { ok: true })
  } catch (e) {
    console.error(e)
    if (!res.headersSent) send(res, 500, { error: (e as Error).message })
  }
})

// One run's mistake mustn't stop the others running here.
process.on('unhandledRejection', (e) => console.error('Unhandled', e))

// Cloud Run sends SIGTERM before stopping an instance; runs under way are lost then (and marked failed when quiet).
server.listen(Number(process.env.PORT ?? 8788), () => console.log(`Runner on port ${process.env.PORT ?? 8788}${QUEUE ? '' : ' (no queue: runs here at once)'}`))
