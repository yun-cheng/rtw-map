// Attaching a file to a message to the assistant, in the browser (media.ts): a large photo is made smaller first
// (the model reads it as well at 2,000 px), an image gets a small preview for the chat, and the file is uploaded
// through the Worker (POST /api/media), which answers with the attachment to send.
import { MEDIA_LIMITS, MEDIA_TYPES, type Attachment } from './media'

/** The longest side a photo is sent at, and its preview's. */
const MAX_SIDE = 2000
const THUMB_SIDE = 120
/** Images smaller than this (and no larger than MAX_SIDE) are sent as they are. */
const KEEP_BYTES = 1_500_000

/** An image drawn at most `side` px on its longest side, as a JPEG. */
async function drawn(bitmap: ImageBitmap, side: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')!
  // (A transparent PNG on white, not black.)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Not drawn'))), 'image/jpeg', quality))
}

const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

/** The file as it will be sent, and an image's preview; or why it can't be attached. */
async function prepare(file: File): Promise<{ blob: Blob; mimeType: string; thumb?: string } | string> {
  const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '')
  if (!MEDIA_TYPES.includes(type)) return `${file.name}: only images and PDFs can be attached`
  let out: { blob: Blob; mimeType: string; thumb?: string } = { blob: file, mimeType: type }
  if (type.startsWith('image/')) {
    // (A browser that can't read the image, such as HEIC outside Safari, sends it as it is: Gemini reads it.)
    const bitmap = await createImageBitmap(file).catch(() => null)
    if (bitmap) {
      try {
        if (file.size > KEEP_BYTES || Math.max(bitmap.width, bitmap.height) > MAX_SIDE) out = { blob: await drawn(bitmap, MAX_SIDE, 0.85), mimeType: 'image/jpeg' }
        const thumb = await dataUrl(await drawn(bitmap, THUMB_SIDE, 0.6))
        if (thumb.length <= MEDIA_LIMITS.thumbChars) out.thumb = thumb
      } finally {
        bitmap.close()
      }
    }
  }
  if (out.blob.size > MEDIA_LIMITS.bytes) return `${file.name} is too large (at most ${MEDIA_LIMITS.bytes / 1e6} MB)`
  return out
}

/** Prepares and uploads a file: the attachment to send with the message, or why it couldn't be attached. */
export async function attach(file: File, signal?: AbortSignal): Promise<Attachment | string> {
  const ready = await prepare(file)
  if (typeof ready === 'string') return ready
  const name = (file.name || (ready.mimeType === 'application/pdf' ? 'document.pdf' : 'image.jpg')).slice(0, MEDIA_LIMITS.nameChars)
  const res = await fetch('/api/media', {
    method: 'POST', headers: { 'Content-Type': ready.mimeType, 'X-File-Name': encodeURIComponent(name) }, body: ready.blob, signal,
  }).catch(() => null)
  const body = (await res?.json().catch(() => null)) as { attachment?: Attachment; error?: string } | null
  if (!res?.ok || !body?.attachment) return body?.error ?? (res ? `${name} couldn't be attached (${res.status}).` : `${name} couldn't be attached: check your connection.`)
  return { ...body.attachment, ...(ready.thumb && { thumb: ready.thumb }) }
}
