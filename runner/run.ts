// Answers one message of the trip assistant on the server (a run, see worker/runs.ts): loads the run and the trip
// from the Worker, runs the assistant's loop on its own copy of the trip (src/agent/engine.ts, the same as in the
// browser), calls the model through the Worker (which keeps the allowance and counts the cost), and saves the trip
// and the reply after each step, so the page can follow along or be closed.
import { runAssistant, type ChatMessage, type Content, type ModelCall, type SavedChat, type Spent } from '../src/agent/engine'
import type { ViewItem } from '../src/agent/shared'
import { createTripStore, tripData, type Display, type TripData } from '../src/store/tripCore'

type RunInput = {
  status: string
  request: { text: string; view: ViewItem[]; think: boolean; plan?: 'new' | 'update'; display: Display }
  data: TripData | null
  chat: SavedChat | null
}

/** Waits before retrying when the per-minute limit is hit, and when the Worker can't be reached. */
const BUSY_WAITS = [15_000, 30_000, 45_000]
const LOST_WAITS = [2_000, 5_000, 10_000]

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason) }, { once: true })
})

/** The Worker's side of one run. */
function workerApi(origin: string, account: string, run: string, secret: string) {
  const base = `${origin}/internal/runs/${account}/${run}`
  /** A request to the Worker, sent again if it can't be reached. */
  const send = async (path: string, body?: unknown, signal?: AbortSignal): Promise<Response> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetch(base + path, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { Authorization: `Bearer ${secret}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal,
        })
      } catch (e) {
        if (signal?.aborted || attempt >= LOST_WAITS.length) throw e
        await sleep(LOST_WAITS[attempt], signal)
      }
    }
  }
  return { send }
}

/** Runs one message to the end. Never throws: how it ended is saved with the run (one the Worker can't be reached
 *  for is marked failed there when it goes quiet). */
export async function execute(origin: string, account: string, runId: string, secret: string): Promise<void> {
  try {
    await answer(workerApi(origin, account, runId, secret), runId)
  } catch (e) {
    console.error('Run failed', runId, e)
  }
}

async function answer(api: ReturnType<typeof workerApi>, runId: string): Promise<void> {
  const res = await api.send('')
  const input = (await res.json().catch(() => null)) as RunInput | null
  if (!res.ok || !input) {
    console.error('Run not loaded', runId, res.status)
    return
  }
  // Already finished (a task delivered twice), or gone quiet and given up on.
  if (input.status !== 'running') return

  const { request } = input
  const chat: SavedChat = { messages: input.chat?.messages ?? [], contents: input.chat?.contents ?? [], note: input.chat?.note ?? null }
  const trip = createTripStore(input.data, request.display)
  const controller = new AbortController()
  const question: ChatMessage = { role: 'user', text: request.text, ...(request.view.length && { view: request.view.map((v) => v.label) }) }

  const callModel: ModelCall = async (contents, context, think, signal, onSpent) => {
    for (let attempt = 0; ; attempt++) {
      const res = await api.send('/chat', { contents, context, think }, signal)
      const data = (await res.json().catch(() => null)) as { error?: string; content?: Content; spent?: Partial<Spent> } | null
      if (data?.spent) onSpent(data.spent)
      // Too many calls this minute (or Gemini busy): wait and try again. Out of today's allowance: stop.
      const outForToday = /today|turned off/.test(data?.error ?? '')
      if (res.status === 429 && !outForToday && attempt < BUSY_WAITS.length) {
        await sleep(BUSY_WAITS[attempt], signal)
        continue
      }
      if (!res.ok || !data?.content) throw new Error(data?.error ?? `The assistant isn't reachable (${res.status}).`)
      return data.content
    }
  }

  // After each step: the reply so far, and the trip when it changed; the Worker answers whether to stop.
  let saved = JSON.stringify(input.data)
  const onStep = async (reply: ChatMessage) => {
    const now = JSON.stringify(tripData(trip.getState()))
    const res = await api.send('/progress', { reply, ...(now !== saved && { data: JSON.parse(now) }) })
    if (now !== saved && res.ok) saved = now
    const { stop } = (await res.json().catch(() => ({}))) as { stop?: boolean }
    if (stop) controller.abort(new Error('Stopped'))
  }

  const { reply, contents } = await runAssistant({
    trip, view: request.view, history: chat.contents, note: chat.note, text: request.text, think: request.think, plan: request.plan,
    callModel, signal: controller.signal, onStep,
  })
  const status = reply.error ? 'failed' : controller.signal.aborted ? 'stopped' : 'done'
  const finished = await api.send('/finish', {
    status, error: reply.error ?? null, reply, data: tripData(trip.getState()),
    chat: { messages: [...chat.messages, question, reply], contents, note: null } satisfies SavedChat,
  })
  if (!finished.ok) console.error('Run not saved', runId, finished.status, await finished.text())
}
