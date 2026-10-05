// The site's Worker: serves the built app (static files) and one API route, /api/chat, which forwards the trip
// assistant's conversation to Gemini with the secret API key. Everything else goes to the static files.
import { geminiRequest, LIMITS, parseChatRequest } from './chat'

type Env = {
  ASSETS: Fetcher
  CHAT_LIMIT: RateLimit
  GEMINI_API_KEY?: string
  GEMINI_MODEL: string
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

async function chat(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405)
  // Only the site itself may call this (browsers send Origin on POST).
  const origin = request.headers.get('Origin')
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'Not allowed' }, 403)
  if (!env.GEMINI_API_KEY) return json({ error: 'The assistant is not set up yet (no Gemini API key).' }, 503)

  const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
  if (!(await env.CHAT_LIMIT.limit({ key: ip })).success) {
    return json({ error: 'Too many requests: wait a minute and try again.' }, 429)
  }

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

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(geminiRequest(req, new Date().toISOString().slice(0, 10))),
  })
  const data = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: unknown[] }; finishReason?: string }[]
    usageMetadata?: Record<string, number>
    error?: { message?: string; status?: string }
  } | null
  const candidate = data?.candidates?.[0]
  if (!res.ok || !candidate?.content?.parts?.length) {
    console.error('Gemini error', res.status, data?.error?.status, data?.error?.message, candidate?.finishReason)
    const busy = res.status === 429 || res.status === 503
    const error = busy ? 'The assistant is busy right now: try again in a minute.'
      : candidate?.finishReason === 'SAFETY' ? 'The assistant declined to answer that.'
        : 'The assistant failed to answer: try again.'
    return json({ error }, busy ? 429 : 502)
  }
  return json({ content: { role: 'model', parts: candidate.content.parts }, finishReason: candidate.finishReason, usage: data?.usageMetadata })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/chat') return chat(request, env)
    if (pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
