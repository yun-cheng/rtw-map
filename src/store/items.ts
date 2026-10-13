// The cities' and journeys' items on this device (itemsCore.ts: stays, albums, links, notes): kept in the browser
// first, like the journal, with those not yet on the server (book.ts). Sent and received in saved.ts.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { bookActions, changeBook, LOCAL, type BookState } from './book'
import { changedItem, mergeItems, noteId, notesAsItems, removedItem, type Items, type TripItem } from './itemsCore'
import type { TripNotes } from './tripCore'

export { isEmptyItem, newItemId, noteId, priceId, webUrl, type ItemKind, type Items, type TripItem } from './itemsCore'

type ItemsState = BookState<TripItem> & {
  /** Adds or changes an item (`kind` and `at` are needed for a new one). */
  put: (item: Partial<TripItem> & { id: string }) => void
  /** Removes an item (kept as removed, so the removal reaches the other devices). */
  remove: (id: string) => void
  /** Puts items back as they were (null: not there then, so removed), e.g. for the assistant's Undo. */
  restore: (was: Record<string, TripItem | null>) => void
  /** Notes kept with the trip's data before items, moved into the open trip's items (those not there yet). */
  takeNotes: (notes: TripNotes | undefined) => void
}

/** Called after each change (saved.ts sends it when it can). */
let onChange = () => {}
export const setItemsSync = (fn: () => void) => { onChange = fn }

const NO_ITEMS: Items = {}

export const useItems = create<ItemsState>()(
  persist(
    (set, get) => {
      const current = () => get().books[get().key]?.entries ?? NO_ITEMS
      return {
        books: {},
        key: LOCAL,
        problem: null,

        ...bookActions<TripItem>(set, get, (i) => i.id, mergeItems, () => onChange()),

        put: (patch) => {
          const item = changedItem(current()[patch.id], patch)
          if (item) changeBook(set, get, { [item.id]: item }, onChange)
        },

        remove: (id) => {
          const item = removedItem(current()[id])
          if (item) changeBook(set, get, { [id]: item }, onChange)
        },

        restore: (was) => {
          const now = Date.now()
          const items = Object.entries(was).map(([id, old]) => (old ? { ...old, updatedAt: now } : removedItem(current()[id], now)))
            .filter((i): i is TripItem => !!i)
          if (items.length) changeBook(set, get, Object.fromEntries(items.map((i) => [i.id, i])), onChange)
        },

        takeNotes: (notes) => {
          const moved = notesAsItems(notes, current(), Date.now())
          if (moved.length) changeBook(set, get, Object.fromEntries(moved.map((i) => [i.id, i])), onChange)
        },
      }
    },
    {
      name: 'rtw-map-items',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ books: s.books, key: s.key }),
    },
  ),
)

/** The open trip's items for a city or a journey (none removed or empty), in the order added. */
export const useItemsAt = (at: string, kind?: TripItem['kind']): TripItem[] => {
  const entries = useItems((s) => s.books[s.key]?.entries ?? NO_ITEMS)
  return itemsAt(entries, at, kind)
}
const cache = new WeakMap<Items, Map<string, TripItem[]>>()
/** (The same array for the same items, so a selector using it doesn't render again for nothing.) */
export function itemsAt(entries: Items, at: string, kind?: TripItem['kind']): TripItem[] {
  let byAt = cache.get(entries)
  if (!byAt) cache.set(entries, (byAt = new Map()))
  const key = `${at}|${kind ?? ''}`
  let list = byAt.get(key)
  if (!list) {
    list = Object.values(entries).filter((i) => i.at === at && (!kind || i.kind === kind) && !i.deleted)
    byAt.set(key, list)
  }
  return list
}

/** The open trip's item, if any (and not removed). */
export const useItem = (id: string): TripItem | undefined => useItems((s) => {
  const i = s.books[s.key]?.entries[id]
  return i?.deleted ? undefined : i
})

/** The note on a city or a journey ('' if none). */
export const useNote = (at: string) => useItem(noteId(at))?.text ?? ''

/** The open trip's items, all of them. */
export const useAllItems = () => useItems((s) => s.books[s.key]?.entries ?? NO_ITEMS)
