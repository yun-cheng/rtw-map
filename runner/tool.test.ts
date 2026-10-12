import { describe, expect, it } from 'vitest'
import { MCP_TOOLS, RUNNER_TOOLS } from '../src/agent/mcpTools'
import { WRITE_TOOLS } from '../src/agent/schema'
import { dataset as ds } from '../src/data/dataset'
import { draftStops, testCaseInput } from '../src/data/testCase'
import type { Items } from '../src/store/itemsCore'
import type { Journal } from '../src/store/journalCore'
import { createTripStore, tripData } from '../src/store/tripCore'
import { callTool, parseToolCall } from './tool'

/** A trip as saved: the test case with its drafted stops. Drafted once (it's slow), a fresh copy each time. */
let drafted: ReturnType<typeof tripData> | undefined
function savedTrip() {
  if (!drafted) {
    const store = createTripStore(null)
    store.getState().setInput(testCaseInput(ds, 'US'))
    store.getState().setStops(draftStops(ds, store.getState().input))
    drafted = tripData(store.getState())
  }
  return structuredClone(drafted)
}

const call = (name: string, args: Record<string, unknown> = {}, extra: unknown = null) =>
  callTool({ name, args, trip: { id: 't1', name: 'Europe' }, data: savedTrip(), extra })

describe('tools for other apps (MCP)', () => {
  it('offers the assistant\'s tools, each marked whether it changes the trip', () => {
    for (const t of MCP_TOOLS) {
      expect(t.annotations.readOnlyHint).toBe(!WRITE_TOOLS.has(t.name) && t.name !== 'undo')
      expect(t.inputSchema.type).toBe('object')
      expect(t.title).toBeTruthy()
    }
    expect(MCP_TOOLS.map((t) => t.name).sort()).toEqual(['list_trips', 'get_changes', 'undo', ...Object.keys(RUNNER_TOOLS)].sort())
    for (const name of WRITE_TOOLS) expect(RUNNER_TOOLS[name]).toEqual({ trip: true, write: true })
    expect(parseToolCall({ name: 'undo', args: {} })).toBeNull()
    expect(parseToolCall({ name: 'get_trip', args: [] })).toBeNull()
  })

  it('changes the trip it was sent: the trip after, and what changed', () => {
    const was = createTripStore(savedTrip()).getState().stops
    const out = call('set_nights', { city: ds.cities[was[0].cityId].name, nights: was[0].nights + 2 })
    expect(out.ok).toBe(true)
    expect(out.changes).toEqual([`${ds.cities[was[0].cityId].name}: ${was[0].nights} → ${was[0].nights + 2} nights`])
    expect(out.data!.stops[0].nights).toBe(was[0].nights + 2)
    expect(out.result).toMatchObject({ trip: 'Europe', done: expect.stringContaining('nights'), description: expect.stringContaining('Dates:') })
    // Nothing to save when nothing changed, nor when the change is refused.
    const same = call('set_nights', { city: ds.cities[was[0].cityId].name, nights: was[0].nights })
    expect(same).toMatchObject({ ok: true, result: { done: expect.stringMatching(/no change/) } })
    expect(same.data).toBeUndefined()
    const locked = callTool({ name: 'remove_stop', args: { city: was[0].cityId }, trip: { id: 't1', name: 'Europe' }, data: { ...savedTrip(), readOnly: true }, extra: null })
    expect(locked).toMatchObject({ ok: false, result: { error: expect.stringMatching(/read-only/) } })
    expect(locked.data).toBeUndefined()
  })

  it('describes the trip it was sent, and looks up cities without one', () => {
    const trip = call('get_trip', { trip: 'Europe' })
    expect(trip.ok).toBe(true)
    expect(trip.result).toMatchObject({ trip: 'Europe', description: expect.stringContaining('Dates:') })
    expect((trip.result.itinerary as { stops: unknown[] }).stops.length).toBeGreaterThan(3)
    const city = callTool({ name: 'get_city_info', args: { city: 'Krakow' }, trip: null, data: null, extra: null })
    expect(city.result.name).toBe('Kraków')
    expect(call('get_city_info', { city: 'Atlantis' })).toMatchObject({ ok: false, result: { error: expect.stringMatching(/find_cities/) } })
  })

  it('lists My visit in the trip\'s order, without removed or empty items, by city if asked', () => {
    const stops = createTripStore(savedTrip()).getState().stops.map((s) => s.cityId)
    const [first, second] = stops
    const items: Items = {
      a: { id: 'a', kind: 'link', at: second, title: 'Museum', url: 'https://example.com', updatedAt: 1 },
      b: { id: 'b', kind: 'stay', at: first, title: 'Hostel One', address: 'Main St 1', from: '2027-05-01', to: '2027-05-04', updatedAt: 2 },
      c: { id: 'c', kind: 'note', at: `${first}>${second}`, text: 'Train at 9', updatedAt: 3 },
      d: { id: 'd', kind: 'stay', at: first, title: 'Gone', updatedAt: 4, deleted: true },
      e: { id: 'e', kind: 'album', at: second, updatedAt: 5 },
    }
    const all = call('get_visit', {}, items).result.items as { where: string; kind: string; title?: string; check_in?: string }[]
    expect(all.map((i) => i.kind)).toEqual(['stay', 'note', 'link'])
    expect(all[0]).toMatchObject({ where: ds.cities[first].name, title: 'Hostel One', check_in: '2027-05-01' })
    expect(all[1].where).toBe(`${ds.cities[first].name} → ${ds.cities[second].name}`)
    const one = call('get_visit', { city: ds.cities[second].name }, items).result.items as unknown[]
    expect(one).toHaveLength(2)
    expect(call('get_visit', {}, null).result).toMatchObject({ items: [], note: expect.stringMatching(/Nothing/) })
  })

  it('reads the journal: the latest days, or those asked for', () => {
    const journal: Journal = {}
    for (let d = 1; d <= 70; d++) {
      const date = `2027-0${d <= 31 ? 5 : d <= 61 ? 6 : 7}-${String(d <= 31 ? d : d <= 61 ? d - 31 : d - 61).padStart(2, '0')}`
      journal[date] = { date, cityId: 'krakow', highlight: `Day ${d}`, text: '', updatedAt: d }
    }
    journal['2027-04-30'] = { date: '2027-04-30', highlight: '', text: '', updatedAt: 1 }
    const latest = call('get_journal', {}, journal).result as { days: { date: string; city: string }[]; earlier: string }
    expect(latest.days).toHaveLength(60)
    expect(latest.days.at(-1)).toMatchObject({ date: '2027-07-09', city: 'Kraków' })
    expect(latest.earlier).toMatch(/^10 earlier/)
    const range = call('get_journal', { from: '2027-05-30', to: '2027-06-02' }, journal).result as { days: { highlight: string }[] }
    expect(range.days.map((d) => d.highlight)).toEqual(['Day 30', 'Day 31', 'Day 32', 'Day 33'])
  })
})
