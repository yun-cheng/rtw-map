// The shared trip this page shows (its link: shareLink.ts): loaded once, read-only.
import { create } from 'zustand'
import { SHARED_TOKEN } from './shareLink'
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
    const { name, data } = (await res.json()) as { name: string; data: TripData | null }
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
