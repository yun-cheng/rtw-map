import { describe, expect, it } from 'vitest'
import boundaries from '../../data/gen/boundaries.json'
import { dataset as ds } from './dataset'
import { REGIONS } from './regions'

const WORLD = ds.world

describe('world regions', () => {
  it('puts every country on the map in exactly one region', () => {
    const seen = REGIONS.flatMap((r) => r.countries)
    expect(seen.filter((c, i) => seen.indexOf(c) !== i)).toEqual([])
    expect(Object.keys(WORLD).filter((c) => !seen.includes(c))).toEqual([])
    expect(seen.filter((c) => !WORLD[c])).toEqual([])
  })
  it('has an outline for every country, however small (Vatican City, Tuvalu)', () => {
    const empty = boundaries.features.filter((f) => !f.geometry.coordinates.some((poly) => poly[0]?.length >= 4)).map((f) => f.properties.iso2)
    expect(empty).toEqual([])
  })
  it('includes every country the app has data on', () => {
    expect(Object.keys(ds.countries).filter((c) => !WORLD[c])).toEqual([])
  })
})
