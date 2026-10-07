import { describe, expect, it } from 'vitest'
import { matches, textOf } from './cells'
import { SOURCES, table } from './sources'

describe('data review cells', () => {
  it('shows values as text', () => {
    expect(textOf(null)).toBe('')
    expect(textOf(true)).toBe('yes')
    expect(textOf([25, 45])).toBe('25–45')
    expect(textOf(['tram', 'bus'])).toBe('tram · bus')
  })

  it('filters numbers, lists, empty cells and text', () => {
    expect(matches(4, '>3', 'number')).toBe(true)
    expect(matches(3, '>3', 'number')).toBe(false)
    expect(matches(3, '<=3', 'number')).toBe(true)
    expect(matches(4, '2..5', 'number')).toBe(true)
    expect(matches(6, '2..5', 'number')).toBe(false)
    expect(matches(null, '>3', 'number')).toBe(false)
    expect(matches(null, 'empty', 'number')).toBe(true)
    expect(matches([], '∅', 'list')).toBe(true)
    expect(matches(['beach', 'food'], '∋beach', 'list')).toBe(true)
    expect(matches(['beaches'], '∋beach', 'list')).toBe(false)
    expect(matches(true, '=yes', 'bool')).toBe(true)
    expect(matches('Old Town', 'town', 'text')).toBe(true)
  })
})

describe('data review checks', () => {
  const rows = [
    { from: 'tirana', to: 'nowhere', mode: 'bus' },
    { from: 'tirana', to: 'nowhere', mode: 'bus' },
  ]
  const t = table('Test', { rows, where: ['line 2', 'line 3'] }, {
    key: (r) => `${r.from}|${r.to}|${r.mode}`, links: { from: 'city', to: 'city' }, expect: ['tirana|nowhere|bus', 'tirana|shkoder|bus'],
  })

  it('marks unknown cities, repeated rows and missing ones', () => {
    expect(t.issues[0]).toEqual({ to: 'No city "nowhere" in cities.csv' })
    expect(t.issues[1].from).toBe('Repeats the row at line 2')
    expect(t.missing).toEqual(['tirana|shkoder|bus'])
    expect(t.lines).toBe(true)
  })

  it('reads every seed file', () => {
    for (const s of SOURCES) for (const tb of Object.values(s.tables)) expect(tb.rows.length, `${s.id} ${tb.label}`).toBeGreaterThan(0)
  })
})
