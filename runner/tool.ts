// A tool call from the trip's MCP server (worker/mcp.ts) for another app's AI assistant, run here on the trip it was
// sent with: the trip assistant's own read tools (src/agent/tools.ts) with the app's city data, which the Worker
// doesn't have, and My visit and the journal (the app's assistant doesn't read those).
import { RUNNER_TOOLS } from '../src/agent/mcpTools'
import { cityId, cityName, runTool, toolContext, tripContext, withTrip, type ToolResult } from '../src/agent/tools'
import { isEmptyItem, type Items, type TripItem } from '../src/store/itemsCore'
import { isEmptyEntry, type Journal } from '../src/store/journalCore'
import { createTripStore, type TripData } from '../src/store/tripCore'

export type ToolCall = { name: string; args: Record<string, unknown>; trip: { id: string; name: string } | null; data: TripData | null; extra: unknown }

/** The journal days shown without from and to; the most in a range. */
const LATEST_DAYS = 60
const MOST_DAYS = 120

export function parseToolCall(raw: unknown): ToolCall | null {
  const c = (raw ?? {}) as Partial<ToolCall>
  if (typeof c.name !== 'string' || !RUNNER_TOOLS[c.name]) return null
  if (!c.args || typeof c.args !== 'object' || Array.isArray(c.args)) return null
  return { name: c.name, args: c.args, trip: c.trip ?? null, data: c.data ?? null, extra: c.extra ?? null }
}

export function callTool(call: ToolCall): { ok: boolean; result: ToolResult } {
  const store = createTripStore(call.data)
  const args = Object.fromEntries(Object.entries(call.args).filter(([k]) => k !== 'trip'))
  const trip = call.trip && { trip: call.trip.name }
  return withTrip(toolContext(store), () => {
    try {
      if (call.name === 'get_visit') return { ok: true, result: { ...trip, ...visit(call.extra as Items | null, args.city, store.getState().stops.map((s) => s.cityId)) } }
      if (call.name === 'get_journal') return { ok: true, result: { ...trip, ...journal(call.extra as Journal | null, args) } }
      const out = runTool(call.name, args)
      if (!out.ok || call.name !== 'get_trip') return out
      return { ok: true, result: { ...trip, description: tripContext(), ...out.result } }
    } catch (e) {
      return { ok: false, result: { error: (e as Error).message } }
    }
  })
}

const KINDS = ['stay', 'note', 'album', 'link']
const where = (at: string) => at.split('>').map(cityName).join(' → ')

/** The items kept for the trip's cities and journeys, in the trip's order (only a city's and its journeys', if asked). */
function visit(items: Items | null, city: unknown, stops: string[]): ToolResult {
  const only = typeof city === 'string' && city.trim() ? cityId(city) : null
  const order = (i: TripItem) => {
    const n = stops.indexOf(i.at.split('>')[0])
    return n < 0 ? stops.length : n
  }
  const list = Object.values(items ?? {})
    .filter((i) => !isEmptyItem(i) && (!only || i.at.split('>').includes(only)))
    .sort((a, b) => order(a) - order(b) || a.at.localeCompare(b.at) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || (a.from ?? '').localeCompare(b.from ?? ''))
  if (!list.length) return { items: [], note: only ? `Nothing kept for ${cityName(only)} yet.` : 'Nothing kept in My visit yet.' }
  return {
    items: list.map((i) => ({
      where: where(i.at), kind: i.kind, title: i.title, address: i.address, check_in: i.from, check_out: i.to, url: i.url,
      reference: i.ref, price: i.price, text: i.text, updated: new Date(i.updatedAt).toISOString().slice(0, 10),
    })),
  }
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
    days: shown.map((e) => ({ date: e.date, city: e.cityId && cityName(e.cityId), highlight: e.highlight || undefined, text: e.text || undefined, rating: e.rating })),
    ...(days.length > shown.length && { earlier: `${days.length - shown.length} earlier days not shown: ask with from and to.` }),
  }
}
