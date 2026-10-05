const DAY = 86_400_000

export const toDate = (iso: string) => new Date(iso + 'T00:00:00Z')
export const toIso = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (iso: string, n: number) => toIso(new Date(toDate(iso).getTime() + n * DAY))
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY)
/** Day of the trip a date falls on: the start date is day 1. */
export const tripDay = (start: string, date: string) => daysBetween(start, date) + 1
export const monthOf = (iso: string) => Number(iso.slice(5, 7))
