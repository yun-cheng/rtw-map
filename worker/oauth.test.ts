import { describe, expect, it } from 'vitest'
import { b64url, signSession, verifySession, type User } from './auth'
import { handleMcp, type McpContext } from './mcp'
import { bearer, oauth, parseRegistration, redirectAllowed, redirectMatches, seal, unseal, type GrantStore, type OAuthContext } from './oauth'

const SECRET = 'test-secret'
const ORIGIN = 'https://trips.example'
const user: User = { sub: '42', name: 'Zeke', email: 'zeke@example.com' }

/** The grants as the Account keeps them (account.ts), in memory. */
function fakeGrants() {
  const rows = new Map<string, { scope: string; status: 'pending' | 'active'; gen: number }>()
  let n = 0
  const store: GrantStore = {
    addGrant: async (g) => {
      const id = `g${++n}`
      rows.set(id, { scope: g.scope, status: 'pending', gen: 0 })
      return id
    },
    activateGrant: async (id) => {
      const g = rows.get(id)
      if (!g) return null
      if (g.status !== 'pending') {
        rows.delete(id)
        return null
      }
      Object.assign(g, { status: 'active', gen: 1 })
      return { scope: g.scope, gen: 1 }
    },
    rotateGrant: async (id, gen) => {
      const g = rows.get(id)
      if (g?.status !== 'active') return null
      if (g.gen !== gen) {
        rows.delete(id)
        return null
      }
      g.gen = gen + 1
      return { scope: g.scope, gen: g.gen }
    },
    useGrant: async (id) => {
      const g = rows.get(id)
      return g?.status === 'active' ? { scope: g.scope } : null
    },
  }
  return { rows, store }
}

function context(signedIn: User | null = user) {
  const grants = fakeGrants()
  const ctx: OAuthContext = { secret: SECRET, googleClientId: 'google-client', user: async () => signedIn, grants: () => grants.store, limit: async () => true }
  return { ctx, grants }
}

const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  new Request(ORIGIN + path, { method: 'POST', body, headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded', ...headers } })
const send = (ctx: OAuthContext, req: Request) => oauth(req, ctx, new URL(req.url).pathname) as Promise<Response>

/** PKCE as an app does it: a verifier and its challenge. */
async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  return { verifier, challenge }
}

/** Registers an app, has the user allow it, and returns its code, as Claude's or Codex's sign-in does. */
async function connect(ctx: OAuthContext, redirect = 'http://127.0.0.1:33418/callback') {
  const reg = await send(ctx, post('/oauth/register', JSON.stringify({ client_name: 'Claude', redirect_uris: [redirect] }), { 'Content-Type': 'application/json' }))
  expect(reg.status).toBe(201)
  const { client_id: clientId } = await reg.json() as { client_id: string }
  const { verifier, challenge } = await pkce()
  const params = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 's1', resource: `${ORIGIN}/mcp`,
  })
  const page = await send(ctx, new Request(`${ORIGIN}/oauth/authorize?${params}`))
  expect(page.status).toBe(200)
  expect(await page.text()).toContain('Allow <b>Claude</b> to see your trips?')
  const answer = await send(ctx, post('/oauth/authorize', `${params}&decision=allow`))
  expect(answer.status).toBe(303)
  const back = new URL(answer.headers.get('Location')!)
  expect(back.searchParams.get('state')).toBe('s1')
  expect(back.searchParams.get('iss')).toBe(ORIGIN)
  return { clientId, verifier, redirect, code: back.searchParams.get('code')! }
}

const exchange = (ctx: OAuthContext, params: Record<string, string>) => send(ctx, post('/oauth/token', new URLSearchParams(params).toString()))

describe('connecting other apps (OAuth)', () => {
  it('signs tokens with a key of their own, by type, until they expire', async () => {
    const t = await seal('access', { sub: '42', exp: 2000 }, SECRET)
    expect(await unseal('access', t, SECRET, 1000)).toMatchObject({ sub: '42' })
    expect(await unseal('refresh', t, SECRET, 1000)).toBeNull()
    expect(await unseal('access', t, SECRET, 3000)).toBeNull()
    expect(await unseal('access', t, 'other-secret', 1000)).toBeNull()
    // A session can't pass for a token, nor a token for a session.
    expect(await unseal('access', await signSession(user, SECRET), SECRET)).toBeNull()
    expect(await verifySession(await seal('access', { sub: '42' }, SECRET), SECRET)).toBeNull()
  })

  it('sends apps back only to https, this computer or their own scheme', () => {
    expect(redirectAllowed('https://claude.ai/api/mcp/auth_callback')).toBe(true)
    expect(redirectAllowed('http://localhost:3000/callback')).toBe(true)
    expect(redirectAllowed('http://[::1]:3000/cb')).toBe(true)
    expect(redirectAllowed('cursor://anysphere.cursor-mcp/oauth/callback')).toBe(true)
    for (const bad of ['http://evil.example/cb', 'javascript:alert(1)', 'data:text/html,hi', 'https://claude.ai/cb#x', 'not a url']) expect(redirectAllowed(bad)).toBe(false)
    expect(redirectMatches(['http://127.0.0.1:1234/callback'], 'http://127.0.0.1:5555/callback')).toBe(true)
    expect(redirectMatches(['http://127.0.0.1:1234/callback'], 'http://127.0.0.1:5555/other')).toBe(false)
    expect(redirectMatches(['https://claude.ai/cb'], 'https://claude.ai/cb2')).toBe(false)
    expect(parseRegistration({ redirect_uris: [] })).toBe('invalid_redirect_uri')
    expect(parseRegistration({ redirect_uris: ['https://a.example/cb'] })).toEqual({ name: 'An AI app', redirects: ['https://a.example/cb'] })
  })

  it('tells apps where to sign in', async () => {
    const { ctx } = context()
    const resource = await (await send(ctx, new Request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`))).json()
    expect(resource).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN] })
    const server = await (await send(ctx, new Request(`${ORIGIN}/.well-known/oauth-authorization-server`))).json()
    expect(server).toMatchObject({ issuer: ORIGIN, code_challenge_methods_supported: ['S256'], registration_endpoint: `${ORIGIN}/oauth/register` })
    const res = await bearer(new Request(`${ORIGIN}/mcp`, { method: 'POST' }), ctx) as Response
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`)
  })

  it('connects an app the user allows: a code for tokens once, refresh tokens rotated, a reused one disconnects it', async () => {
    const { ctx, grants } = context()
    const { clientId, verifier, redirect, code } = await connect(ctx)
    // A CLI's server may be on another port than it registered.
    expect(redirect).toContain('127.0.0.1')
    expect((await exchange(ctx, { grant_type: 'authorization_code', code, client_id: clientId, code_verifier: 'x'.repeat(43) })).status).toBe(400)
    const res = await exchange(ctx, { grant_type: 'authorization_code', code, client_id: clientId, code_verifier: verifier, redirect_uri: redirect })
    expect(res.status).toBe(200)
    const first = await res.json() as { access_token: string; refresh_token: string; scope: string }
    expect(first.scope).toBe('trips:read')

    const mcp = (token: string) => new Request(`${ORIGIN}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    expect(await bearer(mcp(first.access_token), ctx)).toEqual({ sub: '42', scope: 'trips:read' })

    const refreshed = await (await exchange(ctx, { grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: clientId })).json() as typeof first
    expect(refreshed.refresh_token).not.toBe(first.refresh_token)
    expect(await bearer(mcp(refreshed.access_token), ctx)).toMatchObject({ sub: '42' })
    // The old refresh token again: copied, so the app is disconnected and its tokens stop.
    expect((await exchange(ctx, { grant_type: 'refresh_token', refresh_token: first.refresh_token })).status).toBe(400)
    expect(grants.rows.size).toBe(0)
    expect(((await bearer(mcp(refreshed.access_token), ctx)) as Response).status).toBe(401)
  })

  it('refuses a code used twice (and drops its grant), for another app, or without the right verifier', async () => {
    const { ctx, grants } = context()
    const { clientId, verifier, code } = await connect(ctx)
    const other = await connect(ctx, 'https://chatgpt.com/connector/oauth/cb')
    expect((await exchange(ctx, { grant_type: 'authorization_code', code, client_id: other.clientId, code_verifier: verifier })).status).toBe(400)
    expect((await exchange(ctx, { grant_type: 'authorization_code', code, client_id: clientId, code_verifier: verifier })).status).toBe(200)
    const again = await exchange(ctx, { grant_type: 'authorization_code', code, client_id: clientId, code_verifier: verifier })
    expect(await again.json()).toMatchObject({ error: 'invalid_grant' })
    expect(grants.rows.size).toBe(1)
  })

  it('asks a signed-out user to sign in, sends a no back to the app, and takes answers only from its own page', async () => {
    const reg = parseRegistration({ client_name: '<script>', redirect_uris: ['https://claude.ai/cb'] }) as { name: string; redirects: string[] }
    const clientId = await seal('client', { n: reg.name, u: reg.redirects }, SECRET)
    const { challenge } = await pkce()
    const params = new URLSearchParams({ response_type: 'code', client_id: clientId, code_challenge: challenge, code_challenge_method: 'S256', state: 'abc' })
    const signedOut = await send(context(null).ctx, new Request(`${ORIGIN}/oauth/authorize?${params}`))
    const html = await signedOut.text()
    expect(html).toContain('accounts.google.com/gsi/client')
    expect(html).toContain('&lt;script&gt;')
    expect(signedOut.headers.get('X-Frame-Options')).toBe('DENY')

    const { ctx } = context()
    const no = await send(ctx, post('/oauth/authorize', `${params}&decision=deny`))
    expect(no.headers.get('Location')).toMatch(/^https:\/\/claude\.ai\/cb\?error=access_denied&.*state=abc/)
    const elsewhere = await send(ctx, post('/oauth/authorize', `${params}&decision=allow`, { Origin: 'https://evil.example' }))
    expect(elsewhere.status).toBe(403)

    const noPkce = await send(ctx, new Request(`${ORIGIN}/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId })}`))
    expect(noPkce.headers.get('Location')).toContain('error=invalid_request')
    const unknown = await send(ctx, new Request(`${ORIGIN}/oauth/authorize?client_id=forged.sig&redirect_uri=https://evil.example`))
    expect(unknown.status).toBe(400)
    expect(unknown.headers.get('Location')).toBeNull()
  })
})

describe('the MCP server', () => {
  const trips = [
    { id: 'a1', name: 'Balkans', startDate: '2027-05-01', endDate: '2027-06-01', stops: 6, updated: Date.parse('2026-10-01'), share: null },
    { id: 'b2', name: 'Asia', startDate: null, endDate: null, stops: 0, updated: Date.parse('2026-09-01'), share: null },
  ]
  function server() {
    const sent: string[] = []
    const ctx: McpContext = {
      listTrips: async () => ({ trips, lastId: 'b2' }),
      tripTexts: async (id, extra) => ({ data: `{"trip":"${id}"}`, extra: extra && '{"x":1}' }),
      runTool: async (body) => {
        sent.push(body)
        return { ok: true, result: { done: true } }
      },
    }
    /** A request, or a notification (no id). */
    const rpc = async (method: string, params: unknown = {}, notify = false) => {
      const body = JSON.stringify({ jsonrpc: '2.0', ...(!notify && { id: 1 }), method, params })
      const res = await handleMcp(new Request(`${ORIGIN}/mcp`, { method: 'POST', body }), ctx)
      return { status: res.status, body: res.status === 202 ? null : await res.json() as { result?: Record<string, unknown>; error?: { code: number } } }
    }
    return { rpc, sent }
  }
  const textOf = (r: { result?: Record<string, unknown> }) => JSON.parse((r.result!.content as { text: string }[])[0].text)

  it('starts a session and lists its tools', async () => {
    const { rpc } = server()
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai' } })
    expect(init.body?.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'rtw-map' } })
    expect((await rpc('initialize', { protocolVersion: '1999-01-01' })).body?.result?.protocolVersion).toBe('2025-11-25')
    expect((await rpc('notifications/initialized', {}, true)).status).toBe(202)
    const tools = (await rpc('tools/list')).body?.result?.tools as { name: string }[]
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['list_trips', 'get_trip', 'get_visit', 'get_journal', 'get_route']))
    expect((await rpc('resources/list')).body?.error?.code).toBe(-32601)
    expect((await handleMcp(new Request(`${ORIGIN}/mcp`), {} as McpContext)).status).toBe(405)
  })

  it('lists the trips and runs tools on the one asked for, or the one open in the app', async () => {
    const { rpc, sent } = server()
    expect(textOf((await rpc('tools/call', { name: 'list_trips', arguments: {} })).body!).trips[1]).toMatchObject({ id: 'b2', open_in_app: true })
    await rpc('tools/call', { name: 'get_trip', arguments: {} })
    expect(JSON.parse(sent[0])).toMatchObject({ name: 'get_trip', trip: { id: 'b2', name: 'Asia' }, data: { trip: 'b2' }, extra: null })
    await rpc('tools/call', { name: 'get_visit', arguments: { trip: 'balkans', city: 'Kotor' } })
    expect(JSON.parse(sent[1])).toMatchObject({ trip: { id: 'a1' }, args: { city: 'Kotor' }, extra: { x: 1 } })
    const missing = (await rpc('tools/call', { name: 'get_trip', arguments: { trip: 'Mars' } })).body!
    expect(missing.result).toMatchObject({ isError: true })
    expect(textOf(missing).error).toMatch(/Balkans, Asia/)
    expect((await rpc('tools/call', { name: 'remove_stop', arguments: {} })).body?.error?.code).toBe(-32602)
    expect(sent).toHaveLength(2)
  })
})
