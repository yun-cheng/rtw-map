// Saved trips: checks what the browser sends and builds the short summary shown in the trip list.
// Plain functions, used by the Account Durable Object (account.ts) and tested in worker.test.ts.

export const TRIP_LIMITS = { trips: 50, plans: 8, nameChars: 80, dataBytes: 400_000, chatBytes: 600_000, noteChars: 2000 }

/** What a trip list shows without loading each trip; `share`: the token of its public link, if it's shared. */
export type TripSummary = { id: string; name: string; startDate: string | null; endDate: string | null; stops: number; updated: number; share: string | null }
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
    const d = data as { input?: unknown; stops?: unknown; plans?: unknown; activePlanId?: unknown; readOnly?: unknown; notes?: unknown }
    if (!d || typeof d !== 'object' || typeof d.input !== 'object' || !Array.isArray(d.stops)) return 'Invalid trip'
    // Other versions of the itinerary (plans), each with its own setup and stops; the active one is also at the top.
    const plans = d.plans === undefined ? undefined : Array.isArray(d.plans) && d.plans.length <= TRIP_LIMITS.plans ? d.plans : null
    if (plans === null || plans?.some((p) => !p || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.input !== 'object' || !Array.isArray(p.stops))) {
      return 'Invalid trip plans'
    }
    patch.data = JSON.stringify({
      input: d.input, stops: d.stops,
      ...(plans && { plans, activePlanId: typeof d.activePlanId === 'string' ? d.activePlanId : undefined }),
      ...(d.readOnly === true && { readOnly: true }),
      ...notesOf(d.notes),
    })
    if (patch.data.length > TRIP_LIMITS.dataBytes) return 'This trip is too large to save'
  }
  if (chat !== undefined) {
    patch.chat = JSON.stringify(chat)
    if (patch.chat.length > TRIP_LIMITS.chatBytes) return 'This trip\'s chat is too long to save: start a new chat'
  }
  return patch
}

/** The user's notes on cities and journeys: text only, each cut to the most allowed; anything else is dropped. */
function notesOf(raw: unknown): { notes?: Record<'cities' | 'legs', Record<string, string>> } {
  if (!raw || typeof raw !== 'object') return {}
  const texts = (x: unknown) => Object.fromEntries(
    Object.entries(x && typeof x === 'object' ? x : {}).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, (v as string).slice(0, TRIP_LIMITS.noteChars)]),
  )
  const notes = { cities: texts((raw as { cities?: unknown }).cities), legs: texts((raw as { legs?: unknown }).legs) }
  return Object.keys(notes.cities).length || Object.keys(notes.legs).length ? { notes } : {}
}

/** A new public link's token: 128 random bits, URL-safe. */
export function shareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const isShareToken = (s: string) => /^[\w-]{22}$/.test(s)

/** A shared trip as anyone with its link sees it: read-only, without what's private (the user's notes, their wishes
 *  for the assistant, the chat, which isn't in `data`). */
export function publicTripData(data: string | null): unknown {
  const d = JSON.parse(data ?? 'null') as { input?: Record<string, unknown>; plans?: { input?: Record<string, unknown> }[]; notes?: unknown } | null
  if (!d) return null
  const { notes: _, ...rest } = d
  const open = (input?: Record<string, unknown>) => {
    if (!input) return input
    const { wishes: __, ...kept } = input
    return kept
  }
  return { ...rest, input: open(d.input), ...(d.plans && { plans: d.plans.map((p) => ({ ...p, input: open(p.input) })) }), readOnly: true }
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
