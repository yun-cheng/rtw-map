// A tool call from the trip's MCP server (worker/mcp.ts) for another app's AI assistant, run here on the trip it was
// sent with: the trip assistant's own tools (src/agent/tools.ts) with the app's city data, which the Worker doesn't
// have, My visit, and the journal (the app's assistant doesn't read that). A change answers with the trip after
// it, or My visit's items it changed, and what changed, for the Worker to save (with undo).
import { RUNNER_TOOLS } from '../src/agent/mcpTools'
import { ITEM_TOOLS } from '../src/agent/schema'
import { cityName, describeChanges, describeItemChanges, itemsHandle, runTool, toolContext, tripContext, withTrip, type ToolResult } from '../src/agent/tools'
import type { Items, TripItem } from '../src/store/itemsCore'
import { isEmptyEntry, type Journal } from '../src/store/journalCore'
import { createTripStore, tripData, type TripData } from '../src/store/tripCore'

export type ToolCall = { name: string; args: Record<string, unknown>; trip: { id: string; name: string } | null; data: TripData | null; extra: unknown }
/** A tool's answer; a change that did something also has the trip after it (`data`) or the My visit items changed
 *  (`items`), and what changed (`changes`). */
export type ToolAnswer = { ok: boolean; result: ToolResult; data?: TripData; items?: TripItem[]; changes?: string[] }

/** The journal days shown without from and to; the most in a range. */
const LATEST_DAYS = 60
const MOST_DAYS = 120

export function parseToolCall(raw: unknown): ToolCall | null {
  const c = (raw ?? {}) as Partial<ToolCall>
  if (typeof c.name !== 'string' || !RUNNER_TOOLS[c.name]) return null
  if (!c.args || typeof c.args !== 'object' || Array.isArray(c.args)) return null
  return { name: c.name, args: c.args, trip: c.trip ?? null, data: c.data ?? null, extra: c.extra ?? null }
}

export function callTool(call: ToolCall): ToolAnswer {
  const store = createTripStore(call.data)
  const args = Object.fromEntries(Object.entries(call.args).filter(([k]) => k !== 'trip'))
  const trip = call.trip && { trip: call.trip.name }
  const items = RUNNER_TOOLS[call.name].extra === 'items' ? itemsHandle(call.extra as Items | null) : undefined
  return withTrip(toolContext(store, [], false, items), () => {
    try {
      if (call.name === 'get_journal') return { ok: true, result: { ...trip, ...journal(call.extra as Journal | null, args) } }
      const before = tripData(store.getState())
      const out = runTool(call.name, args)
      if (out.ok && call.name === 'get_trip') return { ok: true, result: { ...trip, description: tripContext(), ...out.result } }
      if (!out.ok || !RUNNER_TOOLS[call.name].write) return { ok: out.ok, result: out.ok && call.name === 'get_visit' ? { ...trip, ...out.result } : out.result }
      if (ITEM_TOOLS.has(call.name)) {
        const was = (call.extra ?? {}) as Items
        // (Saved as they were, such as a ticket saved again from the same email, is no change.)
        const fields = (x: TripItem | undefined) => JSON.stringify(Object.entries(x ?? {}).filter(([k]) => k !== 'updatedAt').sort())
        const same = (x: TripItem | undefined, y: TripItem | undefined) => fields(x) === fields(y)
        const changed = [...items!.changed].map((id) => items!.get()[id]).filter((i) => !same(i, was[i.id]))
        if (!changed.length) return { ok: true, result: { ...trip, done: `${out.summary} (no change)` } }
        const changes = describeItemChanges(was, items!.get())
        return { ok: true, result: { ...trip, done: out.summary }, items: changed, changes: changes.length ? changes : [out.summary] }
      }
      const after = tripData(store.getState())
      const changes = describeChanges(before, after)
      // (A change that changed nothing, such as nights set to what they were, has nothing to save.)
      if (JSON.stringify(after) === JSON.stringify(before)) return { ok: true, result: { ...trip, done: `${out.summary} (no change)` } }
      // The user's notes as kept before items stay with the trip (the app moves them when it opens it).
      const data = { ...after, ...(call.data?.notes && { notes: call.data.notes }) }
      return { ok: true, result: { ...trip, done: out.summary, description: tripContext() }, data, changes: changes.length ? changes : [out.summary] }
    } catch (e) {
      return { ok: false, result: { error: (e as Error).message } }
    }
  })
}

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** The days written, oldest first: those from and to the days asked, or the latest. */
function journal(entries: Journal | null, args: Record<string, unknown>): ToolResult {
  const from = isDay(args.from) ? args.from : null
  const to = isDay(args.to) ? args.to : null
  const days = Object.values(entries ?? {})
    .filter((e) => !isEmptyEntry(e) && (!from || e.date >= from) && (!to || e.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date))
  const shown = days.slice(-(from || to ? MOST_DAYS : LATEST_DAYS))
  if (!shown.length) return { days: [], note: from || to ? 'Nothing written for those days.' : 'Nothing written in the journal yet.' }
  return {
    days: shown.map((e) => ({ date: e.date, city: e.cityId && cityName(e.cityId), highlight: e.highlight || undefined, text: e.text || undefined, rating: e.rating, tags: e.tags })),
    ...(days.length > shown.length && { earlier: `${days.length - shown.length} earlier days not shown: ask with from and to.` }),
  }
}
