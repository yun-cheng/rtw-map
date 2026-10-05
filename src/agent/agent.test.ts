import { beforeEach, describe, expect, it } from 'vitest'
import { geminiRequest, parseChatRequest } from '../../worker/chat'
import { dataset as ds } from '../data/dataset'
import { testCaseInput } from '../data/testCase'
import { useTrip } from '../store/trip'
import { TOOLS, WRITE_TOOLS } from './schema'
import { describeChanges, runTool, snapshot, tripContext } from './tools'

const stopIds = () => useTrip.getState().stops.map((s) => s.cityId)

beforeEach(() => {
  useTrip.setState({ input: testCaseInput(ds, 'US'), stops: [], plan: null })
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

  it('edits regions and country modes', () => {
    expect(runTool('add_region', { preset: 'East Asia' }).ok).toBe(true)
    expect(runTool('set_country_mode', { country: 'Japan', mode: 'excluded' }).ok).toBe(true)
    expect(useTrip.getState().input.groups.at(-1)!.countries.find((c) => c.iso2 === 'JP')!.mode).toBe('excluded')
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
