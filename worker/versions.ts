// A trip's version history, like a shared document's: the trip as it was after each spell of changes, by whom, kept
// for good, so the user can see what changed over time and go back to an earlier version. The Account Durable Object
// keeps them (account.ts); these are the plain rules (tested in worker.test.ts). The browser says what changed
// between two versions (src/store/versions.ts).
//
// Changes by the same author close together are one version (the latest of it, updated as they go on), as a document
// keeps a spell of typing as one: the user's edits within SESSION_MS of each other, one run of the trip assistant,
// one app's changes. A restore is a version of its own, and the trip as it was before the first version kept is kept
// too (`earlier`), so that version's changes can be told.

/** Who made a version: the user (in the app, on any device), a run of the trip assistant (with what it was asked),
 *  another app's assistant, the user going back to an earlier version (`from`: when that one started), or no one
 *  known (the trip before its history was kept). */
export type VersionBy =
  | { who: 'you' }
  | { who: 'assistant'; run: string; asked: string }
  | { who: 'app'; app: string }
  | { who: 'restore'; from: number }
  | { who: 'earlier' }

/** A version as the browser sees it: when its first and last change were, by whom, and the trip after it (JSON, or
 *  null: an empty trip). */
export type VersionView = { id: string; by: VersionBy; rev: number; started: number; updated: number; data: unknown }

/** Changes by the same author this close to the last are part of its version. */
export const SESSION_MS = 30 * 60_000
/** Versions listed at a time. */
export const VERSION_PAGE = 20
/** What the trip assistant was asked, as kept with its version. */
export const ASKED_CHARS = 200

/** Whether a change by `by` at `now` goes into the latest version (else it starts a new one). */
export function joinsLatest(latest: { by: VersionBy; updated: number } | null, by: VersionBy, now: number): boolean {
  if (!latest || now - latest.updated > SESSION_MS) return false
  const a = latest.by
  if (a.who !== by.who) return false
  if (a.who === 'assistant') return by.who === 'assistant' && a.run === by.run
  if (a.who === 'app') return by.who === 'app' && a.app === by.app
  return a.who === 'you'
}

export const RESTORE_SAME = 'The trip is already as it was then.'
