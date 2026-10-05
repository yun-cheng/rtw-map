// The trip assistant's daily limits per user, as plain functions (used by the Usage Durable Object; testable).

/** Messages a user may send per day (UTC), shown as a countdown. */
export const DAILY_MESSAGES = 20
/** Model calls per day: one message can take a few calls when the assistant uses tools; this caps the cost. */
export const DAILY_CALLS = 160

export type Count = { day: string; messages: number; calls: number }

export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)
/** Next midnight UTC, when the counts reset. */
export const resetsAt = (now = Date.now()) => new Date(Date.parse(today(now)) + 86_400_000).toISOString()

/** The stored count if it's from `day`, else a fresh one (a new day starts at zero). */
export const current = (stored: Count | undefined, day: string): Count => (stored?.day === day ? stored : { day, messages: 0, calls: 0 })

/** Counts one model call, plus one message if it starts a new message; refuses past the daily limits. */
export function take(c: Count, message: boolean): { ok: boolean; next: Count } {
  if ((message && c.messages >= DAILY_MESSAGES) || c.calls >= DAILY_CALLS) return { ok: false, next: c }
  return { ok: true, next: { ...c, messages: c.messages + (message ? 1 : 0), calls: c.calls + 1 } }
}

/** Gives back a call (and message) that failed before Gemini answered. */
export const refund = (c: Count, message: boolean): Count =>
  ({ ...c, messages: Math.max(0, c.messages - (message ? 1 : 0)), calls: Math.max(0, c.calls - 1) })
