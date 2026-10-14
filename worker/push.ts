// Notifications when the assistant finishes a run (runs.ts), even with the app closed: Web Push. The page asks the
// browser for a push subscription once the user has allowed notifications (src/agent/notify.ts) and keeps it with
// the account (account.ts); when the runner reports a run's end, the Worker sends each of the account's
// subscriptions the notice, encrypted for that browser (RFC 8291) and signed with the site's VAPID key (RFC 8292);
// the service worker shows it (pwa/sw.ts). The page, while open, shows the same notice itself (the same tag: one
// replaces the other).
//
// Keys: VAPID_PUBLIC_KEY (wrangler.jsonc) and VAPID_PRIVATE_KEY (a secret), made by scripts/vapid-keys.ts.

export const PUSH_LIMITS = {
  /** Subscriptions kept per account (its browsers and phones): the oldest go first. */
  kept: 10,
  endpointChars: 1000,
  /** How long a push service keeps a notice for a device that's off. */
  ttlSeconds: 12 * 3600,
}

/** The notices' tag: a newer one replaces the one shown. */
export const NOTICE_TAG = 'rtw-assistant'

/** The push services of Chrome (and Android), Firefox, Safari (and iOS) and Edge: the only addresses the Worker
 *  sends to. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/]

export type PushTarget = { endpoint: string; p256dh: string; auth: string }

export const b64url = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  decode: (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
}
const bytesOf = (s: string) => {
  try {
    return b64url.decode(s)
  } catch {
    return null
  }
}

/** A subscription from the browser (PushSubscription.toJSON()), checked; or what's wrong with it. */
export function parsePushTarget(raw: unknown): PushTarget | string {
  const r = (raw ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  if (typeof r.endpoint !== 'string' || r.endpoint.length > PUSH_LIMITS.endpointChars) return 'Invalid endpoint'
  let url: URL
  try {
    url = new URL(r.endpoint)
  } catch {
    return 'Invalid endpoint'
  }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((h) => h.test(url.hostname))) return 'Unknown push service'
  const { p256dh, auth } = r.keys ?? {}
  if (typeof p256dh !== 'string' || bytesOf(p256dh)?.length !== 65) return 'Invalid key'
  if (typeof auth !== 'string' || bytesOf(auth)?.length !== 16) return 'Invalid key'
  return { endpoint: r.endpoint, p256dh, auth }
}

/** A reply's text in a line: without its markdown, cut short. */
export function plainLine(text: string, max = 140) {
  const line = text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/** What the notice says, and the trip to open from it. */
export type DoneNotice = { title: string; body: string; tag: string; tripId?: string }

/** The notice for a reply (or its error), with the trip's name when there is one. */
export function doneNotice(reply: { text?: unknown; error?: unknown } | null, trip?: { id: string; name: string }): DoneNotice {
  const error = typeof reply?.error === 'string' ? reply.error : null
  const head = error ? 'The assistant couldn\'t finish' : 'The assistant replied'
  return {
    title: trip?.name ? `${head} · ${trip.name}` : head,
    body: error ?? plainLine(typeof reply?.text === 'string' ? reply.text : ''),
    tag: NOTICE_TAG,
    ...(trip && { tripId: trip.id }),
  }
}

// ---------------------------------------------------------------- sending

const enc = new TextEncoder()
const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
/** (Copies: Web Crypto's types take only bytes in an ArrayBuffer.) */
const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) =>
  new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(salt), info: new Uint8Array(info) }, await crypto.subtle.importKey('raw', new Uint8Array(ikm), 'HKDF', false, ['deriveBits']), bytes * 8))

/** (Typed as the browser's: Cloudflare's types call `public` `$public`.) */
const ecdh = (key: CryptoKey) => ({ name: 'ECDH', public: key }) as unknown as Parameters<typeof crypto.subtle.deriveBits>[0]

/** The payload encrypted for a browser's subscription (RFC 8291: aes128gcm, one record). `fixed`: the server's key
 *  pair and salt, for tests. */
export async function encryptPush(payload: Uint8Array, target: Pick<PushTarget, 'p256dh' | 'auth'>, fixed?: { keys: CryptoKeyPair; salt: Uint8Array }) {
  const uaPublic = b64url.decode(target.p256dh)
  const keys = fixed?.keys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', keys.publicKey)) as ArrayBuffer)
  const ua = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh(ua), keys.privateKey, 256))
  const ikm = await hkdf(b64url.decode(target.auth), shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // (The last record's delimiter, 2, and no padding.)
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))))
  const header = new Uint8Array(21)
  header.set(salt)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  return concat(header, asPublic, sealed)
}

export type Vapid = { publicKey: string; privateKey: string; subject: string }

/** The signing key, from the public key (65 bytes, base64url) and the private one (its 32 bytes). */
const signingKey = (v: Vapid) => {
  const pub = b64url.decode(v.publicKey)
  return crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64url.encode(pub.slice(1, 33)), y: b64url.encode(pub.slice(33, 65)), d: v.privateKey }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/** The Authorization header for a push service (RFC 8292): a token signed with the site's key, for 12 hours. */
export async function vapidAuth(endpoint: string, v: Vapid, now = Date.now()): Promise<string> {
  const part = (o: unknown) => b64url.encode(enc.encode(JSON.stringify(o)))
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: v.subject })}`
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(v), enc.encode(unsigned)))
  return `vapid t=${unsigned}.${b64url.encode(signature)}, k=${v.publicKey}`
}

/** Sends one notice: 'gone' when the browser no longer has the subscription (to forget it). */
export async function sendPush(target: PushTarget, notice: DoneNotice, v: Vapid): Promise<'sent' | 'gone' | 'failed'> {
  try {
    const res = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuth(target.endpoint, v),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(PUSH_LIMITS.ttlSeconds),
        Urgency: 'normal',
        // (A newer notice replaces one not delivered yet.)
        Topic: 'assistant',
      },
      body: await encryptPush(enc.encode(JSON.stringify(notice)), target),
    })
    if (res.status === 404 || res.status === 410) return 'gone'
    if (!res.ok) console.error('Push refused', new URL(target.endpoint).hostname, res.status, await res.text().catch(() => ''))
    return res.ok ? 'sent' : 'failed'
  } catch (e) {
    console.error('Push failed', (e as Error).message)
    return 'failed'
  }
}
