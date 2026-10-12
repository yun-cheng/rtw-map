import { describe, expect, it } from 'vitest'
import { MCP_TOOLS, RUNNER_TOOLS } from '../src/agent/mcpTools'
import { WRITE_TOOLS } from '../src/agent/schema'
import { dataset as ds } from '../src/data/dataset'
import { draftStops, testCaseInput } from '../src/data/testCase'
import type { Items } from '../src/store/itemsCore'
import type { Journal } from '../src/store/journalCore'
import { createTripStore, tripData } from '../src/store/tripCore'
import { callTool, parseToolCall } from './tool'

/** A trip as saved: the test case with its drafted stops. */
function savedTrip() {
  const store = createTripStore(null)
  store.getState().setInput(testCaseInput(ds, 'US'))
  store.getState().setStops(draftStops(ds, store.getState().input))
  return tripData(store.getState())
}

const call = (name: string, args: Record<string, unknown> = {}, extra: unknown = null) =>
  callTool({ name, args, trip: { id: 't1', name: 'Europe' }, data: savedTrip(), extra })

describe('tools for other apps (MCP)', () => {
  it('offers only tools that read', () => {
    for (const t of MCP_TOOLS) {
      expect(WRITE_TOOLS.has(t.name)).toBe(false)
      expect(t.annotations.readOnlyHint).toBe(true)
      expect(t.inputSchema.type).toBe('object')
    }
    expect(MCP_TOOLS.map((t) => t.name).sort()).toEqual(['list_trips', ...Object.keys(RUNNER_TOOLS)].sort())
    expect(parseToolCall({ name: 'remove_stop', args: {} })).toBeNull()
    expect(parseToolCall({ name: 'get_trip', args: [] })).toBeNull()
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
