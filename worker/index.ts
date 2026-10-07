// The site's Worker: serves the built app (static files) and the API for signed-in users:
//   GET  /api/session              who is signed in, and today's assistant usage
//   POST /api/auth/google          sign in with a Google ID token (sets our session cookie)
//   POST /api/auth/logout          sign out
//   GET  /api/trips                the user's saved trips (summaries) and the one opened last
//   POST /api/trips                create a trip
//   GET|PUT|DELETE /api/trips/:id  open, save or delete a trip
//   POST /api/chat                 forward the assistant conversation to Gemini (20 messages a day)
// Everything else goes to the static files.
import { readSessionCookie, sessionCookie, signSession, verifyGoogleIdToken, verifySession, type User } from './auth'
import { GEMINI_TRIES, geminiRequest, isBrokenReply, isNewMessage, LIMITS, parseChatRequest, type GeminiResponse } from './chat'
import { DAILY_MESSAGES, resetsAt, today, type Count } from './limits'
import { Account } from './account'
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
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

const usageOf = (c: Count) => ({ used: c.messages, limit: DAILY_MESSAGES, remaining: Math.max(0, DAILY_MESSAGES - c.messages), resetsAt: resetsAt() })
const account = (env: Env, user: User) => env.ACCOUNT.get(env.ACCOUNT.idFromName(user.sub))

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
    usage: user ? usageOf(await account(env, user).status(today())) : null,
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
  if (!env.GEMINI_API_KEY) return json({ error: 'The assistant is not set up yet (no Gemini API key).' }, 503)
  const user = await currentUser(request, env)
  if (!user) return signInFirst()
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

  // Count the message (only when the user sent new text, not for tool-result rounds) and the model call.
  const day = today()
  const message = isNewMessage(req.contents)
  const taken = await account(env, user).take(day, message)
  if (!taken.ok) {
    return json({ error: 'You have used all of today\'s assistant messages.', usage: usageOf(taken.count) }, 429)
  }

  // Gemini sometimes returns a broken reply (a garbled tool call: finishReason MALFORMED_…, or no parts) that a
  // second try answers fine; retry those here, as one counted call.
  const body = JSON.stringify(geminiRequest(req, day))
  let res: Response
  let data: GeminiResponse | null
  for (let attempt = 1; ; attempt++) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body,
    })
    data = (await res.json().catch(() => null)) as GeminiResponse | null
    if (!res.ok || attempt >= GEMINI_TRIES || !isBrokenReply(data)) break
    console.warn('Gemini broken reply, retrying', data?.candidates?.[0]?.finishReason)
  }
  const candidate = data?.candidates?.[0]
  if (!res.ok || !candidate?.content?.parts?.length || candidate.finishReason?.startsWith('MALFORMED')) {
    console.error('Gemini error', res.status, data?.error?.status, data?.error?.message, candidate?.finishReason)
    const count = await account(env, user).refund(day, message)
    const busy = res.status === 429 || res.status === 503
    const error = busy ? 'The assistant is busy right now: try again in a minute.'
      : candidate?.finishReason === 'SAFETY' ? 'The assistant declined to answer that.'
        : 'The assistant failed to answer: try again.'
    return json({ error, usage: usageOf(count) }, busy ? 429 : 502)
  }
  return json({ content: { role: 'model', parts: candidate.content.parts }, finishReason: candidate.finishReason, usage: usageOf(taken.count) })
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
    return trip ? json(trip) : json({ error: 'Trip not found' }, 404)
  }
  if (method === 'DELETE' && id) return (await store.deleteTrip(id)) ? json({ ok: true }) : json({ error: 'Trip not found' }, 404)
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
    return saved ? json(saved) : json({ error: 'Trip not found' }, 404)
  }
  return json({ error: 'Not found' }, 404)
}

async function api(request: Request, env: Env, pathname: string): Promise<Response> {
  const tripPath = pathname.match(/^\/api\/trips(?:\/([\w-]{1,64}))?$/)
  if (tripPath) {
    if (request.method !== 'GET' && !sameSite(request)) return json({ error: 'Not allowed' }, 403)
    return trips(request, env, tripPath[1])
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
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
