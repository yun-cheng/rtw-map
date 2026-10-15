// The trip's journal on this device (journalCore.ts): kept in the browser first, so a day written with no connection
// is never lost, with the days not yet on the server (book.ts). Sending and receiving is in saved.ts, which knows the
// account and the open trip.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { bookActions, changeBook, LOCAL, type BookState } from './book'
import { isEmptyEntry, mergeJournal, type DayEntry, type Journal } from './journalCore'
import { SHARED_TOKEN } from './shareLink'

export { isEmptyEntry, type DayEntry, type Journal } from './journalCore'
export { LOCAL } from './book'

type JournalState = BookState<DayEntry> & {
  /** My trip's Daily (the journal), brought to a stop's days: `focus`, its first day. */
  view: { focus?: string }

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
      view: {},

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

const NO_DAYS: Journal = {}
/** On a shared trip's page, the days its owner made public (shared.ts): shown read-only, never kept on this device or
 *  sent anywhere. */
export const useSharedJournal = create<{ entries: Journal }>(() => ({ entries: NO_DAYS }))

/** The open trip's journal (a shared trip's public days on its page). */
export const useJournalEntries = (): Journal => {
  const own = useJournal((s) => s.books[s.key]?.entries ?? NO_DAYS)
  const shared = useSharedJournal((s) => s.entries)
  return SHARED_TOKEN ? shared : own
}

/** The open trip's day, if written. */
export const useDayEntry = (date: string): DayEntry | undefined => {
  const e = useJournalEntries()[date]
  return isEmptyEntry(e) ? undefined : e
}
