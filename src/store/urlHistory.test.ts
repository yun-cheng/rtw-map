import { beforeAll, describe, expect, it, vi } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { draftStops, testCaseInput } from '../data/testCase'
import { useTrip } from './trip'
import { quietly, syncUrl } from './url'

// The browser's history, as the addresses of its entries, and the one shown.
const entries = ['?panel=itinerary']
let at = 0
const listeners: Record<string, () => void> = {}
const searchOf = (url: string) => new URL(url, 'https://rtw.test').search
const tick = () => new Promise((r) => setTimeout(r))
const back = () => {
  at--
  listeners.popstate()
}

beforeAll(() => {
  vi.stubGlobal('window', {
    location: { get search() { return entries[at] }, pathname: '/', hash: '' },
    addEventListener: (type: string, f: () => void) => (listeners[type] = f),
  })
  vi.stubGlobal('history', {
    state: null,
    pushState: (_: unknown, __: string, url: string) => {
      entries.splice(at + 1, Infinity, searchOf(url))
      at++
    },
    replaceState: (_: unknown, __: string, url: string) => (entries[at] = searchOf(url)),
  })
  useTrip.setState({ input: testCaseInput(ds, 'US'), stops: [], plan: null, selected: null, layer: 'none', cityTab: 'overview', panel: 'setup' })
  useTrip.getState().setStops(draftStops(ds, useTrip.getState().input))
  syncUrl()
})

describe('going back', () => {
  it("makes opening a city or a panel a step, and the rest (a city's tabs too) changes the address in place", async () => {
    const { select, setCityTab, setLayer, setPanel } = useTrip.getState()
    select({ type: 'city', id: 'tirana' })
    setCityTab('weather')
    expect(entries).toHaveLength(2)
    await tick()
    setLayer('climate')
    expect(entries).toHaveLength(2)
    expect(entries[1]).toContain('layer=climate')
    select({ type: 'city', id: 'krakow' })
    await tick()
    setCityTab('costs')
    expect(entries).toHaveLength(3)

    setLayer('air')
    back()
    expect(useTrip.getState().selected).toEqual({ type: 'city', id: 'tirana' })
    expect(useTrip.getState().cityTab).toBe('weather')
    // (The map's view stays as it is.)
    expect(useTrip.getState().layer).toBe('air')
    expect(entries[1]).toContain('layer=air')
    back()
    expect(useTrip.getState().selected).toBeNull()
    // (Going back isn't a step itself: the steps ahead are still there.)
    expect(entries).toHaveLength(3)

    await tick()
    quietly(() => setPanel('setup'))
    expect(entries).toHaveLength(3)
    expect(entries[0]).toContain('panel=setup')
  })
})
