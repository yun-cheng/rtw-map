// The trip assistant's conversation: sends it to /api/chat (the Worker, which calls Gemini), runs the tools the
// model asks for on the trip, and loops until the model answers in text. Each reply that changed the trip keeps a
// copy of the trip from before, for Undo.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useTrip } from '../store/trip'
import { useAccount, type Usage } from './account'
import { WRITE_TOOLS } from './schema'
import { describeChanges, runTool, snapshot, tripContext, type TripSnapshot } from './tools'
import { setSharedView, viewText, type ViewItem } from './view'

type Part = { text?: string; thought?: boolean; thoughtSignature?: string; functionCall?: { name: string; args?: Record<string, unknown>; id?: string }; functionResponse?: unknown }
type Content = { role: 'user' | 'model'; parts: Part[] }

export type ToolStep = { name: string; ok: boolean; summary: string }
export type ChatMessage =
  /** `view`: the labels of what the user shared from the screen with this message. */
  | { role: 'user'; text: string; view?: string[] }
  /** `choices`: short replies shown as buttons (the model's, or Continue when it ran out of steps); `think`: whether
   *  this reply thought harder, so a clicked choice or a retry continues the same way. */
  | { role: 'assistant'; text: string; steps: ToolStep[]; changes: string[]; before?: TripSnapshot; undone?: boolean; error?: string; choices?: string[]; think?: boolean }

type ChatState = {
  messages: ChatMessage[]
  /** The conversation as Gemini sees it, kept exactly as returned (including thought signatures). */
  contents: Content[]
  /** Tells the model about an Undo, sent with the next message. */
  note: string | null
  think: boolean
  busy: boolean
  /** Sends a message, with the parts of the current view the user chose to share. Options for Plan with AI:
   *  `think` overrides the "Think harder" switch, `rounds` allows more model calls than a chat message. */
  send: (text: string, view?: ViewItem[], options?: { think?: boolean; rounds?: number }) => Promise<void>
  undo: (index: number) => void
  /** Sends the message that a failed reply answered again, in place of the failed attempt. */
  retry: (index: number, view?: ViewItem[]) => Promise<void>
  setThink: (think: boolean) => void
  clear: () => void
  /** Shows the chat saved with a trip (or an empty one). */
  load: (saved: SavedChat | null) => void
}

/** The part of the chat saved with each trip. */
export type SavedChat = { messages: ChatMessage[]; contents: Content[]; note: string | null }

/** Model calls per chat message (each tool round is one call). Thinking harder (the chat switch, and always for
 *  Plan with AI) allows more, since reworking a months-long trip takes many lookups and edits. The last call is
 *  always made without tools, so the reply ends with what was done (and what's left) rather than mid-way. */
const MAX_ROUNDS = 12
export const THINK_ROUNDS = 40
/** From this many steps left, tool results remind the model to finish. */
const WRAP_UP_STEPS = 3
/** Waits before retrying when the per-minute limit is hit (the daily limit isn't retried). */
const RETRY_WAITS = [15_000, 30_000, 45_000]
/** Older turns are dropped to keep requests within /api/chat's limits (worker/chat.ts: 80 turns, 200 KB), with
 *  room to spare; always cut at a user's text message, never the one being answered. */
const MAX_CONTENTS = 60
const MAX_BYTES = 170_000
/** Older tool results bigger than this are shortened (the latest results stay whole). */
const OLD_RESULT_CHARS = 2_000

/** Clickable replies: the model ends its text with a line like `Choices: [Yes, do it] [Keep it as it is]`. */
const CHOICES_LINE = /\n*^Choices:\s*((?:\[[^\]\n]+\]\s*)+)$/m
const MAX_CHOICES = 4

/** The reply's text without the choices line, and the choices in it. */
export function splitChoices(text: string): { text: string; choices: string[] } {
  const m = text.match(CHOICES_LINE)
  if (!m || m.index === undefined || text.slice(m.index + m[0].length).trim()) return { text, choices: [] }
  const choices = [...m[1].matchAll(/\[([^\]\n]+)\]/g)].map((c) => c[1].trim()).filter(Boolean).slice(0, MAX_CHOICES)
  return { text: text.slice(0, m.index).trimEnd(), choices }
}

const isUserText = (c: Content) => c.role === 'user' && c.parts.some((p) => p.text !== undefined)

function trim(contents: Content[]): Content[] {
  let start = 0
  const size = () => JSON.stringify(contents.slice(start)).length
  while (contents.length - start > MAX_CONTENTS || size() > MAX_BYTES) {
    let next = start + 1
    while (next < contents.length && !isUserText(contents[next])) next++
    // Only the message being answered is left: keep it.
    if (next >= contents.length) break
    start = next
  }
  return contents.slice(start)
}

/**
 * Keeps a long run of tool calls small: every change returns the whole trip, which is out of date after the next
 * change, so older results keep only what was done; older large lookups are shortened. The latest results stay whole.
 */
function compact(contents: Content[]): Content[] {
  const latest = contents.findLastIndex((c) => c.parts.some((p) => p.functionResponse))
  return contents.map((c, i) => {
    if (i === latest || !c.parts.some((p) => p.functionResponse)) return c
    return {
      ...c,
      parts: c.parts.map((p) => {
        const fr = p.functionResponse as { name: string; id?: string; response?: Record<string, unknown> } | undefined
        if (!fr?.response) return p
        const { trip: _, ...rest } = fr.response
        const response = JSON.stringify(rest).length > OLD_RESULT_CHARS ? { note: 'Older result left out to save space; call the tool again if needed.' } : rest
        return { ...p, functionResponse: { ...fr, response } }
      }),
    }
  })
}

async function callModel(contents: Content[], context: string, think: boolean, final: boolean): Promise<Content> {
  let res: Response
  let data: { usage?: Usage; signIn?: boolean; error?: string; content?: Content } | null
  for (let attempt = 0; ; attempt++) {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, context, think, ...(final && { final }) }),
    })
    data = await res.json().catch(() => null)
    // Too many calls this minute (or Gemini busy) during a long run: wait and try again. Out of today's allowance,
    // or the assistant turned off for the account: stop.
    const outForToday = /today|turned off/.test(data?.error ?? '')
    if (res.status !== 429 || outForToday || attempt >= RETRY_WAITS.length) break
    await new Promise((r) => setTimeout(r, RETRY_WAITS[attempt]))
  }
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

      send: async (text, view = [], options = {}) => {
        const think = options.think ?? get().think
        const rounds = options.rounds ?? (think ? THINK_ROUNDS : MAX_ROUNDS)
        if (get().busy || !text.trim()) return
        const before = snapshot()
        // The trip (and view) as it was when the user asked, kept the same for every step of this reply.
        const context = [tripContext(), viewText(view)].filter(Boolean).join('\n\n')
        setSharedView(view)
        const prefix = get().note ? `[${get().note}]\n` : ''
        let contents = trim([...get().contents, { role: 'user', parts: [{ text: prefix + text.trim() }] }])
        const reply: Extract<ChatMessage, { role: 'assistant' }> = { role: 'assistant', text: '', steps: [], changes: [], think }
        set({ busy: true, note: null, messages: [...get().messages, { role: 'user', text: text.trim(), ...(view.length && { view: view.map((v) => v.label) }) }] })

        let ranOut = false
        let choices: string[] = []
        try {
          for (let round = 0; round < rounds; round++) {
            contents = trim(compact(contents))
            const final = round === rounds - 1
            const content = await callModel(contents, context, think, final)
            const calls = content.parts.filter((p) => p.functionCall).map((p) => p.functionCall!)
            const split = splitChoices(content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim())
            const said = split.text
            if (split.choices.length) choices = split.choices
            if (said) reply.text = reply.text ? `${reply.text}\n\n${said}` : said
            if (final && calls.length) {
              // Asked for tools with none allowed: keep only its text, so no call is left unanswered.
              ranOut = true
              if (said) contents = [...contents, { role: 'model', parts: [{ text: said }] }]
              break
            }
            contents = [...contents, content]
            if (!calls.length) break
            // Steps left after this one; the last is for the answer only.
            const left = rounds - 2 - round
            const responses: Part[] = calls.map((call, i) => {
              const { ok, summary, result } = runTool(call.name, call.args ?? {})
              if (WRITE_TOOLS.has(call.name) || !ok) reply.steps.push({ name: call.name, ok, summary })
              const response = i < calls.length - 1 ? result : {
                ...result,
                steps_left: left,
                ...(left <= WRAP_UP_STEPS && {
                  note: left ? `Only ${left} step${left > 1 ? 's' : ''} left: make your remaining changes now, together, then answer.` : 'No steps left: answer now.',
                }),
              }
              return { functionResponse: { name: call.name, ...(call.id && { id: call.id }), response } }
            })
            contents = [...contents, { role: 'user', parts: responses }]
          }
          const changed = reply.steps.some((s) => s.ok && WRITE_TOOLS.has(s.name))
          if (!reply.text && ranOut) {
            reply.text = changed
              ? 'I made some changes but ran out of steps before finishing. Check the itinerary, or ask me to continue.'
              : 'I ran out of steps while looking things up, before changing anything. Ask me to continue.'
          }
          if (!reply.text) reply.text = changed ? 'Done.' : 'Sorry, I have no answer to that.'
          if (ranOut) choices = ['Continue', ...choices]
          if (choices.length) reply.choices = [...new Set(choices)].slice(0, MAX_CHOICES)
        } catch (e) {
          reply.error = (e as Error).message
          // Keep the conversation valid for the next try: drop the unanswered turn.
          contents = get().contents
        }

        const after = snapshot()
        reply.changes = describeChanges(before, after)
        // For Undo. Unless the plans themselves changed, only the active plan was edited: keep just its setup and stops.
        const samePlans = before.activePlanId === after.activePlanId &&
          (before.plans ?? []).map((p) => p.id + p.name).join() === (after.plans ?? []).map((p) => p.id + p.name).join()
        if (reply.changes.length) reply.before = samePlans ? { input: before.input, stops: before.stops } : before
        set({ busy: false, contents: reply.error ? contents : trim(compact(contents)), messages: [...get().messages, reply] })
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
        await send(asked.text, view, { think: failed.think })
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
