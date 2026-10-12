// The trip's MCP server (Model Context Protocol) at /mcp: other apps' AI assistants (Claude, ChatGPT and Codex,
// Gemini CLI), connected with oauth.ts, read and change the user's trips with the trip assistant's own tools
// (src/agent/mcpTools.ts). Streamable HTTP without sessions or streams: each POST is one JSON-RPC message, answered
// with JSON. The tools that need the app's city data run on the runner (runner/tool.ts: the Worker has too little CPU
// for them); list_trips, get_changes and undo are answered here. A change is saved with the trip from before it, so
// it can be undone (changes.ts), by the app or by the user in the app.
import { MCP_INSTRUCTIONS, MCP_TOOLS, RUNNER_TOOLS } from '../src/agent/mcpTools'
import type { ChangeView } from './changes'
import { canWrite, CORS } from './oauth'
import type { TripSummary } from './trips'

/** The protocol versions understood, newest first. */
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26']
const BODY_BYTES = 100_000

export type McpContext = {
  /** What the app was allowed (oauth.ts SCOPES). */
  scope: string
  listTrips: () => Promise<{ trips: TripSummary[]; lastId: string | null }>
  /** A trip as stored (JSON text) and its rev, with its items or journal if asked. */
  tripTexts: (id: string, extra: 'items' | 'journal' | null) => Promise<{ data: string | null; extra: string | null; rev: number } | null>
  /** Runs a tool call (JSON text) on the runner: a change also answers with the trip after it and what changed. */
  runTool: (body: string) => Promise<{ ok: boolean; result: unknown; data?: unknown; changes?: string[] }>
  /** Saves a change made on the trip at rev `base` (or why it can't be). */
  saveChange: (tripId: string, base: number, data: unknown, change: { tool: string; summary: string[] }) => Promise<{ change: ChangeView } | string>
  /** The changes made to a trip by apps, newest first. */
  changes: (tripId: string) => Promise<ChangeView[]>
  /** Undoes a change (by id), or this app's latest. */
  undo: (tripId: string, change: string | null) => Promise<{ undone: ChangeView[] } | string>
}

type Message = { jsonrpc?: unknown; id?: string | number | null; method?: unknown; params?: unknown }
type Answer = { result: unknown } | { error: { code: number; message: string } }

const reply = (id: Message['id'], answer: Answer, status = 200) =>
  Response.json({ jsonrpc: '2.0', id: id ?? null, ...answer }, { status, headers: { 'Cache-Control': 'no-store', ...CORS } })

/** One request from the app's assistant (already signed in). */
export async function handleMcp(request: Request, ctx: McpContext): Promise<Response> {
  // No stream for messages from the server (GET), and no sessions to end (DELETE).
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST', ...CORS } })
  const text = await request.text()
  if (text.length > BODY_BYTES) return reply(null, { error: { code: -32600, message: 'Request too large' } }, 413)
  let msg: Message
  try {
    msg = JSON.parse(text)
  } catch {
    return reply(null, { error: { code: -32700, message: 'Parse error' } }, 400)
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0') return reply(null, { error: { code: -32600, message: 'Invalid request' } }, 400)
  // Notifications, and answers to requests (the server sends none), need no answer.
  if (msg.id === undefined || msg.id === null || typeof msg.method !== 'string') return new Response(null, { status: 202, headers: CORS })
  const params = msg.params && typeof msg.params === 'object' && !Array.isArray(msg.params) ? (msg.params as Record<string, unknown>) : {}
  return reply(msg.id, await answer(msg.method, params, ctx))
}

/** Tools that change a trip: only for an app the user allowed to. */
const changes = (name: string) => !!RUNNER_TOOLS[name]?.write || name === 'undo'

async function answer(method: string, params: Record<string, unknown>, ctx: McpContext): Promise<Answer> {
  switch (method) {
    case 'initialize': {
      const asked = String(params.protocolVersion ?? '')
      return {
        result: {
          protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'rtw-map', title: 'rtw-map trips', version: '1.1.0' },
          instructions: MCP_INSTRUCTIONS,
        },
      }
    }
    case 'ping': return { result: {} }
    case 'tools/list': return { result: { tools: MCP_TOOLS.filter((t) => canWrite(ctx.scope) || !changes(t.name)) } }
    case 'tools/call': return callTool(params, ctx)
    default: return { error: { code: -32601, message: `Method not found: ${method}` } }
  }
}

const text = (body: unknown, isError = false): Answer => ({ result: { content: [{ type: 'text', text: JSON.stringify(body) }], isError } })
const failed = (message: string) => text({ error: message }, true)
const day = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

async function callTool(params: Record<string, unknown>, ctx: McpContext): Promise<Answer> {
  const name = String(params.name ?? '')
  const raw = params.arguments
  const args = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const tool = RUNNER_TOOLS[name] ?? (['list_trips', 'get_changes', 'undo'].includes(name) ? { trip: name !== 'list_trips' } : null)
  if (!tool) return { error: { code: -32602, message: `Unknown tool: ${name}` } }
  if (changes(name) && !canWrite(ctx.scope)) {
    return failed('The user allowed this app only to read their trips. To let it change them, they disconnect it in rtw-map (Account, AI apps) and connect it again.')
  }
  const { trips, lastId } = await ctx.listTrips()
  if (name === 'list_trips') {
    return text({
      trips: trips.map((t) => ({
        id: t.id, name: t.name, start_date: t.startDate, end_date: t.endDate, stops: t.stops,
        updated: new Date(t.updated).toISOString().slice(0, 10), open_in_app: t.id === lastId,
      })),
    })
  }

  // The trip asked for (by id or name), or the one opened last in the app.
  const ref = typeof args.trip === 'string' ? args.trip.trim() : ''
  const trip = ref ? trips.find((t) => t.id === ref) ?? trips.find((t) => t.name.trim().toLowerCase() === ref.toLowerCase())
    : trips.find((t) => t.id === lastId) ?? trips[0]
  if (ref && !trip) return failed(`No trip called "${ref}". The trips: ${trips.map((t) => t.name).join(', ') || 'none'}.`)
  if (!trip && tool.trip) return failed('There are no trips saved in this account yet: plan one in the app first.')

  if (name === 'get_changes') {
    const list = await ctx.changes(trip!.id)
    return text({
      trip: trip!.name,
      changes: list.map((c) => ({ id: c.id, app: c.app, tool: c.tool, changes: c.summary, when: `${day(c.created)} UTC`, ...(c.undone && { undone: true }) })),
      ...(!list.length && { note: 'No changes made by apps to this trip in the last two weeks.' }),
    })
  }
  if (name === 'undo') {
    const out = await ctx.undo(trip!.id, typeof args.change === 'string' && args.change.trim() ? args.change.trim() : null)
    if (typeof out === 'string') return failed(out)
    return text({ trip: trip!.name, undone: out.undone.map((c) => ({ id: c.id, app: c.app, changes: c.summary })), done: 'The trip is back as it was before these changes.' })
  }

  const texts = trip ? await ctx.tripTexts(trip.id, 'extra' in tool ? tool.extra ?? null : null) : null
  const body = `{"name":${JSON.stringify(name)},"args":${JSON.stringify(args)},"trip":${trip ? JSON.stringify({ id: trip.id, name: trip.name }) : 'null'},` +
    `"data":${texts?.data ?? 'null'},"extra":${texts?.extra ?? 'null'}}`
  const out = await ctx.runTool(body)
  if (!out.ok || !out.data || !trip || !texts) return text(out.result, !out.ok)
  // A change: saved (refused if the trip changed meanwhile, or the app's own assistant is working on it).
  const saved = await ctx.saveChange(trip.id, texts.rev, out.data, { tool: name, summary: out.changes ?? [] })
  if (typeof saved === 'string') return failed(`Not changed: ${saved}`)
  const { description, ...result } = out.result as Record<string, unknown>
  return text({ ...result, changes: saved.change.summary, change_id: saved.change.id, undo: 'The user sees this change in the app and can undo it there; or call undo.', description })
}
