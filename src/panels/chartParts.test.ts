import { describe, expect, it, vi } from 'vitest'
import { hoverProps } from './chartParts'

describe('chart hover', () => {
  it('reports the month under the pointer (1–12) and null when it leaves', () => {
    const onHover = vi.fn()
    const props = hoverProps(onHover)
    props.onMouseMove!({ isTooltipActive: true, activeTooltipIndex: 6, activeIndex: 6 } as never)
    props.onMouseMove!({ isTooltipActive: true, activeTooltipIndex: '0', activeIndex: '0' } as never)
    props.onMouseMove!({ isTooltipActive: false, activeTooltipIndex: undefined, activeIndex: undefined } as never)
    props.onMouseLeave!()
    expect(onHover.mock.calls.map((c) => c[0])).toEqual([7, 1, null, null])
    expect(hoverProps()).toEqual({})
  })
})
