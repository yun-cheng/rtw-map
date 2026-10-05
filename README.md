# rtw-map

A map-based planner for long, multi-country trips. It's built for cities worldwide; detailed data currently covers the Balkans, Central & Eastern Europe (incl. Austria), Poland, the Baltic States and Russia, plus Taiwan, Japan, Thailand, Vietnam, Malaysia, Singapore and Cambodia (more regions to follow).
You choose regions, dates, pace and budget. It suggests a route with nights per city, enforces the Schengen 90/180 rule,
checks visas and travel advisories, and shows weather, costs, English level and transport for every stop.

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

- **Trip assistant** (Assistant tab, needs **Sign in with Google**; 20 messages per account per day, counted down; account menu with Sign out at the top right): chat with Google Gemini to ask about or change the trip. It uses the app's own actions and data (add/remove/move stops, nights, dates, pace, regions; weather, costs, visas, transport), changes apply right away, and each reply that changed the trip can be undone. Optional "Think harder".
- **Setup**: dates, regions in visiting order (each country *must* / *optional* / *excluded*; countries in a region start optional and every region gets at least one stop, a country added on its own starts as must, and "do not travel" countries start excluded), "longer stay" per region, start/end city, pace, budget, interests, passport, Schengen days already used.
- **Generated plan**: picks cities, orders the route, assigns nights, keeps Schengen days ≤ 90 in any 180-day window, estimates cost as a range. Ground transport wins unless a flight clearly saves time: flights count ~2½ h of airport time and their fare.
- **Editing**: ± nights (auto-locks that stop and rebalances the rest), lock, remove, drag to reorder, add a city from the map, re-order for the shortest route.
- **Checks**: Schengen, visas per passport, travel advisories (UK FCDO + US State Dept), Kosovo → Serbia border, weather, air pollution, tap water, cash-only places and countries where foreign cards fail, pace, limited English, unreachable or estimated legs.
- **Map views**: **Route** (stops numbered by the trip day you arrive; lines coloured by travel mode, dashed where times are estimated from road distance; legend), **Weather** (fill = average high in ranges, e.g. 18–28°C; a ring around each stop fills with the share of rainy days), **Air**, **Cost**, **Cards**, **English**, **Schengen** (inside/outside colours and the 90/180 day counter) and **Safety**. Weather and air show each place at the time of the trip by default (a stop in the month of its stay, other cities in the month you're at the nearest stop), or any month you pick. Outside the Route view the route is drawn plainly. Clicking a city anywhere (map, itinerary, timeline, another city) brings it into view if it's off screen or under the panel; a click on a stop picks the stop, not the route line under it.
- **City panel**, in tabs ordered by how often you need them: **Overview** (description, suggested days per pace, one line per topic at a glance; problems come first in red, most serious first: visa needed, do-not-travel advice, foreign cards not working), **Transport** (getting around: public transport, how to pay, taxis, rentals; getting there & away), **Weather** (weather chart; air quality by month), **Money** (costs incl. supermarket prices, price level vs a country you pick with a how-to-read explainer, Big Mac reference; money & payments), **Daily life** (language, shops & services, people & culture), **Safety** (advisories; health & emergencies: tap water, risks, healthcare, emergency number) and **Entry** (visa & entry incl. Schengen 90/180 and EU entry-system notices; before you go: vaccines, travel insurance, plugs). Tabs with a problem get a red dot, and the chosen tab stays when you switch cities. Links to official advice, health and travel pages sit under their sections; data sources are listed under "Data" below.
- **Display settings** (top bar): currency (EUR, USD, TWD, JPY, …; data is stored in EUR), °C / °F, and light / dark / same-as-device theme (the map switches to a recoloured dark base map).
- **Address bar**: the map position, open city or journey and its tab, left tab, map view and month are kept in the URL, so a refresh (or a shared link) comes back to the same view.
- **Saving & trips**: signed out, one trip is kept in this browser. Signed in with Google, trips are saved to your account automatically a moment after each change (with each trip's assistant chat), so they work on any device; the trip menu (top left) switches between trips and creates, renames or deletes them (up to 50). Signing in adds the trip planned while signed out to the account; signing out clears the browser. Esc closes the side panel.

## Project layout

```
src/
  planner/     planning engine (pure TS, no UI) + tests: graph, route, allocate, schengen, cost, language
  data/        dataset loader, region presets, the test-case input
  agent/       trip assistant: instructions + tool list (schema.ts, shared with the Worker), tool runner, chat loop
  store/       Zustand trip state + localStorage persistence, saved trips, view state in the URL (url.ts)
  map/         MapLibre map and layer controls
  panels/      setup, itinerary, assistant chat, city/leg drawers, timeline, header
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
| `fetch-amenities.ts` | OpenStreetMap via Overpass (ODbL) | `amenities.json`: shops, pharmacies, clinics near the centre; nearest hospital |
| `fetch-advisories.ts` | UK FCDO (OGL) + US State Dept | `advisories.json` |
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

**Estimates:** costs, connections, English levels, local transport, taxi, rental, health, shopping and payment data are hand-made seed estimates and are labelled as such in the UI. Visa and safety information always links to official sources; verify before travelling.
