// What's kept on this device of something the trip holds apart from its data and merges entry by entry on the server
// (the journal, journal.ts; the cities' items, items.ts): each trip's under its id (signed out, the browser's own trip
// under "local"), with the entries changed here and not yet on the server. Sending is in saved.ts.

/** The browser's own trip (signed out). */
export const LOCAL = 'local'

export type Book<T> = { entries: Record<string, T>; /** Entries (keys) changed here and not yet on the server. */ pending: string[] }
export const emptyBook = <T>(): Book<T> => ({ entries: {}, pending: [] })

export type BookState<T> = {
  /** Each trip's on this device. */
  books: Record<string, Book<T>>
  /** The open trip's ("local" signed out). */
  key: string
  /** Why the last send failed (not for want of a connection). */
  problem: string | null
  /** The open trip is now `key`, with the server's entries, if any (those changed here and not sent stay). */
  open: (key: string, server?: Record<string, T> | null) => void
  /** These entries reached the server, which answered with all of its. */
  sent: (key: string, entries: T[], server: Record<string, T>) => void
  /** The browser's own trip became a trip in the account: its entries go with it, all to send. */
  adopt: (key: string) => void
  /** Signed out: forget everything on this browser (it may be shared). */
  clear: () => void
}

type Set<T> = (patch: Partial<BookState<T>>) => void
type Get<T> = () => BookState<T>

/** The open trip's book with entries changed: kept, marked to send, and `onChange` told. */
export function changeBook<T>(set: Set<T>, get: Get<T>, changed: Record<string, T>, onChange: () => void) {
  const { key, books } = get()
  const book = books[key] ?? emptyBook<T>()
  set({ books: { ...books, [key]: { entries: { ...book.entries, ...changed }, pending: [...new Set([...book.pending, ...Object.keys(changed)])] } } })
  onChange()
}

/** A book's actions, for entries keyed by `keyOf`, merged by `merge` (the latest edit wins). */
export function bookActions<T extends { updatedAt: number }>(
  set: Set<T>, get: Get<T>, keyOf: (e: T) => string, merge: (all: Record<string, T>, list: T[]) => Record<string, T>, onChange: () => void,
): Pick<BookState<T>, 'open' | 'sent' | 'adopt' | 'clear'> {
  return {
    open: (key, server) => {
      const books = get().books
      const book = books[key] ?? emptyBook<T>()
      // Entries changed here and not sent win over the server's (they're newer, or sent next).
      const mine = book.pending.map((k) => book.entries[k]).filter(Boolean)
      const entries = server ? merge(server, mine) : book.entries
      set({ key, books: { ...books, [key]: { entries, pending: book.pending } } })
    },

    sent: (key, entries, server) => {
      const book = get().books[key] ?? emptyBook<T>()
      // Entries changed again while sending are still to send.
      const pending = book.pending.filter((k) => !entries.some((e) => keyOf(e) === k && e.updatedAt === book.entries[k]?.updatedAt))
      const mine = pending.map((k) => book.entries[k]).filter(Boolean)
      set({ problem: null, books: { ...get().books, [key]: { entries: merge(server, mine), pending } } })
    },

    adopt: (key) => {
      const { [LOCAL]: local, ...books } = get().books
      if (!local || !Object.keys(local.entries).length) return set({ books, key })
      set({ key, books: { ...books, [key]: { entries: local.entries, pending: Object.keys(local.entries) } } })
      onChange()
    },

    clear: () => set({ books: {}, key: LOCAL, problem: null }),
  }
}
