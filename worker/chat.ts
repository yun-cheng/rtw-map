// Checks a chat request from the browser and turns it into a Gemini generateContent request.
// The instructions and tools are added here, so the endpoint only works as the trip assistant.
import { SYSTEM_PROMPT, TOOLS } from '../src/agent/schema'

export const LIMITS = { bodyBytes: 200_000, messages: 80, contextChars: 30_000, maxOutputTokens: 8192 }

/** Fields a message part may have: text, tool calls and results, and Gemini's thinking markers. */
const PART_KEYS = new Set(['text', 'functionCall', 'functionResponse', 'thoughtSignature', 'thought'])

export type Part = Record<string, unknown>
export type Content = { role: 'user' | 'model'; parts: Part[] }
export type ChatRequest = { contents: Content[]; context: string; think: boolean }

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
    }
  }
  if (contents[contents.length - 1].role !== 'user') return 'The last message must come from the user'
  if (typeof context !== 'string' || context.length > LIMITS.contextChars) return 'Invalid trip context'
  return { contents: contents as Content[], context, think: think === true }
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
