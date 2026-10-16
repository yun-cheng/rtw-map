// The trip's tools for other apps' AI assistants (the MCP server, worker/mcp.ts): the trip assistant's tools
// (schema.ts), each told which trip to use, and what only they have: the list of trips, the journal, and their own
// changes, to undo. They run on the runner (runner/tool.ts), which has the app's city data; list_trips, get_changes
// and undo in the Worker. The tools that change a trip or its My visit (bookings read from the user's email, say) need
// the user's leave (the scope trips:write).
import { ITEM_TOOLS, TOOLS, WRITE_TOOLS, type FunctionDeclaration } from './schema'

type Schema = FunctionDeclaration['parametersJsonSchema']
export type McpTool = { name: string; title: string; description: string; inputSchema: Schema; annotations: Record<string, boolean | string> }

/** What the server tells the app's assistant when it connects. */
export const MCP_INSTRUCTIONS = `rtw-map plans long trips across many countries. These tools read and change the user's saved trips, and read the
app's data on cities: weather, costs, visas, safety, health, transport and the routes between cities. Use list_trips
to see the trips; the other tools use the trip opened last in the app unless given \`trip\`. The app only knows the
cities that find_cities returns: don't add others. Prices are in EUR and temperatures in °C. Visa, entry and safety
rules change: tell the user to confirm with official sources.

My visit is the user's own, kept with the trip (get_visit): where they stay in each city, their tickets for the
journeys between cities (flights, trains, buses, ferries), links, notes, receipts of what they spent, and prices they
paid. To import bookings (from the user's email, say, with another tool of yours), save each with save_visit_item: a
hotel or flat as a stay at its city, each flight or train as a ticket on the journey from city to journey_to (the
nearest cities in the app to the airports or stations; one ticket per flight, so a connection is two); and, if the
user asks to log their spending, each payment as a receipt at its city (what, day, amount, currency), linked to its
stays and tickets (bookings: their ids, given when each was saved; a package of flights and a hotel paid together is
one receipt for all of them). Check get_visit first and change a booking already there
(by its id) instead of adding it again. Keep times as the booking gives them, in each place's local time. Leave out
card numbers, passport numbers and the like. My visit can change on a read-only trip too.

Changing a trip (if the user allowed this app to): each change is saved at once in the user's account and shows in
the app, where the user can undo it; undo takes back this app's latest change. Changes apply to the trip's active
plan. Nothing re-fits the plan for you: an edit changes only what it touches, so after the changes asked for, leave
the plan in order: the stops' nights add up to the trip's nights exactly ("N of M nights"), in a sensible order,
moving nights between unlocked stops as needed. Prefer small edits; use set_itinerary for a big rework and
reorder_stops for many moves. Change the setup (regions, countries, dates, preferences, plans) or lock stops only
when the user asks; keep locked stops and their nights. A read-only trip can't change, and on a trip under way the
days up to today stay as they were. Changes are refused while the app's own assistant is working on the trip. If
there are no tools that change trips, the user allowed this app only to read them: to allow changes, they disconnect
it in the app (Account, AI apps) and connect it again.`

const TRIP: Schema = { type: 'string', description: 'Which trip: its id or name from list_trips. Default: the trip opened last in the app.' }
const DAY = (description: string): Schema => ({ type: 'string', description: `${description}, YYYY-MM-DD` })

/** The tools run on the runner, and what they need: `trip`, a trip (the others use the default one if there is
 *  one, for its dates and passport); `extra`, the trip's items or journal too; `write`, they change the trip. */
export const RUNNER_TOOLS: Record<string, { trip: boolean; extra?: 'items' | 'journal'; write?: true }> = {
  get_trip: { trip: true }, find_cities: { trip: false }, get_city_info: { trip: false }, compare_cities: { trip: false },
  get_route: { trip: false }, get_options: { trip: false }, get_visit: { trip: true, extra: 'items' }, get_journal: { trip: true, extra: 'journal' },
  ...Object.fromEntries([...WRITE_TOOLS].map((name) => [name, { trip: true, write: true }])),
  ...Object.fromEntries([...ITEM_TOOLS].map((name) => [name, { trip: true, extra: 'items', write: true }])),
}

const TITLES: Record<string, string> = {
  list_trips: 'List trips', get_trip: 'Get a trip', find_cities: 'Find cities', get_city_info: 'City info', compare_cities: 'Compare cities',
  get_route: 'Route between cities', get_options: 'Regions and options', get_visit: 'My visit', get_journal: 'Journal',
  get_changes: 'Changes made by apps', undo: 'Undo a change',
  update_settings: 'Change trip settings', update_preferences: 'Change preferences', add_region: 'Add a region', update_region: 'Change a region',
  set_country_mode: 'Set a country\'s mode', set_itinerary: 'Set the whole itinerary', add_stop: 'Add a stop', remove_stop: 'Remove a stop',
  set_nights: 'Set nights', set_locked: 'Lock or unlock a stop', move_stop: 'Move a stop', reorder_stops: 'Reorder stops',
  new_plan: 'New plan', switch_plan: 'Switch plan', rename_plan: 'Rename plan', delete_plan: 'Delete plan',
  save_visit_item: 'Save to My visit', remove_visit_item: 'Remove from My visit', set_prices_seen: 'Set prices seen', save_phrases: 'Save phrases',
}
const DESCRIPTIONS: Record<string, string> = {
  get_trip: 'A trip in full: its description (dates, preferences, wishes, plans, where it is today if under way), settings, regions, every stop with dates and nights, legs between stops, cost and all warnings.',
}
/** Changes that take something away (each can still be undone). */
const DESTRUCTIVE = new Set(['remove_stop', 'delete_plan', 'set_itinerary', 'update_region', 'remove_visit_item'])

const tool = (name: string, description: string, inputSchema: Schema): McpTool => ({
  name, title: TITLES[name], description, inputSchema,
  annotations: WRITE_TOOLS.has(name) || ITEM_TOOLS.has(name) || name === 'undo'
    ? { readOnlyHint: false, destructiveHint: DESTRUCTIVE.has(name), idempotentHint: false, openWorldHint: false }
    : { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
})

export const MCP_TOOLS: McpTool[] = [
  tool('list_trips', 'The trips saved in the user\'s account: id, name, dates, number of stops, when last changed, and which one is open in the app (opened last).', { type: 'object', properties: {}, required: [] }),
  ...TOOLS.filter((t) => RUNNER_TOOLS[t.name]).map((t) => tool(t.name, DESCRIPTIONS[t.name] ?? t.description, {
    ...t.parametersJsonSchema, properties: { ...t.parametersJsonSchema.properties, trip: TRIP },
  })),
  tool('get_journal', 'The trip\'s journal: what the user wrote about the trip\'s days (an entry or more a day, each with its highlight, a few lines in Markdown, the emoji the user picked for it, tags) and where they spent the night. Without from and to: the latest 60 entries written.', {
    type: 'object', properties: { trip: TRIP, from: DAY('First day'), to: DAY('Last day') }, required: [],
  }),
  tool('get_changes', 'The changes AI apps made to a trip with these tools (the latest few of the last two weeks), newest first: id, which app, what changed, when, and whether it was undone.', {
    type: 'object', properties: { trip: TRIP }, required: [],
  }),
  tool('undo', 'Undo a change made with these tools, putting back the trip (or its My visit) as it was before it: by default this app\'s latest change to the trip; with `change`, that change and every later one still on. Refused if the trip was changed in other ways since (in the app): then change it back with the other tools.', {
    type: 'object', properties: { trip: TRIP, change: { type: 'string', description: 'The id of the change to undo (from a change\'s result or get_changes)' } }, required: [],
  }),
]
