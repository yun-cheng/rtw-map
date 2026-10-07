import { describe, expect, it } from 'vitest'
import { readSessionCookie, sessionCookie, signSession, verifyGoogleIdToken, verifySession } from './auth'
import { isNewMessage } from './chat'
import { canCall, costOf, current, DAILY_USD, dailyUsdFor, MESSAGE_RESERVE_USD, parseAccountLimits, resetsAt, spend, today, usageOf } from './limits'
import { parseTripPatch, summarize, TRIP_LIMITS } from './trips'

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))

/** A fake Google: an RSA key pair, its public key as a JWKS response, and a way to issue ID tokens. */
async function fakeGoogle() {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const fetcher = (async () => Response.json({ keys: [{ ...jwk, kid: 'k1', alg: 'RS256' }] })) as unknown as typeof fetch
  const issue = async (claims: Record<string, unknown>, kid = 'k1') => {
    const head = enc({ alg: 'RS256', kid, typ: 'JWT' })
    const body = enc(claims)
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`)))
    return `${head}.${body}.${b64url(sig)}`
  }
  return { fetcher, issue }
}

describe('Google sign-in', () => {
  const now = Date.parse('2026-10-05T12:00:00Z')
  const claims = { iss: 'https://accounts.google.com', aud: 'client-1', sub: '1234', name: 'Zeke', exp: now / 1000 + 600 }

  it('accepts a valid ID token for our client', async () => {
    const g = await fakeGoogle()
    expect(await verifyGoogleIdToken(await g.issue(claims), 'client-1', g.fetcher, now)).toEqual({ sub: '1234', name: 'Zeke', picture: undefined })
    // The email is kept only when Google has verified it (keys are cached, so this uses the same fake Google).
    const withEmail = { ...claims, email: 'Zeke@Example.com', email_verified: true }
    expect(await verifyGoogleIdToken(await g.issue(withEmail), 'client-1', g.fetcher, now)).toMatchObject({ email: 'zeke@example.com' })
    expect(await verifyGoogleIdToken(await g.issue({ ...withEmail, email_verified: false }), 'client-1', g.fetcher, now)).not.toHaveProperty('email')
  })

  it('rejects tokens for another app, expired tokens, forged signatures and unknown keys', async () => {
    const g = await fakeGoogle()
    const other = await fakeGoogle()
    expect(await verifyGoogleIdToken(await g.issue({ ...claims, aud: 'someone-else' }), 'client-1', g.fetcher, now)).toBeNull()
    expect(await verifyGoogleIdToken(await g.issue({ ...claims, exp: now / 1000 - 1 }), 'client-1', g.fetcher, now)).toBeNull()
    expect(await verifyGoogleIdToken(await g.issue({ ...claims, iss: 'evil.example' }), 'client-1', g.fetcher, now)).toBeNull()
    expect(await verifyGoogleIdToken(await other.issue(claims), 'client-1', g.fetcher, now)).toBeNull()
    expect(await verifyGoogleIdToken(await g.issue(claims, 'k2'), 'client-1', g.fetcher, now)).toBeNull()
    expect(await verifyGoogleIdToken('not.a.token', 'client-1', g.fetcher, now)).toBeNull()
  })
})

describe('session cookie', () => {
  const user = { sub: '1234', name: 'Zeke' }

  it('round-trips a signed session and rejects tampering, a wrong secret and expiry', async () => {
    const token = await signSession(user, 'secret-a')
    expect(await verifySession(token, 'secret-a')).toEqual({ sub: '1234', name: 'Zeke', picture: undefined })
    expect(await verifySession(await signSession({ ...user, email: 'zeke@example.com' }, 'secret-a'), 'secret-a')).toMatchObject({ email: 'zeke@example.com' })
    expect(await verifySession(token, 'secret-b')).toBeNull()
    const [, sig] = token.split('.')
    expect(await verifySession(`${enc({ ...user, sub: '9999', exp: Date.now() + 1e9 })}.${sig}`, 'secret-a')).toBeNull()
    expect(await verifySession(token, 'secret-a', Date.now() + 31 * 86_400_000)).toBeNull()
  })

  it('sets and reads the cookie', () => {
    expect(sessionCookie('abc', true)).toMatch(/^rtw_session=abc; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax; Secure$/)
    expect(sessionCookie(null, false)).toMatch(/^rtw_session=; Max-Age=0/)
    expect(readSessionCookie(new Request('https://x', { headers: { Cookie: 'a=1; rtw_session=tok.sig; b=2' } }))).toBe('tok.sig')
    expect(readSessionCookie(new Request('https://x'))).toBeNull()
  })
})

describe('daily message count', () => {
  it('counts a message only when the user sent new text, not for tool-result rounds', () => {
    expect(isNewMessage([{ role: 'user', parts: [{ text: 'hi' }] }])).toBe(true)
    expect(isNewMessage([
      { role: 'user', parts: [{ text: 'hi' }] },
      { role: 'model', parts: [{ functionCall: { name: 'get_trip' } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'get_trip', response: {} } }] },
    ])).toBe(false)
  })
})

describe('daily limits', () => {
  it('prices a call from its tokens, at the prices of that day', () => {
    // 2026: input $0.75, cached $0.075, output (incl. thinking) $3.75 per million.
    expect(costOf({ promptTokenCount: 1_000_000, candidatesTokenCount: 100_000, thoughtsTokenCount: 100_000 }, '2026-10-06')).toBeCloseTo(1.5)
    expect(costOf({ promptTokenCount: 1_000_000, cachedContentTokenCount: 800_000 }, '2026-10-06')).toBeCloseTo(0.21)
    // Prices double from 2027.
    expect(costOf({ promptTokenCount: 1_000_000 }, '2027-01-01')).toBeCloseTo(1.5)
    expect(costOf(undefined, '2026-10-06')).toBe(0)
  })

  it('caps the day at $1: new messages need some left, and no call may go past it', () => {
    let c = current(undefined, '2026-10-06')
    expect(canCall(c, true, 100_000)).toBe(true)
    c = spend(c, DAILY_USD - MESSAGE_RESERVE_USD - 0.01)
    expect(canCall(c, true)).toBe(true)
    expect(usageOf(c).remaining).toBe(1)
    c = spend(c, 0.01)
    expect(canCall(c, true)).toBe(false)
    expect(usageOf(c).remaining).toBe(0)
    // The tool rounds of a message under way may use the rest, if the request fits.
    expect(canCall(c, false, 400_000)).toBe(true)
    expect(canCall(spend(c, 0.15), false, 400_000)).toBe(false)
    // A new day starts at zero; older records (messages or tokens) too.
    expect(current(c, '2026-10-07')).toEqual({ day: '2026-10-07', usd: 0 })
    expect(current({ day: '2026-10-06', tokens: 500 } as never, '2026-10-06')).toEqual({ day: '2026-10-06', usd: 0 })
  })

  it('gives listed accounts their own daily limit', () => {
    const limits = parseAccountLimits({ limits: [{ email: ' Friend@Example.com ', usd: 5 }, { email: 'off@example.com', usd: 0 }] })
    expect(limits).toEqual({ 'friend@example.com': 5, 'off@example.com': 0 })
    const l = limits as Record<string, number>
    expect(dailyUsdFor(l, 'friend@example.com')).toBe(5)
    expect(dailyUsdFor(l, 'someone@example.com')).toBe(DAILY_USD)
    expect(dailyUsdFor(l, undefined)).toBe(DAILY_USD)
    // $5: plenty left after $2; $0: nothing at all.
    expect(canCall({ day: '2026-10-06', usd: 2 }, true, 100_000, 5)).toBe(true)
    expect(usageOf({ day: 'd', usd: 0 }, 0)).toMatchObject({ remaining: 0, multiple: 0 })
    expect(usageOf({ day: 'd', usd: 0 }, 5).multiple).toBe(5)
    expect(usageOf({ day: 'd', usd: 0 }).multiple).toBe(1)
    expect(usageOf({ day: 'd', usd: 0 }, 0.01).multiple).toBe(0.1)
    expect(canCall({ day: '2026-10-06', usd: 0 }, true, 1000, 0)).toBe(false)
    // Bad lists are refused with a reason.
    expect(parseAccountLimits({ limits: [{ email: 'not-an-email', usd: 1 }] })).toMatch(/Not an email/)
    expect(parseAccountLimits({ limits: [{ email: 'a@b.co', usd: 500 }] })).toMatch(/\$0–50/)
    expect(parseAccountLimits({ limits: [{ email: 'a@b.co', usd: 1 }, { email: 'A@b.co', usd: 2 }] })).toMatch(/twice/)
    expect(parseAccountLimits(null)).toBeTypeOf('string')
  })

  it('shows the percent left for new messages', () => {
    expect(usageOf({ day: 'd', usd: 0 }).remaining).toBe(100)
    expect(usageOf({ day: 'd', usd: (DAILY_USD - MESSAGE_RESERVE_USD) / 4 })).toMatchObject({ used: 25, limit: 100, remaining: 75 })
  })

  it('resets at midnight UTC', () => {
    const now = Date.parse('2026-10-05T23:30:00Z')
    expect(today(now)).toBe('2026-10-05')
    expect(resetsAt(now)).toBe('2026-10-06T00:00:00.000Z')
  })
})

describe('saved trips', () => {
  it('accepts a name, trip data and chat, keeping only the trip fields', () => {
    const patch = parseTripPatch({ name: '  Balkans  ', data: { input: { startDate: '2027-05-01' }, stops: [], extra: 1 }, chat: { messages: [] } })
    expect(patch).toEqual({ name: 'Balkans', data: '{"input":{"startDate":"2027-05-01"},"stops":[]}', chat: '{"messages":[]}' })
  })

  it("keeps a trip's plans, and rejects malformed or too many", () => {
    const plan = (id: string) => ({ id, name: `Plan ${id}`, input: {}, stops: [] })
    const patch = parseTripPatch({ data: { input: {}, stops: [], plans: [plan('a'), plan('b')], activePlanId: 'b' } }) as { data: string }
    expect(JSON.parse(patch.data)).toMatchObject({ plans: [{ id: 'a' }, { id: 'b' }], activePlanId: 'b' })
    expect(parseTripPatch({ data: { input: {}, stops: [], plans: [{ id: 'a' }] } })).toBeTypeOf('string')
    expect(parseTripPatch({ data: { input: {}, stops: [], plans: Array.from({ length: TRIP_LIMITS.plans + 1 }, (_, i) => plan(String(i))) } })).toBeTypeOf('string')
  })

  it('rejects empty names, malformed trips and oversized data', () => {
    expect(parseTripPatch({ name: '   ' })).toBeTypeOf('string')
    expect(parseTripPatch({ data: { input: {}, stops: 'x' } })).toBeTypeOf('string')
    expect(parseTripPatch({ data: { stops: [] } })).toBeTypeOf('string')
    expect(parseTripPatch({ data: { input: {}, stops: Array(TRIP_LIMITS.dataBytes).fill(1) } })).toBeTypeOf('string')
    expect(parseTripPatch({ chat: 'x'.repeat(TRIP_LIMITS.chatBytes) })).toBeTypeOf('string')
    expect(parseTripPatch(null)).toBeTypeOf('string')
    expect((parseTripPatch({ name: 'x'.repeat(200) }) as { name: string }).name).toHaveLength(TRIP_LIMITS.nameChars)
  })

  it('summarizes a trip for the list', () => {
    expect(summarize('{"input":{"startDate":"2027-05-01","endDate":"2027-09-30"},"stops":[1,2,3]}')).toEqual({ startDate: '2027-05-01', endDate: '2027-09-30', stops: 3 })
    expect(summarize(null)).toEqual({ startDate: null, endDate: null, stops: 0 })
    expect(summarize('not json')).toEqual({ startDate: null, endDate: null, stops: 0 })
  })
})
