// The trip's MCP server (Model Context Protocol) at /mcp: other apps' AI assistants (Claude, ChatGPT and Codex,
// Gemini CLI), connected with oauth.ts, read the user's trips with the trip assistant's own tools
// (src/agent/mcpTools.ts). Streamable HTTP without sessions or streams: each POST is one JSON-RPC message, answered
// with JSON. The tools that need the app's city data run on the runner (runner/tool.ts: the Worker has too little CPU
// for them); list_trips is answered here.
import { MCP_INSTRUCTIONS, MCP_TOOLS, RUNNER_TOOLS } from '../src/agent/mcpTools'
import { CORS } from './oauth'
import type { TripSummary } from './trips'

/** The protocol versions understood, newest first. */
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26']
const BODY_BYTES = 100_000

export type McpContext = {
  listTrips: () => Promise<{ trips: TripSummary[]; lastId: string | null }>
  /** A trip as stored (JSON text), with its items or journal if asked. */
  tripTexts: (id: string, extra: 'items' | 'journal' | null) => Promise<{ data: string | null; extra: string | null } | null>
  /** Runs a tool call (JSON text) on the runner. */
  runTool: (body: string) => Promise<{ ok: boolean; result: unknown }>
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

async function answer(method: string, params: Record<string, unknown>, ctx: McpContext): Promise<Answer> {
  switch (method) {
    case 'initialize': {
      const asked = String(params.protocolVersion ?? '')
      return {
        result: {
          protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'rtw-map', title: 'rtw-map trips', version: '1.0.0' },
          instructions: MCP_INSTRUCTIONS,
        },
      }
    }
    case 'ping': return { result: {} }
    case 'tools/list': return { result: { tools: MCP_TOOLS } }
    case 'tools/call': return callTool(params, ctx)
    default: return { error: { code: -32601, message: `Method not found: ${method}` } }
  }
}

const text = (body: unknown, isError = false): Answer => ({ result: { content: [{ type: 'text', text: JSON.stringify(body) }], isError } })
const failed = (message: string) => text({ error: message }, true)

async function callTool(params: Record<string, unknown>, ctx: McpContext): Promise<Answer> {
  const name = String(params.name ?? '')
  const raw = params.arguments
  const args = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const { trips, lastId } = await ctx.listTrips()
  if (name === 'list_trips') {
    return text({
      trips: trips.map((t) => ({
        id: t.id, name: t.name, start_date: t.startDate, end_date: t.endDate, stops: t.stops,
        updated: new Date(t.updated).toISOString().slice(0, 10), open_in_app: t.id === lastId,
      })),
    })
  }
  const tool = RUNNER_TOOLS[name]
  if (!tool) return { error: { code: -32602, message: `Unknown tool: ${name}` } }

  // The trip asked for (by id or name), or the one opened last in the app.
  const ref = typeof args.trip === 'string' ? args.trip.trim() : ''
  const trip = ref ? trips.find((t) => t.id === ref) ?? trips.find((t) => t.name.trim().toLowerCase() === ref.toLowerCase())
    : trips.find((t) => t.id === lastId) ?? trips[0]
  if (ref && !trip) return failed(`No trip called "${ref}". The trips: ${trips.map((t) => t.name).join(', ') || 'none'}.`)
  if (!trip && tool.trip) return failed('There are no trips saved in this account yet: plan one in the app first.')
  const texts = trip ? await ctx.tripTexts(trip.id, tool.extra ?? null) : null
  const body = `{"name":${JSON.stringify(name)},"args":${JSON.stringify(args)},"trip":${trip ? JSON.stringify({ id: trip.id, name: trip.name }) : 'null'},` +
    `"data":${texts?.data ?? 'null'},"extra":${texts?.extra ?? 'null'}}`
  const out = await ctx.runTool(body)
  return text(out.result, !out.ok)
}
