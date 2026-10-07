// Sign-in for the trip assistant: verifies the ID token from "Sign in with Google" and keeps the user signed in with
// our own signed session cookie (HMAC-SHA256), so Google is only asked once per 30 days.

/** `email`: only when Google says it's verified; kept in the session cookie (not stored) to look up the account's
 *  daily limit and admin rights. */
export type User = { sub: string; name: string; picture?: string; email?: string }

const SESSION_COOKIE = 'rtw_session'
const SESSION_DAYS = 30
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com'])
const GOOGLE_KEYS = 'https://www.googleapis.com/oauth2/v3/certs'

const enc = new TextEncoder()
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))
const decodeJson = (s: string) => JSON.parse(new TextDecoder().decode(fromB64url(s)))

// ---------------------------------------------------------------- Google ID token

type Jwk = { kid: string; n: string; e: string; kty: string; alg?: string }
let keyCache: { keys: Jwk[]; until: number } | null = null

async function googleKeys(fetcher: typeof fetch): Promise<Jwk[]> {
  if (keyCache && keyCache.until > Date.now()) return keyCache.keys
  const res = await fetcher(GOOGLE_KEYS)
  if (!res.ok) throw new Error(`Google keys: ${res.status}`)
  const maxAge = Number(res.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 3600)
  keyCache = { keys: ((await res.json()) as { keys: Jwk[] }).keys, until: Date.now() + maxAge * 1000 }
  return keyCache.keys
}

/** The user from a Google ID token, or null if it isn't valid for our client ID. */
export async function verifyGoogleIdToken(token: string, clientId: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<User | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  let header: { alg?: string; kid?: string }
  let claims: { iss?: string; aud?: string; exp?: number; sub?: string; name?: string; picture?: string; email?: string; email_verified?: boolean }
  try {
    header = decodeJson(parts[0])
    claims = decodeJson(parts[1])
  } catch {
    return null
  }
  if (header.alg !== 'RS256' || !header.kid) return null
  if (!GOOGLE_ISSUERS.has(claims.iss ?? '') || claims.aud !== clientId || !claims.sub || !claims.exp || claims.exp * 1000 < now) return null
  const jwk = (await googleKeys(fetcher)).find((k) => k.kid === header.kid)
  if (!jwk) return null
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`))
  if (!ok) return null
  const email = claims.email && claims.email_verified === true ? claims.email.toLowerCase() : undefined
  return { sub: claims.sub, name: claims.name ?? 'Traveller', picture: claims.picture, ...(email && { email }) }
}

// ---------------------------------------------------------------- our session

const hmacKey = (secret: string) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

export async function signSession(user: User, secret: string, now = Date.now()): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ ...user, exp: now + SESSION_DAYS * 86_400_000 })))
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload)))
  return `${payload}.${b64url(sig)}`
}

export async function verifySession(token: string, secret: string, now = Date.now()): Promise<User | null> {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  try {
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(payload)))) return null
    const { sub, name, picture, email, exp } = decodeJson(payload) as User & { exp: number }
    return exp > now && sub ? { sub, name, picture, ...(email && { email }) } : null
  } catch {
    return null
  }
}

export function sessionCookie(token: string | null, secure: boolean): string {
  const attrs = `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  return token ? `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86_400}; ${attrs}` : `${SESSION_COOKIE}=; Max-Age=0; ${attrs}`
}

export function readSessionCookie(request: Request): string | null {
  const cookie = request.headers.get('Cookie') ?? ''
  return cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) || null
}
