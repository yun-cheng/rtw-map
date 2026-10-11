import { describe, expect, it } from 'vitest'
import { tipAt } from './chartParts'

describe('chart tooltip', () => {
  it('places the point under the pointer on the page, above the chart, and nothing when there is none', () => {
    const box = { left: 100, top: 50 }
    expect(tipAt({ isTooltipActive: true, activeTooltipIndex: 6, activeCoordinate: { x: 40, y: 90 } } as never, box)).toEqual({ index: 6, x: 140, y: 50 })
    expect(tipAt({ isTooltipActive: true, activeTooltipIndex: '0', activeCoordinate: { x: 5, y: 0 } } as never, box)).toEqual({ index: 0, x: 105, y: 50 })
    expect(tipAt({ isTooltipActive: false, activeTooltipIndex: undefined, activeCoordinate: undefined } as never, box)).toBeNull()
    expect(tipAt({ isTooltipActive: true, activeTooltipIndex: 2, activeCoordinate: { x: 5, y: 0 } } as never, undefined)).toBeNull()
  })
})
