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
| `npm run dev:api` | The site's Worker locally (port 8787), for the trip assistant; `npm run dev` forwards `/api` to it. Needs `GEMINI_API_KEY` and `SESSION_SECRET` in `.env.local` |
| `npm test` | Planner and formatting tests (Vitest) |
| `npm run lint` | oxlint |
| `npm run build` | Type-check + production build into `dist/` (static files) |

## What it does

- **Trip assistant** (Assistant tab, needs **Sign in with Google**; 20 messages per account per day, counted down; account menu with Sign out at the top right): chat with Google Gemini to ask about or change the trip. It uses the app's own actions and data (add/remove/move stops, reorder or reverse the whole route in one step, nights, dates, regions, every preference, the trip's plans) and can look up anything in the app's data: any city in full, many cities side by side, and the route between any two cities. For a big what-if it makes a new plan first, so the current one is kept. Changes apply right away, and each reply that changed the trip can be undone. A message can take up to 8 model calls, or 24 with Think harder (and for Plan with AI); long runs wait out the per-minute limit, and older tool results are shortened so long chats stay within the request limits. **Context** chips above the message box show what's on screen (the open city and tab, an open journey, the map view); they're sent with the message so "here" and "this city" make sense, and any of them can be left out. Answers use your currency and °C/°F, in the language you write in. Optional "Think harder".
- **Plans**: a trip can have up to 8 plans, versions of the itinerary each with its own setup and preferences, shown as a bar under the left panel's tabs. **+ Plan** copies the current one to try something without losing it; the active plan's menu renames or deletes it; **Compare** shows them side by side (dates, stops, countries, travel style, cost, per day, travel time, Schengen days, problems, and the cities one has that the other doesn't). The trip's name and assistant chat are shared by its plans.
- **Trip** (the left panel's first tab): dates, regions in visiting order (each country *must* / *optional* / *excluded*; countries in a region start optional and every region gets at least one stop, a country added on its own starts as must, and "do not travel" countries start excluded), "longer stay" per region, start/end city, number of stops (optional minimum and maximum; the planner gives more or fewer nights per stop to keep within it, and Checks says when it can't), Schengen days already used, and free-text wishes. **Generate plan** runs the planner; **Plan with AI** (signed in) runs the same planner, then asks the assistant to adjust the result to the wishes and preferences with its usual tools, so the app's rules (dates filled, Schengen, routes, visas) still hold, and every change can be undone.
- **Preferences** (saved with the trip; a new trip starts from the current one's): home city (any city the app knows; the trip starts there and, unless one way, returns there; not a stop: the itinerary shows the journey from home and back, the map draws it dashed, and the cost includes it; long flights aren't in the timetable data, so they're estimated from distance: ~800 km/h, one change above 7,000 km, a fare range by distance), passport, pace and interests, and a travel style to start from (Shoestring, Backpacker, Budget private, Mid-range, Comfort) that fills in the details, which can then be changed: travellers (solo, two sharing a room, 3–4), room type and hotel level, most per night, cooking vs eating out, where you eat out, alcohol and coffee, getting around in and between cities, overnight travel, longest travel day, paid sights, comfortable ranges of daily highs and of nightly lows (any end open, in 2° steps), rain to avoid, fast internet needed, daily budget; and **trip goals**: what matters most (balanced, more countries, top highlights) and what to do about expensive places (nothing, shorter stays, skip where optional). The planner uses the trip goals, pace, interests and the temperature and rain limits when it makes a plan (and the limits in the weather checks, including warm or cold nights); the travel style sets prices. The rest is stored for the new cost model and checks.
- **Generated plan**: picks cities, orders the route, assigns nights, keeps Schengen days ≤ 90 in any 180-day window, estimates cost as a range. Ground transport wins unless a flight clearly saves time: flights count ~2½ h of airport time and their fare.
- **Editing**: ± nights (auto-locks that stop and rebalances the rest), lock, remove, drag to reorder, add a city from the map, re-order for the shortest route.
- **Checks**: Schengen, visas per passport, travel advisories (UK FCDO + US State Dept), Kosovo → Serbia border, weather, air pollution, tap water, cash-only places and countries where foreign cards fail, pace, limited English, unreachable or estimated legs.
- **Map views**: **Route** (stops numbered by the trip day you arrive and sized by the nights there; elsewhere all stops are one size; lines coloured by travel mode, dashed where times are estimated from road distance; legend), **Weather** (fill = average high in ranges, e.g. 18–28°C, with the high written on each stop, or with **Low** in the legend the average low in night ranges: <2, 2–10, 10–18, 18–23, 23°C+ for nights too hot to sleep without air conditioning; hovering shows both; a ring around each stop fills with the share of rainy days), **Air** (five PM2.5 bands at the WHO's interim targets, 10/15/25/35 µg/m³, with the monthly average on each stop), **Cost** (daily cost for your budget in five bands of about a fifth of all cities each, in your currency), **Mobile** (mobile internet in five bands by download speed, from slow under 25 Mbps to very fast 200+, with the speed on each stop), **Nearby** (roughly how many supermarkets, pharmacies, clinics & doctors or ATMs are within 1.5 km of the centre, picked with buttons like the month; coloured from none found to 50+) and **Schengen** (inside/outside colours and the 90/180 day counter). Weather and air show each place at the time of the trip by default (a stop in the month of its stay, other cities in the month you're at the nearest stop), or any month you pick. Outside the Route view the route is drawn plainly. Clicking a city anywhere (map, itinerary, timeline, another city) brings it into view if it's off screen or under the panel; a click on a stop picks the stop, not the route line under it.
- **City panel**, in tabs (the tab bar scrolls sideways; the mouse wheel scrolls it too): **Overview** (description, suggested days per pace, one line per topic at a glance; problems come first in red, most serious first: visa needed, do-not-travel advice, foreign cards not working), **Transport** (in the city: public transport, how to pay, taxis, rentals; to other cities), **Weather** (weather chart; air quality by month), **Money** (costs incl. supermarket prices, price level vs a country you pick with a how-to-read explainer, Big Mac reference; paying & cash), **Daily life** (language; phone & power: mobile internet, plugs; shops; people & culture), **Health** (vaccines & medicines from CDC; tap water, risks, healthcare; pharmacies, clinics and the nearest hospital), **Safety** (travel advice, emergency number, travel insurance) and **Entry** (visa & entry incl. Schengen 90/180 and EU entry-system notices). Tabs with a problem get a red dot, and the chosen tab stays when you switch cities. Links to official advice, health and travel pages sit under their sections; data sources are listed under "Data" below.
- **Display settings** (top bar): currency (EUR, USD, TWD, JPY, …; data is stored in EUR), °C / °F, and light / dark / same-as-device theme (the map switches to a recoloured dark base map).
- **Address bar**: the map position, open city or journey and its tab, left tab, map view, its month, the Nearby kind and Weather high/low are kept in the URL, so a refresh (or a shared link) comes back to the same view.
- **Saving & trips**: signed out, one trip is kept in this browser. Signed in with Google, trips are saved to your account automatically a moment after each change (with all of their plans and the assistant chat), so they work on any device; the trip menu (top left) switches between trips and creates, renames or deletes them (up to 50). Signing in adds the trip planned while signed out to the account; signing out clears the browser. Esc closes the side panel.

## Project layout

```
src/
  planner/     planning engine (pure TS, no UI) + tests: graph, route, allocate, schengen, cost, language, health,
               mobile internet, places nearby, preferences and travel styles (prefs.ts)
  data/        dataset loader, region presets, the test-case input
  agent/       trip assistant: instructions + tool list (schema.ts, shared with the Worker), tool runner, chat loop
  store/       Zustand trip state + localStorage persistence, saved trips, view state in the URL (url.ts)
  map/         MapLibre map, layer controls, and the colour scales shared by the map and its legends (scales.ts)
  panels/      trip, preferences, plan bar, itinerary, assistant chat, city/leg drawers, timeline, header
  ui/          formatting (money, dates, temperatures), theme, small UI kit
data/
  seed/        hand-curated: countries, cities, costs, connections, notices
  gen/         generated by scripts/, imported by the app
               (data/ is not in git: it's synced with Cloudflare R2, see "Data storage")
scripts/       data pipeline (TypeScript, run with tsx)
worker/        the site's Cloudflare Worker: static files, Google sign-in (auth.ts), per-user data: saved trips and daily limits (account.ts, trips.ts, limits.ts), /api/chat (Gemini)
```

## Data

Hand-curated files are in `data/seed/`; scripts enrich them from open sources into `data/gen/`. Neither is in git: see "Data storage" below.

| Script | Source | Output |
|---|---|---|
| `build-cities.ts` | GeoNames cities500 (CC-BY) | `cities.json`: coordinates, population, timezone |
| `build-boundaries.ts` | Natural Earth 1:50m (public domain) | `boundaries.json` |
| `build-seed.ts` | `data/seed/*` | `countries`, `costs`, `connections`, `notices`, `local-transport`, `health`, `shopping`, `payments` (validated: every city/country needs an entry) |
| `build-roads.ts` | OSRM demo server (OpenStreetMap, ODbL) | `roads.json`: driving times for estimated legs (queried in batches of nearby cities) |
| `build-visa.ts` | Passport Index dataset (MIT) | `visa.json` |
| `build-climate.ts` | Open-Meteo archive, ERA5 (CC-BY) | `climate.json`: monthly averages 2016–2025 |
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

### Publishing

The site is published as static files on a Cloudflare Worker (`rtw-map`, configured in `wrangler.jsonc`) by `.github/workflows/deploy.yml`: on every push to `main`, by hand, and after the weekly data refresh. It pulls the data from R2, runs the tests, builds and runs `wrangler deploy`. Repository secrets: the four `R2_*` settings, `CLOUDFLARE_API_TOKEN` (permissions: Workers Scripts Edit, Account Settings Read, User Details Read, Memberships Read) and `CLOUDFLARE_ACCOUNT_ID`.

The Worker also serves the API (`worker/`): `/api/session`, `/api/auth/google`, `/api/auth/logout`, `/api/trips` (list, create, open, save, delete the user's trips) and `/api/chat`, which forwards the assistant conversation to Gemini. Per-user data (trips and assistant usage) lives in one Durable Object per Google account (`Account`, SQLite). Secrets, set once with `npx wrangler secret put <name>`: `GEMINI_API_KEY` and `SESSION_SECRET` (random; signs the session cookie). In `wrangler.jsonc`: `GEMINI_MODEL`, `GOOGLE_CLIENT_ID` (the OAuth client for Sign in with Google; its authorised JavaScript origins are the site and `http://localhost:5317`), the `Account` Durable Object and the per-minute rate limits (assistant calls, trip saves). For local development, put `GEMINI_API_KEY` and `SESSION_SECRET` in `.env.local`.

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
