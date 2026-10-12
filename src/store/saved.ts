// Trips saved to the signed-in user's account (the Worker's /api/trips). After sign-in it lists the trips and opens
// the last one; the open trip and its assistant chat are saved automatically a moment after each change.
// The assistant answers messages about a saved trip on the server (/api/runs), so they finish with the page closed;
// the page follows the run, showing the trip as it changes, and picks it up again when the trip is opened.
// Signed out, the app keeps one trip in this browser only (store/trip.ts persists it locally).
// Offline, the trip on screen is the one kept in the browser: edits are marked unsaved (in the browser too, so a
// reload keeps the mark) and sent when the server can be reached again, before the trip is reloaded from it.
// The trip's journal and the cities' items (stays, albums, links, notes) are sent on their own (store/journal.ts,
// items.ts): merged entry by entry on the server, also while the assistant works on the trip.
// Other apps' AI assistants (worker/mcp.ts) change trips on the server: the page checks for that when it comes back
// into view and every little while, puts their changes on screen and lists them with Undo (useOutside). Each save
// says which version of the trip (`rev`) it's from, so a save from before such a change is refused, not overwriting it.
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { useAccount } from '../agent/account'
import { NO_SPENT, setServerRuns, useChat, type ChatMessage, type SavedChat, type Spent } from '../agent/chat'
import type { TripInput } from '../planner'
import type { Book, BookState } from './book'
import { setItemsSync, useItems, type Items } from './items'
import { setJournalSync, useJournal, type Journal } from './journal'
import { localNotes, newTripInput, useTrip, type TripData } from './trip'
import { SHARED_TOKEN } from './shareLink'
import { tripData as saveable } from './tripCore'

export type TripSummary = { id: string; name: string; startDate: string | null; endDate: string | null; stops: number; updated: number; share?: string | null; rev?: number }
/** Another app's change to the trip (worker/changes.ts). */
export type OutsideChange = { id: string; app: string; tool: string; summary: string[]; rev: number; created: number; undone: boolean }
type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'offline' | 'error'

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
  /** Turns the trip's public link on or off (anyone with it sees the trip read-only, without the notes, items and chat). */
  setShared: (id: string, on: boolean) => Promise<void>
}

const SAVE_DELAY_MS = 1200
/** Remembers which saved trip this browser shows, so a reload doesn't copy the local trip into a new one. */
const ACTIVE_KEY = 'rtw-map-active-trip'
/** The saved trip with edits on this device not yet on the server (made offline, or a save that failed). */
const UNSAVED_KEY = 'rtw-map-unsaved'

/** A request that didn't reach the server (no connection). */
class Offline extends Error {}
/** A save refused because another app changed the trip since the version on screen. */
class Changed extends Error {}

const call = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
    .catch(() => { throw new Offline('No connection') })
  const data = await res.json().catch(() => null)
  if (res.status === 401) useAccount.getState().signedOut()
  if (res.status === 409 && data?.changed) throw new Changed(data.error)
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
  return data
}

/** The open trip as saved: the active plan's setup and stops, all of its plans, and the trip's own settings. */
const tripData = (): TripData => saveable(useTrip.getState())
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
/** Edits on screen not yet saved: `dirty`, kept in the browser for the trip they belong to. */
let dirty = false
function setDirty(on: boolean) {
  dirty = on
  const id = useSaved.getState().activeId
  try {
    if (on && id) localStorage.setItem(UNSAVED_KEY, id)
    else localStorage.removeItem(UNSAVED_KEY)
  } catch {
    // Storage unavailable: the edits are still sent while the page stays open.
  }
}
const unsaved = () => {
  try {
    return localStorage.getItem(UNSAVED_KEY)
  } catch {
    return null
  }
}

/** True while a trip is being put on screen, so that isn't mistaken for an edit to save. */
let applying = false
let timer: ReturnType<typeof setTimeout> | undefined
/** Which version of the open trip is on screen (the server counts it up with each save; unknown: none checked). */
let rev: number | undefined

/** What the server keeps of a trip apart from its data, merged entry by entry. */
type Kept = { journal?: Journal | null; items?: Items | null }

/** Puts a saved trip (of version `at`), its chat, its journal and items on screen (`kept` none: those on this device). */
function show(id: string, data: TripData | null, chat: SavedChat | null, keepView = false, kept: Kept = {}, at?: number) {
  applying = true
  useTrip.getState().openTrip(data, keepView)
  useChat.getState().load(chat)
  applying = false
  remember(id)
  if (useSaved.getState().activeId !== id) useOutside.setState({ from: null, changes: [], error: null })
  useSaved.setState({ activeId: id })
  seen(id, at)
  useJournal.getState().open(id, kept.journal)
  useItems.getState().open(id, kept.items)
  // (Notes kept with the trip's data before items.)
  useItems.getState().takeNotes(data?.notes)
  void journalSync.send()
  void itemsSync.send()
}

export const useSaved = create<SavedState>()((set, get) => {
  const upsert = (s: TripSummary) => set({ trips: [s, ...get().trips.filter((t) => t.id !== s.id)].sort((a, b) => b.updated - a.updated) })

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
        const before = lastSeen(id)
        show(id, trip.data, trip.chat, keepView, { journal: trip.journal ?? {}, items: trip.items ?? {} }, trip.rev)
        set({ status: 'idle' })
        // Changed by other apps since this browser last showed it: say so.
        if (before !== undefined && trip.rev > before) void listOutside(id, before)
        // The assistant is still answering on the server: follow it.
        if (trip.run) {
          useChat.setState({ busy: true, runId: trip.run.id, messages: [...useChat.getState().messages, { role: 'user', text: trip.run.text }] })
          void follow(id, trip.run)
        }
      } catch (e) {
        set({ status: 'error', error: (e as Error).message })
      }
    },

    create: async (name) => {
      await flush()
      try {
        const data: TripData = { input: newSetup(), stops: [] }
        const created: TripSummary = await call('POST', '/api/trips', { name, data })
        upsert(created)
        show(created.id, data, null, false, { journal: {}, items: {} }, created.rev)
        set({ status: 'saved', error: null })
      } catch (e) {
        set({ status: 'error', error: (e as Error).message })
      }
    },

    rename: async (id, name) => {
      try {
        const saved: TripSummary = await call('PUT', `/api/trips/${id}`, { name })
        upsert(saved)
        if (id === get().activeId) seen(id, saved.rev)
      } catch (e) {
        set({ status: 'error', error: (e as Error).message })
      }
    },

    setShared: async (id, on) => {
      try {
        const { share } = (await call(on ? 'POST' : 'DELETE', `/api/trips/${id}/share`)) as { share: string | null }
        set({ trips: get().trips.map((t) => (t.id === id ? { ...t, share } : t)) })
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

/** A new trip's setup: empty, keeping the user's preferences (passport, pace, interests, travel style and the rest). */
function newSetup(): TripInput {
  const { passport, pace, budget, prefs, interests } = useTrip.getState().input
  return { ...newTripInput(), passport, pace, budget, prefs, interests }
}

/** Saves the open trip now (used before switching trips and after the save delay). */
async function flush() {
  clearTimeout(timer)
  timer = undefined
  const id = useSaved.getState().activeId
  if (!id || !dirty) return
  // (Offline from the start: sent once the account is reached again, see signedIn.)
  if (useAccount.getState().offline) return useSaved.setState({ status: 'offline' })
  dirty = false
  useSaved.setState({ status: 'saving' })
  try {
    const saved: TripSummary = await call('PUT', `/api/trips/${id}`, { data: tripData(), chat: chatData(), rev })
    if (useSaved.getState().activeId === id) seen(id, saved.rev)
    if (!dirty) setDirty(false)
    useSaved.setState((s) => ({ status: dirty ? 'saving' : 'saved', error: null, trips: [saved, ...s.trips.filter((t) => t.id !== saved.id)] }))
  } catch (e) {
    if (e instanceof Changed) {
      // Another app changed the trip since it was put on screen: its version is shown instead of these edits.
      setDirty(false)
      useSaved.setState({ status: 'idle', error: null })
      useOutside.setState({ error: 'Another app changed this trip while you were editing it here, so your latest edits weren\'t saved: here is the trip as it is now.' })
      void checkOutside(true)
      return
    }
    setDirty(true)
    useSaved.setState(e instanceof Offline ? { status: 'offline', error: null } : { status: 'error', error: (e as Error).message })
  }
}

function changed() {
  // (While the assistant answers on the server, the trip is the run's: edits on screen are replaced by its changes.)
  if (applying || !useSaved.getState().activeId || useChat.getState().runId) return
  setDirty(true)
  // Other apps' changes can't be undone once the trip is edited again (that would lose the edit).
  if (useOutside.getState().changes.length) dismissOutside()
  if (useAccount.getState().offline) return useSaved.setState({ status: 'offline' })
  useSaved.setState({ status: 'saving' })
  clearTimeout(timer)
  timer = setTimeout(() => void flush(), SAVE_DELAY_MS)
}

/** Sends what a book (book.ts: the journal, the items) has changed on this device for the open trip, a moment after a
 *  change: the server answers with all of the trip's, merged. */
function bookSync<T>(store: UseBoundStore<StoreApi<BookState<T>>>, path: 'journal' | 'items') {
  const DELAY_MS = 1500
  let timer: ReturnType<typeof setTimeout> | undefined
  let sending = false
  const changed = (book: Book<T>) => book.pending.map((k) => book.entries[k]).filter(Boolean)
  async function send() {
    clearTimeout(timer)
    timer = undefined
    const id = useSaved.getState().activeId
    const book = store.getState().books[id ?? '']
    if (!id || store.getState().key !== id || !book?.pending.length || sending) return
    // (Offline: sent once the account is reached again.)
    if (useAccount.getState().offline) return
    const entries = changed(book)
    sending = true
    try {
      const answer = (await call('PUT', `/api/trips/${id}/${path}`, { entries })) as Record<typeof path, Record<string, T>>
      store.getState().sent(id, entries, answer[path])
    } catch (e) {
      if (!(e instanceof Offline)) store.setState({ problem: (e as Error).message })
      return
    } finally {
      sending = false
    }
    // Changed again meanwhile.
    if (store.getState().books[id]?.pending.length) timer = setTimeout(() => void send(), DELAY_MS)
  }
  return {
    send,
    soon: () => {
      clearTimeout(timer)
      timer = setTimeout(() => void send(), DELAY_MS)
    },
    /** The page is closing: what's waiting, sent anyway. */
    last: () => {
      const id = useSaved.getState().activeId
      const book = store.getState().books[id ?? '']
      if (!id || !timer || !book?.pending.length) return
      void fetch(`/api/trips/${id}/${path}`, {
        method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: changed(book) }),
      })
    },
  }
}
const journalSync = bookSync(useJournal, 'journal')
const itemsSync = bookSync(useItems, 'items')
setJournalSync(journalSync.soon)
setItemsSync(itemsSync.soon)
// Notes this browser kept with its trip before items: into the trip's items.
if (!SHARED_TOKEN) useItems.getState().takeNotes(localNotes)

// Save after edits to the trip or its chat.
useTrip.subscribe((s, prev) => {
  if (s.input !== prev.input || s.stops !== prev.stops || s.plans !== prev.plans || s.activePlanId !== prev.activePlanId || s.readOnly !== prev.readOnly) changed()
})
useChat.subscribe((s, prev) => {
  if (!s.busy && (s.messages !== prev.messages || s.contents !== prev.contents)) changed()
})

// Don't lose the last edit when the page closes.
if (typeof window !== 'undefined') {
  // A save that failed for want of a connection: send it when the connection is back.
  window.addEventListener('online', () => {
    void flush()
    void journalSync.send()
    void itemsSync.send()
  })
  window.addEventListener('pagehide', () => {
    // The journal's and items' last changes, if not sent yet.
    journalSync.last()
    itemsSync.last()
    const id = useSaved.getState().activeId
    if (!id || !dirty) return
    void fetch(`/api/trips/${id}`, {
      method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: tripData(), chat: chatData() }),
    })
  })
}

// ---------------------------------------------------------------- the assistant's runs on the server (worker/runs.ts)

type Run = { id: string; text: string; created: number; status: 'running' | 'done' | 'stopped' | 'failed'; version: number; error: string | null; reply: { spent?: Spent } | null }
/** How often the page asks how a run is going. */
const POLL_MS = 1500
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Follows a run on the open trip until it ends: what it has used so far, the trip each time it changes, and at the
 *  end the trip and chat as saved. Stops following (not the run) when another trip is opened. */
let following: string | null = null
async function follow(tripId: string, run: Run) {
  // (Already following it: the trip was opened again meanwhile.)
  if (following === run.id) return
  following = run.id
  useChat.setState({ busy: true, runId: run.id, spent: run.reply?.spent ?? NO_SPENT, startedAt: run.created })
  let version = run.version
  let misses = 0
  while (useSaved.getState().activeId === tripId) {
    await sleep(POLL_MS)
    if (useSaved.getState().activeId !== tripId) break
    let now: { run: Run; data?: TripData }
    try {
      now = await call('GET', `/api/runs/${run.id}?since=${version}`)
      misses = 0
    } catch {
      // Offline for a moment (the run goes on): keep asking, less often.
      await sleep(Math.min(30_000, 2_000 * ++misses))
      continue
    }
    if (now.run.reply?.spent) useChat.setState({ spent: now.run.reply.spent })
    if (now.data && now.run.status === 'running') {
      applying = true
      useTrip.getState().openTrip(now.data!, true)
      applying = false
    }
    version = now.run.version
    if (now.run.status === 'running') continue
    // It ended: the trip and the chat with its reply, as saved.
    try {
      const trip = await call('GET', `/api/trips/${tripId}`)
      if (useSaved.getState().activeId !== tripId) break
      show(tripId, trip.data, trip.chat, true, { journal: trip.journal, items: trip.items }, trip.rev)
      // It died before saving its reply (the runner stopped answering): keep the question, with the error and Try
      // again, in the chat (saved as usual).
      const last = useChat.getState().messages.at(-1)
      if (now.run.status === 'failed' && !(last?.role === 'assistant' && last.error)) {
        const failed: ChatMessage = { role: 'assistant', text: '', steps: [], changes: [], error: now.run.error ?? 'The assistant failed to answer: try again.' }
        useChat.setState({ busy: false, runId: null, messages: [...useChat.getState().messages, { role: 'user', text: now.run.text }, failed] })
      }
    } catch (e) {
      useSaved.setState({ status: 'error', error: (e as Error).message })
    }
    break
  }
  following = null
  useChat.setState({ busy: false, runId: null })
}

setServerRuns({
  send: async (text, view, { think, plan }) => {
    const tripId = useSaved.getState().activeId
    if (!tripId) return false
    // The run starts from the trip and chat as on screen (sent with it, so no save is needed first).
    clearTimeout(timer)
    timer = undefined
    dirty = false
    const chat = chatData()
    const asked: ChatMessage = { role: 'user', text: text.trim(), ...(view.length && { view: view.map((v) => v.label) }) }
    useChat.setState({ busy: true, note: null, spent: NO_SPENT, startedAt: Date.now(), messages: [...chat.messages, asked] })
    const { currency, tempUnit, tempFeels } = useTrip.getState()
    const res = await fetch('/api/runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId, text, view, think, plan, display: { currency, tempUnit, tempFeels }, data: tripData(), chat, rev }),
    }).catch(() => null)
    const body = (await res?.json().catch(() => null)) as { run?: Run; error?: string; changed?: boolean } | null
    // Another app changed the trip since it was put on screen: show it as it is now (asking again starts from it).
    if (body?.changed) void checkOutside()
    // No runner on the server (yet): answer here instead.
    if (res?.status === 503) {
      useChat.setState({ busy: false, messages: chat.messages, note: chat.note })
      return false
    }
    if (!res?.ok || !body?.run) {
      if (res?.status === 401) useAccount.getState().signedOut()
      const error = body?.error ?? (res ? `The assistant couldn't start (${res.status}).` : 'The assistant isn\'t reachable: check your network.')
      const failed: ChatMessage = { role: 'assistant', text: '', steps: [], changes: [], error, think, ...(plan && { plan }) }
      useChat.setState({ busy: false, note: chat.note, messages: [...chat.messages, asked, failed] })
      return true
    }
    await follow(tripId, body.run)
    return true
  },
  stop: (runId) => void call('POST', `/api/runs/${runId}/stop`).catch(() => {}),
})

/** After sign-in: list the trips and open one. The trip planned before signing in is added to the account first. */
async function signedIn() {
  useSaved.setState({ status: 'loading', error: null })
  try {
    const { trips, lastId } = (await call('GET', '/api/trips')) as { trips: TripSummary[]; lastId: string | null }
    useSaved.setState({ trips })
    const local = remembered()
    // Edits made on this device while offline (or before a reload): sent first, so reloading the trip keeps them.
    if (local && unsaved() === local && trips.some((t) => t.id === local)) {
      useSaved.setState({ activeId: local })
      dirty = true
    }
    if (local && trips.some((t) => t.id === local)) {
      // This browser already shows a saved trip: keep it on screen (it may have unsaved edits) and refresh from the server.
      await useSaved.getState().open(local, true)
    } else if (hasContent() || !trips.length) {
      // A trip planned while signed out (or a first sign-in): keep it as a new trip in the account.
      const created: TripSummary = await call('POST', '/api/trips', { name: 'My trip', data: tripData(), chat: chatData() })
      useSaved.setState({ trips: [created, ...trips], activeId: created.id, status: 'saved' })
      remember(created.id)
      seen(created.id, created.rev)
      // (Its journal and items too, written signed out.)
      useJournal.getState().adopt(created.id)
      useItems.getState().adopt(created.id)
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
  setDirty(false)
  remember(null)
  rev = undefined
  useOutside.setState({ from: null, changes: [], error: null })
  useSaved.setState({ trips: [], activeId: null, status: 'idle', error: null })
  applying = true
  useTrip.getState().openTrip(null)
  useChat.getState().clear()
  applying = false
  useJournal.getState().clear()
  useItems.getState().clear()
}

useAccount.subscribe((s, prev) => {
  // A shared trip's page shows that trip only: the visitor's own trips stay as they are.
  if (SHARED_TOKEN) return
  // Offline: the trip on screen is the saved one this browser showed last, so its edits are marked unsaved.
  if (s.offline && !prev.offline && !s.user && remembered()) {
    useSaved.setState({ activeId: remembered(), status: unsaved() === remembered() ? 'offline' : 'idle' })
    dirty = unsaved() === remembered()
    useJournal.getState().open(remembered()!)
    useItems.getState().open(remembered()!)
  }
  // Back online but signed out (the session ended meanwhile): the edits stay marked, sent at the next sign-in.
  if (prev.offline && !s.offline && !s.user) useSaved.setState({ activeId: null, status: 'idle' })
  if (s.user?.sub === prev.user?.sub) return
  if (s.user) void signedIn()
  else if (prev.user) signedOut()
})

// ---------------------------------------------------------------- other apps' changes (worker/changes.ts)

type Outside = {
  /** The version of the trip before the changes listed; they're the changes since. */
  from: number | null
  changes: OutsideChange[]
  /** Undoing them. */
  undoing: boolean
  error: string | null
}
export const useOutside = create<Outside>()(() => ({ from: null, changes: [], undoing: false, error: null }))

/** How often the page checks for other apps' changes while it's in view. */
const CHECK_MS = 15_000
/** The version of each trip this browser showed last (across reloads, so changes made meanwhile are listed). */
const SEEN_KEY = 'rtw-map-seen-rev'
const seenRevs = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}
const lastSeen = (id: string): number | undefined => seenRevs()[id]
/** The trip on screen is now of version `at`; kept for the next visit (from before the changes still listed). */
function seen(id: string, at: number | undefined) {
  rev = at
  if (at === undefined) return
  try {
    const keep = Object.fromEntries(Object.entries({ ...seenRevs(), [id]: useOutside.getState().from ?? at }).slice(-50))
    localStorage.setItem(SEEN_KEY, JSON.stringify(keep))
  } catch {
    // Storage unavailable: changes made while the page was closed just aren't listed.
  }
}

/** Lists the changes other apps made to the open trip since version `from` (still on). */
async function listOutside(id: string, from: number) {
  const now = (await call('GET', `/api/trips/${id}/changes?since=${from}`).catch(() => null)) as { changes: OutsideChange[] } | null
  if (!now || useSaved.getState().activeId !== id) return
  const changes = now.changes.filter((c) => !c.undone).reverse()
  useOutside.setState({ from: changes.length ? from : null, changes })
  seen(id, rev)
}

let checking = false
/** Whether another app has changed the open trip since it was put on screen: if so, it's put on screen again as it
 *  is now, and the changes listed (`force`: even when they can't be, after a refused save). */
async function checkOutside(force = false) {
  const id = useSaved.getState().activeId
  if (!id || checking || (rev === undefined && !force) || useChat.getState().busy || useAccount.getState().offline) return
  checking = true
  try {
    const at = rev
    const now = (await call('GET', `/api/trips/${id}/changes?since=${at ?? 0}`)) as { rev: number; changes: OutsideChange[] }
    if (useSaved.getState().activeId !== id || useChat.getState().busy || (!force && (at === undefined || now.rev <= at))) return
    // Edits here not saved yet: saved first (refused if another app changed the trip: then it's checked again, and
    // shown as it is now).
    if (dirty) {
      checking = false
      return void (await flush())
    }
    const trip = (await call('GET', `/api/trips/${id}`)) as { data: TripData | null; rev: number }
    if (useSaved.getState().activeId !== id || dirty || useChat.getState().busy) return
    applying = true
    useTrip.getState().openTrip(trip.data, true)
    applying = false
    const from = useOutside.getState().from ?? at ?? null
    if (from !== null) useOutside.setState({ from })
    seen(id, trip.rev)
    if (from !== null) await listOutside(id, from)
  } catch {
    // Offline for a moment: checked again later.
  } finally {
    checking = false
  }
}

/** The changes listed, seen: not listed any more. */
export function dismissOutside() {
  useOutside.setState({ from: null, changes: [], error: null })
  const id = useSaved.getState().activeId
  if (id) seen(id, rev)
}

/** Undoes the changes listed (the first, with all after it): the trip is put back as it was before them. */
export async function undoOutside() {
  const id = useSaved.getState().activeId
  const first = useOutside.getState().changes[0]
  if (!id || !first || useOutside.getState().undoing) return
  await flush()
  useOutside.setState({ undoing: true, error: null })
  try {
    await call('POST', `/api/trips/${id}/changes/${first.id}/undo`)
    useOutside.setState({ from: null, changes: [], undoing: false })
    await checkOutside(true)
  } catch (e) {
    useOutside.setState({ undoing: false, error: (e as Error).message })
  }
}

if (typeof window !== 'undefined' && !SHARED_TOKEN) {
  const check = () => {
    if (document.visibilityState === 'visible') void checkOutside()
  }
  document.addEventListener('visibilitychange', check)
  window.addEventListener('focus', check)
  setInterval(check, CHECK_MS)
}
