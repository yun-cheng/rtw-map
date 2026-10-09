# rtw-map

A map-based planner for long, multi-country trips. It's built for cities worldwide; detailed data currently covers the Balkans, Central & Eastern Europe (incl. Austria), Poland, the Baltic States and Russia, plus Taiwan, Japan, Thailand, Vietnam, Malaysia, Singapore and Cambodia (more regions to follow).
You choose where and when, and how you like to travel. It suggests a route with nights per city, enforces the Schengen 90/180 rule,
checks visas and travel advisories, and shows weather, costs, health advice, mobile internet and transport for every stop.

See [PLAN.md](PLAN.md) for the product plan, decisions and roadmap.

## Run it

```bash
npm install
npm run data:pull   # the data lives in a private Cloudflare R2 bucket, not in git (see "Data storage")
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173), click **Load test case** (the Balkans → Russia trip from PLAN.md §3.3), then **Generate plan**.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run dev:api` | The site's Worker locally (port 8787), for the trip assistant; `npm run dev` forwards `/api` to it. Needs `GEMINI_API_KEY` and `SESSION_SECRET` in `.env.local` (and `ADMIN_EMAILS` to edit assistant limits) |
| `npm test` | Planner and formatting tests (Vitest) |
| `npm run lint` | oxlint |
| `npm run build` | Type-check + production build into `dist/` (static files) |

## What it does

- **Trip assistant** (Assistant tab, needs **Sign in with Google**; at most $1 of Gemini use per account per day, priced from each call's tokens and shown as the percent left (a quick question costs about a cent, a long Plan with AI run much more); admins (the `ADMIN_EMAILS` secret) can give particular accounts, by email, another daily limit under **Assistant limits…** in the account menu (those users see it as e.g. "5× the usual allowance", with a one-time notice when it's raised); account menu with Sign out at the top right): chat with Google Gemini to ask about or change the trip. **Ask AI** in a city or journey panel's header opens it about that panel (beside it; on a phone, a sheet over it that goes back to the city when closed). It uses the app's own actions and data (add/remove/move stops, reorder or reverse the whole route in one step, nights, dates and how flexible they are, regions, every preference, the trip's plans) and can look up anything in the app's data: any city in full, many cities side by side, and the route between any two cities. For a big what-if it makes a new plan first, so the current one is kept. Changes apply right away, and each reply that changed the trip can be undone. A message can take up to 12 model calls, or 40 with Think harder (and for Plan with AI); routes and cities can be looked up many at a time, the assistant sees how many steps it has left, and the last call is made without tools so a long run always ends with what was done and what's left. Long runs wait out the per-minute limit, and older tool results are shortened so long chats stay within the request limits. **Context** chips above the message box show what's on screen (the open city and tab, an open journey, the map view); they're sent with the message so "here" and "this city" make sense, and any of them can be left out. When it asks you to choose or confirm, its reply ends with buttons to answer in one click (e.g. *Yes, swap them* / *Keep Kotor*); a run that ran out of steps offers **Continue**, and a failed reply **Try again** (sent in its place). Answers use your currency and °C/°F, in the language you write in. Optional "Think harder".
- **Plans**: a trip can have up to 8 plans, versions of the itinerary each with its own setup and preferences, shown as a bar under the left panel's tabs. **+ Plan** copies the current one to try something without losing it; the active plan's menu renames or deletes it; **Compare** shows them side by side (dates, stops, countries, cost, per day, travel time, Schengen days, problems, and the cities one has that the other doesn't). The trip's name and assistant chat are shared by its plans.
- **Trip** (the left panel's first tab): dates, each exact or flexible by up to ± 14 days (generating a plan then picks dates within them so the trip is as long as its stops' suggested stays, rather than stretching or squeezing them; the Trip tab shows the dates asked for and the dates planned), regions in visiting order (each country *must* / *optional* / *excluded*; countries in a region start optional and every region gets at least one stop, a country added on its own starts as must, and "do not travel" countries start excluded), "longer stay" per region, start/end city, number of stops (optional minimum and maximum; the planner gives more or fewer nights per stop to keep within it, and Checks says when it can't), Schengen days already used, and free-text wishes. **Generate plan** runs the planner; **Plan with AI** (signed in) runs the same planner, then asks the assistant to adjust the result to the wishes and preferences with its usual tools, so the app's rules (dates filled, Schengen, routes, visas) still hold, and every change can be undone.
- **Preferences** (saved with the trip; a new trip starts from the current one's): home city (any city the app knows; the trip starts there and, unless one way, returns there; not a stop: the itinerary shows the journey from home and back, the map draws it dashed, and the cost includes it; long flights aren't in the timetable data, so they're estimated from distance: ~800 km/h, one change above 7,000 km, a fare range by distance), passport, pace and interests, travellers (solo, two sharing a room, 3–4); **a day in a city**, the defaults for every city's daily cost, set like in a city's Costs tab: bed (dorm or private room), each meal (breakfast: DIY, local place or skip; lunch and dinner: DIY, local place, restaurant or skip; a DIY meal is supermarket food: breakfast 2 slices of bread, an egg and a banana; lunch or dinner 125 g pasta, 150 g chicken breast and 200 g tomatoes), café coffees and beers in a bar (0–2 a day), and the most you'd pay a night (a day of public transport is always counted; taxi rides are added per city); then travel between cities, overnight travel, longest travel day, paid sights, comfortable ranges of daily highs and of nightly lows (any end open, in 2° steps), rain to avoid, fast internet needed, daily budget; and **trip goals**: what matters most (balanced, more countries, top highlights) and what to do about expensive places (nothing, shorter stays, skip where optional). The planner uses the trip goals, pace, interests and the temperature and rain limits when it makes a plan (and the limits in the weather checks, including warm or cold nights). Daily costs add up the bed, meals, drinks and getting around you chose; the rest is stored for later checks. Breakfast, lunch and dinner explain the chosen option with an ⓘ (a tooltip on hover or tap). The assistant can apply a travel style preset (Shoestring, Backpacker, Budget private, Mid-range, Comfort) that sets these in one go.
- **Generated plan**: picks cities, orders the route, assigns nights, keeps Schengen days ≤ 90 in any 180-day window, estimates cost as a range (shown at the top of the Itinerary tab, with an ⓘ on what it counts, and ~per day). Ground transport wins unless a flight clearly saves time: flights count ~2½ h of airport time and their fare.
- **Editing**: ± nights (auto-locks that stop and rebalances the rest), lock, remove, drag to reorder, add a city from the map, re-order for the shortest route.
- **Checks**: Schengen, visas per passport, travel advisories (UK FCDO + US State Dept), Kosovo → Serbia border, weather, air pollution, tap water, cash-only places and countries where foreign cards fail, pace, limited English, unreachable or estimated legs.
- **Map views**: **Route** (stops numbered by the trip day you arrive, or by the nights there with the legend's **Day | Nights** switch, and sized by the nights; elsewhere all stops are one size; lines coloured by travel mode, dashed where times are estimated from road distance; legend), **Weather** (fill = average high in ranges, e.g. 18–28°C, with the high written on each stop, or with **Low** in the legend the average low, on the same scale; hovering shows both; a ring around each stop fills with the share of rainy days), **Air** (five PM2.5 bands at the WHO's interim targets, 10/15/25/35 µg/m³, with the monthly average on each stop), **Cost** (one kind of cost at a time, picked in two rows, a group and then the kind in it: **Per day** on your daily cost choices; **Stay**: **Dorm bed** or **Private room** a night; **Food & drink**: **Local meal**, **Restaurant** dinner, **Café** coffee, **Bar** beer (0.5 L) or **Groceries** for a day; **Getting around**: local **Transport** a day, a **Taxi** ride of ~5 km, or a day of **Car rental** or **Scooter rental** (grey where that rental isn't usual); each group remembers the kind last picked in it; five bands of about a fifth of all cities each, in your currency; `kind=` in the address), **Mobile** (mobile internet in five bands by download speed, from slow under 25 Mbps to very fast 200+, with the speed on each stop), **Nearby** (roughly how many supermarkets, pharmacies, clinics & doctors or ATMs are within 1.5 km of the centre, picked with buttons like the month; coloured from none found to 50+) and **Schengen** (inside/outside colours and the 90/180 day counter). Weather and air show each place at the time of the trip by default (a stop in the month of its stay, other cities in the month you're at the nearest stop), or any month you pick. Each row of buttons over the map (the views, the months, the Nearby places, the cost groups and kinds) is one line that scrolls sideways when it doesn't fit, e.g. beside a city panel (the mouse wheel too, the edge fading where more is hidden), and the picked button stays in sight. The map's credits start folded into an ⓘ button that shows them. Outside the Route view the route is drawn plainly. Clicking a city anywhere (map, itinerary, timeline, another city) brings it into view if it's off screen or under the panel; a click on a stop picks the stop, not the route line under it.
- **City panel**, in tabs shown as icons (the open tab also has its name; the others name themselves on hover; on a narrow panel the bar scrolls sideways, and the mouse wheel scrolls it too), each section on its own card: **Overview** (description, suggested days per pace, one line per topic at a glance; problems come first in red, most serious first: visa needed, do-not-travel advice, foreign cards not working), **Transport** (in the city: public transport, how to pay, taxis, rentals; to other cities), **Weather** (weather chart; sunshine and air quality charts by month, temperatures as they feel or as measured, see below: hover or tap a month and its details replace the line under that chart (no box over the chart); click High, Low or Rain days in the weather chart's legend to hide or show it), **Costs** ($ icon), in three sub-tabs (**Daily cost**: one traveller's day item by item, bed, breakfast, lunch, dinner, café coffees, beers in a bar, public transport and taxi rides, from your preferences; change any item for this city and it's saved with the trip and counted in its total, a changed item has a reset icon next to its name, and **Reset all to preferences** undoes them all; **Prices**: Stay (dorm bed and private room), Food & drink: local meal, restaurant dinner, café coffee, beer in a bar and supermarket prices for 10 items: water, Coca-Cola, beer, bread, eggs, milk, pasta, bananas, tomatoes, chicken breast; hover the ⓘ by a meal, drink or Groceries for a day to see what each counts; price level vs a country you pick with a how-to-read explainer, Big Mac reference; **Paying & cash**: cards, contactless, cash, currency and ATMs), **Daily life** (language; phone & power: mobile internet, plugs; shops; people & culture), **Phrases** (seven everyday phrases in the local language: hello, thank you, bye, how much?, this one, I don't understand, cheers!, each in the local script with how to say it; where more than one language is spoken, e.g. Macedonian and Albanian in North Macedonia, a switch picks the language, main one first; Singapore just notes that English is the common language), **Health** (vaccines & medicines from CDC; tap water, risks, healthcare; pharmacies, clinics and the nearest hospital), **Safety** (travel advice, emergency number, travel insurance) and **Entry** (visa & entry incl. Schengen 90/180 and EU entry-system notices). Tabs with a problem get a red dot, and the chosen tab stays when you switch cities. Links to official advice, health and travel pages sit under their sections; data sources are listed under "Data" below.
- **Temperatures: Feels like | Real**: one setting (saved, "Feels like" by default) shown as a toggle wherever temperatures are: the map's Weather legend and the city panel's Weather heading. "Feels like" (Open-Meteo apparent temperature: heat with humidity, cold with wind) drives the map's colours and numbers, the timeline colours, the Overview line, the month line and the chart lines; the map's hover text gives the measured values too. Planning and your Preferences temperature limits use measured temperatures.
- **Timeline** (under the map): each stop as a bar sized by its nights, in its map colour for the current view (weather, air, cost, Schengen…) with the map's hover text, and overnight travel hatched; a long trip scrolls sideways (thin scrollbar, or the mouse wheel), and selecting a city brings it into view.
- **Left panel**: its tabs are icons like the city panel's (the open tab also has its name; the others name themselves on hover). « in its tab bar folds it into a thin strip with » and an icon for each tab (Trip, Preferences, Itinerary, Assistant) to open it again on that tab, plus the trip's plans (A, B…) to switch between without opening it, all labelled on hover; remembered in this browser. On a narrow window (under about 1,200 px) only one side panel shows at a time: opening a city or journey panel folds the left one away (it comes back when that closes), and opening the left one closes the city or journey panel.
- **On a phone** (under 768 px wide) the map fills the screen and the panels are bottom sheets, like Google Maps: a city or journey panel opens over the bottom half (the city moves into view above it); drag its header up for all of the map, down to just the header (name, stop and tabs) or further to close it, or tap the grip to open it more. The left panel is a sheet too, its tabs the header. The top bar is hidden, so the map reaches the top: a gear at the top right of the map opens a settings panel from the right with what it held (the trip and its dates, currency, °C or °F, light/dark theme, account and sign-in). The map's legend stays at the top, in one row that scrolls sideways; its controls sit at the bottom, just above the sheet, as one row of dropdowns instead of rows of buttons and switches (the view; its month, places or cost, the cost kinds listed under their groups; Feels like or Real and High or Low on Weather; Day or Nights on Route). The timeline and the map's zoom buttons are hidden (pinch to zoom).
- **Display settings** (top bar): currency (USD by default; EUR, TWD, JPY, …; country prices are stored in local money and route prices in EUR, converted with the current exchange rates), °C / °F, and light / dark / same-as-device theme (the map switches to a recoloured dark base map).
- **Address bar**: the map position, open city or journey and its tab, left tab, map view, its month, the Nearby kind and Weather high/low are kept in the URL, so a refresh (or a shared link) comes back to the same view.
- **Saving & trips**: signed out, one trip is kept in this browser. Signed in with Google, trips are saved to your account automatically a moment after each change (with all of their plans and the assistant chat), so they work on any device; the trip menu (top left) switches between trips and creates, renames or deletes them (up to 50). Signing in adds the trip planned while signed out to the account; signing out clears the browser. Esc closes the side panel.

## Project layout

```
src/
  planner/     planning engine (pure TS, no UI) + tests: graph, route, allocate, schengen, cost, language, health,
               mobile internet, places nearby, preferences and travel styles (prefs.ts)
  data/        dataset loader, region presets, the test-case input, CSV parser (shared with scripts/)
  agent/       trip assistant: instructions + tool list (schema.ts, shared with the Worker), tool runner, chat loop
  store/       Zustand trip state + localStorage persistence, saved trips, view state in the URL (url.ts)
  map/         MapLibre map, layer controls, the colour scales shared by the map and its legends (scales.ts), and each
               city's colour and hover box in the current view, shared by the map and the timeline (cityMetric.ts)
  panels/      trip, preferences, plan bar, itinerary, assistant chat, city/leg drawers (weather, sunshine and air charts
               with Recharts), timeline, header, assistant limits (admins)
  ui/          formatting (money, dates, temperatures), theme, small UI kit, hover box, Feels like | Real toggle,
               sideways scrolling, layout sizes (icons: lucide-react)
  review/      the seed data review page (data.html, development only): each seed file as a table with checks
               (TanStack Table)
data/
  seed/        hand-curated: countries, cities, costs, connections, notices
  gen/         generated by scripts/, imported by the app
               (data/ is not in git: it's synced with Cloudflare R2, see "Data storage")
scripts/       data pipeline (TypeScript, run with tsx)
worker/        the site's Cloudflare Worker: static files, Google sign-in (auth.ts), per-user data: saved trips and the daily
               assistant cost cap, with admin-set limits per email (account.ts, trips.ts, limits.ts), /api/chat (Gemini)
```

## Data

Hand-curated files are in `data/seed/`; scripts enrich them from open sources into `data/gen/`. Neither is in git: see "Data storage" below.

| Script | Source | Output |
|---|---|---|
| `build-cities.ts` | GeoNames cities500 (CC-BY) | `cities.json`: coordinates, population, timezone |
| `build-boundaries.ts` | Natural Earth 1:50m (public domain) | `boundaries.json` |
| `build-seed.ts` | `data/seed/*` | `countries`, `costs`, `connections`, `notices`, `local-transport`, `health`, `shopping`, `payments`, `phrases` (validated: every city/country needs an entry; every language needs every phrase) |
| `build-roads.ts` | OSRM demo server (OpenStreetMap, ODbL) | `roads.json`: driving times for estimated legs (queried in batches of nearby cities) |
| `build-visa.ts` | Passport Index dataset (MIT) | `visa.json` |
| `build-climate.ts` | Open-Meteo archive, ERA5 (CC-BY) | `climate.json`: monthly averages 2016–2025 (highs, lows, "feels like" highs and lows, rain, sunshine, humidity) |
| `build-air.ts` | Open-Meteo Air Quality, CAMS model (CC-BY) | `air.json`: monthly PM2.5 2023–2024 |
| `build-mobile.ts` | Ookla Speedtest open data, mobile tiles (CC BY-NC-SA 4.0, non-commercial) | `mobile.json`: typical mobile download/upload speed and latency within 3–8 km of each city centre, newest quarter (no data for Russia and Belarus) |
| `fetch-amenities.ts` | OpenStreetMap via Overpass (ODbL) | `amenities.json`: shops, pharmacies, clinics and ATMs within 1.5 km of the centre; nearest hospital. One request per city, switching between four public Overpass servers when one is busy; resumes from `.cache/amenities` and saves after every city |
| `build-places.ts` | Overture Maps Places (business listings from Meta, Microsoft and Foursquare) | `overture.json`: the same counts from business listings, read straight from Overture's cloud files (only the parts covering each centre; ~6 min for all cities). The app shows the higher of the two counts, as a rough scale (none found, 1–4, 5+, 20+, 50+) |
| `fetch-advisories.ts` | UK FCDO (OGL) + US State Dept | `advisories.json` |
| `fetch-health.ts` | CDC Travelers' Health destination pages (public domain) | `cdc.json`: vaccines and medicines per country, recommended or to consider, with a note; malaria areas. Rows in an unknown form are kept and reported |
| `fetch-fx.ts` | ExchangeRate-API open endpoint | `fx.json` |
| `fetch-population.ts` | World Bank (CC-BY); national statistics where missing (Taiwan: Ministry of the Interior household registration) | `population.json` |
| `fetch-price-levels.ts` | World Bank PPP (IMF where missing) ÷ our exchange rates | `price-levels.json`: US = 1.00; also used to estimate costs where we have none |
| `fetch-big-mac.ts` | The Economist's Big Mac index (MIT) | `big-mac.json` |

```bash
npm run data:build     # everything; climate is slow (Open-Meteo rate limits) and resumes from .cache/
npm run data:refresh   # fast-changing data only; also runs weekly (Mondays) via .github/workflows/refresh-data.yml
```

To add a city: add a row to `data/seed/cities.csv` (and connections to `data/seed/connections.csv`), then run `npm run data:build`, then `npm run data:push`.

To review the seed data as tables, run `npm run dev` and open `/data.html` (development only, never deployed). Each seed file is a table you can sort, filter and search. It marks links to unknown cities or countries, repeated rows, values out of order (e.g. `daysMin` above `daysIdeal`) and countries or cities with no row. The pin by a column's name keeps it at the left while you scroll sideways (by default the line number and what the row is about, e.g. the country; remembered in this browser); click rows to highlight them, then **Only these** to compare just those (Esc clears). Money columns show the unit after their name; **Prices: As entered | All in …** switches the costs, route, taxi and rental prices to the display currency set in the app. It updates as you edit the files.

### Publishing

The site is published as static files on a Cloudflare Worker (`rtw-map`, configured in `wrangler.jsonc`) by `.github/workflows/deploy.yml`: on every push to `main`, by hand, and after the weekly data refresh. It pulls the data from R2, runs the tests, builds and runs `wrangler deploy`. Repository secrets: the four `R2_*` settings, `CLOUDFLARE_API_TOKEN` (permissions: Workers Scripts Edit, Account Settings Read, User Details Read, Memberships Read) and `CLOUDFLARE_ACCOUNT_ID`.

The Worker also serves the API (`worker/`): `/api/session`, `/api/auth/google`, `/api/auth/logout`, `/api/trips` (list, create, open, save, delete the user's trips), `/api/chat`, which forwards the assistant conversation to Gemini, and `/api/admin/limits` (admins: other daily limits per email). Per-user data (trips and assistant usage) lives in one Durable Object per Google account (`Account`, SQLite); the admin list of limits in a `_settings` instance of it. Secrets, set once with `npx wrangler secret put <name>`: `GEMINI_API_KEY`, `SESSION_SECRET` (random; signs the session cookie) and `ADMIN_EMAILS` (comma-separated; who may edit the limits). In `wrangler.jsonc`: `GEMINI_MODEL`, `GOOGLE_CLIENT_ID` (the OAuth client for Sign in with Google; its authorised JavaScript origins are the site and `http://localhost:5317`), the `Account` Durable Object and the per-minute rate limits (assistant calls, trip saves). For local development, put `GEMINI_API_KEY` and `SESSION_SECRET` in `.env.local`.

### Data storage

The `data/` folder is kept in a private **Cloudflare R2** bucket instead of git, synced by `scripts/r2.ts`:

| Command | What it does |
|---|---|
| `npm run data:pull` | Download the data from R2 into `data/` (only changed files) |
| `npm run data:push` | Upload new or changed files. When any seed file changed, the whole `data/seed/` folder is also saved as a dated copy (`snapshots/<date>/seed/`, one per day) |
| `npm run data:snapshots` | List the dated copies of the seed data |
| `npm run data:restore -- <date>` | Put that day's seed copy back into `data/seed/`; check it, then `data:push` to make it current |

Seed data is hand-made and can't be rebuilt, so it gets dated copies; generated data is rebuilt by the scripts.

Setup (once):
1. In the Cloudflare dashboard, create an R2 bucket (private, the default).
2. Create an R2 API token with **Object Read & Write** on that bucket. Note the Access Key ID, the Secret Access Key and your Account ID.
3. Put them in `.env.local` (git-ignored):
   ```
   R2_ACCOUNT_ID=…
   R2_ACCESS_KEY_ID=…
   R2_SECRET_ACCESS_KEY=…
   R2_BUCKET=…
   ```
4. Add the same four values as GitHub repository secrets, for the weekly refresh workflow (pull → refresh → test → push).

**Estimates:** costs, connections, English levels, local transport, taxi, rental, health (tap water, risks, healthcare; vaccines only where CDC data is missing), shopping and payment data are hand-made seed estimates and are labelled as such in the UI. Visa and safety information always links to official sources; verify before travelling.
