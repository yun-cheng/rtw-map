// The trip assistant's conversation: sends it to /api/chat (the Worker, which calls Gemini), runs the tools the
// model asks for on the trip, and loops until the model answers in text. Each reply that changed the trip keeps a
// copy of the trip from before, for Undo.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useTrip } from '../store/trip'
import { useAccount } from './account'
import { WRITE_TOOLS } from './schema'
import { describeChanges, runTool, snapshot, tripContext, type TripSnapshot } from './tools'

type Part = { text?: string; thought?: boolean; thoughtSignature?: string; functionCall?: { name: string; args?: Record<string, unknown>; id?: string }; functionResponse?: unknown }
type Content = { role: 'user' | 'model'; parts: Part[] }

export type ToolStep = { name: string; ok: boolean; summary: string }
export type ChatMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; steps: ToolStep[]; changes: string[]; before?: TripSnapshot; undone?: boolean; error?: string }

type ChatState = {
  messages: ChatMessage[]
  /** The conversation as Gemini sees it, kept exactly as returned (including thought signatures). */
  contents: Content[]
  /** Tells the model about an Undo, sent with the next message. */
  note: string | null
  think: boolean
  busy: boolean
  send: (text: string) => Promise<void>
  undo: (index: number) => void
  setThink: (think: boolean) => void
  clear: () => void
  /** Shows the chat saved with a trip (or an empty one). */
  load: (saved: SavedChat | null) => void
}

/** The part of the chat saved with each trip. */
export type SavedChat = { messages: ChatMessage[]; contents: Content[]; note: string | null }

/** Model calls per user message (each tool round is one call). */
const MAX_ROUNDS = 8
/** Older turns are dropped to keep requests small; always cut at a user's text message. */
const MAX_CONTENTS = 60

function trim(contents: Content[]): Content[] {
  if (contents.length <= MAX_CONTENTS) return contents
  let start = contents.length - MAX_CONTENTS
  while (start < contents.length && !(contents[start].role === 'user' && contents[start].parts.some((p) => p.text !== undefined))) start++
  return contents.slice(start)
}

async function callModel(contents: Content[], context: string, think: boolean): Promise<Content> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, context, think }),
  })
  const data = await res.json().catch(() => null)
  if (data?.usage) useAccount.getState().setUsage(data.usage)
  if (res.status === 401 && data?.signIn) useAccount.getState().signedOut()
  if (!res.ok || !data?.content) throw new Error(data?.error ?? `The assistant isn't reachable (${res.status}).`)
  return data.content as Content
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      contents: [],
      note: null,
      think: false,
      busy: false,

      send: async (text) => {
        if (get().busy || !text.trim()) return
        const before = snapshot()
        // The trip as it was when the user asked, kept the same for every step of this reply.
        const context = tripContext()
        const prefix = get().note ? `[${get().note}]\n` : ''
        let contents = trim([...get().contents, { role: 'user', parts: [{ text: prefix + text.trim() }] }])
        const reply: Extract<ChatMessage, { role: 'assistant' }> = { role: 'assistant', text: '', steps: [], changes: [] }
        set({ busy: true, note: null, messages: [...get().messages, { role: 'user', text: text.trim() }] })

        try {
          for (let round = 0; round < MAX_ROUNDS; round++) {
            const content = await callModel(contents, context, get().think)
            contents = [...contents, content]
            const calls = content.parts.filter((p) => p.functionCall).map((p) => p.functionCall!)
            const said = content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim()
            if (said) reply.text = reply.text ? `${reply.text}\n\n${said}` : said
            if (!calls.length) break
            const responses: Part[] = calls.map((call) => {
              const { ok, summary, result } = runTool(call.name, call.args ?? {})
              if (WRITE_TOOLS.has(call.name) || !ok) reply.steps.push({ name: call.name, ok, summary })
              return { functionResponse: { name: call.name, ...(call.id && { id: call.id }), response: result } }
            })
            contents = [...contents, { role: 'user', parts: responses }]
            if (round === MAX_ROUNDS - 1) reply.text ||= 'I made some changes but stopped before finishing. Check the itinerary, or ask me to continue.'
          }
          if (!reply.text) reply.text = reply.steps.length ? 'Done.' : 'Sorry, I have no answer to that.'
        } catch (e) {
          reply.error = (e as Error).message
          // Keep the conversation valid for the next try: drop the unanswered turn.
          contents = get().contents
        }

        reply.changes = describeChanges(before, snapshot())
        if (reply.changes.length) reply.before = before
        set({ busy: false, contents: reply.error ? contents : trim(contents), messages: [...get().messages, reply] })
      },

      undo: (index) => {
        const msg = get().messages[index]
        if (msg?.role !== 'assistant' || !msg.before || msg.undone) return
        useTrip.getState().restore(msg.before)
        set({
          note: 'The user pressed Undo: the trip is back to how it was before your previous changes.',
          messages: get().messages.map((m, i) => (i === index ? { ...m, undone: true } : m)),
        })
      },

      setThink: (think) => set({ think }),
      clear: () => set({ messages: [], contents: [], note: null }),
      load: (saved) => set({
        messages: Array.isArray(saved?.messages) ? saved.messages : [],
        contents: Array.isArray(saved?.contents) ? saved.contents : [],
        note: saved?.note ?? null,
        busy: false,
      }),
    }),
    {
      name: 'rtw-map-chat',
      version: 1,
      storage: createJSONStorage(() => {
        try {
          localStorage.setItem('__c', '1')
          localStorage.removeItem('__c')
          return localStorage
        } catch {
          const mem = new Map<string, string>()
          return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) }
        }
      }),
      partialize: (s) => ({ messages: s.messages, contents: s.contents, note: s.note, think: s.think }),
    },
  ),
)
