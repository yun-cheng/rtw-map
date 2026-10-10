// The trip assistant's loop: sends the conversation to the model, runs the tools it asks for on the trip, and goes on
// until the model answers in text (or the run is stopped). The same in the browser (chat.ts, through the Worker's
// /api/chat) and on the server (a run that goes on when the page is closed): only how the model is called differs.
// Each reply that changed the trip keeps a copy of the trip from before, for Undo.
import { WRITE_TOOLS } from './schema'
import { viewText, type ViewItem } from './shared'
import { describeChanges, runTool, snapshot, tripContext, withTrip, type TripHandle, type TripSnapshot } from './tools'

export type Part = { text?: string; thought?: boolean; thoughtSignature?: string; functionCall?: { name: string; args?: Record<string, unknown>; id?: string }; functionResponse?: unknown }
export type Content = { role: 'user' | 'model'; parts: Part[] }

export type ToolStep = { name: string; ok: boolean; summary: string }
/** What a reply's model calls used: tokens read (of which `cached`, cheaper), written (with thinking) and their cost
 *  in USD, from the Worker (worker/limits.ts). */
export type Spent = { calls: number; input: number; cached: number; output: number; usd: number }
export const NO_SPENT: Spent = { calls: 0, input: 0, cached: 0, output: 0, usd: 0 }
export const addSpent = (a: Spent, b: Partial<Spent>): Spent => ({
  calls: a.calls + 1, input: a.input + (b.input ?? 0), cached: a.cached + (b.cached ?? 0), output: a.output + (b.output ?? 0), usd: a.usd + (b.usd ?? 0),
})
export type ChatMessage =
  /** `view`: the labels of what the user shared from the screen with this message. */
  | { role: 'user'; text: string; view?: string[] }
  /** `choices`: short replies shown as buttons (the model's, or Continue when the user stopped it); `think`: whether
   *  this reply thought harder, so a clicked choice or a retry continues the same way; `spent`: what it used; `ms`:
   *  how long it took, from when the user asked. */
  | { role: 'assistant'; text: string; steps: ToolStep[]; changes: string[]; before?: TripSnapshot; undone?: boolean; error?: string; choices?: string[]; think?: boolean; plan?: 'new' | 'update'; spent?: Spent; ms?: number }
export type AssistantMessage = Extract<ChatMessage, { role: 'assistant' }>

/** The part of the chat saved with each trip. */
export type SavedChat = { messages: ChatMessage[]; contents: Content[]; note: string | null }

/** Older turns are dropped to keep requests within /api/chat's limits (worker/chat.ts: 80 turns, 200 KB), with
 *  room to spare; cut at a user's text message. A message's own run of tool calls has no limit: when it alone is too
 *  long, its oldest steps are dropped. */
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
  const out = contents.slice(start)
  // A long run of tool calls: drop the oldest steps (a model call and its results, together), saying so.
  let dropped = false
  while ((out.length > MAX_CONTENTS || JSON.stringify(out).length > MAX_BYTES) && out.length > 5 && isUserText(out[0]) &&
    out[1].role === 'model' && out[2].parts.some((p) => p.functionResponse)) {
    out.splice(1, 2)
    dropped = true
  }
  if (dropped && !out[0].parts.some((p) => p.text === DROPPED)) out[0] = { ...out[0], parts: [...out[0].parts, { text: DROPPED }] }
  return out
}
const DROPPED = '[Your earliest steps for this message were left out to save space; the trip may have changed since: check it before more changes.]'

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

/** One model call, with the trip as it was when the user asked (`context`); `onSpent` gets what each attempt used. */
export type ModelCall = (contents: Content[], context: string, think: boolean, signal: AbortSignal, onSpent: (s: Partial<Spent>) => void) => Promise<Content>

export type Run = {
  trip: TripHandle
  /** What the user shared from the screen with the message. */
  view: ViewItem[]
  /** The conversation so far, as Gemini sees it, and the note about an Undo to send with the message. */
  history: Content[]
  note: string | null
  text: string
  /** `think`: think harder. `plan` starts the model afresh, without the conversation so far: 'new' (Plan with AI)
   *  makes a clean plan from the planner's draft (Undo goes back to the trip from before it); 'update' (Update plan)
   *  changes the plan for what changed in the setup. Either, when finished, notes that the plan fits the setup. */
  think: boolean
  plan?: 'new' | 'update'
  callModel: ModelCall
  /** Stops the run after the model call or wait in progress; what it changed so far stays (and can be undone). */
  signal: AbortSignal
  /** When the user asked (ms since 1970; on the server, when the run was started), for the reply's time. */
  startedAt?: number
  /** What the reply has used so far, after each model call. */
  onSpent?: (spent: Spent) => void
  /** After each step (a model call and the tools it asked for): the reply so far. The run waits for it (the runner
   *  saves the trip and the reply, and hears whether to stop). */
  onStep?: (reply: AssistantMessage) => Promise<void> | void
}

/** Answers one message: the reply, and the conversation to keep for the next one. */
export async function runAssistant(run: Run): Promise<{ reply: AssistantMessage; contents: Content[] }> {
  const { trip, view, think, plan, signal, callModel } = run
  const startedAt = run.startedAt ?? Date.now()
  const tools = <T>(fn: () => T) => withTrip(trip, view, fn)
  const before = tools(snapshot)
  if (plan === 'new') trip.getState().generate()
  // The trip (and view) as it was when the user asked, kept the same for every step of this reply.
  const context = [tools(tripContext), viewText(view)].filter(Boolean).join('\n\n')
  const prefix = run.note && !plan ? `[${run.note}]\n` : ''
  let contents = trim([...(plan ? [] : run.history), { role: 'user', parts: [{ text: prefix + run.text.trim() }] }])
  const reply: AssistantMessage = { role: 'assistant', text: '', steps: [], changes: [], think, ...(plan && { plan }) }

  let stopped = false
  let choices: string[] = []
  const onSpent = (s: Partial<Spent>) => {
    reply.spent = addSpent(reply.spent ?? NO_SPENT, s)
    run.onSpent?.(reply.spent)
  }
  try {
    // No limit on the steps: the model works until it answers in text, or the user stops it.
    for (;;) {
      contents = trim(compact(contents))
      const content = await callModel(contents, context, think, signal, onSpent)
      const calls = content.parts.filter((p) => p.functionCall).map((p) => p.functionCall!)
      const split = splitChoices(content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim())
      const said = split.text
      if (split.choices.length) choices = split.choices
      if (said) reply.text = reply.text ? `${reply.text}\n\n${said}` : said
      contents = [...contents, content]
      if (!calls.length) break
      const responses: Part[] = calls.map((call) => {
        const { ok, summary, result } = tools(() => runTool(call.name, call.args ?? {}))
        if (WRITE_TOOLS.has(call.name) || !ok) reply.steps.push({ name: call.name, ok, summary })
        return { functionResponse: { name: call.name, ...(call.id && { id: call.id }), response: result } }
      })
      contents = [...contents, { role: 'user', parts: responses }]
      await run.onStep?.(reply)
      if (signal.aborted) throw signal.reason
    }
  } catch (e) {
    if (signal.aborted) {
      // Stopped: keep what was done, and end the turn so the conversation stays valid for the next message.
      stopped = true
      if (contents.at(-1)?.role === 'user') contents = [...contents, { role: 'model', parts: [{ text: '(The user stopped me here.)' }] }]
    } else {
      reply.error = (e as Error).message
      // Keep the conversation valid for the next try: drop the unanswered turn.
      contents = run.history
    }
  }
  if (plan && !reply.error && !stopped) trip.getState().markPlanned()
  if (!reply.error) {
    const changed = reply.steps.some((s) => s.ok && WRITE_TOOLS.has(s.name))
    if (stopped) reply.text = [reply.text, changed ? 'Stopped. The changes so far are kept.' : 'Stopped.'].filter(Boolean).join('\n\n')
    if (!reply.text) reply.text = changed ? 'Done.' : 'Sorry, I have no answer to that.'
    if (stopped) choices = ['Continue', ...choices]
    if (choices.length) reply.choices = [...new Set(choices)].slice(0, MAX_CHOICES)
  }

  const after = tools(snapshot)
  reply.changes = describeChanges(before, after)
  // For Undo. Unless the plans themselves changed, only the active plan was edited: keep just its setup and stops.
  const samePlans = before.activePlanId === after.activePlanId &&
    (before.plans ?? []).map((p) => p.id + p.name).join() === (after.plans ?? []).map((p) => p.id + p.name).join()
  if (reply.changes.length) reply.before = samePlans ? { input: before.input, stops: before.stops } : before
  reply.ms = Math.max(0, Date.now() - startedAt)
  return { reply, contents: reply.error ? contents : trim(compact(contents)) }
}
