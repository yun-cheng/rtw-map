// What the user keeps for a city or a journey (PLAN.md, Progress: My visit): where they stay, photo albums, links and their notes.
// The trip's, not a plan's (kept by city, so switching plans or moving dates keeps them; a stay carries its own dates,
// so two visits to a city each show theirs), private, and kept apart from the trip's data like the journal
// (journalCore.ts): written on any device, offline too, and merged item by item, the latest edit of each winning.
// Plain rules, shared by the app (store/items.ts) and the Worker (account.ts), tested in items.test.ts.
import type { TripNotes } from './tripCore'

export type ItemKind = 'note' | 'stay' | 'album' | 'link'

/** One thing kept for a city or a journey. A removed one is kept as `deleted` (so the removal wins over older copies). */
export type TripItem = {
  id: string
  kind: ItemKind
  /** Where it belongs: a city id, or a journey's `from>to`. */
  at: string
  /** A stay's name; an album's or a link's title. */
  title?: string
  /** A stay's booking, the album, the link (http or https). */
  url?: string
  /** A note (Markdown); a stay's own note (door code, wifi). */
  text?: string
  /** A stay's address. */
  address?: string
  /** A stay's check-in and check-out days (ISO). */
  from?: string
  to?: string
  /** A stay's booking reference. */
  ref?: string
  /** A stay's price, as written ("€84, paid"). */
  price?: string
  /** When last changed (ms), on the device that changed it: the latest wins. */
  updatedAt: number
  deleted?: true
}
export type Items = Record<string, TripItem>

export const ITEM_LIMITS = { textChars: 4000, shortChars: 200, urlChars: 2000, items: 2000, bytes: 1_500_000 }
const SHORT = ['title', 'address', 'ref', 'price'] as const
const KINDS: ItemKind[] = ['note', 'stay', 'album', 'link']

/** A note's id: one per city or journey. */
export const noteId = (at: string) => `note:${at}`
/** An item with nothing in it (a note emptied, a stay with no name), as good as removed. */
export const isEmptyItem = (i: TripItem | undefined) =>
  !i || i.deleted || ![i.title, i.url, i.text, i.address, i.ref, i.price].some((v) => v?.trim())

/** A link as typed, with https:// when it has no scheme; '' if it isn't a web address. */
export function webUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  const url = /^[a-z][a-z\d+.-]*:/i.test(s) ? s : `https://${s}`
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol) ? url : ''
  } catch {
    return ''
  }
}

/** The items sent from a device, checked: each one valid (cut to the most allowed), or the reason why not. `now` keeps
 *  a clock set ahead from winning every later edit. */
export function parseItems(raw: unknown, now = Date.now()): TripItem[] | string {
  const list = (raw as { entries?: unknown } | null)?.entries
  if (!Array.isArray(list) || list.length > ITEM_LIMITS.items) return 'Invalid items'
  const items: TripItem[] = []
  for (const x of list as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !/^[\w:>.-]{1,140}$/.test(x.id)) return 'Invalid item'
    if (!KINDS.includes(x.kind as ItemKind) || typeof x.at !== 'string' || !/^[\w.-]{1,64}(>[\w.-]{1,64})?$/.test(x.at)) return 'Invalid item'
    if (typeof x.updatedAt !== 'number' || !Number.isFinite(x.updatedAt)) return 'Invalid item'
    const item: TripItem = { id: x.id, kind: x.kind as ItemKind, at: x.at, updatedAt: Math.min(x.updatedAt, now) }
    if (x.deleted) {
      items.push({ ...item, deleted: true })
      continue
    }
    for (const k of SHORT) if (typeof x[k] === 'string' && x[k]) item[k] = (x[k] as string).slice(0, ITEM_LIMITS.shortChars)
    if (typeof x.text === 'string' && x.text) item.text = x.text.slice(0, ITEM_LIMITS.textChars)
    if (typeof x.url === 'string' && x.url) {
      const url = webUrl(x.url)
      if (!url || url.length > ITEM_LIMITS.urlChars) return 'Invalid link'
      item.url = url
    }
    for (const k of ['from', 'to'] as const) {
      if (x[k] === undefined || x[k] === '') continue
      if (typeof x[k] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x[k] as string)) return 'Invalid date'
      item[k] = x[k] as string
    }
    items.push(item)
  }
  return items
}

/** The items with these in: each one's latest edit wins (a tie keeps what's there). */
export function mergeItems(items: Items, list: TripItem[]): Items {
  const merged = { ...items }
  for (const i of list) if (!merged[i.id] || i.updatedAt > merged[i.id].updatedAt) merged[i.id] = i
  return merged
}

/** A new item's id, e.g. `stay:123456789012`. */
export const newItemId = (kind: ItemKind) => `${kind}:${crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 12)}`

/** An item added or changed: the fields given replace those kept ('' empties one), the rest stay; `kind` and `at` are
 *  needed for a new one (null without them). */
export function changedItem(old: TripItem | undefined, patch: Partial<TripItem> & { id: string }, now = Date.now()): TripItem | null {
  const kind = patch.kind ?? old?.kind
  const at = patch.at ?? old?.at
  if (!kind || !at) return null
  const { deleted: _, ...rest } = { ...old, ...patch }
  // (Fields emptied are dropped.)
  return Object.fromEntries(Object.entries({ ...rest, kind, at, updatedAt: now }).filter(([, v]) => v !== '' && v !== undefined)) as unknown as TripItem
}

/** An item removed: kept as removed, so the removal reaches the other devices (null if there's none to remove). */
export const removedItem = (old: TripItem | undefined, now = Date.now()): TripItem | null =>
  old && !old.deleted ? { id: old.id, kind: old.kind, at: old.at, updatedAt: now, deleted: true } : null

/** Notes kept with the trip's data before items (`TripData.notes`), as items: those not already there, a moved note
 *  never overwriting one written (or removed) since. */
export function notesAsItems(notes: TripNotes | undefined, items: Items, updatedAt: number): TripItem[] {
  if (!notes) return []
  return [...Object.entries(notes.cities ?? {}), ...Object.entries(notes.legs ?? {})]
    .filter(([at, text]) => typeof text === 'string' && text.trim() && !items[noteId(at)] && /^[\w.-]{1,64}(>[\w.-]{1,64})?$/.test(at))
    .map(([at, text]) => ({ id: noteId(at), kind: 'note', at, text: text.slice(0, ITEM_LIMITS.textChars), updatedAt }))
}
