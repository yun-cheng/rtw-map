// The site's Worker: serves the built app (static files) and the API for signed-in users:
//   GET  /api/session              who is signed in, and today's assistant usage
//   POST /api/auth/google          sign in with a Google ID token (sets our session cookie)
//   POST /api/auth/logout          sign out
//   GET  /api/trips                the user's saved trips (summaries) and the one opened last
//   POST /api/trips                create a trip
//   GET|PUT|DELETE /api/trips/:id  open, save or delete a trip
//   POST /api/chat                 forward the assistant conversation to Gemini (at most $1 a day per account)
//   POST /api/runs                 answer a message on the server, so it finishes with the page closed (runs.ts)
//   GET  /api/runs/:id[?since=N]   how a run is going, and the trip if it changed since version N
//   POST /api/runs/:id/stop        stop it
//   /internal/runs/…               the runner's side of a run (with the RUNNER_SECRET)
//   GET|PUT /api/admin/limits      other daily limits for particular accounts, by email (admins only)
// Everything else goes to the static files.
import { readSessionCookie, sessionCookie, signSession, verifyGoogleIdToken, verifySession, type User } from './auth'
import { GEMINI_TRIES, geminiRequest, isBrokenReply, isNewMessage, LIMITS, parseChatRequest, type GeminiResponse } from './chat'
import { addSpent, DAILY_USD, dailyUsdFor, parseAccountLimits, spentOf, today, usageOf, type Spent } from './limits'
import { Account, BUSY } from './account'
import { parseRunEnd, parseRunStart, RUN_LIMITS, runView } from './runs'
import { parseTripPatch } from './trips'

export { Account }

type Env = {
  ASSETS: Fetcher
  CHAT_LIMIT: RateLimit
  SAVE_LIMIT: RateLimit
  ACCOUNT: DurableObjectNamespace<Account>
  GEMINI_API_KEY?: string
  GEMINI_MODEL: string
  GOOGLE_CLIENT_ID?: string
  SESSION_SECRET?: string
  /** Who may edit the account limits: email addresses, separated by commas (a secret, so they're not in git). */
  ADMIN_EMAILS?: string
  /** The runner (runner/, on Cloud Run) that answers messages on the server, and the secret it and the Worker share. */
  RUNNER_URL?: string
  RUNNER_SECRET?: string
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

const account = (env: Env, user: Pick<User, 'sub'>) => env.ACCOUNT.get(env.ACCOUNT.idFromName(user.sub))
/** The Durable Object that holds site-wide settings (the account limits); Google account IDs are numbers, so the
 *  name can't clash with a user's. */
const settings = (env: Env) => env.ACCOUNT.get(env.ACCOUNT.idFromName('_settings'))

const isAdmin = (env: Env, user: User | null) =>
  !!user?.email && (env.ADMIN_EMAILS ?? '').toLowerCase().split(/[\s,]+/).includes(user.email)

const dailyUsd = async (env: Env, user: Pick<User, 'email'>) => dailyUsdFor(await settings(env).getLimits(), user.email)

async function currentUser(request: Request, env: Env): Promise<User | null> {
  const token = readSessionCookie(request)
  return token && env.SESSION_SECRET ? verifySession(token, env.SESSION_SECRET) : null
}

/** Only the site itself may call the API (browsers send Origin on POST). */
function sameSite(request: Request): boolean {
  const origin = request.headers.get('Origin')
  return !origin || new URL(origin).host === new URL(request.url).host
}

async function session(request: Request, env: Env, user: User | null = null) {
  user ??= await currentUser(request, env)
  return {
    clientId: env.GOOGLE_CLIENT_ID ?? null,
    user,
    admin: isAdmin(env, user),
    usage: user ? usageOf(await account(env, user).status(today()), await dailyUsd(env, user)) : null,
  }
}

async function signIn(request: Request, env: Env): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.SESSION_SECRET) return json({ error: 'Sign-in is not set up yet.' }, 503)
  const { credential } = (await request.json().catch(() => ({}))) as { credential?: string }
  const user = credential ? await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID) : null
  if (!user) return json({ error: 'Google sign-in failed: please try again.' }, 401)
  const cookie = sessionCookie(await signSession(user, env.SESSION_SECRET), new URL(request.url).protocol === 'https:')
  return json(await session(request, env, user), 200, { 'Set-Cookie': cookie })
}

async function chat(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env)
  if (!user) return signInFirst()
  return answer(request, env, user)
}

/** One model call for this user (from the browser, or from the runner for a run of theirs): checks the request and
 *  the allowance, calls Gemini and counts what it cost. */
async function answer(request: Request, env: Env, user: Pick<User, 'sub' | 'email'>): Promise<Response> {
  if (!env.GEMINI_API_KEY) return json({ error: 'The assistant is not set up yet (no Gemini API key).' }, 503)
  if (!(await env.CHAT_LIMIT.limit({ key: user.sub })).success) return json({ error: 'Too many requests: wait a minute and try again.' }, 429)

  const text = await request.text()
  if (text.length > LIMITS.bodyBytes) return json({ error: 'This conversation is too long: start a new chat' }, 413)
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
  const req = parseChatRequest(raw)
  if (typeof req === 'string') return json({ error: req }, 400)

  // Today's allowance (DAILY_USD): a new message needs some of it left; any call must fit in what's left.
  const day = today()
  const daily = await dailyUsd(env, user)
  const body = JSON.stringify(geminiRequest(req, day))
  const allowed = await account(env, user).allowed(day, isNewMessage(req.contents), body.length, daily)
  if (!allowed.ok) {
    const error = daily > 0 ? 'You have used today\'s assistant allowance.' : 'The assistant is turned off for this account.'
    return json({ error, usage: usageOf(allowed.count, daily) }, 429)
  }

  // Gemini sometimes returns a broken reply (a garbled tool call: finishReason MALFORMED_…, or no parts) that a
  // second try answers fine; retry those here. Every attempt's cost counts.
  let res: Response
  let data: GeminiResponse | null
  let spent: Spent = { input: 0, cached: 0, output: 0, usd: 0 }
  for (let attempt = 1; ; attempt++) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body,
    })
    data = (await res.json().catch(() => null)) as GeminiResponse | null
    spent = addSpent(spent, spentOf(data?.usageMetadata, day))
    if (!res.ok || attempt >= GEMINI_TRIES || !isBrokenReply(data)) break
    console.warn('Gemini broken reply, retrying', data?.candidates?.[0]?.finishReason)
  }
  const count = await account(env, user).spend(day, spent.usd)
  const candidate = data?.candidates?.[0]
  if (!res.ok || !candidate?.content?.parts?.length || candidate.finishReason?.startsWith('MALFORMED')) {
    console.error('Gemini error', res.status, data?.error?.status, data?.error?.message, candidate?.finishReason)
    const busy = res.status === 429 || res.status === 503
    const error = busy ? 'The assistant is busy right now: try again in a minute.'
      : candidate?.finishReason === 'SAFETY' ? 'The assistant declined to answer that.'
        : 'The assistant failed to answer: try again.'
    return json({ error, spent, usage: usageOf(count, daily) }, busy ? 429 : 502)
  }
  return json({ content: { role: 'model', parts: candidate.content.parts }, finishReason: candidate.finishReason, spent, usage: usageOf(count, daily) })
}

const signInFirst = () => json({ error: 'Please sign in with Google.', signIn: true }, 401)

async function trips(request: Request, env: Env, id: string | undefined): Promise<Response> {
  const user = await currentUser(request, env)
  if (!user) return signInFirst()
  const store = account(env, user)
  const { method } = request
  if (method === 'GET') {
    if (!id) return json(await store.listTrips())
    const trip = await store.getTrip(id)
    if (!trip) return json({ error: 'Trip not found' }, 404)
    // With the assistant's run on it, if one is under way (the page follows it).
    const run = await store.tripRun(id)
    return json({ ...(trip as object), run: run && runView(run) })
  }
  if (method === 'DELETE' && id) {
    const deleted = await store.deleteTrip(id)
    if (deleted === BUSY) return json({ error: BUSY, busy: true }, 409)
    return deleted ? json({ ok: true }) : json({ error: 'Trip not found' }, 404)
  }
  if ((method === 'POST' && !id) || (method === 'PUT' && id)) {
    if (!(await env.SAVE_LIMIT.limit({ key: user.sub })).success) return json({ error: 'Saving too often: wait a moment.' }, 429)
    const text = await request.text()
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return json({ error: 'Invalid request' }, 400)
    }
    const patch = parseTripPatch(raw)
    if (typeof patch === 'string') return json({ error: patch }, 400)
    if (!id) {
      const created = await store.createTrip(patch)
      return typeof created === 'string' ? json({ error: created }, 409) : json(created, 201)
    }
    const saved = await store.saveTrip(id, patch)
    if (typeof saved === 'string') return json({ error: saved, busy: true }, 409)
    return saved ? json(saved) : json({ error: 'Trip not found' }, 404)
  }
  return json({ error: 'Not found' }, 404)
}

// ---------------------------------------------------------------- the assistant's runs (runs.ts)

/** Starts a run: saves the trip and chat as on screen, adds the run, and hands it to the runner. */
async function startRun(request: Request, env: Env, user: User): Promise<Response> {
  if (!env.RUNNER_URL || !env.RUNNER_SECRET) return json({ error: 'The assistant is not set up yet (no runner).' }, 503)
  if (!env.GEMINI_API_KEY) return json({ error: 'The assistant is not set up yet (no Gemini API key).' }, 503)
  const start = parseRunStart(await request.json().catch(() => null))
  if (typeof start === 'string') return json({ error: start }, 400)
  const patch = parseTripPatch({ data: start.data, chat: start.chat })
  if (typeof patch === 'string') return json({ error: patch }, 400)
  // A new message needs some of today's allowance left (as on /api/chat).
  const day = today()
  const daily = await dailyUsd(env, user)
  const allowed = await account(env, user).allowed(day, true, 0, daily)
  if (!allowed.ok) {
    const error = daily > 0 ? 'You have used today\'s assistant allowance.' : 'The assistant is turned off for this account.'
    return json({ error, usage: usageOf(allowed.count, daily) }, 429)
  }
  const run = await account(env, user).startRun(start.tripId, patch, start.request, user.email)
  if (!run) return json({ error: 'Trip not found' }, 404)
  if (typeof run === 'string') return json({ error: run, busy: true }, 409)
  // The runner queues it and answers at once; the run itself reports back on /internal/runs.
  const res = await fetch(`${env.RUNNER_URL}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Runner-Secret': env.RUNNER_SECRET },
    body: JSON.stringify({ origin: new URL(request.url).origin, account: user.sub, run: run.id }),
  }).catch((e: Error) => {
    console.error('Runner unreachable', e.message)
    return null
  })
  if (!res?.ok) {
    console.error('Runner refused the run', res?.status, await res?.text().catch(() => ''))
    const error = 'The assistant couldn\'t start: try again.'
    await account(env, user).failRun(run.id, error)
    return json({ error }, 502)
  }
  return json({ run: runView(run) }, 201)
}

async function runs(request: Request, env: Env, id: string | undefined, action: string | undefined): Promise<Response> {
  const user = await currentUser(request, env)
  if (!user) return signInFirst()
  if (request.method === 'POST' && !id) return startRun(request, env, user)
  if (!id) return json({ error: 'Not found' }, 404)
  const run = request.method === 'POST' && action === 'stop' ? await account(env, user).stopRun(id)
    : request.method === 'GET' && !action ? await account(env, user).getRun(id) : undefined
  if (run === undefined) return json({ error: 'Not found' }, 404)
  if (!run) return json({ error: 'Run not found' }, 404)
  // The trip too, when the run changed it since the version the page has (kept as text: it may be large).
  const since = Number(new URL(request.url).searchParams.get('since') ?? NaN)
  const data = !action && run.version > since ? await account(env, user).runTripData(id) : null
  return new Response(`{"run":${JSON.stringify(runView(run))}${data ? `,"data":${data}` : ''}}`, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

/** Equal strings, compared in constant time. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/** The runner's side of a run: its input, model calls, progress and end. Only with the shared secret. */
async function internal(request: Request, env: Env, sub: string, id: string, action: string | undefined): Promise<Response> {
  const auth = request.headers.get('Authorization') ?? ''
  if (!env.RUNNER_SECRET || !sameSecret(auth, `Bearer ${env.RUNNER_SECRET}`)) return json({ error: 'Not allowed' }, 403)
  const store = account(env, { sub })
  if (request.method === 'GET' && !action) {
    const input = await store.runInput(id)
    return input ? new Response(input, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }) : json({ error: 'Run not found' }, 404)
  }
  if (request.method !== 'POST') return json({ error: 'Not found' }, 404)
  if (action === 'chat') {
    const email = await store.runEmail(id)
    if (email === undefined) return json({ error: 'Run not found' }, 404)
    return answer(request, env, { sub, email: email ?? undefined })
  }
  const body = (await request.json().catch(() => null)) as { reply?: unknown; data?: unknown; chat?: unknown } | null
  const reply = JSON.stringify(body?.reply ?? null)
  if (reply.length > RUN_LIMITS.replyBytes) return json({ error: 'Reply too long' }, 413)
  const patch = parseTripPatch({ ...(body?.data !== undefined && { data: body.data }), ...(body?.chat !== undefined && { chat: body.chat }) })
  if (typeof patch === 'string') return json({ error: patch }, 400)
  if (action === 'progress') return json(await store.runProgress(id, reply, patch.data))
  if (action === 'finish') {
    const end = parseRunEnd(body)
    if (typeof end === 'string') return json({ error: end }, 400)
    return (await store.finishRun(id, patch, reply, end.status, end.error)) ? json({ ok: true }) : json({ error: 'Run not found' }, 404)
  }
  return json({ error: 'Not found' }, 404)
}

/** The account limits, for admins: the default and the accounts listed with their own daily limit. */
async function adminLimits(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env)
  if (!user) return signInFirst()
  if (!isAdmin(env, user)) return json({ error: 'Not allowed' }, 403)
  const list = (limits: Record<string, number>) => ({
    defaultUsd: DAILY_USD,
    limits: Object.entries(limits).map(([email, usd]) => ({ email, usd })).sort((a, b) => a.email.localeCompare(b.email)),
  })
  if (request.method === 'GET') return json(list(await settings(env).getLimits()))
  if (request.method !== 'PUT') return json({ error: 'Not found' }, 404)
  const limits = parseAccountLimits(await request.json().catch(() => null))
  if (typeof limits === 'string') return json({ error: limits }, 400)
  await settings(env).setLimits(limits)
  return json(list(limits))
}

async function api(request: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === '/api/admin/limits') {
    if (request.method !== 'GET' && !sameSite(request)) return json({ error: 'Not allowed' }, 403)
    return adminLimits(request, env)
  }
  const tripPath = pathname.match(/^\/api\/trips(?:\/([\w-]{1,64}))?$/)
  if (tripPath) {
    if (request.method !== 'GET' && !sameSite(request)) return json({ error: 'Not allowed' }, 403)
    return trips(request, env, tripPath[1])
  }
  const runPath = pathname.match(/^\/api\/runs(?:\/([\w-]{1,64})(?:\/(stop))?)?$/)
  if (runPath) {
    if (request.method !== 'GET' && !sameSite(request)) return json({ error: 'Not allowed' }, 403)
    return runs(request, env, runPath[1], runPath[2])
  }
  if (request.method === 'GET' && pathname === '/api/session') return json(await session(request, env))
  if (request.method !== 'POST') return json({ error: 'Not found' }, 404)
  if (!sameSite(request)) return json({ error: 'Not allowed' }, 403)
  if (pathname === '/api/auth/google') return signIn(request, env)
  if (pathname === '/api/auth/logout') {
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(null, new URL(request.url).protocol === 'https:') })
  }
  if (pathname === '/api/chat') return chat(request, env)
  return json({ error: 'Not found' }, 404)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/')) return api(request, env, pathname)
    const internalPath = pathname.match(/^\/internal\/runs\/(\w{1,64})\/([\w-]{1,64})(?:\/(chat|progress|finish))?$/)
    if (internalPath) return internal(request, env, internalPath[1], internalPath[2], internalPath[3])
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
