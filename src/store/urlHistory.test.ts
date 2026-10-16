import { beforeAll, describe, expect, it, vi } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { draftStops, testCaseInput } from '../data/testCase'
import { useAssistantPanel } from '../ui/assistantPanel'
import { useLeftSheet } from '../ui/leftSheet'
import { openRecord, useRightPanel } from '../ui/rightPanel'
import { useTrip } from './trip'
import { quietly, syncUrl } from './url'

// A computer, unless a test says a phone.
const device = vi.hoisted(() => ({ phone: false }))
vi.mock('../ui/usePhone', () => ({ isPhone: () => device.phone, usePhone: () => device.phone }))

// The browser's history, as the addresses of its entries, and the one shown.
const entries = ['?panel=itinerary']
const states: unknown[] = [null]
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
    get state() { return states[at] },
    pushState: (state: unknown, __: string, url: string) => {
      entries.splice(at + 1, Infinity, searchOf(url))
      states.splice(at + 1, Infinity, state)
      at++
    },
    replaceState: (state: unknown, __: string, url: string) => {
      entries[at] = searchOf(url)
      states[at] = state
    },
    // (As a browser's: a moment later.)
    back: () => setTimeout(back),
    forward: () => {
      at++
      listeners.popstate()
    },
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

  it("makes My trip's tabs and pages steps, which Back goes back through, not opening it or the Assistant on a computer", async () => {
    const start = at
    const { show, setTab, setAdding, setRecord } = useRightPanel.getState()
    await tick()
    // (Opening it: the layout.)
    show('stays')
    expect(at).toBe(start)
    expect(entries[at]).toContain('mytrip=stays')
    await tick()
    setTab('tickets')
    expect(at).toBe(start + 1)
    await tick()
    openRecord('tickets', 't1')
    expect(entries[at]).toContain('record=t1')
    await tick()
    setAdding('tickets', 't2')
    expect(entries[at]).toContain('new=t2')
    await tick()
    // (A new one done: its record's page in its place.)
    setRecord('tickets', 't2')
    setAdding('tickets', null)
    expect(entries[at]).toContain('record=t2')
    await tick()
    useAssistantPanel.getState().show()
    expect(entries[at]).toContain('assistant=1')
    expect(at).toBe(start + 3)

    back()
    // (It stays open: the layout.)
    expect(useAssistantPanel.getState().open).toBe(true)
    expect(useRightPanel.getState().records.tickets).toBe('t1')
    back()
    expect(useRightPanel.getState()).toMatchObject({ open: true, tab: 'tickets', records: { tickets: undefined } })
    back()
    expect(useRightPanel.getState()).toMatchObject({ open: true, tab: 'stays' })
    // (Folded, it goes to its tab and page without opening.)
    await tick()
    useRightPanel.getState().hide()
    useAssistantPanel.getState().hide()
    expect(at).toBe(start)
    history.forward()
    expect(useRightPanel.getState()).toMatchObject({ open: false, tab: 'tickets' })
  })

  it("makes a page's own back button in My trip go back as Back does", async () => {
    const start = at
    const { show, setRecord } = useRightPanel.getState()
    await tick()
    show('tickets')
    await tick()
    openRecord('tickets', 't1')
    expect(at).toBe(start + 1)
    await tick()
    // (All tickets.)
    setRecord('tickets', null)
    await tick()
    expect(at).toBe(start)
    expect(entries[at]).toContain('mytrip=tickets')
    expect(entries[at]).not.toContain('record=')
    // (Forward still goes to it.)
    expect(entries[at + 1]).toContain('record=t1')
    await tick()
    useRightPanel.getState().hide()
  })

  it("makes a phone's sheets opening steps, and closing one go back as Back does, or else not a step", async () => {
    // (Its sheets closed: on a computer, not steps.)
    useRightPanel.setState({ sheet: false })
    useAssistantPanel.setState({ sheet: false })
    device.phone = true
    try {
      const start = at
      await tick()
      useRightPanel.getState().show('stays')
      expect(at).toBe(start + 1)
      await tick()
      useAssistantPanel.getState().show()
      expect(at).toBe(start + 2)
      back()
      expect(useAssistantPanel.getState().sheet).toBe(false)
      expect(useRightPanel.getState().sheet).toBe(true)
      back()
      expect(useRightPanel.getState().sheet).toBe(false)
      // (Open from the start: closing it isn't a step, so Back doesn't open it again.)
      await tick()
      useLeftSheet.getState().setOpen(false)
      expect(at).toBe(start)
      expect(entries[at]).toContain('left=closed')
      await tick()
      useLeftSheet.getState().setOpen(true)
      expect(at).toBe(start + 1)
      // (Closed again just after: back where it was, as Back.)
      await tick()
      useLeftSheet.getState().setOpen(false)
      await tick()
      expect(at).toBe(start)
      expect(useLeftSheet.getState().open).toBe(false)
    } finally {
      device.phone = false
    }
  })
})
