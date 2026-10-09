import { describe, expect, it } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { REGIONS } from '../data/regions'
import { countryShape, shapeOf } from './shapes'

const inside = (s: { box: number[]; centre: number[] }) =>
  s.centre[0] >= s.box[0] && s.centre[0] <= s.box[2] && s.centre[1] >= s.box[1] && s.centre[1] <= s.box[3]

describe('where the map centres', () => {
  it('has a middle inside every country, even the smallest (Vatican City, Tuvalu)', () => {
    const bad = Object.keys(ds.world).filter((iso2) => {
      const s = countryShape(iso2)
      return !s || !inside(s) || Number.isNaN(s.centre[0])
    })
    expect(bad).toEqual([])
  })

  it('has a middle inside every region, on the map (not past the date line)', () => {
    const bad = REGIONS.filter((r) => {
      const s = shapeOf(r.countries)
      return !s || !inside(s) || s.centre[0] < -180 || s.centre[0] > 360
    }).map((r) => r.name)
    expect(bad).toEqual([])
  })

  it('centres Iberia in Spain and the Nordic countries in Scandinavia', () => {
    const iberia = shapeOf(REGIONS.find((r) => r.name === 'Iberia')!.countries)!.centre
    expect(iberia[0]).toBeGreaterThan(-9)
    expect(iberia[0]).toBeLessThan(0)
    const nordic = shapeOf(REGIONS.find((r) => r.name === 'Nordic countries')!.countries)!.centre
    expect(nordic[0]).toBeGreaterThan(5)
    expect(nordic[0]).toBeLessThan(25)
  })

  it('measures a country across the date line the short way round', () => {
    const russia = countryShape('RU')!
    expect(russia.box[2] - russia.box[0]).toBeLessThan(180)
  })
})
