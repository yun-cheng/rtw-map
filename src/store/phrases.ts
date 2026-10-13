// The user's own phrases (itemsCore.ts, kind "phrase": the assistant's translations of what they asked for), the
// account's, for every trip: kept in the browser first, like the trip's items (book.ts), under "account" signed in
// (sent and received in saved.ts, GET|PUT /api/phrases) or "local" signed out (they go to the account at sign-in).
// The assistant's tools see them with the trip's items (agent/chat.ts). Trips kept them before; those this browser
// had signed out are moved here once (the server gathers each account's).
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { bookActions, changeBook, LOCAL, type BookState } from './book'
import { changedItem, isPhrase, mergeItems, removedItem, type Items, type TripItem } from './itemsCore'
import { useItems } from './items'

/** The signed-in account's phrases. */
export const ACCOUNT = 'account'

type PhrasesState = BookState<TripItem> & {
  /** Adds or changes a phrase. */
  put: (item: Partial<TripItem> & { id: string }) => void
  /** Removes one (kept as removed, so the removal reaches the other devices). */
  remove: (id: string) => void
  /** Puts phrases back as they were (null: not there then), e.g. for the assistant's Undo. */
  restore: (was: Record<string, TripItem | null>) => void
  /** Those this browser kept with its own trip before were moved here. */
  moved: boolean
}

/** Called after each change (saved.ts sends it when it can). */
let onChange = () => {}
export const setPhrasesSync = (fn: () => void) => { onChange = fn }

const NO_PHRASES: Items = {}

export const usePhrases = create<PhrasesState>()(
  persist(
    (set, get) => {
      const current = () => get().books[get().key]?.entries ?? NO_PHRASES
      return {
        books: {},
        key: LOCAL,
        problem: null,
        moved: false,

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
      }
    },
    {
      name: 'rtw-map-phrases',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ books: s.books, key: s.key, moved: s.moved }),
    },
  ),
)

// Phrases this browser kept with its own trip (signed out) before they were the account's: moved here, once (a
// signed-in account's are gathered on the server).
if (!usePhrases.getState().moved) {
  const kept = Object.values(useItems.getState().books[LOCAL]?.entries ?? {}).filter((i) => isPhrase(i.id) && !i.deleted)
  const { books } = usePhrases.getState()
  const local = books[LOCAL] ?? { entries: {}, pending: [] }
  usePhrases.setState({
    moved: true,
    ...(kept.length && { books: { ...books, [LOCAL]: { entries: mergeItems(local.entries, kept), pending: [...new Set([...local.pending, ...kept.map((i) => i.id)])] } } }),
  })
}

/** The user's phrases (none removed or empty). */
export const useMyPhrases = (): TripItem[] => {
  const entries = usePhrases((s) => s.books[s.key]?.entries ?? NO_PHRASES)
  return phraseList(entries)
}
const cache = new WeakMap<Items, TripItem[]>()
/** (The same array for the same phrases, so a selector using it doesn't render again for nothing.) */
function phraseList(entries: Items): TripItem[] {
  let list = cache.get(entries)
  if (!list) cache.set(entries, (list = Object.values(entries).filter((i) => !i.deleted && i.text?.trim())))
  return list
}

/** The user's phrases in a language. */
export const usePhrasesIn = (tag: string): TripItem[] => useMyPhrases().filter((p) => p.at === tag)
