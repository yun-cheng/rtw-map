import { describe, expect, it } from 'vitest'
import { readSessionCookie, sessionCookie, signSession, verifyGoogleIdToken, verifySession } from './auth'
import { isNewMessage } from './chat'
import { current, DAILY_CALLS, DAILY_MESSAGES, refund, resetsAt, take, today } from './limits'

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
  it('allows 20 messages a day, then refuses until the next day', () => {
    let c = current(undefined, '2026-10-05')
    for (let i = 0; i < DAILY_MESSAGES; i++) {
      const r = take(c, true)
      expect(r.ok).toBe(true)
      c = r.next
    }
    expect(c.messages).toBe(20)
    expect(take(c, true).ok).toBe(false)
    // Tool-result rounds of the last message still go through, up to the call cap.
    expect(take(c, false).ok).toBe(true)
    expect(current(c, '2026-10-06')).toEqual({ day: '2026-10-06', messages: 0, calls: 0 })
  })

  it('caps model calls per day even without new messages', () => {
    const c = { day: '2026-10-05', messages: 1, calls: DAILY_CALLS }
    expect(take(c, false).ok).toBe(false)
  })

  it('refunds a failed call', () => {
    expect(refund({ day: 'd', messages: 3, calls: 5 }, true)).toEqual({ day: 'd', messages: 2, calls: 4 })
    expect(refund({ day: 'd', messages: 0, calls: 0 }, true)).toEqual({ day: 'd', messages: 0, calls: 0 })
  })

  it('resets at midnight UTC', () => {
    const now = Date.parse('2026-10-05T23:30:00Z')
    expect(today(now)).toBe('2026-10-05')
    expect(resetsAt(now)).toBe('2026-10-06T00:00:00.000Z')
  })
})
