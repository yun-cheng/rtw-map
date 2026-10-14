// A saved trip's version history (worker/versions.ts): the versions, a page at a time, newest first, and what changed
// in each, said here from the trip before and after it (the server keeps the trips, not what changed).
import { create } from 'zustand'
import { describeChanges, type TripSnapshot } from '../agent/tools'
import { loadTrip, type TripData } from './tripCore'
import type { VersionBy, VersionView } from '../../worker/versions'

export type { VersionBy }
export type Version = Omit<VersionView, 'data'> & { data: TripData | null }

/** Whether the version history panel is open. */
export const useVersionHistory = create<{ open: boolean }>()(() => ({ open: false }))

/** A page of a trip's versions from before `before` (the oldest one listed's start), newest first, with the one
 *  before the oldest (`previous`, to say what the oldest changed), and whether there are more. */
export async function fetchVersions(tripId: string, before?: number): Promise<{ versions: Version[]; previous: Version | null; more: boolean }> {
  const res = await fetch(`/api/trips/${tripId}/versions${before ? `?before=${before}` : ''}`)
  const body = (await res.json().catch(() => null)) as { versions: Version[]; more: boolean; error?: string } | null
  if (!res.ok || !body) throw new Error(body?.error ?? `The history couldn't be loaded (${res.status}).`)
  const shown = body.more ? body.versions.slice(0, -1) : body.versions
  return { versions: shown, previous: body.more ? body.versions.at(-1)! : null, more: body.more }
}

/** A trip as its changes are told: as the app opens it (older trips filled in), its plans only if it has them (those
 *  made up for a trip saved before plans would have new ids each time). */
function snap(data: TripData): TripSnapshot & { readOnly: boolean } {
  const t = loadTrip(data)
  return { input: t.input, stops: t.stops, ...(data.plans?.length && { plans: t.plans, activePlanId: t.activePlanId }), readOnly: t.readOnly }
}

/** What changed from one version of a trip to the next, in plain language (`before` null: the trip's first). */
export function versionChanges(before: TripData | null, after: TripData | null): string[] {
  if (!after) return []
  let b = snap(after)
  if (!before) return [b.stops.length ? `Started the trip: ${b.stops.length} stops` : 'Started the trip']
  let a = snap(before)
  // (A trip saved before plans, and after: its plans aren't compared.)
  if (!a.plans || !b.plans) [a, b] = [{ ...a, plans: undefined, activePlanId: undefined }, { ...b, plans: undefined, activePlanId: undefined }]
  const out = describeChanges(a, b)
  // (describeChanges tells the plan shown; the others' own changes are named.)
  if (a.activePlanId === b.activePlanId) {
    for (const p of b.plans ?? []) {
      const old = a.plans?.find((x) => x.id === p.id)
      if (p.id !== b.activePlanId && old && JSON.stringify([old.input, old.stops]) !== JSON.stringify([p.input, p.stops])) out.push(`Changed ${p.name}`)
    }
  }
  if (a.readOnly !== b.readOnly) out.push(b.readOnly ? 'Made read-only' : 'Made editable')
  return out
}
