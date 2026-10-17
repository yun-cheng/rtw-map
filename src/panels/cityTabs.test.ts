import { describe, expect, it } from 'vitest'
import { viewTab } from './cityTabs'

const tab = (layer: string, over: object = {}) => viewTab({ layer, costKind: 'day', nearbyKind: 'supermarket', ...over } as Parameters<typeof viewTab>[0])

describe('the city tab a map view opens on', () => {
  it('is the one showing what the view does', () => {
    expect(tab('climate')).toEqual(['weather'])
    expect(tab('air')).toEqual(['weather'])
    expect(tab('mobile')).toEqual(['daily'])
    expect(tab('visa')).toEqual(['entry'])
    expect(tab('schengen')).toEqual(['entry'])
    expect(tab('nearby')).toEqual(['daily'])
    expect(tab('nearby', { nearbyKind: 'pharmacy' })).toEqual(['health'])
  })

  it("is Costs, on the sub-tab for the view's kind, or Transport for getting around", () => {
    expect(tab('cost')).toEqual(['costs', 'daily'])
    expect(tab('cost', { costKind: 'dorm' })).toEqual(['costs', 'prices'])
    expect(tab('cost', { costKind: 'coffee' })).toEqual(['costs', 'prices'])
    expect(tab('cost', { costKind: 'taxi' })).toEqual(['transport'])
  })

  it('keeps the tab open on the Route view', () => {
    expect(tab('none')).toBeNull()
  })
})
