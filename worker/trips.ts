// Saved trips: checks what the browser sends and builds the short summary shown in the trip list.
// Plain functions, used by the Account Durable Object (account.ts) and tested in worker.test.ts.

export const TRIP_LIMITS = { trips: 50, plans: 8, nameChars: 80, dataBytes: 400_000, chatBytes: 600_000 }

/** What a trip list shows without loading each trip. */
export type TripSummary = { id: string; name: string; startDate: string | null; endDate: string | null; stops: number; updated: number }
export type TripPatch = { name?: string; data?: string; chat?: string }

/** Validates a create/save request; trip data and chat are kept as JSON text. */
export function parseTripPatch(raw: unknown): TripPatch | string {
  if (!raw || typeof raw !== 'object') return 'Invalid request'
  const { name, data, chat } = raw as Record<string, unknown>
  const patch: TripPatch = {}
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return 'Give the trip a name'
    patch.name = name.trim().slice(0, TRIP_LIMITS.nameChars)
  }
  if (data !== undefined) {
    const d = data as { input?: unknown; stops?: unknown; plans?: unknown; activePlanId?: unknown }
    if (!d || typeof d !== 'object' || typeof d.input !== 'object' || !Array.isArray(d.stops)) return 'Invalid trip'
    // Other versions of the itinerary (plans), each with its own setup and stops; the active one is also at the top.
    const plans = d.plans === undefined ? undefined : Array.isArray(d.plans) && d.plans.length <= TRIP_LIMITS.plans ? d.plans : null
    if (plans === null || plans?.some((p) => !p || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.input !== 'object' || !Array.isArray(p.stops))) {
      return 'Invalid trip plans'
    }
    patch.data = JSON.stringify({ input: d.input, stops: d.stops, ...(plans && { plans, activePlanId: typeof d.activePlanId === 'string' ? d.activePlanId : undefined }) })
    if (patch.data.length > TRIP_LIMITS.dataBytes) return 'This trip is too large to save'
  }
  if (chat !== undefined) {
    patch.chat = JSON.stringify(chat)
    if (patch.chat.length > TRIP_LIMITS.chatBytes) return 'This trip\'s chat is too long to save: start a new chat'
  }
  return patch
}

/** Dates and number of stops, for the trip list. */
export function summarize(data: string | null): Pick<TripSummary, 'startDate' | 'endDate' | 'stops'> {
  try {
    const d = JSON.parse(data ?? '{}') as { input?: { startDate?: string; endDate?: string }; stops?: unknown[] }
    return { startDate: d.input?.startDate ?? null, endDate: d.input?.endDate ?? null, stops: d.stops?.length ?? 0 }
  } catch {
    return { startDate: null, endDate: null, stops: 0 }
  }
}
