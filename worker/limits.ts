// The trip assistant's daily allowance per user, as plain functions (used by the Account Durable Object; testable).
// It counts what the calls cost (from Gemini's token counts and prices) rather than messages: a quick question costs
// about a cent, a long Plan with AI run most of the day's allowance.

/** Most the assistant may cost per account per day (UTC), in US dollars. */
export const DAILY_USD = 1
/** A new message needs this much of the day left (or a fifth of a smaller limit), so it can get somewhere; its tool
 *  rounds may then use the rest. */
export const MESSAGE_RESERVE_USD = 0.2

/** Other daily limits for particular accounts, by email (lower case), edited by an admin in the app. */
export type AccountLimits = Record<string, number>
export const ACCOUNT_LIMITS = { entries: 200, maxUsd: 50 }

/** The daily limit for an account: its own if listed, else DAILY_USD. */
export const dailyUsdFor = (limits: AccountLimits, email: string | undefined) =>
  email && Object.hasOwn(limits, email) ? limits[email] : DAILY_USD

/** Validates the list from the admin screen: `{ limits: [{ email, usd }] }`. */
export function parseAccountLimits(raw: unknown): AccountLimits | string {
  const list = (raw as { limits?: unknown } | null)?.limits
  if (!Array.isArray(list)) return 'Invalid list'
  if (list.length > ACCOUNT_LIMITS.entries) return `At most ${ACCOUNT_LIMITS.entries} accounts`
  const out: AccountLimits = {}
  for (const item of list) {
    const email = String((item as { email?: unknown })?.email ?? '').trim().toLowerCase()
    const usd = Number((item as { usd?: unknown })?.usd)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return `Not an email address: ${email || '(empty)'}`
    if (!Number.isFinite(usd) || usd < 0 || usd > ACCOUNT_LIMITS.maxUsd) return `${email}: the limit must be $0–${ACCOUNT_LIMITS.maxUsd}`
    if (Object.hasOwn(out, email)) return `${email} is listed twice`
    out[email] = Math.round(usd * 100) / 100
  }
  return out
}

const reserveFor = (daily: number) => Math.min(MESSAGE_RESERVE_USD, daily * 0.2)

/** Gemini paid-tier prices in USD per million tokens, by the date they apply from (newest last); output includes
 *  thinking, cached is input Gemini kept from an earlier call. gemini-3.8-flash, ai.google.dev/gemini-api/docs/pricing. */
export const PRICES: { from: string; input: number; cached: number; output: number }[] = [
  { from: '2000-01-01', input: 0.75, cached: 0.075, output: 3.75 },
  { from: '2027-01-01', input: 1.5, cached: 0.15, output: 7.5 },
]
/** Rough tokens per character of a request, to check a call fits in what's left before sending it. */
const TOKENS_PER_CHAR = 0.25

export type Count = { day: string; usd: number }

/** Gemini's `usageMetadata`. */
export type TokenUsage = {
  promptTokenCount?: number
  cachedContentTokenCount?: number
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
  toolUsePromptTokenCount?: number
}

export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)
/** Next midnight UTC, when the allowance resets. */
export const resetsAt = (now = Date.now()) => new Date(Date.parse(today(now)) + 86_400_000).toISOString()

const priceOn = (day: string) => PRICES.findLast((p) => p.from <= day) ?? PRICES[0]

/** The stored count if it's from `day`, else a fresh one (a new day starts at zero; older records counted messages
 *  or tokens, and start at zero too). */
export const current = (stored: Partial<Count> | undefined, day: string): Count =>
  ({ day, usd: stored?.day === day && Number.isFinite(stored.usd) ? stored.usd! : 0 })

/** What one call cost, in USD. */
export function costOf(u: TokenUsage | undefined, day: string): number {
  if (!u) return 0
  const p = priceOn(day)
  const prompt = (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0)
  const cached = Math.min(u.cachedContentTokenCount ?? 0, prompt)
  const output = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)
  return ((prompt - cached) * p.input + cached * p.cached + output * p.output) / 1e6
}

/** Whether a call may go out: a new message needs the reserve left; any call must fit in what's left, judged by the
 *  request's size (its output is small next to its input). */
export function canCall(c: Count, message: boolean, requestChars = 0, daily = DAILY_USD): boolean {
  const estimate = (requestChars * TOKENS_PER_CHAR * priceOn(c.day).input) / 1e6
  return c.usd + estimate < daily && (!message || c.usd < daily - reserveFor(daily))
}

export const spend = (c: Count, usd: number): Count => ({ ...c, usd: c.usd + Math.max(0, usd) })

/** What the browser shows: percent left for new messages (0 when none can be sent; never 0 while one can), and the
 *  account's allowance as a multiple of the usual one (1 for most; 0 when the assistant is off for the account). */
export function usageOf(c: Count, daily = DAILY_USD, now = Date.now()) {
  const usable = daily - reserveFor(daily)
  const left = c.usd >= usable ? 0 : Math.max(1, Math.floor(100 * (1 - c.usd / usable)))
  return { used: 100 - left, limit: 100, remaining: left, resetsAt: resetsAt(now), multiple: daily > 0 ? Math.max(0.1, Math.round((daily / DAILY_USD) * 10) / 10) : 0 }
}
