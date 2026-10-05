// Trips saved to the signed-in user's account (the Worker's /api/trips). After sign-in it lists the trips and opens
// the last one; the open trip and its assistant chat are saved automatically a moment after each change.
// Signed out, the app keeps one trip in this browser only (store/trip.ts persists it locally).
import { create } from 'zustand'
import { useAccount } from '../agent/account'
import { useChat, type SavedChat } from '../agent/chat'
import type { Stop, TripInput } from '../planner'
import { newTripInput, useTrip } from './trip'

export type TripSummary = { id: string; name: string; startDate: string | null; endDate: string | null; stops: number; updated: number }
type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

type SavedState = {
  trips: TripSummary[]
  activeId: string | null
  status: Status
  error: string | null
  /** `keepView`: the trip is already on screen (reloading it at sign-in), so keep the open panel and map position. */
  open: (id: string, keepView?: boolean) => Promise<void>
  create: (name: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

const SAVE_DELAY_MS = 1200
/** Remembers which saved trip this browser shows, so a reload doesn't copy the local trip into a new one. */
const ACTIVE_KEY = 'rtw-map-active-trip'

const call = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => null)
  if (res.status === 401) useAccount.getState().signedOut()
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
  return data
}

const tripData = () => {
  const { input, stops } = useTrip.getState()
  return { input, stops }
}
const chatData = (): SavedChat => {
  const { messages, contents, note } = useChat.getState()
  return { messages, contents, note }
}
const hasContent = () => {
  const { input, stops } = useTrip.getState()
  return input.groups.length > 0 || stops.length > 0
}
const remember = (id: string | null) => {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // Storage unavailable (private mode): only means the local trip may be offered again.
  }
}
const remembered = () => {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

/** True while a trip is being put on screen, so that isn't mistaken for an edit to save. */
let applying = false
let timer: ReturnType<typeof setTimeout> | undefined

export const useSaved = create<SavedState>()((set, get) => {
  const upsert = (s: TripSummary) => set({ trips: [s, ...get().trips.filter((t) => t.id !== s.id)].sort((a, b) => b.updated - a.updated) })

  const show = (id: string, data: { input: TripInput; stops: Stop[] } | null, chat: SavedChat | null, keepView = false) => {
    applying = true
    useTrip.getState().openTrip(data, keepView)
    useChat.getState().load(chat)
    applying = false
    remember(id)
    set({ activeId: id })
  }

  return {
    trips: [],
    activeId: null,
    status: 'idle',
    error: null,

    open: async (id, keepView) => {
      await flush()
      set({ status: 'loading', error: null })
      try {
        const trip = await call('GET', `/api/trips/${id}`)
        show(id, trip.data, trip.chat, keepView)
        set({ status: 'idle' })
      } catch (e) {
        set({ status: 'error', error: (e as Error).message })
      }
    },

    create: async (name) => {
      await flush()
      try {
        const data = { input: newSetup(), stops: [] }
        const created: TripSummary = await call('POST', '/api/trips', { name, data })
        upsert(created)
        show(created.id, data, null)
        set({ status: 'saved', error: null })
      } catch (e) {
        set({ status: 'error', error: (e as Error).message })
      }
    },

    rename: async (id, name) => {
      try {
        upsert(await call('PUT', `/api/trips/${id}`, { name }))
      } catch (e) {
        set({ status: 'error', error: (e as Error).message })
      }
    },

    remove: async (id) => {
      try {
        await call('DELETE', `/api/trips/${id}`)
        const trips = get().trips.filter((t) => t.id !== id)
        set({ trips })
        if (get().activeId === id) {
          if (trips.length) await get().open(trips[0].id)
          else await get().create('My trip')
        }
      } catch (e) {
        set({ status: 'error', error: (e as Error).message })
      }
    },
  }
})

/** A new trip's setup: empty, keeping the user's passport and travel style. */
function newSetup(): TripInput {
  const { passport, pace, budget, interests } = useTrip.getState().input
  return { ...newTripInput(), passport, pace, budget, interests }
}

/** Saves the open trip now (used before switching trips and after the save delay). */
async function flush() {
  clearTimeout(timer)
  timer = undefined
  const id = useSaved.getState().activeId
  if (!id || !dirty) return
  dirty = false
  useSaved.setState({ status: 'saving' })
  try {
    const saved: TripSummary = await call('PUT', `/api/trips/${id}`, { data: tripData(), chat: chatData() })
    useSaved.setState((s) => ({ status: dirty ? 'saving' : 'saved', error: null, trips: [saved, ...s.trips.filter((t) => t.id !== saved.id)] }))
  } catch (e) {
    dirty = true
    useSaved.setState({ status: 'error', error: (e as Error).message })
  }
}

let dirty = false
function changed() {
  if (applying || !useSaved.getState().activeId) return
  dirty = true
  useSaved.setState({ status: 'saving' })
  clearTimeout(timer)
  timer = setTimeout(() => void flush(), SAVE_DELAY_MS)
}

// Save after edits to the trip or its chat.
useTrip.subscribe((s, prev) => {
  if (s.input !== prev.input || s.stops !== prev.stops) changed()
})
useChat.subscribe((s, prev) => {
  if (!s.busy && (s.messages !== prev.messages || s.contents !== prev.contents)) changed()
})

// Don't lose the last edit when the page closes.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    const id = useSaved.getState().activeId
    if (!id || !dirty) return
    void fetch(`/api/trips/${id}`, {
      method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: tripData(), chat: chatData() }),
    })
  })
}

/** After sign-in: list the trips and open one. The trip planned before signing in is added to the account first. */
async function signedIn() {
  useSaved.setState({ status: 'loading', error: null })
  try {
    const { trips, lastId } = (await call('GET', '/api/trips')) as { trips: TripSummary[]; lastId: string | null }
    useSaved.setState({ trips })
    const local = remembered()
    if (local && trips.some((t) => t.id === local)) {
      // This browser already shows a saved trip: keep it on screen (it may have unsaved edits) and refresh from the server.
      await useSaved.getState().open(local, true)
    } else if (hasContent() || !trips.length) {
      // A trip planned while signed out (or a first sign-in): keep it as a new trip in the account.
      const created: TripSummary = await call('POST', '/api/trips', { name: 'My trip', data: tripData(), chat: chatData() })
      useSaved.setState({ trips: [created, ...trips], activeId: created.id, status: 'saved' })
      remember(created.id)
    } else {
      await useSaved.getState().open(lastId && trips.some((t) => t.id === lastId) ? lastId : trips[0].id)
    }
  } catch (e) {
    useSaved.setState({ status: 'error', error: (e as Error).message })
  }
}

/** After sign-out: forget the account's trips and clear this browser (it may be shared). */
function signedOut() {
  clearTimeout(timer)
  dirty = false
  remember(null)
  useSaved.setState({ trips: [], activeId: null, status: 'idle', error: null })
  applying = true
  useTrip.getState().openTrip(null)
  useChat.getState().clear()
  applying = false
}

useAccount.subscribe((s, prev) => {
  if (s.user?.sub === prev.user?.sub) return
  if (s.user) void signedIn()
  else if (prev.user) signedOut()
})
