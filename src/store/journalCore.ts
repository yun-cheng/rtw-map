// The trip's journal (PLAN.md §14.4): one entry per trip day, what happened, kept apart from the trip's data (plans are
// versions of the future, the journal is what happened). Written on any device, offline too, and merged day by day:
// the latest edit of each day wins, so a day written on the phone and another on the laptop are both kept. Plain
// rules, shared by the app (store/journal.ts) and the Worker (worker/trips.ts, account.ts), tested in journal.test.ts.

/** A day of the trip as the user wrote it; all empty is a day cleared (kept, so the clearing wins over older copies). */
export type DayEntry = {
  /** The trip day, ISO. */
  date: string
  /** Where the night was, by the plan when written. */
  cityId?: string
  /** One line, the day's highlight. */
  highlight: string
  /** A few lines, plain text. */
  text: string
  rating?: 1 | 2 | 3 | 4 | 5
  /** Shown on the trip's shared link; private otherwise. */
  public?: true
  /** When last changed (ms), on the device that changed it: the latest wins. */
  updatedAt: number
}
export type Journal = Record<string, DayEntry>

export const JOURNAL_LIMITS = { textChars: 4000, highlightChars: 140, days: 800, bytes: 1_500_000 }

export const isEmptyEntry = (e: DayEntry | undefined) => !e || (!e.text.trim() && !e.highlight.trim() && !e.rating)

/** The entries sent from a device, checked: each one valid, or the reason why not. `now` keeps a clock set ahead from
 *  winning every later edit. */
export function parseEntries(raw: unknown, now = Date.now()): DayEntry[] | string {
  const list = (raw as { entries?: unknown } | null)?.entries
  if (!Array.isArray(list) || list.length > JOURNAL_LIMITS.days) return 'Invalid journal'
  const entries: DayEntry[] = []
  for (const x of list as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object' || typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return 'Invalid journal day'
    if (typeof x.text !== 'string' || typeof x.highlight !== 'string' || typeof x.updatedAt !== 'number' || !Number.isFinite(x.updatedAt)) return 'Invalid journal day'
    if (x.cityId !== undefined && (typeof x.cityId !== 'string' || x.cityId.length > 64)) return 'Invalid journal day'
    const rating = x.rating === undefined || x.rating === null ? undefined : x.rating
    if (rating !== undefined && ![1, 2, 3, 4, 5].includes(rating as number)) return 'Invalid journal day'
    entries.push({
      date: x.date,
      ...(x.cityId ? { cityId: x.cityId as string } : {}),
      highlight: x.highlight.slice(0, JOURNAL_LIMITS.highlightChars),
      text: x.text.slice(0, JOURNAL_LIMITS.textChars),
      ...(rating ? { rating: rating as DayEntry['rating'] } : {}),
      ...(x.public === true && { public: true as const }),
      updatedAt: Math.min(x.updatedAt, now),
    })
  }
  return entries
}

/** The days the user made public, as the shared link shows them. */
export const publicJournal = (journal: Journal): Journal =>
  Object.fromEntries(Object.values(journal).filter((e) => e.public && !isEmptyEntry(e)).map((e) => [e.date, e]))

/** The journal with these entries in: each day's latest edit wins (a tie keeps what's there). */
export function mergeJournal(journal: Journal, entries: DayEntry[]): Journal {
  const merged = { ...journal }
  for (const e of entries) if (!merged[e.date] || e.updatedAt > merged[e.date].updatedAt) merged[e.date] = e
  return merged
}
