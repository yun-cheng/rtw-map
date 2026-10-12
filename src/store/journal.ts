// The trip's journal on this device (journalCore.ts): kept in the browser first, so a day written with no connection
// is never lost, with the days not yet on the server (book.ts). Sending and receiving is in saved.ts, which knows the
// account and the open trip.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { bookActions, changeBook, LOCAL, type BookState } from './book'
import { isEmptyEntry, mergeJournal, type DayEntry } from './journalCore'

export { isEmptyEntry, type DayEntry, type Journal } from './journalCore'
export { LOCAL } from './book'

type JournalState = BookState<DayEntry> & {
  /** The Itinerary shows the journal instead of the stops; `focus`: a stop's first day to bring into view. */
  view: { journal: boolean; focus?: string }

  /** Changes a day (an empty one is kept, cleared, so the clearing reaches the other devices). */
  write: (date: string, patch: Partial<Omit<DayEntry, 'date' | 'updatedAt'>>) => void
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

      ...bookActions<DayEntry>(set, get, (e) => e.date, mergeJournal, () => onChange()),

      write: (date, patch) => {
        const { key, books } = get()
        const entry: DayEntry = { ...(books[key]?.entries[date] ?? { date, highlight: '', text: '' }), ...patch, updatedAt: Date.now() }
        if (!entry.rating) delete entry.rating
        changeBook(set, get, { [date]: entry }, onChange)
      },

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
