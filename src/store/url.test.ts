import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { draftStops, testCaseInput } from '../data/testCase'
import { useRightPanel } from '../ui/rightPanel'
import { useTrip } from './trip'
import { buildSearch, initialMapView, parseMapView, readUrl } from './url'

beforeEach(() => {
  useTrip.setState({ input: testCaseInput(ds, 'US'), stops: [], plan: null, selected: null, layer: 'none', cityTab: 'overview', panel: 'setup' })
  useTrip.getState().setStops(draftStops(ds, useTrip.getState().input))
  useTrip.getState().setPanel('itinerary')
})

describe('address bar state', () => {
  it('reads and writes the map position as zoom/latitude/longitude', () => {
    expect(parseMapView('5.2/50.06/19.94')).toEqual({ zoom: 5.2, center: [19.94, 50.06] })
    expect(parseMapView('5/95/10')).toBeNull()
    expect(parseMapView('abc')).toBeNull()
    expect(parseMapView(null)).toBeNull()
  })

  it('opens the Trip tab for a link to the old Preferences tab', () => {
    useTrip.setState({ panel: 'itinerary' })
    readUrl('?panel=prefs')
    expect(useTrip.getState().panel).toBe('setup')
  })

  it('opens My trip on Today on a trip under way, unless the address names a tab', () => {
    const { startDate } = useTrip.getState().input
    const closed = { open: false, sheet: false, tab: 'stays' as const }
    vi.useFakeTimers({ now: new Date(`${startDate}T12:00:00`) })
    try {
      useRightPanel.setState(closed)
      readUrl('')
      expect(useRightPanel.getState()).toMatchObject({ open: true, sheet: true, tab: 'today' })
      // (The left panel on the tab it was on.)
      expect(useTrip.getState().panel).toBe('itinerary')
      useRightPanel.setState(closed)
      readUrl('?panel=itinerary')
      expect(useRightPanel.getState().open).toBe(false)
      // (A link to Today when it was the left panel's tab.)
      readUrl('?panel=today')
      expect(useRightPanel.getState()).toMatchObject({ open: true, tab: 'today' })
      expect(useTrip.getState().panel).toBe('itinerary')
      // (Before the trip, as it was.)
      useRightPanel.setState(closed)
      vi.setSystemTime(new Date(`${startDate}T12:00:00`).getTime() - 86_400_000)
      readUrl('')
      expect(useRightPanel.getState().open).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("opens a city's or journey's tab when one is picked, and goes back to the tab before when it's closed", () => {
    const { select, setPanel } = useTrip.getState()
    select({ type: 'city', id: 'tirana' })
    expect(useTrip.getState().panel).toBe('city')
    expect(buildSearch(useTrip.getState(), null)).toBe('?panel=city&city=tirana&tab=overview')
    // (Another one: still the tab before the first.)
    select({ type: 'leg', index: 1 })
    select(null)
    expect(useTrip.getState().panel).toBe('itinerary')
    // (Closed from another tab: that tab stays.)
    select({ type: 'city', id: 'tirana' })
    setPanel('assistant')
    select(null)
    expect(useTrip.getState().panel).toBe('assistant')
    // (No City tab without one, from the address either.)
    readUrl('?panel=city')
    expect(useTrip.getState().panel).toBe('itinerary')
  })

  it('round-trips the open city, its tab, the left panel and a monthly map layer', () => {
    readUrl('?panel=itinerary&city=tirana&tab=weather&layer=climate&month=7&map=6.00/41.300/19.800')
    const s = useTrip.getState()
    expect(s.selected).toEqual({ type: 'city', id: 'tirana' })
    expect(s.cityTab).toBe('weather')
    expect(s.panel).toBe('itinerary')
    expect(s.layer).toBe('climate')
    expect(s.layerMonth).toBe(7)
    expect(initialMapView).toEqual({ zoom: 6, center: [19.8, 41.3] })
    expect(buildSearch(s, initialMapView)).toBe('?panel=itinerary&city=tirana&tab=weather&layer=climate&month=7&map=6.00/41.300/19.800')
  })

  it('leaves the month out when the weather layer shows the trip dates', () => {
    readUrl('?layer=climate')
    expect(useTrip.getState().layerMonth).toBe(0)
    expect(buildSearch(useTrip.getState(), null)).toBe('?panel=itinerary&layer=climate')
  })

  it('keeps whether the weather layer shows highs or lows', () => {
    readUrl('?layer=climate&temp=low')
    expect(useTrip.getState().weatherBy).toBe('low')
    expect(buildSearch(useTrip.getState(), null)).toBe('?panel=itinerary&layer=climate&temp=low')
    readUrl('?layer=climate')
    expect(useTrip.getState().weatherBy).toBe('high')
  })

  it('keeps whether the Route view numbers stops by day or nights', () => {
    readUrl('?panel=itinerary&show=nights')
    expect(useTrip.getState().routeBy).toBe('nights')
    expect(buildSearch(useTrip.getState(), null)).toBe('?panel=itinerary&show=nights')
    readUrl('?panel=itinerary')
    expect(useTrip.getState().routeBy).toBe('day')
  })

  it('keeps the kind of place shown by the Nearby layer', () => {
    readUrl('?layer=nearby&kind=atm')
    expect(useTrip.getState().nearbyKind).toBe('atm')
    expect(buildSearch(useTrip.getState(), null)).toBe('?panel=itinerary&layer=nearby&kind=atm')
  })

  it('keeps the kind of cost shown by the Cost layer (a day on the budget when absent)', () => {
    readUrl('?layer=cost&kind=dorm')
    expect(useTrip.getState().costKind).toBe('dorm')
    expect(buildSearch(useTrip.getState(), null)).toBe('?panel=itinerary&layer=cost&kind=dorm')
    readUrl('?layer=cost')
    expect(useTrip.getState().costKind).toBe('day')
    expect(buildSearch(useTrip.getState(), null)).toBe('?panel=itinerary&layer=cost')
  })

  it('opens a journey only if the plan has it, and ignores unknown values', () => {
    readUrl('?leg=1')
    expect(useTrip.getState().selected).toEqual({ type: 'leg', index: 1 })
    expect(buildSearch(useTrip.getState(), null)).toBe('?panel=city&leg=1')
    readUrl('?layer=cards')
    expect(useTrip.getState().layer).toBe('none')
    readUrl('?leg=999&tab=nope&layer=nope&panel=nope&city=atlantis')
    const s = useTrip.getState()
    expect(s.selected).toBeNull()
    expect(s.cityTab).toBe('overview')
    expect(s.layer).toBe('none')
    expect(s.panel).toBe('itinerary')
  })
})
