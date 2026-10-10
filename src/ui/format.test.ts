import { describe, expect, it } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { WEATHER_STYLE, local, money, rateText, temp, shownTemps, tempBand, tempKind, tempRange, tempScale, warningTitle, weatherKind } from './format'

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

describe('weatherKind', () => {
  it('uses blue for cold, red only for heat, grey for rainy pleasant months', () => {
    expect(weatherKind({ tHigh: 2, rainDays: 5 })).toBe('cold')
    expect(weatherKind({ tHigh: 15, rainDays: 5 })).toBe('cool')
    expect(weatherKind({ tHigh: 23, rainDays: 5 })).toBe('pleasant')
    expect(weatherKind({ tHigh: 23, rainDays: 16 })).toBe('wet')
    expect(weatherKind({ tHigh: 29, rainDays: 3 })).toBe('warm')
    expect(weatherKind({ tHigh: 34, rainDays: 1 })).toBe('hot')
    expect(WEATHER_STYLE.cold.color).not.toBe(WEATHER_STYLE.hot.color)
  })
})

describe('temperatures', () => {
  it('shows °C data in either unit, rounded', () => {
    expect(temp(24.9, 'C')).toBe('25°C')
    expect(temp(24.9, 'F')).toBe('77°F')
    expect(tempRange(-3.2, 4.6, 'F')).toBe('26–40°F')
    expect(tempRange(-24, -15, 'C')).toBe('-24 to -15°C')
    expect(tempRange(-3.2, 4.6, 'C')).toBe('-3 to 5°C')
  })

  it('labels the map classes by their range of average highs', () => {
    expect(['cold', 'cool', 'pleasant', 'warm', 'hot'].map((k) => tempBand(k as 'cold', 'C'))).toEqual(['<12°C', '12–18°C', '18–28°C', '28–32°C', '32°C+'])
    expect(tempBand('pleasant', 'F')).toBe('64–82°F')
  })

  it('adds the temperature to hot and cold warnings in the chosen unit', () => {
    expect(warningTitle({ title: 'Athens: very hot', tempC: 33.4 }, 'F')).toBe('Athens: very hot (avg high 92°F)')
    expect(warningTitle({ title: 'Visa needed' }, 'F')).toBe('Visa needed')
    expect(warningTitle({ title: 'Tirana: cold', tempC: 11, tempFeels: true }, 'C')).toBe('Tirana: cold (avg high feels like 11°C)')
  })

  it('adds the amount and the limit to budget warnings in the chosen currency', () => {
    expect(warningTitle({ title: 'Tirana: over your daily budget', amount: { eur: 34.2, limitEur: 25, per: 'day' } }, 'C')).toBe('Tirana: over your daily budget (~€34 a day, budget €25)')
    expect(warningTitle({ title: 'Tirana: a dorm bed is over your most per night', amount: { eur: 13, limitEur: 12, per: 'night' } }, 'C')).toBe('Tirana: a dorm bed is over your most per night (~€13 a night, most €12)')
  })
})

describe('night temperatures', () => {
  it('says whether a warning is about the high or the low', () => {
    expect(warningTitle({ title: 'Athens: warm nights', tempC: 23.4, tempIsLow: true }, 'C')).toBe('Athens: warm nights (avg low 23°C)')
  })

  it('classes any temperature, day or night, on one scale', () => {
    expect([0, 14, 20, 30, 33].map((c) => tempKind(c))).toEqual(['cold', 'cool', 'pleasant', 'warm', 'hot'])
    expect(tempBand('pleasant', 'C')).toBe('18–28°C')
  })

  it("uses the traveller's own breakpoints", () => {
    const breaks: [number, number, number, number] = [5, 15, 25, 30]
    expect([4, 5, 24, 25, 30].map((c) => tempKind(c, breaks))).toEqual(['cold', 'cool', 'pleasant', 'warm', 'hot'])
    expect(tempBand('cold', 'C', breaks)).toBe('<5°C')
    expect(tempBand('warm', 'F', breaks)).toBe('77–86°F')
    expect(weatherKind({ tHigh: 26, rainDays: 2 }, breaks)).toBe('warm')
  })
})

describe('climate chart scale', () => {
  it('fits the year, below zero too, with round gridlines', () => {
    // Irkutsk-like, -23° to 25°C: a line every 5°, labels every 10°.
    expect(tempScale(-23, 25, 'C')).toEqual({ lo: -25, hi: 30, step: 5, labelStep: 10 })
    // Bangkok-like, 23° to 35°C: every line labelled.
    expect(tempScale(23, 35, 'C')).toEqual({ lo: 20, hi: 40, step: 5, labelStep: 5 })
    // The cold city in °F (-9° to 77°F): a line every 10°F, labels every 20°F.
    expect(tempScale(-9, 77, 'F')).toEqual({ lo: -20, hi: 80, step: 10, labelStep: 20 })
  })
})

describe('temperatures as they feel', () => {
  it('shows temperatures as they feel when asked and known, else measured', () => {
    expect(shownTemps({ tHigh: 33, tLow: 26, feelsHigh: 40, feelsLow: 32 }, true)).toEqual({ high: 40, low: 32, feels: true })
    expect(shownTemps({ tHigh: 33, tLow: 26, feelsHigh: 40, feelsLow: 32 }, false)).toEqual({ high: 33, low: 26, feels: false })
    expect(shownTemps({ tHigh: 33, tLow: 26 }, true)).toEqual({ high: 33, low: 26, feels: false })
  })
})
