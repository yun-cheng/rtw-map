// Files attached to a message to the assistant (src/agent/media.ts): uploaded to Gemini's Files API (which deletes
// them after 48 hours), each answered with a token signed for the account, which a model call must carry for every
// file it sends, so no one can send a file another account uploaded.
import { MEDIA_LIMITS, MEDIA_TYPES, type Attachment } from '../src/agent/media'
import { hmacKey as key } from './auth'
import { b64url, fromB64url } from './base64url'

const enc = new TextEncoder()
const payload = (sub: string, uri: string) => enc.encode(`media|${sub}|${uri}`)

/** The token for a file uploaded by this account. */
export async function mediaToken(sub: string, uri: string, secret: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), payload(sub, uri))))
}

/** Whether every file sent comes with this account's token for it. */
export async function mediaAllowed(sub: string, uris: string[], tokens: { uri: string; token: string }[], secret: string): Promise<boolean> {
  for (const uri of new Set(uris)) {
    const given = tokens.filter((t) => t.uri === uri)
    let ok = false
    for (const t of given) {
      try {
        if (await crypto.subtle.verify('HMAC', await key(secret), fromB64url(t.token), payload(sub, uri))) ok = true
      } catch {
        // (Not a token.)
      }
    }
    if (!ok) return false
  }
  return true
}

const UPLOAD = 'https://generativelanguage.googleapis.com/upload/v1beta/files'
const FILES = 'https://generativelanguage.googleapis.com/v1beta'
/** How long to wait for Gemini to finish reading a file (a PDF may take a moment). */
const READY_WAITS = [500, 1000, 2000, 3000]

type GeminiFile = { name?: string; uri?: string; mimeType?: string; state?: string }

/** Uploads a file to Gemini's Files API (the resumable protocol, in one go): its address and type, or why not. */
export async function uploadFile(bytes: ArrayBuffer, mimeType: string, name: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<{ uri: string; mimeType: string } | string> {
  if (!MEDIA_TYPES.includes(mimeType)) return 'Only images and PDFs can be attached'
  if (!bytes.byteLength) return 'The file is empty'
  if (bytes.byteLength > MEDIA_LIMITS.bytes) return `The file is too large (at most ${MEDIA_LIMITS.bytes / 1e6} MB)`
  const start = await fetcher(UPLOAD, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength), 'X-Goog-Upload-Header-Content-Type': mimeType, 'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: name.slice(0, MEDIA_LIMITS.nameChars) } }),
  })
  const url = start.headers.get('x-goog-upload-url')
  if (!start.ok || !url) {
    console.error('Gemini upload not started', start.status, await start.text().catch(() => ''))
    return 'The file couldn\'t be uploaded: try again.'
  }
  const res = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Length': String(bytes.byteLength), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: bytes,
  })
  let file = ((await res.json().catch(() => null)) as { file?: GeminiFile } | null)?.file
  if (!res.ok || !file?.uri || !file.name) {
    console.error('Gemini upload failed', res.status)
    return 'The file couldn\'t be uploaded: try again.'
  }
  // Ready to use once ACTIVE (images at once; a PDF may be PROCESSING for a moment).
  for (const ms of READY_WAITS) {
    if (file.state !== 'PROCESSING') break
    await new Promise((resolve) => setTimeout(resolve, ms))
    const check = await fetcher(`${FILES}/${file.name}`, { headers: { 'x-goog-api-key': apiKey } })
    file = (await check.json().catch(() => null)) as GeminiFile | null ?? file
  }
  if (file.state === 'FAILED') return 'Gemini couldn\'t read that file.'
  if (file.state === 'PROCESSING') return 'The file is still being read: try again in a moment.'
  return { uri: file.uri!, mimeType: file.mimeType && MEDIA_TYPES.includes(file.mimeType) ? file.mimeType : mimeType }
}

/** The attachment the browser keeps for an uploaded file (without its preview, which the browser adds). */
export async function attachment(sub: string, name: string, uploaded: { uri: string; mimeType: string }, secret: string): Promise<Attachment> {
  return { name: name.slice(0, MEDIA_LIMITS.nameChars), mimeType: uploaded.mimeType, uri: uploaded.uri, token: await mediaToken(sub, uploaded.uri, secret) }
}
