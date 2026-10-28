// Sign-in for other apps' AI assistants (Claude, ChatGPT and Codex, Gemini CLI) to the trip's MCP server (mcp.ts), the
// way MCP asks for it: OAuth 2.1 with PKCE (modelcontextprotocol.io, specification: Authorization). The Worker is its
// own authorization server:
//   GET  /.well-known/oauth-protected-resource[/mcp]   where to sign in for /mcp (RFC 9728)
//   GET  /.well-known/oauth-authorization-server        how to sign in (RFC 8414)
//   POST /oauth/register    an app registers itself (RFC 7591); its client ID is its registration, signed, so nothing is
//                           stored for an app until a user allows it
//   GET  /oauth/authorize   the page where the user allows the app (signed in with the site's own session)
//   POST /oauth/authorize   their answer: back to the app with a code (or the refusal)
//   POST /oauth/token       a code or a refresh token for an access token (an hour) and a new refresh token
// Each app a user allows is a grant in their Account (account.ts), to read the trips and, if the user ticks it, to
// change them: the app lists them (Account, AI apps) and a grant removed there stops its tokens at once. A code or refresh token used twice removes its grant (someone else may have
// it). Tokens are signed with a key of their own, not the session's, so one can't pass for the other.
import { hmacKey, type User } from './auth'
import { b64url, fromB64url } from './base64url'

/** What an app may be allowed: reading the trips, and changing them (which includes reading). */
export const SCOPES = ['trips:read', 'trips:write'] as const
export const canWrite = (scope: string) => scope.split(' ').includes('trips:write')
export const OAUTH = {
  accessMs: 3_600_000, refreshMs: 60 * 86_400_000, codeMs: 5 * 60_000,
  nameChars: 80, redirects: 10, redirectChars: 500, stateChars: 1000, bodyBytes: 20_000,
}

export type Grant = { id: string; client: string; redirect: string; scope: string; created: number; used: number }
export type NewGrant = Pick<Grant, 'client' | 'redirect' | 'scope'>
/** The grants in a user's Account (account.ts). */
export type GrantStore = {
  addGrant: (g: NewGrant) => Promise<string>
  activateGrant: (id: string) => Promise<{ scope: string; gen: number } | null>
  rotateGrant: (id: string, gen: number) => Promise<{ scope: string; gen: number } | null>
  useGrant: (id: string) => Promise<{ scope: string; client: string } | null>
}
export type OAuthContext = {
  secret: string
  googleClientId: string | null
  /** Who is signed in to the site (its session cookie). */
  user: () => Promise<User | null>
  grants: (sub: string) => GrantStore
  /** Whether this many requests for the key are still allowed. */
  limit: (key: string) => Promise<boolean>
}

/** What /mcp accepts from other sites' pages (browser-based clients): tokens come in a header, never a cookie. */
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
}

const enc = new TextEncoder()
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...CORS, ...headers } })

// ---------------------------------------------------------------- signed tokens

/** Tokens' key: one of their own, not the session's. */
const keyFor = (secret: string) => hmacKey(`oauth:${secret}`)

/** A signed token of this type (client, code, access, refresh) with the payload; `exp` (ms), if any, is checked. */
export async function seal(typ: string, payload: Record<string, unknown>, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...payload, typ })))
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await keyFor(secret), enc.encode(body)))
  return `${body}.${b64url(sig)}`
}

/** The payload of a token of this type, or null if it's another type, forged or expired. */
export async function unseal<T>(typ: string, token: string, secret: string, now = Date.now()): Promise<T | null> {
  const [body, sig, more] = token.split('.')
  if (!body || !sig || more !== undefined) return null
  try {
    if (!(await crypto.subtle.verify('HMAC', await keyFor(secret), fromB64url(sig), enc.encode(body)))) return null
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as { typ?: string; exp?: number }
    return p?.typ === typ && (p.exp === undefined || p.exp > now) ? (p as T) : null
  } catch {
    return null
  }
}

const digest = async (s: string) => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))))

/** PKCE: the verifier the app kept is the one whose hash it sent when it asked (S256). */
export async function pkceMatches(verifier: string, challenge: string): Promise<boolean> {
  return /^[\w.~-]{43,128}$/.test(verifier) && (await digest(verifier)) === challenge
}

// ---------------------------------------------------------------- apps

type ClientToken = { n: string; u: string[] }
type Code = { sub: string; g: string; cid: string; uri: string; ch: string; exp: number }
type Refresh = { sub: string; g: string; n: number; cid: string; exp: number }
export type Access = { sub: string; g: string; s: string; aud: string; exp: number }

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const NOT_APPS = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'about:', 'blob:', 'ftp:', 'ws:', 'wss:', 'mailto:'])

const parseUrl = (s: string) => {
  try {
    return new URL(s)
  } catch {
    return null
  }
}

/** Where an app may ask to be sent back: https, http only on the user's own computer (a CLI's small server, RFC 8252),
 *  or a desktop app's own scheme; never a script or a file, and without a fragment. */
export function redirectAllowed(uri: string): boolean {
  const u = uri.length <= OAUTH.redirectChars && !uri.includes('#') ? parseUrl(uri) : null
  if (!u) return false
  if (u.protocol === 'https:') return !!u.hostname
  if (u.protocol === 'http:') return LOOPBACK.has(u.hostname)
  return /^[a-z][a-z\d+.-]*:$/.test(u.protocol) && !NOT_APPS.has(u.protocol)
}

/** Whether the app registered this address: exactly, or on the user's own computer on any port (a CLI picks a free one). */
export function redirectMatches(registered: string[], uri: string): boolean {
  if (registered.includes(uri)) return true
  const u = parseUrl(uri)
  if (u?.protocol !== 'http:' || !LOOPBACK.has(u.hostname)) return false
  return registered.map(parseUrl).some((r) => r?.protocol === 'http:' && r.hostname === u.hostname && r.pathname === u.pathname && r.search === u.search)
}

/** Where the user goes back to, in words, for the page that asks them. */
export function redirectLabel(uri: string): string {
  const u = new URL(uri)
  return u.protocol === 'https:' ? u.host : u.protocol === 'http:' ? 'an app on this computer' : `the app that opens ${u.protocol} links`
}

/** An app's registration (RFC 7591), checked: its name and where it may be sent back, or the error. Apps are public
 *  clients (no secret): PKCE proves a code is theirs. */
export function parseRegistration(raw: unknown): { name: string; redirects: string[] } | string {
  const r = (raw ?? {}) as Record<string, unknown>
  const uris = r.redirect_uris
  if (!Array.isArray(uris) || !uris.length || uris.length > OAUTH.redirects || !uris.every((u) => typeof u === 'string' && redirectAllowed(u))) {
    return 'invalid_redirect_uri'
  }
  const name = typeof r.client_name === 'string' && r.client_name.trim() ? r.client_name.trim().slice(0, OAUTH.nameChars) : 'An AI app'
  return { name, redirects: uris as string[] }
}

export const mcpUrl = (origin: string) => `${origin}/mcp`
/** The resource an app asks for (RFC 8707): the MCP server, as it was given (the site's address, with or without /mcp). */
const isOurResource = (resource: string, origin: string) => [origin, mcpUrl(origin)].includes(resource.replace(/\/+$/, ''))

/** The scopes allowed: those asked for that exist, or all if none of them do (apps ask for all sorts); changing
 *  the trips comes with reading them. */
const scopeOf = (asked: string | null) => {
  const known = (asked ?? '').split(/\s+/).filter((s) => (SCOPES as readonly string[]).includes(s))
  return SCOPES.filter((s) => !known.length || known.includes(s) || (s === 'trips:read' && known.includes('trips:write'))).join(' ')
}

const withParams = (uri: string, params: Record<string, string | null>) => {
  const u = new URL(uri)
  for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v)
  return u.toString()
}

export type AuthRequest = { clientId: string; name: string; redirectUri: string; state: string | null; challenge: string; scope: string }

/** An app's request to be allowed (from its link, or the page's form): `ok`, or `fail` (shown on the page: the app
 *  can't be trusted with an answer), or `back` (the app's address with the error). */
export async function parseAuthorize(p: URLSearchParams, origin: string, secret: string): Promise<{ ok: AuthRequest } | { fail: string } | { back: string }> {
  const clientId = p.get('client_id') ?? ''
  const client = clientId ? await unseal<ClientToken>('client', clientId, secret) : null
  if (!client) return { fail: 'This app isn\'t registered here. Start connecting it again from the app.' }
  const redirectUri = p.get('redirect_uri') ?? (client.u.length === 1 ? client.u[0] : '')
  if (!redirectMatches(client.u, redirectUri)) return { fail: 'The app asked to be sent back to an address it didn\'t register.' }
  const state = p.get('state')
  const back = (error: string, description: string) => ({ back: withParams(redirectUri, { error, error_description: description, state, iss: origin }) })
  if (state && state.length > OAUTH.stateChars) return back('invalid_request', 'state is too long')
  if (p.get('response_type') !== 'code') return back('unsupported_response_type', 'Only response_type=code')
  const challenge = p.get('code_challenge') ?? ''
  if (p.get('code_challenge_method') !== 'S256' || !/^[\w-]{43}$/.test(challenge)) return back('invalid_request', 'PKCE with S256 is required')
  const resource = p.get('resource')
  if (resource && !isOurResource(resource, origin)) return back('invalid_target', 'Unknown resource')
  return { ok: { clientId, name: client.n, redirectUri, state, challenge, scope: scopeOf(p.get('scope')) } }
}

// ---------------------------------------------------------------- the endpoints

export function resourceMetadata(origin: string) {
  return { resource: mcpUrl(origin), authorization_servers: [origin], scopes_supported: SCOPES, bearer_methods_supported: ['header'], resource_name: 'rtw-map' }
}

export function serverMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    scopes_supported: SCOPES,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    authorization_response_iss_parameter_supported: true,
  }
}

/** The OAuth side of the site (all but /mcp): an answer, or null if the path isn't one of these. */
export async function oauth(request: Request, ctx: OAuthContext, pathname: string): Promise<Response | null> {
  const origin = new URL(request.url).origin
  const { method } = request
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } })
  if (method === 'GET' && /^\/\.well-known\/oauth-protected-resource(\/mcp)?$/.test(pathname)) return json(resourceMetadata(origin))
  if (method === 'GET' && pathname === '/.well-known/oauth-authorization-server') return json(serverMetadata(origin))
  if (pathname === '/oauth/register' && method === 'POST') return register(request, ctx)
  if (pathname === '/oauth/authorize' && method === 'GET') return authorize(request, ctx, new URL(request.url).searchParams)
  if (pathname === '/oauth/authorize' && method === 'POST') return decide(request, ctx)
  if (pathname === '/oauth/token' && method === 'POST') return token(request, ctx)
  return null
}

const ip = (request: Request) => request.headers.get('CF-Connecting-IP') ?? 'unknown'
const tooMany = () => json({ error: 'invalid_request', error_description: 'Too many requests: wait a minute.' }, 429)

async function register(request: Request, ctx: OAuthContext): Promise<Response> {
  if (!(await ctx.limit(`oauth:${ip(request)}`))) return tooMany()
  const text = await request.text()
  let raw: unknown = null
  try {
    raw = text.length <= OAUTH.bodyBytes ? JSON.parse(text) : null
  } catch { /* answered below */ }
  const client = parseRegistration(raw)
  if (typeof client === 'string') return json({ error: client, error_description: 'redirect_uris: https, http on localhost, or an app\'s own scheme' }, 400)
  const clientId = await seal('client', { n: client.name, u: client.redirects }, ctx.secret)
  return json({
    client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: client.name, redirect_uris: client.redirects,
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: SCOPES.join(' '),
  }, 201)
}

/** The page where the user allows the app: signed in, the question; signed out, Google's sign-in first. */
async function authorize(request: Request, ctx: OAuthContext, params: URLSearchParams): Promise<Response> {
  const origin = new URL(request.url).origin
  const parsed = await parseAuthorize(params, origin, ctx.secret)
  if ('fail' in parsed) return page('Can\'t connect this app', `<h1>Can't connect this app</h1><p>${esc(parsed.fail)}</p>`, 400)
  if ('back' in parsed) return Response.redirect(parsed.back, 302)
  const req = parsed.ok
  const user = await ctx.user()
  if (!user) return signInPage(req, ctx.googleClientId)
  const fields = [
    ['response_type', 'code'], ['client_id', req.clientId], ['redirect_uri', req.redirectUri], ['code_challenge', req.challenge],
    ['code_challenge_method', 'S256'], ['scope', req.scope], ...(req.state ? [['state', req.state]] : []), ...(params.get('resource') ? [['resource', params.get('resource')!]] : []),
  ].map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('')
  const name = `<b>${esc(req.name)}</b>`
  const write = canWrite(req.scope)
  return page(`Allow ${req.name}?`, `
    <h1>Allow ${name} to see your trips?</h1>
    <p>It will be able to read your saved trips in rtw-map: their plans, dates and costs, your journal and My visit (stays, tickets, expenses, links and notes).${write ? '' : ' It can\'t change anything.'}</p>
    <form method="post" action="/oauth/authorize">${fields}
      ${write ? `<label class="check"><input type="checkbox" name="write" value="1" checked><span><b>Also let it change your trips</b><br><span class="muted">Their plans, stops, nights and settings, and My visit (your bookings, links and notes), as the app's own assistant can. Its changes show in the app, and each can be undone.</span></span></label>` : ''}
      <p class="muted">Allow it only if you just started connecting it: the app chose its own name. You can disconnect it any time in the app (Account, AI apps). After you answer, you go back to ${esc(redirectLabel(req.redirectUri))}.</p>
      <div class="row"><button name="decision" value="deny">Cancel</button><button name="decision" value="allow" class="primary">Allow</button></div>
    </form>
    <p class="muted small">Signed in as ${esc(user.name)}${user.email ? ` (${esc(user.email)})` : ''}.</p>`)
}

/** Whether a form was sent from this site's own page: its Origin, or (a browser that sends "null", as some do for
 *  a page that keeps its address private) the browser's own word that it came from this site. */
export function fromHere(request: Request, origin: string): boolean {
  const from = request.headers.get('Origin')
  if (from && from !== 'null') return from === origin
  return request.headers.get('Sec-Fetch-Site') === 'same-origin'
}

/** The user's answer, from the page above (only from this site, signed in). */
async function decide(request: Request, ctx: OAuthContext): Promise<Response> {
  const url = new URL(request.url)
  if (!fromHere(request, url.origin)) return page('Not allowed', '<h1>Not allowed</h1><p>Answer on the page of this site.</p>', 403)
  const text = await request.text()
  const form = new URLSearchParams(text.length <= OAUTH.bodyBytes ? text : '')
  const parsed = await parseAuthorize(form, url.origin, ctx.secret)
  if ('fail' in parsed) return page('Can\'t connect this app', `<h1>Can't connect this app</h1><p>${esc(parsed.fail)}</p>`, 400)
  if ('back' in parsed) return Response.redirect(parsed.back, 303)
  const req = parsed.ok
  const user = await ctx.user()
  const allow = form.get('decision') === 'allow'
  const write = form.get('write') === '1'
  form.delete('decision')
  form.delete('write')
  // Signed out meanwhile: ask again.
  if (!user) return Response.redirect(`${url.origin}/oauth/authorize?${form}`, 303)
  if (!allow) {
    return Response.redirect(withParams(req.redirectUri, { error: 'access_denied', error_description: 'The user said no', state: req.state, iss: url.origin }), 303)
  }
  // Changing the trips only if the user left that ticked.
  const scope = write ? req.scope : req.scope.split(' ').filter((s) => s !== 'trips:write').join(' ')
  const g = await ctx.grants(user.sub).addGrant({ client: req.name, redirect: redirectLabel(req.redirectUri), scope })
  const code = await seal('code', { sub: user.sub, g, cid: await digest(req.clientId), uri: req.redirectUri, ch: req.challenge, exp: Date.now() + OAUTH.codeMs } satisfies Code, ctx.secret)
  return Response.redirect(withParams(req.redirectUri, { code, state: req.state, iss: url.origin }), 303)
}

/** The app's client ID in a token request: in the form, or as the user of HTTP Basic auth (with an empty secret). */
function clientIdOf(request: Request, p: URLSearchParams): string | null {
  const basic = request.headers.get('Authorization')?.match(/^Basic\s+(\S+)$/i)?.[1]
  if (basic) {
    try {
      return decodeURIComponent(atob(basic).split(':')[0])
    } catch {
      return null
    }
  }
  return p.get('client_id')
}

async function token(request: Request, ctx: OAuthContext): Promise<Response> {
  if (!(await ctx.limit(`oauth:${ip(request)}`))) return tooMany()
  const origin = new URL(request.url).origin
  const text = await request.text()
  if (text.length > OAUTH.bodyBytes) return json({ error: 'invalid_request' }, 400)
  let p: URLSearchParams
  try {
    p = (request.headers.get('Content-Type') ?? '').includes('json') ? new URLSearchParams(JSON.parse(text) as Record<string, string>) : new URLSearchParams(text)
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }
  const fail = (error: string, description: string) => json({ error, error_description: description }, 400)
  const resource = p.get('resource')
  if (resource && !isOurResource(resource, origin)) return fail('invalid_target', 'Unknown resource')
  const clientId = clientIdOf(request, p)
  const grantType = p.get('grant_type')

  if (grantType === 'authorization_code') {
    const code = await unseal<Code>('code', p.get('code') ?? '', ctx.secret)
    if (!code) return fail('invalid_grant', 'The code is wrong or has expired: connect again.')
    if (!clientId || (await digest(clientId)) !== code.cid) return fail('invalid_grant', 'The code is for another app.')
    const uri = p.get('redirect_uri')
    if (uri !== null && uri !== code.uri) return fail('invalid_grant', 'redirect_uri isn\'t the one the code was given to.')
    if (!(await pkceMatches(p.get('code_verifier') ?? '', code.ch))) return fail('invalid_grant', 'code_verifier doesn\'t match.')
    const grant = await ctx.grants(code.sub).activateGrant(code.g)
    if (!grant) return fail('invalid_grant', 'The code was already used: connect again.')
    return tokens(ctx.secret, origin, code.sub, code.g, grant, code.cid)
  }
  if (grantType === 'refresh_token') {
    const r = await unseal<Refresh>('refresh', p.get('refresh_token') ?? '', ctx.secret)
    if (!r) return fail('invalid_grant', 'The refresh token is wrong or has expired: connect again.')
    if (clientId && (await digest(clientId)) !== r.cid) return fail('invalid_grant', 'The refresh token is for another app.')
    const grant = await ctx.grants(r.sub).rotateGrant(r.g, r.n)
    if (!grant) return fail('invalid_grant', 'This app was disconnected: connect it again.')
    return tokens(ctx.secret, origin, r.sub, r.g, grant, r.cid)
  }
  return fail('unsupported_grant_type', 'authorization_code or refresh_token')
}

async function tokens(secret: string, origin: string, sub: string, g: string, grant: { scope: string; gen: number }, cid: string): Promise<Response> {
  const now = Date.now()
  const access = await seal('access', { sub, g, s: grant.scope, aud: mcpUrl(origin), exp: now + OAUTH.accessMs } satisfies Access, secret)
  const refresh = await seal('refresh', { sub, g, n: grant.gen, cid, exp: now + OAUTH.refreshMs } satisfies Refresh, secret)
  return json({ access_token: access, token_type: 'Bearer', expires_in: OAUTH.accessMs / 1000, refresh_token: refresh, scope: grant.scope })
}

/** The user an MCP request is from (its access token, still allowed), what the app may do and which app it is
 *  (`grant`, `app`), or the 401 that tells the app to sign in. */
export async function bearer(request: Request, ctx: OAuthContext): Promise<{ sub: string; scope: string; grant: string; app: string } | Response> {
  const origin = new URL(request.url).origin
  const unauthorized = (error?: string) => json({ error: error ?? 'unauthorized', error_description: 'Connect the app to rtw-map first.' }, 401, {
    'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="${SCOPES.join(' ')}"${error ? `, error="${error}"` : ''}`,
  })
  const raw = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!raw) return unauthorized()
  const t = await unseal<Access>('access', raw, ctx.secret)
  if (!t || t.aud !== mcpUrl(origin)) return unauthorized('invalid_token')
  const grant = await ctx.grants(t.sub).useGrant(t.g)
  return grant ? { sub: t.sub, scope: grant.scope, grant: t.g, app: grant.client } : unauthorized('invalid_token')
}

// ---------------------------------------------------------------- pages

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)

function signInPage(req: AuthRequest, googleClientId: string | null): Response {
  if (!googleClientId) return page('Sign-in is not set up', '<h1>Sign-in is not set up yet</h1>', 503)
  return page(`Connect ${req.name}`, `
    <h1>Sign in to connect <b>${esc(req.name)}</b></h1>
    <p>Sign in to rtw-map with the Google account your trips are saved in.</p>
    <div id="google"></div><p id="error" class="error"></p>
    <script>
      function ready() {
        google.accounts.id.initialize({ client_id: ${JSON.stringify(googleClientId).replace(/</g, '\\u003c')}, callback: async (r) => {
          const res = await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: r.credential }) })
          if (res.ok) location.reload()
          else document.getElementById('error').textContent = 'Google sign-in failed: please try again.'
        } })
        google.accounts.id.renderButton(document.getElementById('google'), { theme: 'outline', size: 'large', text: 'signin_with' })
      }
    </script>
    <script src="https://accounts.google.com/gsi/client?hl=en" async onload="ready()"></script>`)
}

function page(title: string, body: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · rtw-map</title><style>
:root { color-scheme: light dark; --bg: #f6f5f2; --panel: #fff; --text: #1d1d1b; --muted: #6b6a66; --line: #e2e0da; --accent: #2f6f5e; --danger: #b3261e }
@media (prefers-color-scheme: dark) { :root { --bg: #151514; --panel: #1f1f1d; --text: #ecebe7; --muted: #a09f9a; --line: #34332f; --accent: #6fb39c; --danger: #f2b8b5 } }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, sans-serif }
main { max-width: 440px; margin: 10vh auto; padding: 28px 24px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px }
@media (max-width: 500px) { main { margin: 16px; } }
h1 { font-size: 20px; line-height: 1.3; margin: 0 0 12px; font-weight: 600 } p { margin: 0 0 12px }
.muted { color: var(--muted); font-size: 14px } .small { font-size: 13px; margin: 16px 0 0 } .error { color: var(--danger) }
.check { display: flex; gap: 10px; align-items: flex-start; margin: 4px 0 16px; padding: 12px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer }
.check input { margin: 3px 0 0; width: 16px; height: 16px; accent-color: var(--accent); flex: none } .check .muted { font-size: 13px }
.row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px }
button { font: inherit; font-weight: 600; padding: 8px 18px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--text); cursor: pointer }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--panel) }
</style></head><body><main>${body}</main></body></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': 'frame-ancestors \'none\'', 'Referrer-Policy': 'same-origin',
    },
  })
}
