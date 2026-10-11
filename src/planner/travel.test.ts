import { describe, expect, it } from 'vitest'
import { isTravelling, localToday, pastChanges, stopTime, travelDay, tripPhase } from './travel'
import type { ScheduledStop } from './types'

const stop = (cityId: string, arrive: string, depart: string): ScheduledStop => ({ cityId, arrive, depart, nights: 0, locked: false, groupId: '' })
const input = { startDate: '2027-05-01', endDate: '2027-05-20' }
const trip = (stops: ScheduledStop[], startDate = input.startDate) => ({ input: { startDate }, stops })
// Tirana 1–4 May, Shkodër 4–8 May (today: 6 May), Berat 8–12 May.
const before = trip([stop('tirana', '2027-05-01', '2027-05-04'), stop('shkoder', '2027-05-04', '2027-05-08'), stop('berat', '2027-05-08', '2027-05-12')])
const today = '2027-05-06'

describe('a trip under way', () => {
  it('knows today, the trip day and where it is', () => {
    expect(localToday(new Date(2027, 4, 6, 23, 30))).toBe('2027-05-06')
    expect(isTravelling(input, today)).toBe(true)
    expect(isTravelling(input, '2027-04-30')).toBe(false)
    // (The end date, the day of leaving, is the trip's last day: day 20 of 20.)
    expect(travelDay(input, before.stops, today)).toEqual({ day: 6, of: 20, at: 1 })
    expect(travelDay(input, before.stops, input.endDate).day).toBe(20)
    expect(['2027-04-30', '2027-05-01', '2027-05-20', '2027-05-21'].map((d) => tripPhase(input, d))).toEqual(['before', 'travelling', 'travelling', 'after'])
    expect(tripPhase({ startDate: '', endDate: '' }, today)).toBe(null)
    expect(before.stops.map((s) => stopTime(s, today))).toEqual(['done', 'now', 'ahead'])
  })

  it('lets everything after today change', () => {
    const after = trip([before.stops[0], stop('shkoder', '2027-05-04', '2027-05-07'), stop('ohrid', '2027-05-07', '2027-05-12')])
    expect(pastChanges(before, after, today)).toEqual([])
  })

  it('finds changes to the days so far: the start, stops left or begun, nights already spent', () => {
    expect(pastChanges(before, trip(before.stops, '2027-05-02'), today)).toEqual([{ kind: 'start' }])
    expect(pastChanges(before, trip(before.stops.slice(1)), today)).toContainEqual({ kind: 'stop', cityId: 'tirana', change: 'gone' })
    expect(pastChanges(before, trip([before.stops[1], before.stops[0], before.stops[2]]), today)).toContainEqual({ kind: 'stop', cityId: 'shkoder', change: 'moved' })
    expect(pastChanges(before, trip([stop('tirana', '2027-05-01', '2027-05-03'), ...before.stops.slice(1)]), today)).toContainEqual({ kind: 'stop', cityId: 'tirana', change: 'nights' })
    // Tonight's stop can't end before tomorrow.
    expect(pastChanges(before, trip([before.stops[0], stop('shkoder', '2027-05-04', '2027-05-06'), before.stops[2]]), today)).toEqual([{ kind: 'stop', cityId: 'shkoder', change: 'nights' }])
  })
})
