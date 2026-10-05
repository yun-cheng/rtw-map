import { beforeEach, describe, expect, it } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { testCaseInput } from '../data/testCase'
import { useTrip } from './trip'
import { buildSearch, initialMapView, parseMapView, readUrl } from './url'

beforeEach(() => {
  useTrip.setState({ input: testCaseInput(ds, 'US'), stops: [], plan: null, selected: null, layer: 'none', cityTab: 'overview', panel: 'setup' })
  useTrip.getState().generate()
})

describe('address bar state', () => {
  it('reads and writes the map position as zoom/latitude/longitude', () => {
    expect(parseMapView('5.2/50.06/19.94')).toEqual({ zoom: 5.2, center: [19.94, 50.06] })
    expect(parseMapView('5/95/10')).toBeNull()
    expect(parseMapView('abc')).toBeNull()
    expect(parseMapView(null)).toBeNull()
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

  it('opens a journey only if the plan has it, and ignores unknown values', () => {
    readUrl('?leg=1')
    expect(useTrip.getState().selected).toEqual({ type: 'leg', index: 1 })
    expect(buildSearch(useTrip.getState(), null)).toBe('?panel=itinerary&leg=1')
    readUrl('?leg=999&tab=nope&layer=nope&panel=nope&city=atlantis')
    const s = useTrip.getState()
    expect(s.selected).toBeNull()
    expect(s.cityTab).toBe('overview')
    expect(s.layer).toBe('none')
    expect(s.panel).toBe('itinerary')
  })
})
