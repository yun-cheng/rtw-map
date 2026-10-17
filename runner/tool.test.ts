import { describe, expect, it } from 'vitest'
import { MCP_TOOLS, RUNNER_TOOLS } from '../src/agent/mcpTools'
import { ITEM_TOOLS, WRITE_TOOLS } from '../src/agent/schema'
import { dataset as ds } from '../src/data/dataset'
import { draftStops, testCaseInput } from '../src/data/testCase'
import { NO_PLACE, type Items } from '../src/store/itemsCore'
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
      expect(t.annotations.readOnlyHint).toBe(!WRITE_TOOLS.has(t.name) && !ITEM_TOOLS.has(t.name) && t.name !== 'undo')
      expect(t.inputSchema.type).toBe('object')
      expect(t.title).toBeTruthy()
    }
    expect(MCP_TOOLS.map((t) => t.name).sort()).toEqual(['list_trips', 'get_changes', 'undo', ...Object.keys(RUNNER_TOOLS)].sort())
    for (const name of WRITE_TOOLS) expect(RUNNER_TOOLS[name]).toEqual({ trip: true, write: true })
    for (const name of ITEM_TOOLS) expect(RUNNER_TOOLS[name]).toEqual({ trip: true, extra: 'items', write: true })
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

  it('saves a booking to My visit: the items changed, not the trip', () => {
    const [first, second] = createTripStore(savedTrip()).getState().stops.map((s) => s.cityId)
    const [from, to] = [ds.cities[first].name, ds.cities[second].name]
    const ticket = { kind: 'ticket', city: from, journey_to: to, title: 'LOT LO 335', mode: 'flight', departs: '2027-05-04T07:35', arrives: '2027-05-04T09:10', from_place: 'KRK T1', reference: 'X7Y8Z9' }
    const out = call('save_visit_item', ticket, {})
    expect(out).toMatchObject({ ok: true, changes: [`Added ticket LOT LO 335 (${from} → ${to})`] })
    expect(out.data).toBeUndefined()
    expect(out.items).toEqual([expect.objectContaining({ kind: 'ticket', at: `${first}>${second}`, title: 'LOT LO 335', mode: 'flight', from: '2027-05-04T07:35', to: '2027-05-04T09:10', fromPlace: 'KRK T1', ref: 'X7Y8Z9', ai: true })])
    // Marked as filled in by AI only when it changes something: one the user typed, saved again as it is, isn't.
    const { ai: _, ...typed } = out.items![0]
    expect(call('save_visit_item', ticket, { [typed.id]: typed }).result.done).toMatch(/no change/)
    // Listed with its times; saved again as it is, no change.
    const items = { [out.items![0].id]: out.items![0] }
    expect(call('get_visit', {}, items).result.items).toEqual([expect.objectContaining({ kind: 'ticket', departs: '2027-05-04T07:35', arrives: '2027-05-04T09:10', from_place: 'KRK T1' })])
    const again = call('save_visit_item', { id: out.items![0].id, title: 'LOT LO 335', reference: 'X7Y8Z9' }, items)
    expect(again).toMatchObject({ ok: true, result: { done: expect.stringMatching(/no change/) } })
    expect(again.items).toBeUndefined()
    // Added again (the same reference, the same day): that one, changed.
    expect(call('save_visit_item', ticket, items).result.done).toMatch(/no change/)
    expect(call('save_visit_item', { ...ticket, text: 'Seat 12A' }, items).items).toEqual([expect.objectContaining({ id: out.items![0].id, text: 'Seat 12A' })])
    expect(call('save_visit_item', { ...ticket, reference: 'OTHER1' }, items).items![0].id).not.toBe(out.items![0].id)
    // A ticket is a journey's, with times; a stay a city's, with days.
    expect(call('save_visit_item', { ...ticket, journey_to: undefined }, {}).result.error).toMatch(/for a journey/)
    expect(call('save_visit_item', { ...ticket, departs: '4 May 07:35' }, {}).result.error).toMatch(/departs must be/)
    expect(call('save_visit_item', { ...ticket, arrives: '2027-05-03T23:00' }, {}).result.error).toMatch(/arrives must be after departs/)
    expect(call('save_visit_item', { ...ticket, mode: 'rocket' }, {}).result.error).toMatch(/mode must be/)
    expect(call('save_visit_item', { kind: 'stay', city: from, title: 'Hostel', departs: '2027-05-04' }, {}).result.error).toMatch(/departs isn't for a stay/)
  })

  it('logs an expense: in the city\'s money unless another is given, once', () => {
    const [first] = createTripStore(savedTrip()).getState().stops.map((s) => s.cityId)
    const city = ds.cities[first].name
    const own = ds.countries[ds.cities[first].iso2].currency
    const expense = { kind: 'expense', city, title: 'Dinner', amount: 120.555, day: '2027-05-04' }
    const out = call('save_visit_item', expense, {})
    expect(out).toMatchObject({ ok: true, changes: [`Added expense Dinner, 120.56 ${own} (${city})`] })
    expect(out.items).toEqual([expect.objectContaining({ kind: 'expense', at: first, title: 'Dinner', amount: 120.56, currency: own, from: '2027-05-04' })])
    const items = { [out.items![0].id]: out.items![0] }
    expect(call('get_visit', {}, items).result.items).toEqual([expect.objectContaining({ kind: 'expense', day: '2027-05-04', amount: 120.56, currency: own })])
    // Logged again (the same name, amount and day): that one; another amount is another expense.
    expect(call('save_visit_item', expense, items).result.done).toMatch(/no change/)
    expect(call('save_visit_item', { ...expense, amount: 30 }, items).items![0].id).not.toBe(out.items![0].id)
    expect(call('save_visit_item', { ...expense, currency: 'usd' }, {}).items![0].currency).toBe('USD')
    expect(call('save_visit_item', { ...expense, currency: 'XYZ' }, {}).result.error).toMatch(/No exchange rate for XYZ/)
    expect(call('save_visit_item', { ...expense, amount: -5 }, {}).result.error).toMatch(/amount must be/)
    expect(call('save_visit_item', { ...expense, day: 'today' }, {}).result.error).toMatch(/day must be a day/)
    expect(call('save_visit_item', { ...expense, reference: 'R1' }, {}).result.error).toMatch(/reference isn't for an expense/)
    // (An app with its tool list from before still asks for a receipt.)
    expect(call('save_visit_item', { ...expense, kind: 'receipt' }, {}).items).toEqual([expect.objectContaining({ kind: 'expense', title: 'Dinner' })])
    expect(call('save_visit_item', { kind: 'stay', city, title: 'Hostel', amount: 84 }, {}).result.error).toMatch(/amount isn't for a stay/)
  })

  it('links an expense to its bookings (a package: several), and keeps either without a city', () => {
    const [first] = createTripStore(savedTrip()).getState().stops.map((s) => s.cityId)
    // A ticket for none of the trip's journeys; its id given, to link to.
    const ticket = call('save_visit_item', { kind: 'ticket', title: 'Ryanair FR 1', departs: '2027-05-01' }, {})
    expect(ticket.items).toEqual([expect.objectContaining({ kind: 'ticket', at: NO_PLACE })])
    const id = ticket.items![0].id
    expect(ticket.result.done).toContain(`id ${id}`)
    const items = { [id]: ticket.items![0] }
    const stay = call('save_visit_item', { kind: 'stay', city: ds.cities[first].name, title: 'Hotel Package', check_in: '2027-05-01' }, items).items![0]
    items[stay.id] = stay
    const expense = call('save_visit_item', { kind: 'expense', title: 'Flight and hotel', amount: 40, currency: 'EUR', day: '2027-04-01', bookings: [id, stay.id] }, items)
    expect(expense.items).toEqual([expect.objectContaining({ kind: 'expense', at: NO_PLACE, bookings: [id, stay.id] })])
    expect(call('get_visit', {}, { ...items, [expense.items![0].id]: expense.items![0] }).result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'ticket', where: 'no journey' }), expect.objectContaining({ kind: 'expense', where: 'no city', bookings: [id, stay.id] }),
    ]))
    expect(call('save_visit_item', { kind: 'expense', title: 'Flight', amount: 40, day: '2027-04-01' }, {}).result.error).toMatch(/Give the expense's currency/)
    expect(call('save_visit_item', { kind: 'expense', city: ds.cities[first].name, title: 'Taxi', amount: 9, bookings: ['ticket:nope'] }, items).result.error).toMatch(/no stay or ticket/)
    expect(call('save_visit_item', { kind: 'expense', city: ds.cities[first].name, title: 'Taxi', amount: 9, bookings: [] }, items).items![0].bookings).toBeUndefined()
    expect(call('save_visit_item', { kind: 'note', text: 'x' }, {}).result.error).toBeTruthy()
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
