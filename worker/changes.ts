// Changes other apps' AI assistants made to a trip through the MCP server (mcp.ts), kept so each can be undone: by
// the app that made it (its `undo` tool) or by the user in the app (the notice that shows them). The Account Durable
// Object keeps them with the trip as it was before each, or, for a change to My visit (src/store/itemsCore.ts), the
// items it changed as they were; these are the plain rules (tested in worker.test.ts).
//
// Each save of a trip counts its `rev` up, so a change knows the trip's rev before and after it (a change to My visit
// counts it up too, to be among them). Undoing a change puts back the trip from before it, together with every later
// change that's still on, and only while nothing else has changed the trip since (then putting it back would lose
// those edits too); the items those changes changed likewise, only while each is still as the last of them left it.
import { removedItem, type Items, type TripItem } from '../src/store/itemsCore'

/** A change as kept: what was done (`summary`, the list shown to the user), by which app, and the trip's rev around it. */
export type ChangeRecord = {
  id: string; tripId: string; grant: string | null; app: string; tool: string; summary: string[]
  revBefore: number; revAfter: number; created: number; undone: boolean
}
/** A change as apps and the browser see it. */
export type ChangeView = { id: string; app: string; tool: string; summary: string[]; rev: number; created: number; undone: boolean }
export const changeView = (c: ChangeRecord): ChangeView =>
  ({ id: c.id, app: c.app, tool: c.tool, summary: c.summary, rev: c.revAfter, created: c.created, undone: c.undone })

/** Kept per trip: the latest this many, none older than this. */
export const CHANGE_KEEP = 30
export const CHANGE_KEEP_MS = 14 * 86_400_000

export const CHANGED_ELSEWHERE = 'This trip was changed by another app meanwhile: open it again to see the changes.'

/**
 * Which changes undoing `target` takes back: it and every later change still on, if they follow one another and the
 * trip is still as the last of them left it. `changes`: the trip's changes still on, any order; `rev`: the trip's now.
 */
export function undoSet(changes: ChangeRecord[], target: ChangeRecord, rev: number): ChangeRecord[] | string {
  if (target.undone) return 'That change was already undone.'
  const set = changes.filter((c) => !c.undone && c.revAfter >= target.revAfter).sort((a, b) => a.revAfter - b.revAfter)
  const later = (set.at(-1) ?? target).revAfter !== rev || set.some((c, i) => i > 0 && c.revBefore !== set[i - 1].revAfter)
  if (later) return 'The trip was changed after that (in the app, or by its own assistant), so undoing it would lose those changes too: change it back instead.'
  return set
}

/** The change to undo when an app asks without saying which: its own latest still on. */
export function latestOf(changes: ChangeRecord[], grant: string | null): ChangeRecord | null {
  return changes.filter((c) => !c.undone && (grant === null || c.grant === grant)).sort((a, b) => b.revAfter - a.revAfter)[0] ?? null
}

/** After undoing `set`, the trip is again as the change before it left it: that change now ends at the new rev (so
 *  it can be undone in turn). Its id, if there's one. */
export function joinedBefore(changes: ChangeRecord[], set: ChangeRecord[]): string | null {
  const first = set[0]
  return changes.find((c) => !c.undone && c.revAfter === first?.revBefore)?.id ?? null
}

/** A change to My visit as kept: the items it changed as they were (null: not there), and when each was changed by
 *  it (its `updatedAt` then). */
export type ItemsChange = { before: Record<string, TripItem | null>; after: Record<string, number> }

/**
 * The items to save to undo these changes to My visit (oldest first): each as it was before the first of them that
 * changed it. Refused if any was changed since the last of them that changed it (in the app, or by a run). `now`:
 * the items now.
 */
export function itemsUndo(changes: ItemsChange[], now: Items, at = Date.now()): TripItem[] | string {
  const last: Record<string, number> = Object.assign({}, ...changes.map((c) => c.after))
  if (Object.entries(last).some(([id, t]) => now[id]?.updatedAt !== t)) {
    return 'My visit was changed after that (in the app, or by its own assistant), so undoing it would lose those changes too: change it back instead.'
  }
  const was: Record<string, TripItem | null> = Object.assign({}, ...[...changes].reverse().map((c) => c.before))
  return Object.entries(was)
    .map(([id, old]) => (old ? { ...old, updatedAt: at } : removedItem(now[id], at)))
    .filter((i): i is TripItem => !!i)
}

/** Whether the browser's save, from the trip at `base`, would overwrite a change of another app's made since. */
export const overwrites = (base: number | undefined, outside: number | null) => base !== undefined && outside !== null && base < outside
