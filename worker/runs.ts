// Runs of the trip assistant on the server: one message answered by the runner (a Cloud Run service, runner/), so it
// finishes even when the page is closed or the phone loses its connection. The Account Durable Object keeps each
// run; these are its plain rules (tested in worker.test.ts).
//
//   browser ── POST /api/runs ──▶ Worker ── saves the trip, adds the run ──▶ Account
//                                 Worker ── POST {RUNNER_URL}/start ──▶ runner (queues the run on Cloud Tasks)
//   runner ── GET  /internal/runs/:account/:id ──────────▶ the run's message and the trip as it was
//   runner ── POST /internal/runs/:account/:id/chat ─────▶ one model call (allowance and cost as /api/chat)
//   runner ── POST /internal/runs/:account/:id/progress ─▶ the trip and the reply so far; answers whether to stop
//   runner ── POST /internal/runs/:account/:id/finish ───▶ the trip, the chat, and how it ended
//   browser ── GET /api/runs/:id ──▶ how it's going (and the trip when it changed); POST /api/runs/:id/stop

export type RunStatus = 'running' | 'done' | 'stopped' | 'failed'

/** What the user asked, and how: kept with the run for the runner. */
export type RunRequest = {
  text: string
  /** What the user shared from the screen (agent/shared.ts). */
  view: unknown[]
  think: boolean
  plan?: 'new' | 'update'
  /** How the user reads amounts and temperatures. */
  display: { currency: string; tempUnit: 'C' | 'F'; tempFeels: boolean }
}

/** A run as the Account keeps it: the message it answers (`text`), the reply so far as JSON text (text, steps, what
 *  it used), and `version`, counted up each time the run saves the trip. */
export type RunRecord = { id: string; tripId: string; text: string; status: RunStatus; reply: string | null; version: number; error: string | null; updated: number }
/** A run as the browser sees it. */
export type RunView = Omit<RunRecord, 'reply'> & { reply: unknown }
export const runView = ({ reply, ...r }: RunRecord): RunView => ({ ...r, reply: reply ? JSON.parse(reply) : null })

/** A run that hasn't been heard of for this long has died (the runner crashed or was cut off). A step (a model call
 *  with thinking, and waits for the per-minute limit) takes a minute or two at most. */
export const RUN_STALE_MS = 5 * 60_000
/** Finished runs are kept this long (the browser reads how one ended), then deleted. */
export const RUN_KEEP_MS = 24 * 3_600_000

export const RUN_LIMITS = { textChars: 4_000, viewItems: 10, viewBytes: 20_000, replyBytes: 200_000 }

/** Validates the browser's start request: the trip and its chat as on screen (saved first, so the run starts from
 *  them) and the message. */
export function parseRunStart(raw: unknown): { tripId: string; data: unknown; chat: unknown; request: RunRequest } | string {
  if (!raw || typeof raw !== 'object') return 'Invalid request'
  const r = raw as Record<string, unknown>
  if (typeof r.tripId !== 'string' || !/^[\w-]{1,64}$/.test(r.tripId)) return 'Invalid trip'
  if (typeof r.text !== 'string' || !r.text.trim() || r.text.length > RUN_LIMITS.textChars) return 'Invalid message'
  const view = r.view ?? []
  if (!Array.isArray(view) || view.length > RUN_LIMITS.viewItems || JSON.stringify(view).length > RUN_LIMITS.viewBytes) return 'Invalid view'
  if (r.plan !== undefined && r.plan !== 'new' && r.plan !== 'update') return 'Invalid plan'
  const d = (r.display ?? {}) as Record<string, unknown>
  const display = {
    currency: typeof d.currency === 'string' && /^[A-Z]{3}$/.test(d.currency) ? d.currency : 'USD',
    tempUnit: d.tempUnit === 'F' ? 'F' as const : 'C' as const,
    tempFeels: d.tempFeels !== false,
  }
  if (r.data === undefined || r.chat === undefined) return 'Invalid trip'
  return {
    tripId: r.tripId, data: r.data, chat: r.chat,
    request: { text: r.text.trim(), view, think: r.think === true, ...(r.plan ? { plan: r.plan as 'new' | 'update' } : {}), display },
  }
}

/** How a run ended, from the runner. */
export function parseRunEnd(raw: unknown): { status: Exclude<RunStatus, 'running'>; error: string | null } | string {
  const r = (raw ?? {}) as Record<string, unknown>
  if (r.status !== 'done' && r.status !== 'stopped' && r.status !== 'failed') return 'Invalid status'
  return { status: r.status, error: typeof r.error === 'string' ? r.error.slice(0, 500) : null }
}

/** A running run that has gone quiet has failed. */
export const isStale = (status: RunStatus, updated: number, now = Date.now()) => status === 'running' && now - updated > RUN_STALE_MS
