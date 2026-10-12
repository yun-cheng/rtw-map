// Files the user attaches to a message to the trip assistant (a booking confirmation, a ticket, a screenshot, a
// photo): each uploaded once, through the Worker (POST /api/media), to Gemini's Files API, which deletes it after 48
// hours. That message's model calls refer to it by its address; afterwards the conversation keeps only its name.
// Shared by the browser, the assistant's loop (engine.ts), the Worker and the runner.

/** An attached file: its name, type and address at Gemini, the Worker's token for it (signed for the account, so
 *  no one else's file can be sent), and for an image a small preview (a data URL) to show in the chat. */
export type Attachment = { name: string; mimeType: string; uri: string; token: string; thumb?: string }

/** What can be attached: images (as Gemini reads them) and PDFs. */
export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
export const MEDIA_LIMITS = { files: 4, bytes: 10_000_000, nameChars: 120, thumbChars: 16_000 }

/** A file's address at Gemini's Files API. */
export const GEMINI_FILE = /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/files\/[a-z0-9-]{1,64}$/

/** The parts a message's attachments become for the model (before its text). */
export const mediaParts = (media: Attachment[]) => media.map((m) => ({ fileData: { mimeType: m.mimeType, fileUri: m.uri } }))

/** What's left of the attachments in the conversation once their message is answered. */
export const mediaNote = (names: string[]) =>
  `[The user attached ${names.join(', ')} to this message. Attachments go only with the message they came with: if you need one again, ask the user to attach it again.]`

/** The attachments sent with a message, checked: each one valid, or the reason why not. */
export function parseAttachments(raw: unknown): Attachment[] | string {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw) || raw.length > MEDIA_LIMITS.files) return `Attach up to ${MEDIA_LIMITS.files} files to a message`
  const out: Attachment[] = []
  for (const x of raw as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object') return 'Invalid attachment'
    const { name, mimeType, uri, token, thumb } = x
    if (typeof name !== 'string' || !name.trim() || name.length > MEDIA_LIMITS.nameChars) return 'Invalid attachment name'
    if (typeof mimeType !== 'string' || !MEDIA_TYPES.includes(mimeType)) return 'Only images and PDFs can be attached'
    if (typeof uri !== 'string' || !GEMINI_FILE.test(uri) || typeof token !== 'string' || !token) return 'Invalid attachment'
    if (thumb !== undefined && (typeof thumb !== 'string' || !thumb.startsWith('data:image/jpeg;base64,') || thumb.length > MEDIA_LIMITS.thumbChars)) return 'Invalid attachment preview'
    out.push({ name: name.trim(), mimeType, uri, token, ...(thumb !== undefined && { thumb }) })
  }
  return out
}
