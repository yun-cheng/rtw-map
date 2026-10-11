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

type Call = { method: string; url: string; body: { data?: { input?: { wishes?: string } } } | null }
let calls: Call[] = []
/** The server: one trip, "t1", whose saved data is what was last sent to it. */
function server({ offline = false } = {}) {
  let saved: unknown = { input: useTrip.getState().input, stops: [] }
  calls = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ method, url, body })
    if (offline) throw new TypeError('Failed to fetch')
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 })
    const summary = { id: 't1', name: 'My trip', startDate: null, endDate: null, stops: 0, updated: Date.now() }
    if (url === '/api/trips' && method === 'GET') return json({ trips: [summary], lastId: 't1' })
    if (url === '/api/trips/t1' && method === 'PUT') {
      saved = body.data
      return json(summary)
    }
    if (url === '/api/trips/t1' && method === 'GET') return json({ data: saved, chat: null })
    return new Response('{}', { status: 404 })
  })
}
const wishes = () => useTrip.getState().input.wishes

beforeEach(() => {
  stored.clear()
  useAccount.setState({ loaded: false, offline: false, user: null })
  useSaved.setState({ trips: [], activeId: null, status: 'idle', error: null })
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
})
