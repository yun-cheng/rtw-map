// The trip's tools for other apps' AI assistants (the MCP server, worker/mcp.ts): the trip assistant's read tools
// (schema.ts), each told which trip to use, and what only they have: the list of trips, My visit and the journal.
// They run on the runner (runner/tool.ts), which has the app's city data; list_trips in the Worker.
import { TOOLS, type FunctionDeclaration } from './schema'

type Schema = FunctionDeclaration['parametersJsonSchema']
export type McpTool = { name: string; title: string; description: string; inputSchema: Schema; annotations: Record<string, boolean | string> }

/** What the server tells the app's assistant when it connects. */
export const MCP_INSTRUCTIONS = `rtw-map plans long trips across many countries. These tools read the user's saved trips and the app's data on
cities: weather, costs, visas, safety, health, transport and the routes between cities. Use list_trips to see the
trips; the other tools use the trip opened last in the app unless given \`trip\`. The app only knows the cities that
find_cities returns. Prices are in EUR and temperatures in °C. Visa, entry and safety rules change: tell the user to
confirm with official sources. The tools only read: to change a trip, tell the user what to change in the app (its
own assistant can make the changes).`

const TRIP: Schema = { type: 'string', description: 'Which trip: its id or name from list_trips. Default: the trip opened last in the app.' }
const DAY = (description: string): Schema => ({ type: 'string', description: `${description}, YYYY-MM-DD` })

/** The tools run on the runner, and what they need: `trip`, a trip (the others use the default one if there is
 *  one, for its dates and passport); `extra`, the trip's items or journal too. */
export const RUNNER_TOOLS: Record<string, { trip: boolean; extra?: 'items' | 'journal' }> = {
  get_trip: { trip: true }, find_cities: { trip: false }, get_city_info: { trip: false }, compare_cities: { trip: false },
  get_route: { trip: false }, get_options: { trip: false }, get_visit: { trip: true, extra: 'items' }, get_journal: { trip: true, extra: 'journal' },
}

const TITLES: Record<string, string> = {
  list_trips: 'List trips', get_trip: 'Get a trip', find_cities: 'Find cities', get_city_info: 'City info', compare_cities: 'Compare cities',
  get_route: 'Route between cities', get_options: 'Regions and options', get_visit: 'My visit', get_journal: 'Journal',
}
const DESCRIPTIONS: Record<string, string> = {
  get_trip: 'A trip in full: its description (dates, preferences, wishes, plans, where it is today if under way), settings, regions, every stop with dates and nights, legs between stops, cost and all warnings.',
}

const tool = (name: string, description: string, inputSchema: Schema): McpTool =>
  ({ name, title: TITLES[name], description, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } })

export const MCP_TOOLS: McpTool[] = [
  tool('list_trips', 'The trips saved in the user\'s account: id, name, dates, number of stops, when last changed, and which one is open in the app (opened last).', { type: 'object', properties: {}, required: [] }),
  ...TOOLS.filter((t) => RUNNER_TOOLS[t.name]).map((t) => tool(t.name, DESCRIPTIONS[t.name] ?? t.description, {
    ...t.parametersJsonSchema, properties: { ...t.parametersJsonSchema.properties, trip: TRIP },
  })),
  tool('get_visit', 'What the user keeps for the cities of a trip ("My visit" in the app): where they stay (name, address, check-in and check-out days, booking link, reference and price, notes such as the door code), photo albums, links and notes, for each city or journey between two.', {
    type: 'object', properties: { trip: TRIP, city: { type: 'string', description: 'Only this city and the journeys to and from it (name or id); default: all' } }, required: [],
  }),
  tool('get_journal', 'The trip\'s journal: what the user wrote about each day of the trip (the day\'s highlight, a few lines, a rating 1–5) and where they spent the night. Without from and to: the latest 60 days written.', {
    type: 'object', properties: { trip: TRIP, from: DAY('First day'), to: DAY('Last day') }, required: [],
  }),
]
