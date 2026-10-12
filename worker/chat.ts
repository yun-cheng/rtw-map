// Checks a chat request from the browser and turns it into a Gemini generateContent request.
// The instructions and tools are added here, so the endpoint only works as the trip assistant.
import { GEMINI_FILE, MEDIA_LIMITS, MEDIA_TYPES } from '../src/agent/media'
import { SYSTEM_PROMPT, TOOLS } from '../src/agent/schema'
import type { TokenUsage } from './limits'

export const LIMITS = { bodyBytes: 200_000, messages: 80, contextChars: 30_000, maxOutputTokens: 8192 }

/** Fields a message part may have: text, tool calls and results, Gemini's thinking markers, and a file the user
 *  attached (src/agent/media.ts). */
const PART_KEYS = new Set(['text', 'functionCall', 'functionResponse', 'thoughtSignature', 'thought', 'fileData'])

export type Part = Record<string, unknown>
export type Content = { role: 'user' | 'model'; parts: Part[] }
/** `media`: the token for each file attached (media.ts), checked against the account before the call. */
export type ChatRequest = { contents: Content[]; context: string; think: boolean; media: { uri: string; token: string }[] }

/** A file the user attached, as a part: one of the types allowed, at Gemini's Files API. */
function isFilePart(p: Part): boolean {
  const f = p.fileData as Record<string, unknown> | undefined
  return !!f && typeof f === 'object' && Object.keys(f).every((k) => k === 'mimeType' || k === 'fileUri') &&
    typeof f.mimeType === 'string' && MEDIA_TYPES.includes(f.mimeType) && typeof f.fileUri === 'string' && GEMINI_FILE.test(f.fileUri)
}

/** The files a request sends (their addresses). */
export const fileUris = (contents: Content[]) =>
  contents.flatMap((c) => c.parts.flatMap((p) => (p.fileData ? [(p.fileData as { fileUri: string }).fileUri] : [])))

/** The validated request, or an error message for the browser. */
export function parseChatRequest(raw: unknown): ChatRequest | string {
  if (!raw || typeof raw !== 'object') return 'Invalid request'
  const { contents, context, think } = raw as Record<string, unknown>
  if (!Array.isArray(contents) || !contents.length) return 'No messages'
  if (contents.length > LIMITS.messages) return 'This conversation is too long: start a new chat'
  for (const c of contents) {
    if (!c || typeof c !== 'object') return 'Invalid message'
    const { role, parts } = c as Record<string, unknown>
    if (role !== 'user' && role !== 'model') return 'Invalid message role'
    if (!Array.isArray(parts) || !parts.length) return 'Invalid message parts'
    for (const p of parts) {
      if (!p || typeof p !== 'object' || !Object.keys(p).every((k) => PART_KEYS.has(k))) return 'Invalid message part'
      if ('fileData' in p && (role !== 'user' || !isFilePart(p))) return 'Invalid attachment'
    }
  }
  if (contents[contents.length - 1].role !== 'user') return 'The last message must come from the user'
  if (typeof context !== 'string' || context.length > LIMITS.contextChars) return 'Invalid trip context'
  const files = fileUris(contents as Content[])
  if (new Set(files).size > MEDIA_LIMITS.files) return `Attach up to ${MEDIA_LIMITS.files} files to a message`
  const media = (raw as { media?: unknown }).media ?? []
  if (!Array.isArray(media) || media.length > MEDIA_LIMITS.files ||
    !media.every((m) => m && typeof m === 'object' && typeof m.uri === 'string' && typeof m.token === 'string')) return 'Invalid attachment'
  return { contents: contents as Content[], context, think: think === true, media: media.map((m) => ({ uri: m.uri as string, token: m.token as string })) }
}

/** Whether the conversation ends with new text from the user (a new message), rather than tool results. */
export function isNewMessage(contents: Content[]): boolean {
  const last = contents[contents.length - 1]
  return last.role === 'user' && last.parts.some((p) => typeof p.text === 'string') && !last.parts.some((p) => 'functionResponse' in p)
}

export function geminiRequest(req: ChatRequest, today: string) {
  return {
    systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n\nToday is ${today}.\n\nThe trip when the user sent their latest message:\n${req.context}` }] },
    contents: req.contents,
    tools: [{ functionDeclarations: TOOLS }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: {
      maxOutputTokens: LIMITS.maxOutputTokens,
      thinkingConfig: { thinkingLevel: req.think ? 'high' : 'low' },
    },
  }
}

export type GeminiResponse = {
  candidates?: { content?: { parts?: unknown[] }; finishReason?: string }[]
  usageMetadata?: TokenUsage
  error?: { message?: string; status?: string }
}

/** Tries per model call when Gemini's reply is broken (see isBrokenReply). */
export const GEMINI_TRIES = 3

/** A reply worth asking for again: a malformed tool call or response, or no content without a reason like SAFETY. */
export function isBrokenReply(data: GeminiResponse | null): boolean {
  const c = data?.candidates?.[0]
  if (!c) return true
  if (c.finishReason?.startsWith('MALFORMED')) return true
  return !c.content?.parts?.length && c.finishReason !== 'SAFETY' && c.finishReason !== 'MAX_TOKENS'
}
