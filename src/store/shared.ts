// The shared trip this page shows (its link: shareLink.ts): loaded once, read-only.
import { create } from 'zustand'
import { SHARED_TOKEN } from './shareLink'
import { useTrip, type TripData } from './trip'

type Shared = { name: string | null; status: 'loading' | 'ok' | 'gone' }

export const useShared = create<Shared>(() => ({ name: null, status: 'loading' }))

// As the link came, before the page writes its own view into the address (url.ts).
const linkNamesTab = typeof location !== 'undefined' && new URLSearchParams(location.search).has('panel')

/** Loads the shared trip and shows it (read-only, whatever it was saved as). */
export async function openShared() {
  if (!SHARED_TOKEN) return
  try {
    const res = await fetch(`/api/shared/${SHARED_TOKEN}`)
    if (!res.ok) throw new Error(String(res.status))
    const { name, data } = (await res.json()) as { name: string; data: TripData | null }
    useTrip.getState().openTrip(data && { ...data, readOnly: true })
    // The itinerary first (it's what someone sent the link for), unless the link names a tab.
    if (useTrip.getState().plan && !linkNamesTab) useTrip.getState().setPanel('itinerary')
    useShared.setState({ name, status: 'ok' })
    document.title = `${name} · rtw-map`
  } catch {
    useShared.setState({ status: 'gone' })
  }
}
