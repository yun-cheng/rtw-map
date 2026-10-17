// What the user keeps for a city or a journey (PLAN.md, Progress: My visit): where they stay, their tickets (a flight,
// train, bus or ferry booked for a journey), photo albums, links, their notes, prices they saw (which replace ours for
// that city), expenses (what they spent there), and their own phrases in a language.
// The trip's, not a plan's (kept by city, so switching plans or moving dates keeps them; a stay carries its own dates,
// so two visits to a city each show theirs), private, and kept apart from the trip's data like the journal
// (journalCore.ts): written on any device, offline too, and merged item by item, the latest edit of each winning.
// Plain rules, shared by the app (store/items.ts) and the Worker (account.ts), tested in items.test.ts.
import type { PriceKey, SeenPrices } from '../planner/cost'
import type { TripNotes } from './tripCore'

export type ItemKind = 'note' | 'stay' | 'ticket' | 'album' | 'link' | 'price' | 'expense' | 'phrase'
/** How a ticket travels. */
export type TicketMode = 'flight' | 'train' | 'bus' | 'ferry' | 'other'
export const TICKET_MODES: TicketMode[] = ['flight', 'train', 'bus', 'ferry', 'other']

/** One thing kept for a city or a journey. A removed one is kept as `deleted` (so the removal wins over older copies). */
export type TripItem = {
  id: string
  kind: ItemKind
  /** Where it belongs: a city id, or a journey's `from>to`; a phrase's language tag ("mk", "zh-TW"); or the trip as a
   *  whole (NO_PLACE: a ticket, stay or expense not at any of its cities or journeys). */
  at: string
  /** A stay's name; a ticket's carrier and number ("LOT LO 335"); an album's or a link's title; what an expense was
   *  for ("Dinner at Pod Wawelem"); what a phrase says, in English. */
  title?: string
  /** A stay's or a ticket's booking, the album, the link (http or https). */
  url?: string
  /** A note (Markdown); a stay's, a ticket's or an expense's own note (door code, wifi; seat, baggage); a phrase in its
   *  language's script. */
  text?: string
  /** A phrase: how to say it, and a note on using it ("polite: add …"). */
  say?: string
  tip?: string
  /** A stay's address. */
  address?: string
  /** A stay's check-in and check-out days (ISO); a ticket's departure and arrival, each in its place's own time
   *  (YYYY-MM-DDTHH:MM, or the day alone); an expense's day (`from`). */
  from?: string
  to?: string
  /** A ticket's way of travel, and where it leaves from and arrives (the airport, station or port). */
  mode?: TicketMode
  fromPlace?: string
  toPlace?: string
  /** A stay's or a ticket's booking reference. */
  ref?: string
  /** A stay's or a ticket's price, as written ("€84, paid"). */
  price?: string
  /** A price seen in the city (`price:<city>:<what>`, see PriceKey), or what an expense came to, in the money it was
   *  seen or paid in. */
  amount?: number
  currency?: string
  /** An expense's stays and tickets (their ids): what it paid for, one or several (a package: flights and a hotel,
   *  paid together). */
  bookings?: string[]
  /** Filled in, all or in part, by an AI assistant (the app's, or another app's): kept when the user changes it after. */
  ai?: true
  /** Shown on the trip's shared link (SHAREABLE kinds; only their PUBLIC_FIELDS); private otherwise. */
  public?: true
  /** When last changed (ms), on the device that changed it: the latest wins. */
  updatedAt: number
  deleted?: true
}
export type Items = Record<string, TripItem>

export const ITEM_LIMITS = { textChars: 4000, shortChars: 200, urlChars: 2000, items: 2000, bytes: 1_500_000, phrases: 50, bookings: 20 }
/** The user's own phrases (not removed). They're the account's, not a trip's (phrases.ts), though the assistant's
 *  tools see them with the trip's items. */
export const phraseCount = (items: Items) => Object.values(items).filter((i) => i.kind === 'phrase' && !i.deleted).length
/** Whether an item is one of the user's phrases, by its id (`phrase:<tag>:<meaning>`). */
export const isPhrase = (id: string) => id.startsWith('phrase:')
/** The phrases kept with each trip before they were the account's, gathered (the latest edit of each wins). */
export const phrasesOf = (trips: Items[]): Items =>
  trips.reduce<Items>((all, items) => mergeItems(all, Object.values(items).filter((i) => isPhrase(i.id))), {})
/** The trip's items without phrases (trips kept them before phrases were the account's: those are left out). */
export const withoutPhrases = (items: Items): Items => Object.fromEntries(Object.entries(items).filter(([id]) => !isPhrase(id)))
const SHORT = ['title', 'address', 'fromPlace', 'toPlace', 'ref', 'price', 'say', 'tip'] as const
const KINDS: ItemKind[] = ['note', 'stay', 'ticket', 'album', 'link', 'price', 'expense', 'phrase']
/** Kinds since renamed, as items kept or sent before still have them (in the browser, on the server, in its undo
 *  history, from another app's assistant): read as the kind they are now. */
export const RENAMED_KINDS: Record<string, ItemKind> = { receipt: 'expense' }
/** An item with a renamed kind as the kind it is now (its id stays: `receipt:…` ids are expenses' too). */
export const withKindNow = <T extends { kind: string } | null>(i: T): T => (i && RENAMED_KINDS[i.kind] ? { ...i, kind: RENAMED_KINDS[i.kind] } : i)
/** Items kept with renamed kinds, as they are now (the same object if none was renamed). */
export function itemsNow<T extends { kind: string } | null>(items: Record<string, T>): Record<string, T> {
  return Object.values(items).some((i) => i && RENAMED_KINDS[i.kind]) ? Object.fromEntries(Object.entries(items).map(([id, i]) => [id, withKindNow(i)])) : items
}
/** A day; a ticket's times may have the time of day too. */
const DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_TIME = /^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/
/** A currency's code ("PLN"). */
const CURRENCY = /^[A-Z]{3}$/
/** A language tag, as the phrases data has them ("mk", "zh-TW"). */
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/

/** Where a ticket, stay or expense kept for the trip but at none of its cities or journeys is (`at`). */
export const NO_PLACE = '_trip'
/** The kinds that can be at NO_PLACE. */
const UNPLACED: ItemKind[] = ['ticket', 'stay', 'expense']

/** The kinds the user can show on the trip's shared link, and what of each it shows: never a booking's reference,
 *  price, link, address or own note (those can let someone change or cancel a booking, or find where they sleep), nor
 *  an expense's note. */
export const SHAREABLE: ItemKind[] = ['stay', 'ticket', 'album', 'link', 'note', 'expense']
const PUBLIC_FIELDS: Partial<Record<ItemKind, (keyof TripItem)[]>> = {
  stay: ['title', 'from', 'to'],
  ticket: ['title', 'mode', 'from', 'to', 'fromPlace', 'toPlace'],
  album: ['title', 'url'],
  link: ['title', 'url'],
  note: ['text'],
  expense: ['title', 'amount', 'currency', 'from', 'bookings'],
}
/** The items the user made public, as the shared link shows them (their public fields only). */
export function publicItems(items: Items): Items {
  return Object.fromEntries(Object.values(items)
    .filter((i) => i.public && !isEmptyItem(i) && PUBLIC_FIELDS[i.kind])
    .map((i) => {
      const shown: TripItem = { id: i.id, kind: i.kind, at: i.at, updatedAt: i.updatedAt, public: true }
      for (const k of PUBLIC_FIELDS[i.kind]!) if (i[k] !== undefined) (shown as Record<string, unknown>)[k] = i[k]
      return [i.id, shown]
    }))
}

/** A note's id: one per city or journey. */
export const noteId = (at: string) => `note:${at}`
/** A seen price's id: one per city and what it's the price of. */
export const priceId = (cityId: string, key: PriceKey) => `price:${cityId}:${key}`
/** A phrase's id: one per language and what it says in English (saying it again changes it). */
export const phraseId = (tag: string, english: string) =>
  `phrase:${tag}:${english.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'phrase'}`
/** An item with nothing in it (a note emptied, a stay with no name), as good as removed. */
export const isEmptyItem = (i: TripItem | undefined) =>
  !i || i.deleted || (i.kind === 'price' ? i.amount === undefined : i.kind === 'phrase' ? !i.text?.trim()
    : i.kind === 'expense' ? i.amount === undefined && ![i.title, i.text].some((v) => v?.trim())
    : ![i.title, i.url, i.text, i.address, i.fromPlace, i.toPlace, i.ref, i.price].some((v) => v?.trim()))

/** The prices seen in each city, in EUR at these rates (units per EUR); one in money without a rate is left out. */
export function seenPrices(items: Items, rates: Record<string, number>): SeenPrices {
  const out: SeenPrices = {}
  for (const i of Object.values(items)) {
    if (i.kind !== 'price' || isEmptyItem(i)) continue
    const rate = i.currency === 'EUR' ? 1 : rates[i.currency ?? '']
    const key = i.id.split(':')[2] as PriceKey
    if (rate && key) (out[i.at] ??= {})[key] = i.amount! / rate
  }
  return out
}

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
    const kind = (RENAMED_KINDS[x.kind as string] ?? x.kind) as ItemKind
    if (!KINDS.includes(kind) || typeof x.at !== 'string' || !/^[\w.-]{1,64}(>[\w.-]{1,64})?$/.test(x.at)) return 'Invalid item'
    if (typeof x.updatedAt !== 'number' || !Number.isFinite(x.updatedAt)) return 'Invalid item'
    const item: TripItem = { id: x.id, kind, at: x.at, updatedAt: Math.min(x.updatedAt, now) }
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
    if (item.kind === 'phrase' && !LANGUAGE_TAG.test(item.at)) return 'Invalid phrase'
    if (item.at === NO_PLACE && !UNPLACED.includes(item.kind)) return 'Invalid item'
    // (A ticket is for a journey, or none.)
    if (item.kind === 'ticket') {
      if (!item.at.includes('>') && item.at !== NO_PLACE) return 'Invalid ticket'
      if (x.mode !== undefined && !TICKET_MODES.includes(x.mode as TicketMode)) return 'Invalid ticket'
      if (x.mode) item.mode = x.mode as TicketMode
    }
    // (A price seen has its amount and money; an expense, a city's too, may get them after its name, as it's typed.)
    if (item.kind === 'price' || item.kind === 'expense') {
      const price = item.kind === 'price'
      if (item.at.includes('>')) return `Invalid ${item.kind}`
      if ((price || x.amount !== undefined) && (typeof x.amount !== 'number' || !Number.isFinite(x.amount) || x.amount < 0 || x.amount > 1e9)) return `Invalid ${item.kind}`
      if ((price || x.currency !== undefined) && (typeof x.currency !== 'string' || !CURRENCY.test(x.currency))) return `Invalid ${item.kind}`
      if (x.amount !== undefined) item.amount = x.amount as number
      if (x.currency !== undefined) item.currency = x.currency as string
    }
    if (x.ai === true) item.ai = true
    if (x.public === true && SHAREABLE.includes(item.kind)) item.public = true
    if (item.kind === 'expense' && x.bookings !== undefined) {
      const ids = x.bookings
      if (!Array.isArray(ids) || ids.length > ITEM_LIMITS.bookings || ids.some((b) => typeof b !== 'string' || !/^(stay|ticket):[\w-]{1,40}$/.test(b))) return 'Invalid expense'
      if (ids.length) item.bookings = [...new Set(ids as string[])]
    }
    for (const k of ['from', 'to'] as const) {
      if (x[k] === undefined || x[k] === '') continue
      if (typeof x[k] !== 'string' || !(item.kind === 'ticket' ? DAY_TIME : DAY).test(x[k] as string)) return 'Invalid date'
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
