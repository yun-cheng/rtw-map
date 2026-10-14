import { describe, expect, it, vi } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { draftStops, testCaseInput } from '../data/testCase'
import { useHistory } from './history'
import { useTrip } from './trip'

describe('undo and redo', () => {
  it('say what they did, as the edit was made', () => {
    const input = testCaseInput(ds, 'US')
    useTrip.setState({ input, stops: draftStops(ds, input), readOnly: false })
    useHistory.setState({ past: [], future: [], notice: null })
    // (Not so soon after setting the trip up that it's one edit with it.)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 60_000)
    const { cityId, nights } = useTrip.getState().stops[0]
    useTrip.getState().setNights(0, nights + 1)
    const line = `${ds.cities[cityId].name}: ${nights} → ${nights + 1} nights`

    useHistory.getState().undo()
    expect(useTrip.getState().stops[0].nights).toBe(nights)
    expect(useHistory.getState().notice).toMatchObject({ redo: false, changes: [line] })
    useHistory.getState().redo()
    expect(useTrip.getState().stops[0].nights).toBe(nights + 1)
    expect(useHistory.getState().notice).toMatchObject({ redo: true, changes: [line] })
    vi.useRealTimers()
  })
})
