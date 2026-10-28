import { describe, expect, it } from 'vitest'
import { b64url, fromB64url } from './base64url'
import { doneNotice, encryptPush, parsePushTarget, plainLine, vapidAuth } from './push'

const enc = new TextEncoder()
const raw = async (key: CryptoKey) => new Uint8Array((await crypto.subtle.exportKey('raw', key)) as ArrayBuffer)
const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: string | Uint8Array, bytes: number) =>
  new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: typeof info === 'string' ? enc.encode(info) : info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bytes * 8))

/** A browser's subscription keys. */
async function browser() {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return { keys, auth, target: { p256dh: b64url(await raw(keys.publicKey)), auth: b64url(auth) } }
}

/** What the browser does with a push (RFC 8291), written apart from push.ts. */
async function decrypt(body: Uint8Array, b: Awaited<ReturnType<typeof browser>>) {
  const salt = body.slice(0, 16)
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const uaPublic = await raw(b.keys.publicKey)
  const as = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: as } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0], b.keys.privateKey, 256))
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic])
  const ikm = await hkdf(b.auth, shared, info, 32)
  const cek = await crypto.subtle.importKey('raw', await hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16), 'AES-GCM', false, ['decrypt'])
  const nonce = await hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12)
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, cek, body.slice(21 + idlen)))
  return { rs, idlen, delimiter: plain.at(-1), text: new TextDecoder().decode(plain.slice(0, -1)) }
}

describe('notifications (Web Push)', () => {
  it('encrypts a notice that the browser can read', async () => {
    const b = await browser()
    const out = await decrypt(await encryptPush(enc.encode('{"title":"Done ✓"}'), b.target), b)
    expect(out).toEqual({ rs: 4096, idlen: 65, delimiter: 2, text: '{"title":"Done ✓"}' })
  })

  it('signs for the push service with the site key', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const publicKey = b64url(await raw(pair.publicKey))
    const privateKey = ((await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey).d!
    const now = Date.UTC(2026, 9, 15)
    const header = await vapidAuth('https://fcm.googleapis.com/fcm/send/abc', { publicKey, privateKey, subject: 'https://rtw.example' }, now)
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!
    expect(k).toBe(publicKey)
    const [h, c, s] = token.split('.')
    expect(JSON.parse(new TextDecoder().decode(fromB64url(c)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: 'https://rtw.example' })
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromB64url(s), enc.encode(`${h}.${c}`))
    expect(ok).toBe(true)
  })

  it('keeps only subscriptions to the browsers\' push services', async () => {
    const { target } = await browser()
    expect(parsePushTarget({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: target })).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', ...target })
    expect(parsePushTarget({ endpoint: 'https://web.push.apple.com/QG3', keys: target })).not.toBeTypeOf('string')
    expect(parsePushTarget({ endpoint: 'https://example.com/push', keys: target })).toBe('Unknown push service')
    expect(parsePushTarget({ endpoint: 'http://fcm.googleapis.com/x', keys: target })).toBe('Unknown push service')
    expect(parsePushTarget({ endpoint: 'https://fcm.googleapis.com/x', keys: { ...target, auth: 'AAAA' } })).toBe('Invalid key')
    expect(parsePushTarget(null)).toBe('Invalid endpoint')
  })

  it('says what the assistant replied, in a line', () => {
    expect(plainLine('**Done.** I moved [Kyoto](https://x.y) to\n\n# 4 nights, `easy`')).toBe('Done. I moved Kyoto to 4 nights, easy')
    expect(plainLine('word '.repeat(100), 20)).toBe('word word word word…')
    expect(doneNotice({ text: '**Added** Kraków.' }, { id: 't1', name: 'Europe' })).toEqual({ title: 'The assistant replied · Europe', body: 'Added Kraków.', tag: 'rtw-assistant', tripId: 't1' })
    expect(doneNotice({ text: '', error: 'Out of allowance.' })).toEqual({ title: 'The assistant couldn\'t finish', body: 'Out of allowance.', tag: 'rtw-assistant' })
  })
})
