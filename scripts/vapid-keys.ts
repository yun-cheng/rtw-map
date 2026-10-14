// Makes the site's key pair for notifications (worker/push.ts): the private key goes into .env.local (for npm run
// dev:api, and from there to the Worker's secret), never printed; the public key is printed for wrangler.jsonc.
//   npx tsx scripts/vapid-keys.ts
//   grep '^VAPID_PRIVATE_KEY=' .env.local | cut -d= -f2- | npx wrangler secret put VAPID_PRIVATE_KEY
// A new pair signs the browsers up again as they open the app (src/agent/notify.ts); until then they get none.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { b64url } from '../worker/push.ts'

const FILE = '.env.local'
if (existsSync(FILE) && /^VAPID_PRIVATE_KEY=/m.test(readFileSync(FILE, 'utf8'))) {
  console.error(`${FILE} has a VAPID_PRIVATE_KEY already: remove it first to make a new pair.`)
  process.exit(1)
}
const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
const publicKey = b64url.encode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
appendFileSync(FILE, `\n# Notifications (worker/push.ts): the private half; the public one is VAPID_PUBLIC_KEY in wrangler.jsonc.\nVAPID_PRIVATE_KEY=${jwk.d}\n`)
console.log(`VAPID_PRIVATE_KEY added to ${FILE}. Public key, for "VAPID_PUBLIC_KEY" in wrangler.jsonc:\n${publicKey}`)
