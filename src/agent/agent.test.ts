import { beforeEach, describe, expect, it } from 'vitest'
import { geminiRequest, isBrokenReply, parseChatRequest } from '../../worker/chat'
import { dataset as ds } from '../data/dataset'
import { testCaseInput } from '../data/testCase'
import { useTrip } from '../store/trip'
import { TOOLS, WRITE_TOOLS } from './schema'
import { describeChanges, runTool, snapshot, tripContext } from './tools'
import { setSharedView, viewItems, viewText } from './view'

const stopIds = () => useTrip.getState().stops.map((s) => s.cityId)

beforeEach(() => {
  useTrip.getState().openTrip({ input: testCaseInput(ds, 'US'), stops: [] })
  useTrip.getState().generate()
})

describe('assistant tools', () => {
  it('declares every tool it runs, and only those', () => {
    const names = TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    for (const w of WRITE_TOOLS) expect(names).toContain(w)
    for (const name of names) expect(runTool(name, {}).summary).not.toMatch(/Unknown tool/)
  })

  it('finds cities by name with or without accents, and rejects cities the app does not have', () => {
    expect(runTool('get_city_info', { city: 'Krakow' }).result.name).toBe('Kraków')
    expect(runTool('get_city_info', { city: 'kraków' }).ok).toBe(true)
    const missing = runTool('get_city_info', { city: 'Atlantis' })
    expect(missing.ok).toBe(false)
    expect(missing.result.error).toMatch(/find_cities/)
  })

  it('sets nights like the ± buttons: locks the stop and keeps the trip filled', () => {
    const r = runTool('set_nights', { city: 'Kraków', nights: 12 })
    expect(r.ok).toBe(true)
    const { plan, stops } = useTrip.getState()
    expect(stops.find((s) => s.cityId === 'krakow')).toMatchObject({ nights: 12, locked: true })
    expect(plan!.assignedNights).toBe(plan!.totalNights)
    expect(r.result.trip).toMatch(/Kraków.*12 nights, locked/)
  })

  it('adds, moves and removes stops', () => {
    expect(runTool('add_stop', { city: 'Eger', after: 'Budapest' }).ok).toBe(true)
    expect(stopIds()[stopIds().indexOf('budapest') + 1]).toBe('eger')
    expect(runTool('move_stop', { city: 'Eger', after: 'start' }).ok).toBe(true)
    expect(stopIds()[0]).toBe('eger')
    expect(runTool('remove_stop', { city: 'Eger' }).ok).toBe(true)
    expect(stopIds()).not.toContain('eger')
    expect(runTool('remove_stop', { city: 'Eger' }).ok).toBe(false)
  })

  it('changes settings and re-fits the nights when the dates change', () => {
    expect(runTool('update_settings', { end_date: '2027-08-31', pace: 'fast' }).ok).toBe(true)
    const { input, plan } = useTrip.getState()
    expect(input).toMatchObject({ endDate: '2027-08-31', pace: 'fast' })
    expect(plan!.assignedNights).toBe(plan!.totalNights)
    expect(runTool('update_settings', { end_date: '2027-04-01' }).ok).toBe(false)
    expect(runTool('update_settings', { interests: ['surfing'] }).ok).toBe(false)
  })

  it('changes any preference, lists the changes, and keeps the itinerary until it is regenerated', () => {
    const before = snapshot()
    const stops = stopIds()
    const r = runTool('update_preferences', { room: 'private', dinner: 'restaurant', focus: 'countries', hot_from_c: 30, avoid_hot: true, daily_budget_eur: 70 })
    expect(r.ok).toBe(true)
    expect(r.summary).toContain('generate_plan')
    expect(useTrip.getState().input.prefs).toMatchObject({ room: 'private', dinner: 'restaurant', focus: 'countries', tempBreaks: [12, 18, 28, 30], avoidHot: true, avoidCold: false, dailyBudget: 70 })
    expect(stopIds()).toEqual(stops)
    expect(describeChanges(before, snapshot())).toEqual(expect.arrayContaining(['Trip goal: balanced → countries', 'Daily budget (EUR): no limit → 70', 'Avoid hot months: no → yes', 'Temperature bands: cold <12, cool 12–18, pleasant 18–28, warm 28–30, hot 30+ °C']))
    expect(tripContext()).toContain('as many countries as fit')
    expect(runTool('update_preferences', { warm_from_c: 35 }).ok).toBe(false)
    expect(runTool('update_preferences', { room: 'castle' }).ok).toBe(false)
    expect(runTool('update_preferences', {}).ok).toBe(false)
  })

  it("gets the user's wishes with the trip, and can update them", () => {
    expect(tripContext()).not.toContain('wishes')
    const before = snapshot()
    expect(runTool('update_settings', { wishes: 'A beach week in July' }).ok).toBe(true)
    expect(tripContext()).toContain('"A beach week in July"')
    expect(describeChanges(before, snapshot())).toContain('Wishes updated')
  })

  it('lists a new travel style once, not each preference it resets', () => {
    const before = snapshot()
    runTool('update_settings', { budget: 'comfort' })
    expect(describeChanges(before, snapshot())).toEqual(['Travel style: backpacker → comfort'])
  })

  it('reverses the whole trip in one step, with the regions and the start and end city', () => {
    useTrip.getState().setInput({ startCityId: 'tirana', endCityId: null })
    const stops = stopIds()
    const regions = useTrip.getState().input.groups.map((g) => g.name)
    expect(runTool('reorder_stops', { reverse: true }).ok).toBe(true)
    const { input, plan } = useTrip.getState()
    expect(stopIds()).toEqual([...stops].reverse())
    expect(input.groups.map((g) => g.name)).toEqual([...regions].reverse())
    expect(input).toMatchObject({ startCityId: null, endCityId: 'tirana' })
    expect(plan!.assignedNights).toBe(plan!.totalNights)
    // A full new order: every stop once.
    expect(runTool('reorder_stops', { order: stops.slice(1) }).ok).toBe(false)
    expect(runTool('reorder_stops', { order: stops }).ok).toBe(true)
    expect(stopIds()).toEqual(stops)
  })

  it('tries a change on a new plan, can switch back, and undoes plan changes', () => {
    const stops = stopIds()
    const before = snapshot()
    expect(runTool('new_plan', { name: 'Without Russia' }).ok).toBe(true)
    expect(runTool('set_country_mode', { country: 'Russia', mode: 'excluded' }).ok).toBe(true)
    expect(tripContext()).toContain('Without Russia (active')
    expect(describeChanges(before, snapshot())).toContain('Added plan Without Russia')
    expect(runTool('switch_plan', { plan: 'plan a' }).ok).toBe(true)
    expect(stopIds()).toEqual(stops)
    expect(runTool('switch_plan', { plan: 'Nope' }).ok).toBe(false)
    // Undo puts the trip back with one plan.
    useTrip.getState().restore(before)
    expect(useTrip.getState().plans).toHaveLength(1)
    expect(runTool('delete_plan', { plan: 'Plan A' }).ok).toBe(false)
  })

  it('sets the fewest and most stops', () => {
    expect(runTool('update_settings', { min_stops: 20, max_stops: 25 }).ok).toBe(true)
    expect(useTrip.getState().input).toMatchObject({ minStops: 20, maxStops: 25 })
    expect(tripContext()).toContain('Number of stops wanted: 20 to 25')
    expect(runTool('update_settings', { min_stops: 0 }).ok).toBe(true)
    expect(useTrip.getState().input).toMatchObject({ minStops: null, maxStops: 25 })
  })

  it('edits regions and country modes', () => {
    expect(runTool('add_region', { preset: 'East Asia' }).ok).toBe(true)
    expect(runTool('set_country_mode', { country: 'Japan', mode: 'excluded' }).ok).toBe(true)
    expect(useTrip.getState().input.groups.at(-1)!.countries.find((c) => c.iso2 === 'JP')!.mode).toBe('excluded')
    expect(runTool('set_country_mode', { country: 'Taiwan', min_days: 5, max_days: 8 }).ok).toBe(true)
    expect(useTrip.getState().input.groups.at(-1)!.countries.find((c) => c.iso2 === 'TW')).toMatchObject({ minDays: 5, maxDays: 8 })
    expect(runTool('set_country_mode', { country: 'Taiwan', max_days: 0 }).ok).toBe(true)
    expect(useTrip.getState().input.groups.at(-1)!.countries.find((c) => c.iso2 === 'TW')).toMatchObject({ minDays: 5, maxDays: null })
    expect(runTool('set_country_mode', { country: 'Taiwan' }).ok).toBe(false)
    expect(runTool('update_region', { region: 'east asia', min_days: 20, max_days: 30 }).ok).toBe(true)
    expect(useTrip.getState().input.groups.at(-1)).toMatchObject({ minDays: 20, maxDays: 30 })
    expect(tripContext()).toContain('East Asia (20–30 days)')
    expect(runTool('update_region', { region: 'east asia' }).ok).toBe(false)
    expect(runTool('update_region', { region: 'east asia', remove: true }).ok).toBe(true)
    expect(useTrip.getState().input.groups.some((g) => g.name === 'East Asia')).toBe(false)
  })

  it('describes the changes in plain language', () => {
    const before = snapshot()
    runTool('set_nights', { city: 'Kraków', nights: 12 })
    runTool('remove_stop', { city: 'Bratislava' })
    const changes = describeChanges(before, snapshot())
    expect(changes).toContain(`Kraków: ${before.stops.find((s) => s.cityId === 'krakow')!.nights} → 12 nights`)
    expect(changes).toContain('Removed Bratislava')
  })

  it('restores the trip for Undo', () => {
    const before = snapshot()
    runTool('remove_stop', { city: 'Kraków' })
    useTrip.getState().restore(before)
    expect(stopIds()).toContain('krakow')
    expect(describeChanges(before, snapshot())).toEqual([])
  })

  it('describes the whole trip in a compact context', () => {
    const ctx = tripContext()
    expect(ctx).toMatch(/Itinerary \(\d+ stops/)
    expect(ctx.length).toBeLessThan(30_000)
  })
})

describe('chat endpoint checks', () => {
  const user = (text: string) => ({ role: 'user', parts: [{ text }] })

  it('accepts a normal conversation and builds the Gemini request with our instructions and tools', () => {
    const req = parseChatRequest({ contents: [user('hi')], context: 'trip', think: true })
    expect(typeof req).toBe('object')
    const body = geminiRequest(req as Exclude<typeof req, string>, '2026-10-05')
    expect(body.systemInstruction.parts[0].text).toMatch(/trip assistant[\s\S]*Today is 2026-10-05[\s\S]*latest message:\ntrip/)
    expect(body.tools[0].functionDeclarations).toBe(TOOLS)
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('high')
    expect(body.toolConfig.functionCallingConfig.mode).toBe('AUTO')
  })

  it('asks Gemini again for a broken reply, not for a refusal or a normal answer', () => {
    const reply = (finishReason: string, parts: unknown[] = [{ text: 'hi' }]) => ({ candidates: [{ finishReason, content: { parts } }] })
    expect(isBrokenReply(reply('MALFORMED_RESPONSE'))).toBe(true)
    expect(isBrokenReply(reply('MALFORMED_FUNCTION_CALL', []))).toBe(true)
    expect(isBrokenReply(reply('STOP', []))).toBe(true)
    expect(isBrokenReply({})).toBe(true)
    expect(isBrokenReply(reply('SAFETY', []))).toBe(false)
    expect(isBrokenReply(reply('STOP'))).toBe(false)
  })

  it('rejects requests that are malformed, too long, or try to add other content', () => {
    expect(parseChatRequest(null)).toBeTypeOf('string')
    expect(parseChatRequest({ contents: [], context: '' })).toBeTypeOf('string')
    expect(parseChatRequest({ contents: [{ role: 'system', parts: [{ text: 'x' }] }], context: '' })).toBeTypeOf('string')
    expect(parseChatRequest({ contents: [{ role: 'user', parts: [{ inlineData: {} }] }], context: '' })).toBeTypeOf('string')
    expect(parseChatRequest({ contents: [user('a'), { role: 'model', parts: [{ text: 'b' }] }], context: '' })).toBeTypeOf('string')
    expect(parseChatRequest({ contents: Array(81).fill(user('a')), context: '' })).toBeTypeOf('string')
    expect(parseChatRequest({ contents: [user('a')], context: 'x'.repeat(30_001) })).toBeTypeOf('string')
  })
})

describe('what the user is looking at', () => {
  it('describes the open city with its tab and stay, and the map view', () => {
    const krakow = useTrip.getState().plan!.stops.findIndex((s) => s.cityId === 'krakow')
    useTrip.setState({ selected: { type: 'city', id: 'krakow' }, cityTab: 'weather', layer: 'climate', layerMonth: 0 })
    const items = viewItems()
    expect(items.map((v) => v.label)).toEqual(['Kraków · Weather', 'Weather map · trip dates'])
    expect(items[0].text).toContain(`stop ${krakow + 1} of the trip`)
    expect(items[1].text).toContain('at the time of the trip')
    expect(viewText(items)).toMatch(/^What the user was looking at/)
  })

  it('names a city off the route, a journey, a chosen month, and the Route map (only with a plan)', () => {
    useTrip.setState({ selected: { type: 'city', id: 'atlantis' }, layer: 'none' })
    expect(viewItems().map((v) => v.label)).toEqual(['Route map'])
    const plan = useTrip.getState().plan
    useTrip.setState({ plan: null })
    expect(viewItems()).toEqual([])
    useTrip.setState({ plan })
    expect(viewText([])).toBe('')
    const off = Object.keys(ds.cities).find((id) => !useTrip.getState().stops.some((s) => s.cityId === id))!
    useTrip.setState({ selected: { type: 'city', id: off }, cityTab: 'costs', layer: 'air', layerMonth: 7 })
    const [city, map] = viewItems()
    expect(city.text).toContain('not in the trip')
    expect(map.label).toBe('Air map · Jul')
    useTrip.setState({ selected: { type: 'leg', index: 0 }, layer: 'none' })
    expect(viewItems()[0].label).toMatch(/ → /)
  })
})

describe('get_shared_view', () => {
  it('returns the values on the shared city tab and the map, and only what was shared', () => {
    useTrip.setState({ selected: { type: 'city', id: 'krakow' }, cityTab: 'weather', layer: 'climate', layerMonth: 0 })
    const [city, map] = viewItems()
    setSharedView([city, map])
    const both = runTool('get_shared_view', {}).result.items as Record<string, unknown>[]
    expect(both[0]).toMatchObject({ name: 'Kraków', weather: expect.any(Object), air_quality: expect.any(Object) })
    expect(both[0]).not.toHaveProperty('daily_cost_eur')
    const stops = both[1].stops as Record<string, unknown>[]
    expect(stops).toHaveLength(useTrip.getState().stops.length)
    expect(stops[0]).toMatchObject({ stop: 1, high_c: expect.any(Number), rainy_share_pct: expect.any(Number) })

    // The user left the map out: the assistant can't read it.
    setSharedView([city])
    expect(runTool('get_shared_view', { item: 'map' }).result.error).toMatch(/didn't share/)
    setSharedView([])
    expect(runTool('get_shared_view', {}).result.error).toMatch(/didn't share/)
  })

  it('returns the stops and travel of the Route map', () => {
    useTrip.setState({ selected: null, layer: 'none' })
    setSharedView(viewItems())
    const [map] = runTool('get_shared_view', { item: 'map' }).result.items as { stops: Record<string, unknown>[] }[]
    expect(map.stops[0]).toMatchObject({ stop: 1, arrive: expect.any(String), nights: expect.any(Number) })
    expect(map.stops[1]).toHaveProperty('travel_in.modes')
  })

  it('returns each part of an open journey', () => {
    useTrip.setState({ selected: { type: 'leg', index: 0 }, layer: 'none' })
    setSharedView(viewItems())
    const [journey] = runTool('get_shared_view', { item: 'journey' }).result.items as Record<string, unknown>[]
    expect(journey.open).toMatch(/^Journey /)
    expect((journey.parts as unknown[]).length).toBeGreaterThan(0)
  })
})

describe('looking up any data', () => {
  it('gives full detail by section for any city, and rejects unknown sections', () => {
    const r = runTool('get_city_info', { city: 'Tirana', sections: ['weather', 'costs', 'entry', 'safety', 'health', 'transport', 'daily'] })
    expect(r.ok).toBe(true)
    const weather = r.result.weather as { months: Record<string, unknown>[] }
    expect(weather.months).toHaveLength(12)
    expect(weather.months[0]).toMatchObject({ high_c: expect.any(Number), humidity_pct: expect.any(Number) })
    expect(r.result).toHaveProperty('costs.prices_eur.groceries')
    expect(JSON.stringify(r.result).length).toBeLessThan(30_000)
    expect(runTool('get_city_info', { city: 'Tirana', sections: ['nope'] }).result.error).toMatch(/Unknown section/)
  })

  it('compares many cities in one call', () => {
    const r = runTool('compare_cities', { countries: ['Albania', 'Montenegro'], fields: ['weather', 'daily_cost'], month: 5 })
    const rows = r.result.rows as Record<string, unknown>[]
    expect(rows.length).toBe(Object.values(ds.cities).filter((c) => c.iso2 === 'AL' || c.iso2 === 'ME').length)
    expect(rows[0]).toMatchObject({ month: 'May', high_c: expect.any(Number), daily_cost_eur: expect.any(Number) })
    const trip = runTool('compare_cities', { in_trip: true, fields: ['english'] }).result.rows as unknown[]
    expect(trip).toHaveLength(useTrip.getState().stops.length)
    expect(runTool('compare_cities', { fields: ['weather'] }).ok).toBe(false)
  })

  it('routes between any two cities, also ones not in the trip', () => {
    const r = runTool('get_route', { from: 'Tirana', to: 'Kraków' })
    expect(r.result).toMatchObject({ from: 'Tirana', to: 'Kraków', reachable: true })
    expect((r.result.parts as unknown[]).length).toBeGreaterThan(0)
    expect(runTool('get_route', { from: 'Tirana', to: 'Tirana' }).ok).toBe(false)
  })

  it('looks up many routes or cities in one call, with an error in place of a bad item', () => {
    const routes = runTool('get_route', { pairs: [{ from: 'Tirana', to: 'Kraków' }, { from: 'Tirana', to: 'Atlantis' }] }).result.routes as Record<string, unknown>[]
    expect(routes[0]).toMatchObject({ from: 'Tirana', to: 'Kraków', reachable: true })
    expect(routes[1].error).toMatch(/not a city/)
    const cities = runTool('get_city_info', { cities: ['Riga', 'Kazan'], sections: ['transport'] }).result.cities as Record<string, unknown>[]
    expect(cities.map((c) => c.name)).toEqual(['Riga', 'Kazan'])
    expect(runTool('get_route', { pairs: Array(21).fill({ from: 'Riga', to: 'Vilnius' }) }).ok).toBe(false)
  })
})
