import { describe, expect, it } from 'vitest'
import { EU, FREE_MOVEMENT, SCHENGEN } from './areas'
import { dataset as ds } from './dataset'

describe('Schengen and free-movement areas', () => {
  it('names countries on the map', () => {
    expect([...SCHENGEN, ...FREE_MOVEMENT].filter((c) => !ds.world[c])).toEqual([])
    expect(SCHENGEN.size).toBe(29)
    expect(EU.size).toBe(27)
  })
  it('agrees with the flags of the app\'s countries', () => {
    for (const c of Object.values(ds.countries)) {
      expect([c.iso2, c.schengen]).toEqual([c.iso2, SCHENGEN.has(c.iso2)])
      expect([c.iso2, c.eu]).toEqual([c.iso2, EU.has(c.iso2)])
    }
  })
})
