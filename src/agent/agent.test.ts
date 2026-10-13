import { beforeEach, describe, expect, it, vi } from 'vitest'
import { geminiRequest, isBrokenReply, parseChatRequest } from '../../worker/chat'
import { dataset as ds } from '../data/dataset'
import { draftStops, testCaseInput } from '../data/testCase'
import { useTrip } from '../store/trip'
import { TOOLS, WRITE_TOOLS } from './schema'
import { bindTrip, describeChanges, describeItemChanges, itemsBefore, itemsHandle, runTool, snapshot, toolContext, tripContext, withTrip } from './tools'
import { viewItems, viewText } from './view'

const stopIds = () => useTrip.getState().stops.map((s) => s.cityId)

beforeEach(() => {
  bindTrip(useTrip)
  useTrip.getState().openTrip({ input: testCaseInput(ds, 'US'), stops: [] })
  useTrip.getState().setStops(draftStops(ds, useTrip.getState().input))
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

  it('sets nights and nothing else (the assistant fits the rest), locking only nights the user asked for', () => {
    const before = useTrip.getState()
    const krakow = before.stops.find((s) => s.cityId === 'krakow')!
    const r = runTool('set_nights', { city: 'Kraków', nights: krakow.nights + 3 })
    expect(r.ok).toBe(true)
    const { plan, stops } = useTrip.getState()
    expect(stops.find((s) => s.cityId === 'krakow')).toMatchObject({ nights: krakow.nights + 3, locked: false })
    expect(stops.filter((s) => s.cityId !== 'krakow')).toEqual(before.stops.filter((s) => s.cityId !== 'krakow'))
    expect(plan!.assignedNights).toBe(before.plan!.assignedNights + 3)
    expect(r.result.trip).toMatch(/\d+ of \d+ nights/)
    runTool('set_nights', { city: 'Kraków', nights: 12, lock: true })
    expect(useTrip.getState().stops.find((s) => s.cityId === 'krakow')).toMatchObject({ nights: 12, locked: true })
  })

  it('puts in a whole itinerary, keeping the user\'s locks', () => {
    const r = runTool('set_itinerary', { stops: [{ city: 'Kraków', nights: 40 }, { city: 'Warsaw', nights: 50, lock: true }, { city: 'Gdańsk', nights: 62 }] })
    expect(r.ok).toBe(true)
    expect(useTrip.getState().stops.map((s) => [s.cityId, s.nights, s.locked])).toEqual([['krakow', 40, false], ['warsaw', 50, true], ['gdansk', 62, false]])
    expect(runTool('set_itinerary', { stops: [{ city: 'Kraków', nights: 2 }, { city: 'krakow', nights: 2 }] }).result.error).toMatch(/twice/)
    expect(runTool('set_itinerary', { stops: [{ city: 'Atlantis', nights: 2 }] }).ok).toBe(false)
  })

  it('only reads a read-only trip: changes are refused, and the context says so', () => {
    useTrip.getState().setReadOnly(true)
    const before = stopIds()
    expect(runTool('get_city_info', { city: 'Kraków' }).ok).toBe(true)
    const r = runTool('remove_stop', { city: before[0] })
    expect(r.ok).toBe(false)
    expect(r.result.error).toMatch(/read-only/)
    expect(runTool('update_settings', { pace: 'fast' }).ok).toBe(false)
    expect(stopIds()).toEqual(before)
    expect(tripContext()).toMatch(/read-only/)
  })

  it('changes a trip under way only after today', () => {
    const stops = useTrip.getState().plan!.stops
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${stops[1].arrive}T12:00`))
    try {
      expect(tripContext()).toMatch(/under way.*day \d+ of \d+/)
      const r = runTool('remove_stop', { city: ds.cities[stops[0].cityId].name })
      expect(r.ok).toBe(false)
      expect(r.result.error).toMatch(/under way/)
      expect(stopIds()[0]).toBe(stops[0].cityId)
      expect(runTool('set_nights', { city: ds.cities[stops[3].cityId].name, nights: 7 }).ok).toBe(true)
    } finally {
      vi.useRealTimers()
    }
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

  it('changes settings; new dates leave the itinerary as it is, for the assistant to fit', () => {
    const before = useTrip.getState().stops
    expect(runTool('update_settings', { end_date: '2027-08-31', pace: 'fast' }).ok).toBe(true)
    const { input, plan, stops } = useTrip.getState()
    expect(input).toMatchObject({ endDate: '2027-08-31', pace: 'fast' })
    expect(stops).toEqual(before)
    expect(plan!.assignedNights).toBeGreaterThan(plan!.totalNights)
    expect(runTool('update_settings', { end_date: '2027-04-01' }).ok).toBe(false)
    expect(runTool('update_settings', { interests: ['surfing'] }).ok).toBe(false)
  })

  it('changes any preference, lists the changes, and keeps the itinerary as it is', () => {
    const before = snapshot()
    const stops = stopIds()
    const r = runTool('update_preferences', { room: 'private', dinner: 'restaurant', focus: 'countries', hot_from_c: 30, avoid_hot: true, daily_budget_eur: 70 })
    expect(r.ok).toBe(true)
    expect(r.summary).toContain('The itinerary is unchanged')
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

describe('My visit tools', () => {
  /** Runs tools on the trip with a My visit of its own. */
  const visit = (start = {}) => {
    const items = itemsHandle(start)
    return { items, run: (name: string, args: Record<string, unknown> = {}) => withTrip(toolContext(useTrip, [], false, items), () => runTool(name, args)) }
  }

  it('adds a stay, changes only the fields given, and lists it with its id', () => {
    const { items, run } = visit()
    const added = run('save_visit_item', {
      kind: 'stay', city: 'Kraków', title: 'Hostel Mleczarnia', address: 'Meiselsa 22', check_in: '2026-05-04', check_out: '2026-05-07',
      reference: 'BK-123', price: '€84, paid', url: 'booking.com/x',
    })
    expect(added).toMatchObject({ ok: true, summary: 'Added stay Hostel Mleczarnia (Kraków)' })
    // (No trip in the result: My visit isn't the plan.)
    expect(added.result.trip).toBeUndefined()
    const [stay] = run('get_visit', { city: 'krakow' }).result.items as { id: string }[]
    expect(stay).toMatchObject({ where: 'Kraków', kind: 'stay', title: 'Hostel Mleczarnia', check_in: '2026-05-04', url: 'https://booking.com/x' })
    expect(run('save_visit_item', { id: stay.id, price: '€90', reference: '' }).summary).toBe('Changed stay Hostel Mleczarnia (Kraków)')
    expect(items.get()[stay.id]).toMatchObject({ title: 'Hostel Mleczarnia', price: '€90', from: '2026-05-04' })
    expect(items.get()[stay.id].ref).toBeUndefined()
    expect(run('remove_visit_item', { id: stay.id }).summary).toBe('Removed stay Hostel Mleczarnia (Kraków)')
    expect(run('get_visit').result).toMatchObject({ items: [], note: 'Nothing kept in My visit yet.' })
  })

  it('keeps one note per city or journey, and adds to it when asked', () => {
    const { items, run } = visit()
    run('save_visit_item', { kind: 'note', city: 'Kraków', text: '- [ ] Wawel tickets' })
    run('save_visit_item', { kind: 'note', city: 'Kraków', text: '- [ ] Salt mine', append: true })
    expect(items.get()['note:krakow'].text).toBe('- [ ] Wawel tickets\n\n- [ ] Salt mine')
    expect(run('save_visit_item', { kind: 'note', city: 'Kraków', journey_to: 'Warsaw', text: 'Seat 42' }).summary).toBe('Added note (Kraków → Warsaw)')
    expect(items.get()['note:krakow>warsaw'].text).toBe('Seat 42')
  })

  it('refuses what My visit can\'t keep', () => {
    const { run } = visit()
    const error = (args: Record<string, unknown>) => run('save_visit_item', args).result.error
    expect(error({ kind: 'stay', city: 'Kraków', journey_to: 'Warsaw', title: 'Bus' })).toMatch(/journey keeps only a note/)
    expect(error({ kind: 'stay', city: 'Kraków', title: 'X', check_in: 'May 4' })).toMatch(/check_in must be a day/)
    expect(error({ kind: 'stay', city: 'Kraków', title: 'X', check_in: '2026-05-07', check_out: '2026-05-04' })).toMatch(/after check_in/)
    expect(error({ kind: 'link', city: 'Kraków', url: 'javascript:alert(1)' })).toMatch(/web address/)
    expect(error({ kind: 'album', city: 'Kraków' })).toMatch(/Nothing to keep/)
    expect(error({ kind: 'stay', city: 'Atlantis', title: 'X' })).toMatch(/not a city/)
    expect(error({ id: 'stay:nope', price: '€1' })).toMatch(/get_visit/)
    expect(run('remove_visit_item', { id: 'stay:nope' }).ok).toBe(false)
    // Without My visit (as in the tests above), the tools say so.
    expect(runTool('get_visit').result.error).toMatch(/isn't available/)
  })

  it('keeps prices the user saw in a city, in the money given, and sets them back to ours', () => {
    const { items, run } = visit()
    const set = run('set_prices_seen', { city: 'Kraków', prices: { local_meal: 38.5, whole_day: 260 } })
    expect(set).toMatchObject({ ok: true, summary: 'Prices seen in Kraków: a local meal 38.5 PLN; a whole day 260 PLN' })
    expect(items.get()['price:krakow:mealLocal']).toMatchObject({ kind: 'price', at: 'krakow', amount: 38.5, currency: 'PLN' })
    expect(run('set_prices_seen', { city: 'Kraków', currency: 'eur', prices: { coffee: 3 } }).ok).toBe(true)
    expect(items.get()['price:krakow:coffee']).toMatchObject({ amount: 3, currency: 'EUR' })
    expect(run('get_visit', { city: 'krakow' }).result.items).toContainEqual(expect.objectContaining({ kind: 'price', price_of: 'a café coffee', price_seen: '3 EUR' }))
    expect(run('set_prices_seen', { city: 'Kraków', reset: ['whole_day'] }).summary).toBe("Prices seen in Kraków: a whole day back to the app's")
    expect(items.get()['price:krakow:day'].deleted).toBe(true)
    const error = (args: Record<string, unknown>) => run('set_prices_seen', { city: 'Kraków', ...args }).result.error
    expect(error({ prices: { caviar: 9 } })).toMatch(/no price "caviar"/)
    expect(error({ prices: { coffee: -1 } })).toMatch(/0 or more/)
    expect(error({ currency: 'XXX', prices: { coffee: 1 } })).toMatch(/No exchange rate/)
    expect(error({})).toMatch(/Give the prices/)
    // (Nothing kept from a call that failed.)
    expect(items.get()['price:krakow:mealDinner']).toBeUndefined()
    expect(run('save_visit_item', { id: 'price:krakow:coffee', title: 'x' }).result.error).toMatch(/set_prices_seen/)
  })

  it("keeps the user's own phrases by language, by tag or name, and lists a city's with its languages", () => {
    const { items, run } = visit()
    const out = run('save_phrases', { phrases: [
      { language: 'mk', english: "I'm vegetarian", text: 'Јас сум вегетаријанец', say: 'yas soom veh-geh-tah-ree-YAH-nets', note: 'a woman says вегетаријанка' },
      { language: 'Albanian', english: "I'm vegetarian", text: 'Jam vegjetarian', say: 'yahm veh-jeh-tah-ree-AHN' },
      { language: 'pl', english: "I'm vegetarian", text: 'Jestem wegetarianinem', say: 'YES-tem veh-geh-tah-ryah-NEE-nem' },
    ] })
    expect(out).toMatchObject({ ok: true, summary: 'Phrases kept: "I\'m vegetarian" in Macedonian, Albanian, Polish' })
    expect(items.get()['phrase:mk:i-m-vegetarian']).toMatchObject({ kind: 'phrase', at: 'mk', title: "I'm vegetarian", text: 'Јас сум вегетаријанец', tip: 'a woman says вегетаријанка' })
    // Saving the same meaning again changes it.
    run('save_phrases', { phrases: [{ language: 'mk', english: "I'm vegetarian", text: 'Вегетаријанец сум', say: 'veh-geh-tah-ree-YAH-nets soom' }] })
    expect(items.get()['phrase:mk:i-m-vegetarian']).toMatchObject({ text: 'Вегетаријанец сум' })
    expect(items.get()['phrase:mk:i-m-vegetarian'].tip).toBeUndefined()
    // Skopje's are Macedonian's and Albanian's, not Polish.
    const skopje = run('get_visit', { city: 'skopje' }).result.items as { where: string; language: string }[]
    expect(skopje.map((i) => i.where).sort()).toEqual(['Albanian', 'Macedonian'])
    const error = (phrase: Record<string, unknown>) => run('save_phrases', { phrases: [phrase] }).result.error
    expect(error({ language: 'klingon', english: 'Hi', text: 'nuqneH', say: 'NOOK-neh' })).toMatch(/no phrases in "klingon"/)
    expect(error({ language: 'mk', english: 'Hi', say: 'zdravo' })).toMatch(/needs what it says/)
    expect(run('save_visit_item', { id: 'phrase:pl:i-m-vegetarian', title: 'x' }).result.error).toMatch(/save_phrases/)
    expect(run('remove_visit_item', { id: 'phrase:pl:i-m-vegetarian' }).summary).toBe('Removed phrase "I\'m vegetarian" (Polish)')
  })

  it("tells the model the trip's languages and who says the phrases", () => {
    const ctx = tripContext()
    expect(ctx).toMatch(/Languages on the trip \(tag: name, where\), for phrases: .*mk: Macedonian \(North Macedonia\)/)
    // And who says them (Settings), for the words a woman and a man say differently.
    expect(ctx).toMatch(/says phrases as a woman/)
    useTrip.getState().setSpeaker('male')
    expect(tripContext()).toMatch(/says phrases as a man/)
    useTrip.getState().setSpeaker('female')
  })

  it('changes My visit on a read-only trip, which keeps only its plans as they are', () => {
    useTrip.getState().setReadOnly(true)
    const { run } = visit()
    expect(run('save_visit_item', { kind: 'link', city: 'Kraków', title: 'Wawel', url: 'https://wawel.krakow.pl' }).ok).toBe(true)
    expect(run('remove_stop', { city: stopIds()[0] }).ok).toBe(false)
  })

  it('describes a reply\'s changes to My visit, and keeps the items from before for Undo', () => {
    const { items, run } = visit({ 'note:krakow': { id: 'note:krakow', kind: 'note', at: 'krakow', text: 'Old', updatedAt: 1 } })
    const before = items.get()
    run('save_visit_item', { kind: 'album', city: 'Warsaw', title: 'Old town', url: 'https://photos.app.goo.gl/x' })
    run('remove_visit_item', { id: 'note:krakow' })
    const after = items.get()
    expect(describeItemChanges(before, after).sort()).toEqual(['Added photo album Old town (Warsaw)', 'Removed note (Kraków)'])
    const was = itemsBefore(before, after)!
    expect(was['note:krakow']).toEqual(before['note:krakow'])
    expect(Object.values(was).filter((v) => v === null)).toHaveLength(1)
    expect(itemsBefore(after, after)).toBeUndefined()
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

  it('accepts files the user attached, at Gemini, with their tokens', () => {
    const fileUri = 'https://generativelanguage.googleapis.com/v1beta/files/abc123'
    const withFile = (fileData: unknown, role = 'user') => ({ role, parts: [{ fileData }, { text: 'Save this booking' }] })
    const ok = parseChatRequest({ contents: [withFile({ mimeType: 'image/jpeg', fileUri })], context: '', media: [{ uri: fileUri, token: 't' }] })
    expect(ok).toMatchObject({ media: [{ uri: fileUri, token: 't' }] })
    expect(parseChatRequest({ contents: [withFile({ mimeType: 'image/jpeg', fileUri: 'https://example.com/a.jpg' })], context: '' })).toBe('Invalid attachment')
    expect(parseChatRequest({ contents: [withFile({ mimeType: 'text/html', fileUri })], context: '' })).toBe('Invalid attachment')
    expect(parseChatRequest({ contents: [withFile({ mimeType: 'image/jpeg', fileUri, extra: 1 })], context: '' })).toBe('Invalid attachment')
    expect(parseChatRequest({ contents: [user('a'), withFile({ mimeType: 'image/jpeg', fileUri }, 'model'), user('b')], context: '' })).toBe('Invalid attachment')
    expect(parseChatRequest({ contents: [user('a')], context: '', media: 'x' })).toBe('Invalid attachment')
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
    bindTrip(useTrip, [city, map])
    const both = runTool('get_shared_view', {}).result.items as Record<string, unknown>[]
    expect(both[0]).toMatchObject({ name: 'Kraków', weather: expect.any(Object), air_quality: expect.any(Object) })
    expect(both[0]).not.toHaveProperty('daily_cost_eur')
    const stops = both[1].stops as Record<string, unknown>[]
    expect(stops).toHaveLength(useTrip.getState().stops.length)
    expect(stops[0]).toMatchObject({ stop: 1, high_c: expect.any(Number), rainy_share_pct: expect.any(Number) })

    // The user left the map out: the assistant can't read it.
    bindTrip(useTrip, [city])
    expect(runTool('get_shared_view', { item: 'map' }).result.error).toMatch(/didn't share/)
    bindTrip(useTrip, [])
    expect(runTool('get_shared_view', {}).result.error).toMatch(/didn't share/)
  })

  it('returns the stops and travel of the Route map', () => {
    useTrip.setState({ selected: null, layer: 'none' })
    bindTrip(useTrip, viewItems())
    const [map] = runTool('get_shared_view', { item: 'map' }).result.items as { stops: Record<string, unknown>[] }[]
    expect(map.stops[0]).toMatchObject({ stop: 1, arrive: expect.any(String), nights: expect.any(Number) })
    expect(map.stops[1]).toHaveProperty('travel_in.modes')
  })

  it('returns each part of an open journey', () => {
    useTrip.setState({ selected: { type: 'leg', index: 0 }, layer: 'none' })
    bindTrip(useTrip, viewItems())
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
