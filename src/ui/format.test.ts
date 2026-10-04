import { describe, expect, it } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { local, money, rateText } from './format'

describe('money', () => {
  it('formats EUR amounts', () => {
    expect(money(43.4, 'EUR')).toBe('€43')
    expect(money(0.5, 'EUR', true)).toBe('€0.50')
  })

  it('converts to the display currency with an unambiguous symbol', () => {
    const twd = Math.round(10 * ds.fx.rates.TWD).toLocaleString('en')
    expect(money(10, 'TWD')).toBe(`NT$${twd}`)
    expect(money(10, 'USD')).toMatch(/^\$\d+$/)
    expect(money(10, 'CAD')).toMatch(/^CA\$\d+$/)
  })

  it('falls back to EUR for an unknown currency', () => {
    expect(money(5, 'XXX')).toBe('€5')
  })
})

describe('rateText', () => {
  it('writes the rate so the number is at least 1', () => {
    expect(rateText('EUR', 'RSD')).toMatch(/^1 EUR = [\d.]+ RSD$/)
    expect(rateText('TWD', 'EUR')).toMatch(/^1 EUR = [\d.]+ TWD$/)
    expect(rateText('EUR', 'EUR')).toBeNull()
  })
})

describe('local', () => {
  it('hides the local amount when it is already the display currency', () => {
    expect(local(1, 'PLN', 'PLN')).toBeNull()
    expect(local(1, 'PLN', 'EUR')).toMatch(/PLN$/)
  })
})
