import { describe, expect, it } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { draftStops, testCaseInput } from '../data/testCase'
import { useTrip } from '../store/trip'
import { askAbout } from './askAbout'

const input = testCaseInput(ds, 'US')
useTrip.setState({ input, stops: [], plan: null, selected: null, readOnly: false })
useTrip.getState().setStops(draftStops(ds, input))
const { plan } = useTrip.getState()
const [first, second] = plan!.stops
const name = (id: string) => ds.cities[id].name

describe('Ask AI in a panel', () => {
  it("offers questions about a stop, the open tab's first", () => {
    useTrip.setState({ selected: { type: 'city', id: first.cityId }, cityTab: 'weather' })
    const about = askAbout()!
    expect(about.ask).toBe(`What can you help me with in ${name(first.cityId)}?`)
    expect(about.choices[0]).toBe(`What's the weather like in ${name(first.cityId)} during my trip?`)
    expect(about.choices).toContain(`Is ${first.nights} nights in ${name(first.cityId)} the right amount?`)
    expect(about.choices).toContain(`What's the best way from ${name(first.cityId)} to ${name(second.cityId)}?`)
    expect(about.choices.length).toBeLessThanOrEqual(4)
  })

  it('offers adding a city not in the trip, and a journey its ways', () => {
    const other = Object.keys(ds.cities).find((id) => !plan!.stops.some((s) => s.cityId === id))!
    useTrip.setState({ selected: { type: 'city', id: other }, cityTab: 'overview' })
    expect(askAbout()!.choices).toEqual([`Is ${name(other)} worth adding to my trip?`, `Add ${name(other)} to my trip where it fits best`])
    useTrip.setState({ selected: { type: 'leg', index: 0 } })
    expect(askAbout()!.choices[0]).toBe(`What are my options from ${name(first.cityId)} to ${name(second.cityId)}?`)
    useTrip.setState({ selected: null })
    expect(askAbout()).toBeNull()
  })
})
