// The trip's journal on this device (journalCore.ts): kept in the browser first, so a day written with no connection
// is never lost, with the days not yet on the server. Each trip's journal is kept under its id (signed out, the
// browser's own trip under "local"). Sending and receiving is in saved.ts, which knows the account and the open trip.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isEmptyEntry, mergeJournal, type DayEntry, type Journal } from './journalCore'

export { isEmptyEntry, type DayEntry, type Journal } from './journalCore'

/** The browser's own trip (signed out). */
export const LOCAL = 'local'

type Book = { entries: Journal; /** Days changed here and not yet on the server. */ pending: string[] }
const EMPTY: Book = { entries: {}, pending: [] }

type JournalState = {
  /** Each trip's journal on this device. */
  books: Record<string, Book>
  /** The open trip's ("local" signed out). */
  key: string
  /** Why the last send failed (not for want of a connection). */
  problem: string | null
  /** The Itinerary shows the journal instead of the stops; `focus`: a stop's first day to bring into view. */
  view: { journal: boolean; focus?: string }

  /** Changes a day (an empty one is kept, cleared, so the clearing reaches the other devices). */
  write: (date: string, patch: Partial<Omit<DayEntry, 'date' | 'updatedAt'>>) => void
  /** The open trip is now `key`, with its journal from the server, if any (days changed here and not sent stay). */
  open: (key: string, server?: Journal | null) => void
  /** These entries reached the server, which answered with its journal. */
  sent: (key: string, entries: DayEntry[], server: Journal) => void
  /** The browser's own trip became a trip in the account: its journal goes with it, all to send. */
  adopt: (key: string) => void
  /** Signed out: forget every journal on this browser (it may be shared). */
  clear: () => void
  setView: (view: JournalState['view']) => void
}

/** Called after each change (saved.ts sends it when it can). */
let onChange = () => {}
export const setJournalSync = (fn: () => void) => { onChange = fn }

export const useJournal = create<JournalState>()(
  persist(
    (set, get) => ({
      books: {},
      key: LOCAL,
      problem: null,
      view: { journal: false },

      write: (date, patch) => {
        const { key, books } = get()
        const book = books[key] ?? EMPTY
        const entry: DayEntry = { ...(book.entries[date] ?? { date, highlight: '', text: '' }), ...patch, updatedAt: Date.now() }
        if (!entry.rating) delete entry.rating
        set({ books: { ...books, [key]: { entries: { ...book.entries, [date]: entry }, pending: [...new Set([...book.pending, date])] } } })
        onChange()
      },

      open: (key, server) => {
        const books = get().books
        const book = books[key] ?? EMPTY
        // Days changed here and not sent win over the server's (they're newer, or sent next).
        const mine = book.pending.map((d) => book.entries[d]).filter(Boolean)
        const entries = server ? mergeJournal(server, mine) : book.entries
        set({ key, books: { ...books, [key]: { entries, pending: book.pending } } })
      },

      sent: (key, entries, server) => {
        const book = get().books[key] ?? EMPTY
        // Days changed again while sending are still to send.
        const pending = book.pending.filter((d) => !entries.some((e) => e.date === d && e.updatedAt === book.entries[d]?.updatedAt))
        const mine = pending.map((d) => book.entries[d]).filter(Boolean)
        set({ problem: null, books: { ...get().books, [key]: { entries: mergeJournal(server, mine), pending } } })
      },

      adopt: (key) => {
        const { [LOCAL]: local, ...books } = get().books
        if (!local || !Object.keys(local.entries).length) return set({ books, key })
        set({ key, books: { ...books, [key]: { entries: local.entries, pending: Object.keys(local.entries) } } })
        onChange()
      },

      clear: () => set({ books: {}, key: LOCAL, problem: null }),
      setView: (view) => set({ view }),
    }),
    {
      name: 'rtw-map-journal',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ books: s.books, key: s.key }),
    },
  ),
)

/** The open trip's day, if written. */
export const useDayEntry = (date: string): DayEntry | undefined => useJournal((s) => {
  const e = s.books[s.key]?.entries[date]
  return isEmptyEntry(e) ? undefined : e
})
