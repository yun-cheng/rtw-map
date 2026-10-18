import { describe, expect, it } from 'vitest'
import type { City } from '../planner/types'
import { cityTimezone, diffText, localTime, offsetMin, utcText } from './localTime'

const summer = new Date('2026-07-04T12:32:00Z')
const winter = new Date('2026-01-10T12:32:00Z')

describe("a city's local time", () => {
  it('is its zone offset, summer time included', () => {
    expect(offsetMin('Europe/Warsaw', summer)).toBe(120)
    expect(offsetMin('Europe/Warsaw', winter)).toBe(60)
    expect(offsetMin('Asia/Kolkata', summer)).toBe(330)
    expect(offsetMin('America/Bogota', summer)).toBe(-300)
    expect(offsetMin('Africa/Abidjan', summer)).toBe(0)
  })

  it('says the offset and the difference from the traveller', () => {
    expect([utcText(120), utcText(345), utcText(-300), utcText(0)]).toEqual(['UTC+2', 'UTC+5:45', 'UTC-5', 'UTC'])
    expect([diffText(0), diffText(360), diffText(-330), diffText(30)]).toEqual(['same time as you', '6 h ahead of you', '5 h 30 min behind you', '30 min ahead of you'])
  })

  it('shows the weekday and time there, the zone and its name', () => {
    expect(localTime('Europe/Warsaw', summer, 0)).toEqual({ time: 'Sat 14:32', utc: 'UTC+2', name: 'Central European Summer Time', diff: '2 h ahead of you' })
    // Already Sunday in Auckland; a traveller in Taipei (UTC+8).
    expect(localTime('Pacific/Auckland', new Date('2026-07-04T12:32:00Z'), 480)).toMatchObject({ time: 'Sun 00:32', utc: 'UTC+12', diff: '4 h ahead of you' })
  })

  it("is the country's zone for a city without one, where the country has one zone", () => {
    const city = (id: string, iso2: string, timezone: string | null) => ({ id, iso2, timezone }) as City
    const cities = { tirana: city('tirana', 'AL', 'Europe/Tirane'), theth: city('theth', 'AL', null), x: city('x', 'US', null), ny: city('ny', 'US', 'America/New_York'), la: city('la', 'US', 'America/Los_Angeles') }
    expect(cityTimezone({ cities }, 'tirana')).toBe('Europe/Tirane')
    expect(cityTimezone({ cities }, 'theth')).toBe('Europe/Tirane')
    expect(cityTimezone({ cities }, 'x')).toBeNull()
  })
})
