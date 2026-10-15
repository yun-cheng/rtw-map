// The shared trip this page shows (its link: shareLink.ts): loaded once, read-only, with what its owner made public of
// what they keep (items.ts, journal.ts).
import { create } from 'zustand'
import { SHARED_TOKEN } from './shareLink'
import { useSharedItems, type Items } from './items'
import { useSharedJournal, type Journal } from './journal'
import { useTrip, type TripData } from './trip'
import { quietly } from './url'

type Shared = { name: string | null; status: 'loading' | 'ok' | 'gone' }

export const useShared = create<Shared>(() => ({ name: null, status: 'loading' }))

/** Loads the shared trip and shows it (read-only, whatever it was saved as). */
export async function openShared() {
  if (!SHARED_TOKEN) return
  try {
    const res = await fetch(`/api/shared/${SHARED_TOKEN}`)
    if (!res.ok) throw new Error(String(res.status))
    const { name, data, items, journal } = (await res.json()) as { name: string; data: TripData | null; items?: Items; journal?: Journal }
    // (With the stays, tickets, links, notes and journal days its owner made public: read-only, kept only on this page.)
    useSharedItems.setState({ entries: items ?? {} })
    useSharedJournal.setState({ entries: journal ?? {} })
    // (Setting the page up: no step for Back to undo.)
    quietly(() => {
      useTrip.getState().openTrip(data && { ...data, readOnly: true })
      // Its itinerary is all the page shows (App.tsx).
      useTrip.getState().setPanel('itinerary')
    })
    useShared.setState({ name, status: 'ok' })
    document.title = `${name} · rtw-map`
  } catch {
    useShared.setState({ status: 'gone' })
  }
}
