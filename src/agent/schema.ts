// What the trip assistant is told and which tools it may call. Shared by the Worker (which sends it to Gemini, so
// clients can't change it) and the browser (which runs the tools on the trip).

export const SYSTEM_PROMPT = `You are the trip assistant of rtw-map, a planner for long multi-country trips.
The user plans a trip in the app; you help by answering questions and by changing their trip with the tools.

How to work:
- The trip as it was when the user sent their latest message is described at the end of these instructions.
  Tool results after each change show the trip after that change. Requests like "2 more days" count from the trip
  as it was when the user asked, not from the state after your own earlier changes.
- After the trip comes what the user was looking at when they asked (an open city or journey, the map view), if
  they shared it. Use it for "here", "this city", "this month" and the like; if it isn't there, ask which they mean.
- Tool results give prices in EUR and temperatures in °C; quote them in the user's units given with the trip.
- Use tools for facts about cities (weather, costs, visas, transport, safety) and for which cities exist in the app.
  You can look up any city, not only the trip's or what the user is looking at: get_city_info (sections for full
  detail), compare_cities for questions across many cities, get_route for travel between any two cities.
- Each of your replies that calls tools is one step, and a message has a limited number of steps (tool results show
  steps_left). Look things up in bulk: get_route takes many pairs and get_city_info many cities in one call, and
  independent tools can be called together in one step. Don't look up what the trip description already says.
  The app only knows the cities that find_cities returns; don't add others. Say so if a place isn't in the app.
- When the user asks for a change, make it with the tools right away (they can undo it), then say briefly what changed.
  Prefer small edits (add, remove, move a stop, set nights) over generate_plan, which replaces the whole itinerary.
  For many moves at once (reverse the trip, a new order), use reorder_stops in one call instead of many move_stop calls.
- A trip can have several plans (versions of the itinerary). Your changes apply to the active plan. To try a big
  change ("what if we skip Russia?") without losing the current plan, make a new_plan first, then change it, and
  tell the user they can switch back or compare the plans (Compare, above the itinerary).
- The user's preferences (travel style, room, food, transport, trip goals, weather limits, budgets) come with the trip.
  Take them into account in suggestions; when the user states a new one ("we're two", "no night buses"), save it
  with update_preferences.
- "Plan with AI": when asked to adjust a freshly generated plan to the user's wishes, keep that plan and change it with
  small edits (add, remove or move stops, set and lock nights around fixed dates); the plan must still fill the dates.
  Don't call generate_plan for this. Work in few steps: look up what you need in one or two steps, then make several
  changes at once (call several tools in one step). Then list what you changed for which wish, and which wishes you
  couldn't meet and why.
- Setting nights for a stop locks it; unlocked stops share the remaining nights. Keep the user's locked stops unless asked.
- If a request is unclear or would remove a lot, ask one short question first.
- When you ask the user to choose or confirm, or offer next steps, end your reply with one line of 2–4 short replies
  they can click instead of typing, written as the user would say them, e.g.:
  Choices: [Yes, swap them] [Keep Kotor] [Show me other beach towns]
  Only on that last line, nothing after it. Leave it out for open questions (dates, names) and plain answers.
- Visa, entry and safety rules change: give the app's information and tell the user to confirm with official sources.
- You can't book anything. Keep answers short and practical.
- Reply in English, the app's language, unless the user's latest message is written in another language: then
  reply in that language. Never pick a language from their passport, currency or destinations.
- Only help with planning trips in this app; politely decline unrelated requests.`

type JsonSchema = { type: string; description?: string; enum?: string[]; items?: JsonSchema; properties?: Record<string, JsonSchema>; required?: string[] }
export type FunctionDeclaration = { name: string; description: string; parametersJsonSchema: JsonSchema }

const obj = (properties: Record<string, JsonSchema> = {}, required: string[] = []): JsonSchema => ({ type: 'object', properties, required })
const str = (description: string, extra: Partial<JsonSchema> = {}): JsonSchema => ({ type: 'string', description, ...extra })
const CITY = str('City name or id as shown in the trip or by find_cities, e.g. "Kraków" or "krakow"')

export const TOOLS: FunctionDeclaration[] = [
  // ---- read
  {
    name: 'get_trip',
    description: 'The current trip in full: settings, regions, every stop with dates and nights, legs between stops, cost and all warnings.',
    parametersJsonSchema: obj(),
  },
  {
    name: 'find_cities',
    description: 'Cities the app has data for, with suggested days and tags. Filter by country, tag or name.',
    parametersJsonSchema: obj({
      country: str('Country name or ISO code, e.g. "Poland" or "PL"'),
      tag: str('One of: history, culture, food, nature, hiking, beach, city, nightlife'),
      query: str('Part of a city name'),
    }),
  },
  {
    name: 'get_city_info',
    description: 'One city, or several with `cities`. Without sections: a summary (weather, daily cost, visa for the traveller\'s passport, travel advice, public transport, English, card payments, tap water, air quality, connections). With sections: everything the app has on those topics.',
    parametersJsonSchema: obj({
      city: CITY,
      cities: { type: 'array', items: CITY, description: 'Several cities at once (up to 8), instead of city' },
      month: { type: 'integer', description: 'Month 1–12 for the summary\'s weather and air; default: when the user would be there' },
      sections: {
        type: 'array', items: { type: 'string', enum: ['weather', 'costs', 'entry', 'safety', 'health', 'transport', 'daily'] },
        description: 'Full detail instead of the summary: weather (12 months incl. sun, humidity, air), costs (all prices, groceries, price level, Big Mac, shops, payments), entry (visa, Schengen, notices), safety (full travel advice), health (vaccines, risks, healthcare, pharmacies, hospital), transport (local, taxi, rentals, connections), daily (English, languages, plugs, emergency number, mobile internet, shops, ATMs)',
      },
    }),
  },
  {
    name: 'get_shared_view',
    description: 'The values shown in the parts of the app the user shared with their latest message (listed after the trip): an open city tab, an open journey, or the map view (its value for each stop). Prices in EUR, temperatures in °C.',
    parametersJsonSchema: obj({ item: { type: 'string', enum: ['city', 'journey', 'map'], description: 'Only this item; default: all shared items' } }),
  },
  {
    name: 'compare_cities',
    description: 'A table of many cities at once, for questions like "warmest Balkan cities in May" or "cheapest stops": pick cities, whole countries and/or the trip\'s stops, and the fields to show. Prices in EUR, temperatures in °C.',
    parametersJsonSchema: obj({
      cities: { type: 'array', items: CITY },
      countries: { type: 'array', items: str('Country name or code'), description: 'All the app\'s cities in these countries' },
      in_trip: { type: 'boolean', description: 'Include the stops of the trip' },
      fields: { type: 'array', items: { type: 'string', enum: ['weather', 'air', 'daily_cost', 'english', 'cards', 'mobile_internet', 'travel_advice', 'tap_water', 'suggested_days', 'population'] } },
      month: { type: 'integer', description: 'Month 1–12 for weather and air; default: when the user would be at each city' },
    }, ['fields']),
  },
  {
    name: 'get_route',
    description: 'The best way to travel between two cities in the app (also ones not in the trip), or between many pairs at once with `pairs`: each part with mode, hours, price in EUR, and whether it is estimated from road distance.',
    parametersJsonSchema: obj({
      from: CITY,
      to: CITY,
      pairs: { type: 'array', items: obj({ from: CITY, to: CITY }, ['from', 'to']), description: 'Many routes at once (up to 20), instead of from and to' },
    }),
  },
  {
    name: 'get_options',
    description: 'The world\'s regions (each with its countries), the countries with cities in the app and those without yet, interests, passports, paces and budgets that the settings accept.',
    parametersJsonSchema: obj(),
  },
  // ---- change the setup
  {
    name: 'update_settings',
    description: 'Change trip settings. Changing dates re-fits the nights of an existing itinerary.',
    parametersJsonSchema: obj({
      start_date: str('YYYY-MM-DD'),
      end_date: str('YYYY-MM-DD, the day the trip ends'),
      start_flex_days: { type: 'integer', description: 'How many days earlier or later the trip may start (0 = exactly on the start date, up to 14). Generating a plan then picks the dates.' },
      end_flex_days: { type: 'integer', description: 'How many days earlier or later the trip may end (0 = exactly on the end date, up to 14)' },
      pace: str('Travel pace', { enum: ['chill', 'balanced', 'fast'] }),
      budget: str('Apply a travel style preset: sets the room, meals, drinks, getting around, travel between cities and sights in one go (each can then be changed)', { enum: ['shoestring', 'backpacker', 'private', 'midrange', 'comfort'] }),
      interests: { type: 'array', items: str('Interest'), description: 'Replaces the interests; see get_options' },
      passport: str('Passport code from get_options, e.g. "TW", "US", "EU"'),
      keep_region_order: { type: 'boolean', description: 'Visit the regions in the listed order' },
      start_city: str('City to start in, or "" for any'),
      end_city: str('City to end in, or "" for any'),
      schengen_days_before: { type: 'integer', description: 'Days already spent in the Schengen area in the 180 days before the trip' },
      wishes: str('The user\'s free-text wishes for the trip (replaces them)'),
      stops: { type: 'integer', description: 'How many stops the plan should have; 0 for as many as fit' },
      stops_flex: { type: 'integer', description: 'How many more or fewer stops than that are fine (0 = exactly, up to 20)' },
    }),
  },
  {
    name: 'update_preferences',
    description: 'Change how the user likes to travel (the Preferences tab); give only what changes. Trip goals and the heat, cold and rain limits shape the plan the next time it is made: after changing them, offer generate_plan (which replaces the itinerary), or run it if the user asked for the plan to change. To change the travel style itself, use update_settings budget.',
    parametersJsonSchema: obj({
      home_city: str('Home city the trip starts from (and returns to): any city find_cities knows, or "" for none; it is not a stop'),
      return_home: { type: 'boolean', description: 'Return home at the end (false: one way)' },
      travellers: { type: 'integer', description: '1 solo, 2 for two sharing a room, 4 for 3–4 people' },
      room: str('The bed the daily cost counts: a dorm bed or a private room', { enum: ['dorm', 'private'] }),
      max_per_night_eur: { type: 'number', description: 'Most they would pay for a room per night, in EUR; 0 for no limit' },
      breakfast: str('Breakfast on a normal day: DIY (food from a supermarket), at a simple local place, or skipped', { enum: ['diy', 'local', 'skip'] }),
      lunch: str('Lunch on a normal day (diy: food from a supermarket)', { enum: ['skip', 'diy', 'local', 'restaurant'] }),
      dinner: str('Dinner on a normal day (diy: food from a supermarket)', { enum: ['skip', 'diy', 'local', 'restaurant'] }),
      coffees: { type: 'integer', description: 'Café coffees a day: 0, 1 or 2' },
      beers: { type: 'integer', description: 'Beers in a bar a day: 0, 1 or 2' },
      between_cities: str('Travel between cities (fastest allows flights)', { enum: ['cheapest', 'balanced', 'fastest'] }),
      overnight: { type: 'boolean', description: 'Overnight buses and trains are OK' },
      max_travel_hours: { type: 'integer', description: 'Longest travel day in hours: 3, 5 or 8; 0 for no limit' },
      sights: str('Paid sights and tours', { enum: ['few', 'daily', 'lots'] }),
      focus: str('Trip goal: a balance, as many countries as fit, or the most popular places', { enum: ['balanced', 'countries', 'highlights'] }),
      expensive: str('Expensive places: no change, shorter stays, or skip where optional', { enum: ['ignore', 'shorter', 'skip'] }),
      min_high_c: str('Lowest comfortable daily high in °C, e.g. "12", or "none"'),
      max_high_c: str('Highest comfortable daily high in °C, e.g. "30", or "none"'),
      min_low_c: str('Coldest comfortable night (daily low) in °C, e.g. "5" for camping, or "none"'),
      max_low_c: str('Warmest comfortable night (daily low) in °C, e.g. "20" without air conditioning, or "none"'),
      avoid_rain: { type: 'boolean', description: 'Avoid rainy months' },
      need_internet: { type: 'boolean', description: 'Needs fast mobile internet (working on the road)' },
      daily_budget_eur: { type: 'number', description: 'Daily budget per person in EUR; 0 for none' },
    }),
  },
  {
    name: 'add_region',
    description: 'Add a region to the trip setup, one of the world\'s regions by name or a list of countries. Countries in a region start optional; a single country starts as must-visit. Countries without cities in the app yet can be added, but the planner leaves them out.',
    parametersJsonSchema: obj({
      preset: str('Region name from get_options, e.g. "Balkans"'),
      countries: { type: 'array', items: str('Country name or ISO code'), description: 'Countries, if not adding one of the regions' },
      name: str('Name for a list of countries'),
      longer: { type: 'boolean', description: 'Spend longer in this region' },
    }),
  },
  {
    name: 'update_region',
    description: 'Change a region: spend longer there, or remove it.',
    parametersJsonSchema: obj({ region: str('Region name'), longer: { type: 'boolean' }, remove: { type: 'boolean' } }, ['region']),
  },
  {
    name: 'set_country_mode',
    description: 'Whether a country must be visited, may be visited, or is left out. Applies when the plan is generated.',
    parametersJsonSchema: obj({ country: str('Country name or ISO code'), mode: str('Mode', { enum: ['must', 'optional', 'excluded'] }) }, ['country', 'mode']),
  },
  {
    name: 'generate_plan',
    description: 'Create a new itinerary from the setup (regions, dates, pace…). Replaces the current itinerary, including locked stops.',
    parametersJsonSchema: obj(),
  },
  // ---- change the itinerary
  {
    name: 'add_stop',
    description: 'Add a city to the itinerary. Without "after", it goes where it fits the route best.',
    parametersJsonSchema: obj({ city: CITY, after: str('City to put it after, or "start" for the beginning'), nights: { type: 'integer', description: 'Nights to stay (locks the stop)' } }, ['city']),
  },
  {
    name: 'remove_stop',
    description: 'Remove a city from the itinerary; its nights go to the other unlocked stops.',
    parametersJsonSchema: obj({ city: CITY }, ['city']),
  },
  {
    name: 'set_nights',
    description: 'Set the nights at a stop. The stop gets locked; unlocked stops are re-fitted so the trip still fills the dates.',
    parametersJsonSchema: obj({ city: CITY, nights: { type: 'integer', description: 'At least 1' } }, ['city', 'nights']),
  },
  {
    name: 'set_locked',
    description: 'Lock or unlock a stop. Locked stops keep their nights when the plan is re-fitted.',
    parametersJsonSchema: obj({ city: CITY, locked: { type: 'boolean' } }, ['city', 'locked']),
  },
  {
    name: 'move_stop',
    description: 'Move a stop to another place in the route.',
    parametersJsonSchema: obj({ city: CITY, after: str('City to put it after, or "start" for the beginning') }, ['city', 'after']),
  },
  {
    name: 'new_plan',
    description: 'Add a plan to the trip (another version of the itinerary, with its own setup and preferences): a copy of the active plan, so a change can be tried without losing the current one. Switches to it unless switch_to is false; later changes then apply to the new plan.',
    parametersJsonSchema: obj({
      name: str('Short name, e.g. "Without Russia"; default Plan B, C, …'),
      switch_to: { type: 'boolean', description: 'Switch to the new plan (default true)' },
    }),
  },
  {
    name: 'switch_plan',
    description: "Make another of the trip's plans the active one (the one shown and edited).",
    parametersJsonSchema: obj({ plan: str('Plan name') }, ['plan']),
  },
  {
    name: 'rename_plan',
    description: 'Rename one of the trip\'s plans.',
    parametersJsonSchema: obj({ plan: str('Plan name'), name: str('New name') }, ['plan', 'name']),
  },
  {
    name: 'delete_plan',
    description: "Delete one of the trip's plans (never the last one). Only when the user asks.",
    parametersJsonSchema: obj({ plan: str('Plan name') }, ['plan']),
  },
  {
    name: 'reorder_stops',
    description: 'Put all stops in a new order in one step: reverse: true for the whole trip backwards (also reverses the region order and swaps the start and end city), or order with every stop of the trip, each once. Nights stay; unlocked stops are re-fitted.',
    parametersJsonSchema: obj({
      reverse: { type: 'boolean', description: 'Travel the whole trip in the opposite direction' },
      order: { type: 'array', items: CITY, description: 'Every stop of the trip in the new order' },
    }),
  },
  {
    name: 'optimize_route',
    description: 'Re-order the stops for the shortest travel, keeping the region order if set.',
    parametersJsonSchema: obj(),
  },
  {
    name: 'refit_nights',
    description: 'Re-share the nights among unlocked stops so the trip fills the dates exactly.',
    parametersJsonSchema: obj(),
  },
]

/** Names of tools that change the trip (the rest only read). */
export const WRITE_TOOLS = new Set([
  'update_settings', 'update_preferences', 'new_plan', 'switch_plan', 'rename_plan', 'delete_plan', 'add_region', 'update_region', 'set_country_mode', 'generate_plan',
  'add_stop', 'remove_stop', 'set_nights', 'set_locked', 'move_stop', 'reorder_stops', 'optimize_route', 'refit_nights',
])
