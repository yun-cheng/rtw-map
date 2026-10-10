// The trip assistant's conversation in the browser, kept with each trip. For a trip saved to the user's account a
// message is answered on the server (store/saved.ts), so it finishes with the page closed; otherwise here, with the
// assistant's loop (engine.ts) calling the model through /api/chat (the Worker, which calls Gemini).
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useTrip } from '../store/trip'
import { useAccount, type Usage } from './account'
import { NO_SPENT, runAssistant, type ChatMessage, type Content, type ModelCall, type SavedChat, type Spent } from './engine'
import type { ViewItem } from './view'

export { NO_SPENT, splitChoices, type ChatMessage, type SavedChat, type Spent, type ToolStep } from './engine'

type ChatState = {
  messages: ChatMessage[]
  /** The conversation as Gemini sees it, kept exactly as returned (including thought signatures). */
  contents: Content[]
  /** Tells the model about an Undo, sent with the next message. */
  note: string | null
  think: boolean
  busy: boolean
  /** The run answering on the server, while there is one. */
  runId: string | null
  /** What the reply under way has used so far. */
  spent: Spent
  /** Sends a message, with the parts of the current view the user chose to share. `think` overrides the "Think
   *  harder" switch. `plan` starts the model afresh, without the conversation so far: 'new' (Plan with AI) makes a
   *  clean plan from the planner's draft (Undo goes back to the trip from before it); 'update' (Update plan) changes
   *  the plan for what changed in the setup. Either, when finished, notes that the plan fits the setup as it is. */
  send: (text: string, view?: ViewItem[], options?: { think?: boolean; plan?: 'new' | 'update' }) => Promise<void>
  /** Stops the reply under way after the model call or wait in progress; what it changed so far stays (and can be undone). */
  stop: () => void
  undo: (index: number) => void
  /** Sends the message that a failed reply answered again, in place of the failed attempt. */
  retry: (index: number, view?: ViewItem[]) => Promise<void>
  setThink: (think: boolean) => void
  clear: () => void
  /** Shows the chat saved with a trip (or an empty one). */
  load: (saved: SavedChat | null) => void
}

/** Waits before retrying when the per-minute limit is hit (the daily limit isn't retried). */
const RETRY_WAITS = [15_000, 30_000, 45_000]
/** Waits, unless stopped first. */
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms)
  signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason) }, { once: true })
})

/** One model call; `onSpent` gets what each attempt used (a failed one may have used some too). */
const callModel: ModelCall = async (contents, context, think, signal, onSpent) => {
  let res: Response
  let data: { usage?: Usage; signIn?: boolean; error?: string; content?: Content; spent?: Partial<Spent> } | null
  for (let attempt = 0; ; attempt++) {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, context, think }),
      signal,
    })
    data = await res.json().catch(() => null)
    if (data?.spent) onSpent(data.spent)
    // Too many calls this minute (or Gemini busy) during a long run: wait and try again. Out of today's allowance,
    // or the assistant turned off for the account: stop.
    const outForToday = /today|turned off/.test(data?.error ?? '')
    if (res.status !== 429 || outForToday || attempt >= RETRY_WAITS.length) break
    await wait(RETRY_WAITS[attempt], signal)
  }
  if (data?.usage) useAccount.getState().setUsage(data.usage)
  if (res.status === 401 && data?.signIn) useAccount.getState().signedOut()
  if (!res.ok || !data?.content) throw new Error(data?.error ?? `The assistant isn't reachable (${res.status}).`)
  return data.content as Content
}

/** Stops the reply under way (one at a time). */
let controller: AbortController | null = null

/** Answers messages on the server (store/saved.ts sets it): `send` resolves when the run ends, or to false at once
 *  when the server can't answer (the message is then answered here). */
export type ServerRuns = {
  send: (text: string, view: ViewItem[], options: { think: boolean; plan?: 'new' | 'update' }) => Promise<boolean>
  stop: (runId: string) => void
}
let server: ServerRuns | null = null
export const setServerRuns = (runs: ServerRuns) => { server = runs }

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      contents: [],
      note: null,
      think: false,
      busy: false,
      spent: NO_SPENT,
      runId: null,

      send: async (text, view = [], options = {}) => {
        const think = options.think ?? get().think
        if (get().busy || !text.trim()) return
        if (server && (await server.send(text, view, { think, plan: options.plan }))) return
        controller = new AbortController()
        const { contents: history, note } = get()
        set({ busy: true, note: null, spent: NO_SPENT, messages: [...get().messages, { role: 'user', text: text.trim(), ...(view.length && { view: view.map((v) => v.label) }) }] })
        const { reply, contents } = await runAssistant({
          trip: useTrip, view, history, note, text, think, plan: options.plan, callModel, signal: controller.signal,
          onSpent: (spent) => set({ spent }),
        })
        controller = null
        set({ busy: false, contents, messages: [...get().messages, reply] })
      },

      stop: () => {
        const { runId } = get()
        if (runId) server?.stop(runId)
        else controller?.abort(new DOMException('Stopped', 'AbortError'))
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

      retry: async (index, view = []) => {
        const { messages, send } = get()
        const failed = messages[index]
        const asked = messages[index - 1]
        if (failed?.role !== 'assistant' || !failed.error || asked?.role !== 'user' || get().busy) return
        set({ messages: messages.filter((_, i) => i !== index && i !== index - 1) })
        // A failed plan is tried again as a plan (from scratch, or an update).
        await send(asked.text, view, { think: failed.think, plan: failed.plan })
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
