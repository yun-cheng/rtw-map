// A trip's past chats with the assistant: "New chat" sets the open chat aside instead of losing it, and any of them can
// be opened again from the Chats panel (src/panels/ChatList.tsx), the open one set aside in its place (src/store/
// saved.ts). The trip keeps its open chat as before (the trips table's `chat`, what runs and saves use); the Account
// Durable Object keeps the rest (account.ts). These are the plain rules (tested in worker.test.ts).

export const CHAT_LIMITS = {
  /** Past chats kept for a trip: the oldest go first. */
  kept: 30,
  titleChars: 120,
}

/** A past chat as the list shows it: what it started with, when its last question was asked, how many messages. */
export type ChatSummary = { id: string; title: string; updated: number; messages: number }

type Message = { role?: unknown; text?: unknown; at?: unknown }
const messagesOf = (chat: unknown): Message[] => {
  const m = (chat as { messages?: unknown } | null)?.messages
  return Array.isArray(m) ? m.filter((x): x is Message => !!x && typeof x === 'object') : []
}
const questions = (chat: unknown) => messagesOf(chat).filter((m) => m.role === 'user' && typeof m.text === 'string')

/** Whether a chat has anything in it to keep. */
export const hasMessages = (chat: unknown) => messagesOf(chat).length > 0

/** A chat's summary: its first question for a title, and the time of its last (`fallback` for chats from before
 *  questions had one). */
export function chatSummary(chat: unknown, id: string, fallback: number): ChatSummary {
  const asked = questions(chat)
  const first = asked[0]?.text as string | undefined
  const at = asked.findLast((m) => typeof m.at === 'number')?.at as number | undefined
  return { id, title: (first ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_LIMITS.titleChars), updated: at ?? fallback, messages: messagesOf(chat).length }
}
