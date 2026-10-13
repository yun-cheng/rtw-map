import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The browser's storage, before the stores load (they read it as they start).
const stored = vi.hoisted(() => {
  const mem = new Map<string, string>()
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  }
  ;(globalThis as { localStorage?: unknown }).localStorage = storage
  return storage
})

const { useAccount } = await import('../agent/account')
const { useTrip } = await import('./trip')
const { useSaved } = await import('./saved')
const { useJournal } = await import('./journal')
const { mergeJournal } = await import('./journalCore')
const { useItems } = await import('./items')
const { mergeItems } = await import('./itemsCore')
const { usePhrases } = await import('./phrases')

type Call = { method: string; url: string; body: { data?: { input?: { wishes?: string }; notes?: unknown }; entries?: { text?: string; id?: string }[] } | null }
let calls: Call[] = []
/** The requests for the user's phrases (the account's), apart from the trip's. */
let phraseCalls: Call[] = []
/** The server: one trip, "t1", whose saved data is what was last sent to it, and its journal (one day written on
 *  another device). */
function server({ offline = false, notes }: { offline?: boolean; notes?: Record<string, Record<string, string>> } = {}) {
  let saved: unknown = { input: useTrip.getState().input, stops: [], ...(notes && { notes }) }
  let items: Record<string, { id: string; kind: 'stay'; at: string; title?: string; updatedAt: number }> = { 'stay:l': { id: 'stay:l', kind: 'stay', at: 'krakow', title: 'from the laptop', updatedAt: 1 } }
  let journal: Record<string, { date: string; highlight: string; text: string; updatedAt: number }> = { '2027-05-01': { date: '2027-05-01', highlight: '', text: 'on the laptop', updatedAt: 1 } }
  let phrases: Record<string, { id: string; kind: 'phrase'; at: string; title: string; text: string; updatedAt: number }> = { 'phrase:pl:thanks': { id: 'phrase:pl:thanks', kind: 'phrase', at: 'pl', title: 'Thanks', text: 'Dzięki', updatedAt: 1 } }
  calls = []
  phraseCalls = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : null
    ;(url === '/api/phrases' ? phraseCalls : calls).push({ method, url, body })
    if (offline) throw new TypeError('Failed to fetch')
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 })
    if (url === '/api/phrases' && method === 'GET') return json({ phrases })
    if (url === '/api/phrases' && method === 'PUT') {
      phrases = mergeItems(phrases, body.entries) as typeof phrases
      return json({ phrases })
    }
    const summary = { id: 't1', name: 'My trip', startDate: null, endDate: null, stops: 0, updated: Date.now() }
    if (url === '/api/trips' && method === 'GET') return json({ trips: [summary], lastId: 't1' })
    if (url === '/api/trips/t1' && method === 'PUT') {
      saved = body.data
      return json(summary)
    }
    if (url === '/api/trips/t1' && method === 'GET') return json({ data: saved, chat: null, journal, items })
    if (url === '/api/trips/t1/items' && method === 'PUT') {
      items = mergeItems(items, body.entries) as typeof items
      return json({ items })
    }
    if (url === '/api/trips/t1/journal' && method === 'PUT') {
      journal = mergeJournal(journal, body.entries)
      return json({ journal })
    }
    return new Response('{}', { status: 404 })
  })
}
const wishes = () => useTrip.getState().input.wishes

beforeEach(() => {
  stored.clear()
  useAccount.setState({ loaded: false, offline: false, user: null })
  useSaved.setState({ trips: [], activeId: null, status: 'idle', error: null })
  useJournal.getState().clear()
  useItems.getState().clear()
  usePhrases.getState().clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('saved trips, offline', () => {
  it('keeps edits made offline and sends them before reloading the trip from the server', async () => {
    stored.setItem('rtw-map-active-trip', 't1')
    server()
    // Opened with no connection: the trip on screen is the account's, as this browser kept it.
    useAccount.setState({ loaded: true, offline: true })
    expect(useSaved.getState().activeId).toBe('t1')
    useTrip.getState().setInput({ wishes: 'written offline' })
    expect(useSaved.getState().status).toBe('offline')
    expect(stored.getItem('rtw-map-unsaved')).toBe('t1')
    expect(calls).toEqual([])

    // Back online, still signed in: the edit goes up first, then the trip comes back with it.
    useAccount.setState({ offline: false, user: { sub: 'u1', name: 'U' } })
    await vi.waitFor(() => expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET /api/trips', 'PUT /api/trips/t1', 'GET /api/trips/t1']))
    await vi.waitFor(() => expect(useSaved.getState().status).toBe('idle'))
    expect(calls[1].body?.data?.input?.wishes).toBe('written offline')
    expect(wishes()).toBe('written offline')
    expect(stored.getItem('rtw-map-unsaved')).toBeNull()
  })

  it('sends edits left unsaved when the app was closed, at the next sign-in', async () => {
    stored.setItem('rtw-map-active-trip', 't1')
    stored.setItem('rtw-map-unsaved', 't1')
    useTrip.getState().setInput({ wishes: 'from last time' })
    server()
    useAccount.setState({ loaded: true, user: { sub: 'u1', name: 'U' } })
    await vi.waitFor(() => expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT', 'GET']))
    expect(calls[1].body?.data?.input?.wishes).toBe('from last time')
    await vi.waitFor(() => expect(wishes()).toBe('from last time'))
  })

  it('marks a save that found no connection as offline, not failed', async () => {
    stored.setItem('rtw-map-active-trip', 't1')
    server()
    useAccount.setState({ loaded: true, user: { sub: 'u1', name: 'U' } })
    await vi.waitFor(() => expect(useSaved.getState().activeId).toBe('t1'))
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    server({ offline: true })
    useTrip.getState().setInput({ wishes: 'on a bus' })
    await vi.waitFor(() => expect(useSaved.getState().status).toBe('offline'), { timeout: 3000 })
    expect(stored.getItem('rtw-map-unsaved')).toBe('t1')
  })

  it("sends the journal's days written offline when back online, merged with those written elsewhere", async () => {
    stored.setItem('rtw-map-active-trip', 't1')
    server()
    useAccount.setState({ loaded: true, offline: true })
    useJournal.getState().write('2027-05-02', { text: 'on the phone, offline' })
    await new Promise((r) => setTimeout(r, 1700))
    expect(calls).toEqual([])

    useAccount.setState({ offline: false, user: { sub: 'u1', name: 'U' } })
    await vi.waitFor(() => expect(calls.map((c) => `${c.method} ${c.url}`)).toContain('PUT /api/trips/t1/journal'))
    expect(calls.find((c) => c.url.endsWith('/journal'))?.body?.entries?.map((e) => e.text)).toEqual(['on the phone, offline'])
    await vi.waitFor(() => expect(useJournal.getState().books.t1.pending).toEqual([]))
    const { entries } = useJournal.getState().books.t1
    expect(Object.values(entries).map((e) => e.text).sort()).toEqual(['on the laptop', 'on the phone, offline'])
  })

  it("sends a stay added offline when back online, and moves the notes kept with the trip's data into items", async () => {
    stored.setItem('rtw-map-active-trip', 't1')
    server({ notes: { cities: { krakow: 'Ana: +48 …' } } })
    useAccount.setState({ loaded: true, offline: true })
    useItems.getState().put({ id: 'stay:p', kind: 'stay', at: 'krakow', title: 'from the phone' })
    await new Promise((r) => setTimeout(r, 1700))
    expect(calls).toEqual([])

    useAccount.setState({ offline: false, user: { sub: 'u1', name: 'U' } })
    await vi.waitFor(() => expect(useItems.getState().books.t1?.pending).toEqual([]))
    const sent = calls.filter((c) => c.url.endsWith('/items')).flatMap((c) => c.body?.entries?.map((e) => e.id) ?? [])
    expect(sent.sort()).toEqual(['note:krakow', 'stay:p'])
    const { entries } = useItems.getState().books.t1
    expect(Object.keys(entries).sort()).toEqual(['note:krakow', 'stay:l', 'stay:p'])
    // The trip's data is saved without them at its next change.
    useTrip.getState().setInput({ wishes: 'slow' })
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.url === '/api/trips/t1' && c.body?.data?.input?.wishes === 'slow')).toBe(true), { timeout: 3000 })
    expect(calls.findLast((c) => c.url === '/api/trips/t1' && c.method === 'PUT')?.body?.data).not.toHaveProperty('notes')
  })

  it("keeps the user's phrases with the account: those written signed out go to it at sign-in, with the account's", async () => {
    server()
    usePhrases.getState().put({ id: 'phrase:mk:thanks', kind: 'phrase', at: 'mk', title: 'Thanks', text: 'Благодарам' })
    await new Promise((r) => setTimeout(r, 1700))
    expect(phraseCalls).toEqual([])

    useAccount.setState({ loaded: true, user: { sub: 'u1', name: 'U' } })
    await vi.waitFor(() => expect(usePhrases.getState().books.account?.pending).toEqual([]))
    expect(phraseCalls.map((c) => c.method)).toEqual(['GET', 'PUT'])
    expect(phraseCalls[1].body?.entries?.map((e) => e.id)).toEqual(['phrase:mk:thanks'])
    expect(Object.keys(usePhrases.getState().books.account.entries).sort()).toEqual(['phrase:mk:thanks', 'phrase:pl:thanks'])
    // Not the trip's.
    expect(calls.some((c) => c.url.endsWith('/items'))).toBe(false)
    // Signed out: forgotten on this browser.
    useAccount.setState({ user: null })
    expect(usePhrases.getState().books).toEqual({})
  })
})
