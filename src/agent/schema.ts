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
- Each of your replies that calls tools is one step; the user waits for all of them, so keep them few. Look things up
  in bulk: get_route takes many pairs and get_city_info many cities in one call, and
  independent tools can be called together in one step. Don't look up what the trip description already says.
  The app only knows the cities that find_cities returns; don't add others. Say so if a place isn't in the app.
- When the user asks for a change, make it with the tools right away (they can undo it), then say briefly what changed.
  Nothing in the app re-fits the plan for you: an edit changes only what it touches. So after the changes asked for,
  leave the plan in order (the plan is updated with them): the stops' nights add up to the trip's nights exactly
  (the trip shows "N of M nights"), in a sensible order, still fitting the user's wishes and preferences; move
  nights between unlocked stops as needed. Prefer small edits (add, remove, move a stop, set nights); for a big
  rework use set_itinerary, the whole itinerary in one call. For many moves at once (reverse the trip, a new order),
  use reorder_stops in one call instead of many move_stop calls.
- A trip can have several plans (versions of the itinerary). Your changes apply to the active plan. To try a big
  change ("what if we skip Russia?") without losing the current plan, make a new_plan first, then change it, and
  tell the user they can switch back or compare the plans (Compare, above the itinerary).
- The user's preferences (travel style, room, food, transport, trip goals, weather limits, budgets) come with the trip.
  Take them into account in suggestions; when the user states a new one ("we're two", "no night buses"), save it
  with update_preferences. Each stop in the trip lists its checks: where it doesn't fit them (over the daily budget
  or the most per night, an expensive place, too cold, hot or wet, a travel day too long or overnight) and other
  problems. When you plan or change the trip, fix those where you can (another city, fewer nights, another order),
  and say which are left and why.
- "Plan with AI": a message asking to plan the trip from scratch. Ignore earlier plans and make the best itinerary
  for the setup (the regions and countries: every must-visit country, optional ones as they fit, none left out),
  the dates, the user's wishes, preferences and interests: pick the cities (find_cities, compare_cities), their
  order (get_route for the journeys) and nights (a city's suggested days, the pace), then put it in with one
  set_itinerary call (lock: true only for fixed dates the user asked for). The nights must add up to the trip's
  nights exactly. With flexible dates, pick the dates within them first (update_settings start_date, end_date).
  Work in few steps: look up what you need in one or two steps (many cities and routes per call). Then list what
  you planned for which wish, and which wishes you couldn't meet and why.
- "Update plan": a message listing what changed since the plan was made: the setup, the user's own edits to the
  itinerary (stops added, removed or moved, nights, locks), and nights that don't add up to the dates. Keep the plan
  and the user's edits (they are their choices), and change only what those changes call for (e.g. stops in an
  added region, nights for new dates or for a stop they added, places that no longer fit a preference), so the
  nights add up to the dates again. Then list what you changed for which change, and what you couldn't and why.
- While planning (Plan with AI, Update plan) the user's setup stays as it is: regions, countries, dates (except
  picking them within flexible dates), preferences, locks and plans can't be changed (those tools are refused;
  reversing the trip turns only the stops around, and not at all when the user wants the regions in their order).
  Where the setup stands in the way of a wish, say so and suggest the change.
- The user's own choices are theirs: change the setup (regions, countries, dates, preferences, plans) or lock stops
  only when they ask for that; otherwise work with stops, nights and order, and suggest setup changes in your answer.
  Keep the user's locked stops and their nights unless asked.
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
    description: 'Change trip settings. New dates don\'t change the itinerary: fit its nights to them.',
    parametersJsonSchema: obj({
      start_date: str('YYYY-MM-DD'),
      end_date: str('YYYY-MM-DD, the day the trip ends'),
      start_flex_days: { type: 'integer', description: 'How many days earlier or later the trip may start (0 = exactly on the start date, up to 14). Generating a plan then picks the dates.' },
      end_flex_days: { type: 'integer', description: 'How many days earlier or later the trip may end (0 = exactly on the end date, up to 14)' },
      pace: str('Travel pace', { enum: ['chill', 'balanced', 'fast'] }),
      budget: str('Apply a travel style preset: sets the room, meals, drinks, getting around, and travel between cities in one go (each can then be changed)', { enum: ['shoestring', 'backpacker', 'private', 'midrange', 'comfort'] }),
      interests: { type: 'array', items: str('Interest'), description: 'Replaces the interests; see get_options' },
      passport: str('Passport code from get_options, e.g. "TW", "US", "EU"'),
      keep_region_order: { type: 'boolean', description: 'Visit the regions in the listed order' },
      start_city: str('City to start in, or "" for any'),
      end_city: str('City to end in, or "" for any'),
      schengen_days_before: { type: 'integer', description: 'Days already spent in the Schengen area in the 180 days before the trip' },
      wishes: str('The user\'s free-text wishes for the trip (replaces them)'),
      min_stops: { type: 'integer', description: 'Fewest stops the plan should have; 0 for no limit' },
      max_stops: { type: 'integer', description: 'Most stops the plan should have; 0 for no limit' },
    }),
  },
  {
    name: 'update_preferences',
    description: 'Change how the user likes to travel (the preferences in the Trip tab); give only what changes. Trip goals and the heat, cold and rain limits change what fits the trip: after changing them, change the itinerary for them too if the user asked for the plan to change, or offer to. To change the travel style itself, use update_settings budget.',
    parametersJsonSchema: obj({
      home_city: str('Home city the trip starts from (and returns to): any city find_cities knows, or "" for none; it is not a stop'),
      return_home: { type: 'boolean', description: 'Return home at the end (false: one way)' },
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
      focus: str('Trip goal: a balance, as many countries as fit, or the most popular places', { enum: ['balanced', 'countries', 'highlights'] }),
      expensive: str('Expensive places: no change, shorter stays, or skip where optional', { enum: ['ignore', 'shorter', 'skip'] }),
      cool_from_c: { type: 'number', description: 'Temperature bands, in °C: where cool starts (below it is cold; usual 12). The map and city weather colour by the bands, and Checks flags cold and hot stays' },
      pleasant_from_c: { type: 'number', description: 'Where pleasant starts, in °C (usual 18)' },
      warm_from_c: { type: 'number', description: 'Where warm starts, in °C (usual 28)' },
      hot_from_c: { type: 'number', description: 'Where hot starts, in °C (usual 32)' },
      avoid_cold: { type: 'boolean', description: 'Avoid months whose highs are cold (below where cool starts)' },
      avoid_hot: { type: 'boolean', description: 'Avoid months whose highs are hot (from where hot starts)' },
      avoid_rain: { type: 'boolean', description: 'Avoid rainy months' },
      daily_budget_eur: { type: 'number', description: 'Daily budget per person in EUR; 0 for none' },
    }),
  },
  {
    name: 'add_region',
    description: 'Add a region to the trip setup, one of the world\'s regions by name or a list of countries. Countries in a region start optional; a single country starts as must-visit. Countries without cities in the app yet can be added, but have no stops to plan.',
    parametersJsonSchema: obj({
      preset: str('Region name from get_options, e.g. "Balkans"'),
      countries: { type: 'array', items: str('Country name or ISO code'), description: 'Countries, if not adding one of the regions' },
      name: str('Name for a list of countries'),
    }),
  },
  {
    name: 'update_region',
    description: 'Set the days to spend in a region, all its countries told (the nights at their stops), or remove it from the trip setup. Applies when the plan is made or updated.',
    parametersJsonSchema: obj({
      region: str('Region name'),
      min_days: { type: 'integer', description: 'Fewest days in the region; 0 for no limit' },
      max_days: { type: 'integer', description: 'Most days in the region; 0 for no limit' },
      remove: { type: 'boolean' },
    }, ['region']),
  },
  {
    name: 'set_country_mode',
    description: 'Whether a country must be visited, may be visited, or is left out, and the days to spend there if it is visited (the nights at its stops). Applies when the plan is made or updated.',
    parametersJsonSchema: obj({
      country: str('Country name or ISO code'),
      mode: str('Mode', { enum: ['must', 'optional', 'excluded'] }),
      min_days: { type: 'integer', description: 'Fewest days there; 0 for no limit' },
      max_days: { type: 'integer', description: 'Most days there; 0 for no limit' },
    }, ['country']),
  },
  // ---- change the itinerary
  {
    name: 'set_itinerary',
    description: 'Put in the whole itinerary at once, replacing the current one: every stop in the order of the trip, with its nights (a plan from scratch, or a big rework). The stops\' nights should add up to the trip\'s nights. While planning, the user\'s locked stops must stay, with their nights.',
    parametersJsonSchema: obj({
      stops: { type: 'array', description: 'The stops in order', items: obj({ city: CITY, nights: { type: 'integer', description: 'At least 1' }, lock: { type: 'boolean', description: 'true only for nights or fixed dates the user asked for' } }, ['city', 'nights']) },
    }, ['stops']),
  },
  {
    name: 'add_stop',
    description: 'Add a city to the itinerary, with its usual stay unless nights is given; the other stops keep their nights. Without "after", it goes where it fits the route best.',
    parametersJsonSchema: obj({ city: CITY, after: str('City to put it after, or "start" for the beginning'), nights: { type: 'integer', description: 'Nights to stay' }, lock: { type: 'boolean', description: 'true only when the user asked for this number of nights (or fixed dates there): the stop is locked, so its nights stay when the plan is updated' } }, ['city']),
  },
  {
    name: 'remove_stop',
    description: 'Remove a city from the itinerary; its nights are freed (give them to other stops).',
    parametersJsonSchema: obj({ city: CITY }, ['city']),
  },
  {
    name: 'set_nights',
    description: 'Set the nights at a stop; nothing else changes (keep the stops\' nights adding up to the trip\'s nights).',
    parametersJsonSchema: obj({ city: CITY, nights: { type: 'integer', description: 'At least 1' }, lock: { type: 'boolean', description: 'true only when the user asked for this number of nights (or fixed dates there): the stop is locked, so its nights stay when the plan is updated' } }, ['city', 'nights']),
  },
  {
    name: 'set_locked',
    description: 'Lock or unlock a stop. Locked stops keep their nights when the plan is updated.',
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
    description: 'Put all stops in a new order in one step: reverse: true for the whole trip backwards (also reverses the region order, except while planning), or order with every stop of the trip, each once. Nights stay.',
    parametersJsonSchema: obj({
      reverse: { type: 'boolean', description: 'Travel the whole trip in the opposite direction' },
      order: { type: 'array', items: CITY, description: 'Every stop of the trip in the new order' },
    }),
  },
]

/** Names of tools that change the trip (the rest only read). */
export const WRITE_TOOLS = new Set([
  'update_settings', 'update_preferences', 'new_plan', 'switch_plan', 'rename_plan', 'delete_plan', 'add_region', 'update_region', 'set_country_mode', 'set_itinerary',
  'add_stop', 'remove_stop', 'set_nights', 'set_locked', 'move_stop', 'reorder_stops',
])
