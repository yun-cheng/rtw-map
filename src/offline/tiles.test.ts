import { describe, expect, it } from 'vitest'
import type { ScheduledStop } from '../planner'
import { cityExpired, citiesToDownload, cityTiles, glyphFiles, overviewTiles, tileAt } from './tiles'

const stop = (cityId: string, arrive: string, depart: string) => ({ cityId, arrive, depart, nights: 0, locked: false, groupId: '' }) as ScheduledStop
const STOPS = [
  stop('tirana', '2026-12-01', '2026-12-04'),
  stop('shkoder', '2026-12-04', '2026-12-10'),
  stop('berat', '2026-12-10', '2026-12-20'),
  stop('ohrid', '2026-12-20', '2027-01-02'),
]

describe('offline map', () => {
  it('finds the tile of a point', () => {
    expect(tileAt(0, 0, 1)).toEqual([1, 1])
    expect(tileAt(-180, 85, 2)).toEqual([0, 0])
    // Tirana at zoom 14.
    expect(tileAt(19.82, 41.33, 14)).toEqual([9094, 6122])
  })

  it('keeps the streets near a city and coarser tiles further out, more streets for a big city', () => {
    const small = cityTiles({ lat: 41.33, lon: 19.82, population: 500_000 })
    const big = cityTiles({ lat: 41.33, lon: 19.82, population: 2_000_000 })
    const at = (tiles: Set<string>, z: number) => [...tiles].filter((t) => t.startsWith(`${z}/`)).length
    expect(at(small, 14)).toBeGreaterThan(9)
    expect(at(big, 14)).toBeGreaterThan(at(small, 14))
    expect(at(small, 8)).toBeLessThan(at(small, 14))
    expect(small.has('14/9094/6122')).toBe(true)
    expect(small.size).toBeLessThan(220)
  })

  it('keeps the region around a city zoomed out, with the relief, and not the whole world', () => {
    const tiles = cityTiles({ lat: 41.33, lon: 19.82, population: 500_000 })
    expect(tiles.has('0/0/0')).toBe(true)
    expect(tiles.has('relief:0/0/0')).toBe(true)
    expect([...tiles].filter((t) => t.startsWith('7/')).length).toBeLessThanOrEqual(4)
    expect([...tiles].some((t) => t.startsWith('relief:7/'))).toBe(false)
  })

  it('covers the whole trip zoomed out, around each stop and not the whole world', () => {
    const balkans = overviewTiles([{ lat: 41.33, lon: 19.82 }, { lat: 41.11, lon: 20.8 }])
    const world = overviewTiles([{ lat: 41.33, lon: 19.82 }, { lat: 13.75, lon: 100.5 }, { lat: -34.6, lon: -58.4 }])
    expect(balkans.has('0/0/0')).toBe(true)
    expect(balkans.has('relief:5/17/11')).toBe(true)
    expect([...balkans].some((t) => /^6\//.test(t))).toBe(false)
    // Nearby stops share their tiles; stops around the world add a few each.
    expect(balkans.size).toBeLessThan(30)
    expect(world.size).toBeLessThan(3 * balkans.size)
    expect(world.size).toBeLessThan(4 ** 3)
  })

  it('downloads the cities of the next weeks, from the first day before the trip starts', () => {
    // Under way, on 5 Dec: a week is to the 12th (Shkodër, Berat), two to the 19th.
    expect(citiesToDownload(STOPS, '2026-12-05', 1)).toEqual(['shkoder', 'berat'])
    expect(citiesToDownload(STOPS, '2026-12-05', 2)).toEqual(['shkoder', 'berat'])
    expect(citiesToDownload(STOPS, '2026-12-05', 3)).toEqual(['shkoder', 'berat', 'ohrid'])
    expect(citiesToDownload(STOPS, '2026-12-05', 'trip')).toEqual(['shkoder', 'berat', 'ohrid'])
    // Before it: its first week.
    expect(citiesToDownload(STOPS, '2026-10-12', 1)).toEqual(['tirana', 'shkoder'])
    expect(citiesToDownload(STOPS, '2026-12-05', 0)).toEqual([])
    // After it: nothing.
    expect(citiesToDownload(STOPS, '2027-01-03', 'trip')).toEqual([])
  })

  it("removes a city's map some days after leaving it, or once it's out of the trip", () => {
    expect(cityExpired('tirana', STOPS, '2026-12-10', 7)).toBe(false)
    expect(cityExpired('tirana', STOPS, '2026-12-11', 7)).toBe(true)
    expect(cityExpired('tirana', STOPS, '2026-12-04', 0)).toBe(true)
    expect(cityExpired('tirana', STOPS, '2027-06-01', 'never')).toBe(false)
    expect(cityExpired('skopje', STOPS, '2026-12-01', 'never')).toBe(true)
    // A city visited twice: after the last stay.
    const twice = [...STOPS, stop('tirana', '2027-01-02', '2027-01-04')]
    expect(cityExpired('tirana', twice, '2026-12-20', 7)).toBe(false)
  })

  it("downloads the glyphs for the trip's scripts, Latin always", () => {
    const latin = glyphFiles(['Latin'])
    expect(latin).toContain('Noto Sans Regular/0-255.pbf')
    expect(latin.some((f) => f.includes('1024-1279'))).toBe(false)
    const files = glyphFiles(['Cyrillic and Latin (both used on signs)', 'Thai script; tourist areas also in English'])
    expect(files).toContain('Noto Sans Bold/1024-1279.pbf')
    expect(files).toContain('Noto Sans Italic/3584-3839.pbf')
  })
})
