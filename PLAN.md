# RTW Map — Product & Technical Plan (draft v0.4)

A map-based trip planner for long, multi-country trips anywhere in the world: round-the-world, one region, or a few countries. Data is filled in region by region, starting with the region of my RTW plan (the Balkans, Eastern Europe, Poland, the Baltic States and Russia). The user says roughly **where**, **how long**, and **how they like to travel**. We suggest a route and how many days to spend in each city. Every stop and every leg comes with practical information: weather, costs, how to get there, visas, safety, and local context.

---

## 0. Decisions (Oct 2026)

| Topic | Decision |
|---|---|
| First user | Me (personal use). **Test case:** my RTW trip, May–Sept 2027: Balkans → Eastern Europe → Poland (longer) → Baltics → Russia. The website plans it; we use it to find bugs (§3.3) |
| Coverage | **Global cities.** Basic data comes automatically for any city; detailed hand-checked data is added region by region (§3.0). First region: Balkans, Eastern Europe, Poland, Baltic States, Russia (the test case). Order of later regions: decided after the field test |
| Language | English only |
| Passports | A few: EU/EEA/Swiss (one group), UK, US, Canada, Australia, New Zealand, Japan, South Korea, **Taiwan** |
| Platform | Desktop-first web app; a simple read-only phone view for use on the road |
| Team & budget | Solo developer, lowest possible budget, ~10 daily users |
| Type | Side project, no SEO, so **no SSR**: a plain single-page app |
| Accounts | None. Save locally + export/import JSON; optional share link |
| Name | rtw-map (working name) |
| Target | Test case runs end-to-end by ~Jan 2027 so there's time to fix bugs; phone/offline view ready by May 2027 for the field test |
| "Do not travel" countries | Excluded from routes by default (e.g. Ukraine, Belarus) |
| Spend logging | Out of scope |
| Currency | The user picks a display currency (EUR, USD, GBP, TWD, JPY, …); all prices are shown in it. Data is stored in EUR and converted with daily rates. City pages also show the local currency and the exchange rate |
| Road trips | Supported as a travel mode alongside public transport (§6.4). The planner suggests a rental car only for parts of a trip where it clearly helps, and only if the user drives |

---

## 1. Product principles

1. **The map is the main interface.** The route, the timeline and the information all live on one screen. You should never feel lost in tabs.
2. **Suggest first, then edit freely.** We generate a plan in seconds, and every part of it can be changed: drag cities, lock days, swap the order.
3. **The engine does the math; AI does the conversation.** A deterministic planner handles days, order, visa limits and costs. AI handles natural-language input, explanations and smart edits. AI answers come from our data, never from its own guesses.
4. **Every fact shows its source and age.** Visa, safety and prices change. Each data point carries `source` and `updated_at`, and the UI shows them.
5. **Built for backpackers first.** Hostel prices, supermarket costs, overland routes and overnight buses come first.
6. **Test with a real trip.** If the website can't plan the Balkans → Russia test case well, it isn't done.

---

## 2. Core user flow (MVP)

```
① Trip setup  →  ② Generated plan  →  ③ Edit on map/timeline  →  ④ Explore info  →  ⑤ Save / export
```

### ① Trip setup
| Input | Options |
|---|---|
| Duration | Fixed dates · "~N days starting around <month>" · open-ended |
| Where | Countries, regions ("Balkans") or specific cities, each marked *must* or *nice to have* |
| Start / end | Start city; end city or "anywhere" |
| Pace | 🐢 Chill · ⚖️ Balanced · 🐇 Fast |
| Budget | Shoestring · Backpacker · Mid-range · Comfort |
| Interests | Food, nature/hiking, beaches, culture/history, nightlife, cities, etc. |
| Preferences | Avoid flights / prefer overland, avoid extreme heat, crowd tolerance |
| Passport(s) | Drives visa and Schengen logic (dual citizenship supported) |
| Driving (optional) | Do you drive? · licence country (sets which side of the road you're used to and the IDP rules) · traffic you're used to (quiet roads / town / busy city) · OK with manual gearbox? · OK with mountain roads? · driver age (young-driver fees) · open to renting a car: never / where it helps / prefer driving |
| Anchors (optional) | "Be in St Petersburg for the White Nights", "festival in Kraków on <date>" |

### ② Generated plan
- An ordered list of cities with suggested days, travel legs between them, and an estimated total cost.
- A **Schengen day counter** and other warnings: visa limits, bad-weather months, missed anchors.
- If the user drives: **road-trip segments** (e.g. "rent a car in city A, drive 5 days, return in city B") where a car clearly beats buses, with the full cost and driving warnings.

### ③ Edit
- Drag to reorder, +/- days, lock a stop (the engine rebalances the others), add or remove cities by clicking the map.
- Change pace or budget globally and the plan rebalances live.
- Phase 2: AI copilot ("make Poland longer", "add Moldova", "swap the flight for an overland route").

### ④ Explore
- Click a **city** for its panel, split into tabs ordered by how often they're needed: **Overview** (description, suggested days per pace, one line per topic at a glance), **Transport** (getting around, getting there & away), **Weather** (weather, air quality), **Money** (costs, price level, money & payments), **Daily life** (language, shops & services, people & culture), **Safety** (advisories, health & emergencies) and **Entry** (visa & entry, before you go: vaccines, insurance, plugs). Safety and Entry come last because they're read once per country; their problems (a visa needed for this passport, a do-not-travel advisory, foreign cards not working) still come first in red on the Overview, most serious first, and put a red dot on their tab. The chosen tab stays when switching cities, so cities are easy to compare.
- Click a **leg** for transport options with duration, price range, frequency and booking tips. When driving is an option, public transport and car are compared side by side (time, cost, difficulty).
- City drawer gets a **Driving** section: how hard it is to drive and park there, old-town restrictions, whether a car is useful for the area.
- **Month slider + map layers**: climate quality, Schengen vs. non-Schengen, cost level, safety advisory level, **driving** (road safety per country, driving difficulty per city).

### ⑤ Save / export
- Auto-save to localStorage. Export/import a JSON file (doubles as a backup).
- Optional share link: the trip compressed into the URL, so no server is needed.
- Print/PDF view. `.ics` calendar export later.

---

## 3. Coverage & test case

### 3.0 Global coverage, filled region by region
The website works for any city in the world. Data comes in two tiers:

| Tier | What | How it's made | Coverage |
|---|---|---|---|
| **Automatic** | Location, population, timezone, weather by month, air quality by month, shops/pharmacies/clinics and nearest hospital, visa per passport, travel advisories, exchange rates, country population, estimated road travel times | Scripts from global open sources (§5); no hand work | Every city above a population threshold, plus listed tourist places |
| **Curated** | Suggested days and tags, costs, connections, English level, public transport, taxis, rentals, tap water, supermarket chains, health risks, driving | Country defaults with city overrides; AI-assisted extraction from Wikivoyage and operator sites, then my review (§7) | One region at a time |

- A city with only automatic data shows a **"basic info"** label. The planner still works there: it uses country defaults and road-distance estimates, and says so.
- A region counts as **done** when every city in it has curated data and its test trip passes, like §3.3 for the first region.
- The engine and UI must never assume a specific region: no hard-coded country lists outside the data files.

### 3.1 First region: data coverage (~20 countries, ~80–100 cities; start with ~50 core cities)
The first region is the one my RTW plan covers, and it gets complete curated data.

| Block | Countries | Schengen? |
|---|---|---|
| Western Balkans | Albania, Montenegro, Bosnia & Herzegovina, Serbia, Kosovo, North Macedonia | No |
| Balkans (EU) | Slovenia, Croatia, Greece | Yes |
| Eastern Europe | Bulgaria, Romania, Hungary, Slovakia, Czechia | Yes |
| | Moldova | No |
| Poland | Poland | Yes |
| Baltic States | Lithuania, Latvia, Estonia | Yes |
| Russia | Russia (main cities, starting with St Petersburg and Moscow) | No |

Countries with "do not travel" advisories (e.g. Ukraine, Belarus) are **excluded from routes by default**.

### 3.2 Features this region forces into the MVP
- **Schengen 90/180 calculator.** Most of this region is Schengen (Croatia joined in 2023, Bulgaria and Romania in 2025). Any long trip here hits the 90-day limit for non-EU passports, so the engine must treat Schengen days as a budget while planning, not just warn afterwards.
- **EES / ETIAS notices.** The EU's Entry/Exit System counts days automatically, and ETIAS pre-travel authorization is expected to apply to visa-free visitors by 2027. The site should show the current status.
- **"Hard border" warnings for Russia**, e.g. visa required, no EU flights, limited land crossings, foreign cards not working (bring cash), advisories and insurance gaps. These are data the website shows; they must be refreshable because they change often.

### 3.3 Test case: the Balkans → Russia trip (May–Sept 2027)
The website itself plans this trip. We use it as the main end-to-end test to find bugs and gaps. We do not hand-plan it here.

**Test input:** May–Sept 2027 · Balkans → Eastern Europe → Poland (longer stay) → Baltics → Russia · pace/budget/passport set at test time.

**What the website should do (acceptance checks):**
- [ ] Turns the rough country list into a city route with suggested days per city, in a sensible geographic order
- [ ] Gives Poland noticeably more days when it's marked as a longer stay
- [ ] Keeps Schengen days ≤ 90 in every 180-day window, rebalancing towards non-Schengen countries if needed, and explains why
- [ ] Shows weather fit per stop for the actual month (e.g., warns about inland Balkan heat in midsummer)
- [ ] Shows visa requirements and the Russia warnings for the chosen passport
- [ ] Has a realistic transport option for every leg, including the Baltics → Russia border crossing
- [ ] Estimates the total cost as a range
- [ ] Re-plans correctly after manual edits (lock a stop, change days, reorder, change pace)
- [ ] Survives a reload (localStorage) and a JSON export/import
- [ ] Phone view works offline during the trip

**Driving variant of the test case** (same input + "I drive", to test §6.4):
- [ ] Suggests a car only where public transport is weak or slow; never in "can't drive" mode
- [ ] Never plans a rental across a border the rental rules don't allow (e.g. into Russia), and warns about cross-border fees and green-card insurance
- [ ] Avoids picking up or dropping off cars in cities rated harder than the user's comfort level
- [ ] Shows IDP, vignette/toll, alcohol-limit and driving-side warnings for the licence country
- [ ] Car cost includes rental, fuel, tolls/vignettes, parking and one-way fees, and is compared with the public-transport option

Every failed check becomes a bug or a data gap to fix. Results from the real trip (actual prices, transport times) improve the data afterwards.

### 3.4 Region-specific data references (for manual research, not scraping)
- Buses in the Balkans: GetByBus, BalkanViator, local bus station sites
- Trains: seat61, PKP Intercity / Koleo (Poland), CFR (Romania), ŽS (Serbia)
- Buses in the Baltics and Central Europe: Lux Express, FlixBus, Ecolines
- Wikivoyage coverage of this region is good, so it's the main seed for connections and tips

---

## 4. Screen layout (desktop)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ rtw-map   Trip: "2027 Europe"  153 days · €7.1k est.  Schengen 87/90 ✅ 💬│
├───────────────────┬──────────────────────────────────────────────────────┤
│ ITINERARY         │                                                      │
│ 1 Tirana     3d   │                 MAP (MapLibre)                       │
│   └ 🚌 3h €10     │     ● cities sized by days, routes colored by mode   │
│ 2 Berat      2d   │     Schengen area shaded; layers: [Climate][Cost]    │
│ ...               │                                                      │
│ 14 Kraków    6d 🔒│                                                      │
│ ⚠ 1 warning       │                                                      │
├───────────────────┴──────────────────────────────────────────────────────┤
│ TIMELINE  May ▓▓▓▓│Jun ▓▓▓▓│Jul ▓▓▓▓│Aug ▓▓▓▓│Sep ▓▓▓  (Schengen band ▬▬▬)  │
│ Month slider ◀━━━━━━●━━━━━━━━━━━▶  (drives the climate/price layers)     │
└──────────────────────────────────────────────────────────────────────────┘
          City / leg details open as a right-side drawer over the map
```
Phone (Phase 3): a read-only itinerary + today's stop + offline city info.

---

## 5. Information we provide (and where it comes from)

**Data lives in the repo as files**: hand-curated seed files, enriched by scripts from open sources. Git is the database: changes are reviewable diffs and everything is versioned. For global coverage the generated data is split per country and loaded on demand (§8).

| Category | What we show | Sources | Refresh |
|---|---|---|---|
| **Places** | Cities, coordinates, population, timezone | GeoNames (CC-BY), Wikidata (CC0) | Once |
| **Climate** | Monthly avg high/low, rain days, humidity, sunshine; derived "comfort score" | Open-Meteo historical (ERA5): monthly averages over 2016–2025, computed ourselves | Once |
| **Seasons/events** | Peak season, heat, festivals, public holidays | Nager.Date (holidays), curated | Yearly |
| **Costs** | Hostel dorm bed, private room, street meal, restaurant, local transport, **supermarket basket** | Curated seed data, Open Prices (Open Food Facts), World Bank price levels as fallback | Manual |
| **Price level** | How far money goes in each country vs the US (= 1.00), shown in plain language against a country the user picks (default from the display currency, e.g. TWD → Taiwan): "about 35% cheaper than Germany". A "How to read the price level" explainer. Used to **estimate costs** for any country without hand-entered prices, and to flag hand-entered costs that are >25% above or >20% below what the level suggests | World Bank PPP conversion factors (IMF where missing, e.g. Taiwan) ÷ our daily exchange rates | Yearly (rates daily) |
| **Big Mac** | Local Big Mac price, converted to the display currency, next to the comparison country's price: a relatable reference, not used for estimates (only ~53 countries; McDonald's isn't in e.g. Albania, Kosovo, Russia) | The Economist's Big Mac index (MIT) | Twice a year |
| **Transport** | Between cities: mode, duration, price range, frequency, overnight option, booking tip | **Own `connections` file**, seeded from Wikivoyage + region references (§3.4) using AI extraction + my review; OSRM for road times | Manual |
| **Visa** | Requirement per passport, max stay, Schengen zone, e-visa link, ETIAS/EES notes | Passport Index open dataset + Wikipedia, always linked to the official government site | Monthly check |
| **Safety** | Advisory level + summary, scams, emergency numbers | UK FCDO (gov.uk content API), US State Dept | Daily (automated) |
| **Health & water** | **Tap water** (safe / safe but locals drink bottled / boil or filter / drink bottled), vaccines to discuss with a travel clinic (routine, hepatitis A/B, rabies, tick-borne encephalitis where relevant), health risks (ticks, stray dogs, West Nile mosquitoes, heat, bears, landmines), what healthcare is like and how you pay | Hand-curated from CDC Travelers' Health (linked per country), UK FCDO/NaTHNaC and water utilities; city overrides where they differ (e.g. St Petersburg) | Yearly |
| **Air quality by month** | Monthly average PM2.5 and days above the WHO daily guideline (15 µg/m³); map layer with month picker; warning when the stay month is polluted (e.g. winter smog in Sarajevo, Skopje, Kraków) | Open-Meteo Air Quality API (Copernicus CAMS European **model** data, CC-BY), 2023–2024 | Yearly |
| **Shops & services** | Supermarkets, convenience stores, pharmacies, clinics/doctors and ATMs within 1.5 km of the centre; distance to the nearest hospital; common supermarket chains; Sunday closures and late-night options | OpenStreetMap via Overpass (counts depend on how well an area is mapped); chains and opening rules hand-curated | Yearly |
| **People & culture** | Population, languages, religion breakdown, etiquette, tipping | Wikidata, Pew Research, Wikivoyage "Respect" sections | Yearly |
| **Language** | **How easy it is to get by in English** per city (1 hard → 5 easy): a country estimate, one step easier in big/very touristy cities, one step harder in small towns. Plus other useful languages (e.g. Russian in the Baltics, German in Kosovo, Italian in Albania) and the alphabet on signs (Cyrillic, Greek). Map layer + a trip check for stops where English is limited | Our own estimate, labelled as such; compared against the EF English Proficiency Index and the EU Eurobarometer language survey (references only, not copied) | Yearly |
| **Welcomeness** | LGBTQ+ legal status, women-traveler notes, notes for travelers of different ethnicities | Equaldex, FCDO's dedicated advisory sections | Monthly |
| **Local transport** | Per city: how easy public transport is (1 little/none → 5 excellent), which kinds exist (metro, tram, trolleybus, bus, minibus, train, ferry, funicular, cable car), whether the centre is walkable, how to pay (contactless, app, cash to the conductor, free in Belgrade), tips | Hand-curated from Wikivoyage "Get around" and city transport operators; link to the Wikivoyage page | Yearly |
| **Rentals** | Per city: bike share, e-scooters, bike rental shops, car rental, scooter/motorbike rental. Per country: bike/scooter apps (e.g. Bolt, Lime, nextbike, Whoosh), daily price range for a small car and a scooter, plus what you need to rent (credit card, age, IDP, licence category, helmet) | Hand-curated; only operators we're confident about are named. Car rental data is the starting point for road-trip mode (§6.4) | Yearly |
| **Taxis** | Per country: ride-hailing apps travellers actually use (Uber, Bolt, FREENOW, Yandex Go, CarGo…, or "none: use local taxis"), start fare + per-km price, an estimated 5 km ride, scam tips (e.g. Sofia price stickers, Prague street taxis) | Hand-curated; only apps we're confident operate are listed, since availability changes often | Yearly |
| **Money & payments** | How easy it is to pay by card (1 cash only → 5 cards everywhere; country level, adjusted for big/small cities, with city overrides like cash-only Theth), contactless and phone pay, what you still need cash for, ATM tips (fees, avoid Euronet, choose local currency), ATMs near the centre, currency and rate. Countries where foreign cards don't work (Russia) are always "cash only" and get a trip warning | Hand-curated estimates, labelled as such; rules for foreign cards change, so link users to their bank | Yearly; Russia/Belarus rules monthly |
| **Practical** | Currency + FX (local currency + the user's display currency), plug type, SIM/eSIM | ExchangeRate-API open endpoint (covers ALL, RSD, MKD, BAM, MDL, RUB… which ECB doesn't), curated | Daily FX |
| **Driving (country)** | Driving side, IDP needed for which licences, vignettes/tolls, alcohol limit, daytime headlights, typical road quality, road deaths per 100k, fuel price, driving culture notes | Curated from official sources; **FCDO "Road travel / Driving" advisory sections** (already fetched); WHO Global Health Observatory (road traffic deaths); EU Weekly Oil Bulletin (fuel, EU countries) + curated for the rest; official vignette/toll sites | Yearly; fuel monthly |
| **Driving (city)** | Difficulty 1–5 (congestion, parking, narrow/old-town streets, driving culture), parking cost per night, car-free or restricted centre, "car useful here?" (e.g. national parks, villages) | Curated rating, informed by TomTom Traffic Index (reference only, check licensing) and Wikivoyage "Get around" | Yearly |
| **Car rental** | Typical daily price (manual/automatic), one-way and cross-border fees, which countries a car rented in country X may enter, green-card insurance, young-driver age limits | Curated from major rental companies' published terms (manual research, no scraping) | Yearly |

**Sensitive topics:** we show facts, official advisory text, and sourced notes. We never invent country-level "scores".

### Scaling the data to global cities

| Data | Works globally today? | What changes at global scale |
|---|---|---|
| Cities, population, timezone (GeoNames) | Yes | Pick cities by population threshold + a curated list of tourist places |
| Weather (Open-Meteo ERA5) | Yes, but slow: free tier allows ~38 cities/hour | Bulk download from the Copernicus Climate Data Store (free) or a paid Open-Meteo plan |
| Air quality (CAMS via Open-Meteo) | Yes (global model; more detailed in Europe) | Use station measurements from OpenAQ where available; model only as fallback (models read high in some big cities) |
| Shops, pharmacies, clinics, hospitals (OpenStreetMap) | Yes, but Overpass is slow and rate-limited | Process regional OSM extracts (Geofabrik) locally instead of one query per city |
| Road travel times (OSRM demo server) | Small batches only | Self-hosted OSRM or OpenRouteService (free key) |
| Visa (Passport Index) | Yes: 199 passports | Add more passports to the picker |
| Advisories (FCDO + US), exchange rates, World Bank | Yes | Nothing |
| Curated data (costs, transport, English, taxis, rentals, water, shops, health, driving) | No: hand-made per region | Country defaults first, then city overrides; AI-assisted extraction + review; "report outdated" button for corrections. **Costs already work everywhere**: estimated from the national price level until hand-checked |

---

## 6. The planning engine (core logic)

A pure TypeScript module (`src/planner`) with unit tests, running in the browser, so edits re-plan instantly.

### 6.1 City profile (per city, in the data files)
- `days_min / days_ideal / days_max`, e.g. Kraków 3/5/10, Kotor 1/2/4, a transit town 0.5/1/2. The city panel shows the resulting suggested days for each pace (chill / balanced / fast), using the same rules as the planner
- `tags`, `popularity`, `long_stay_friendly`
- `climate_score[month]` (0–1)
- `daily_cost[budget_tier]`
- `visa_zone` (via its country: `schengen`, `none`, …)

### 6.2 Algorithm
1. **Candidate set**: expand the selected countries/regions into cities and score each one as `interest_match × popularity × climate_fit(month)`. *Must* cities are always included.
2. **Order the route**: geographic nearest-neighbour, then improve with 2-opt / simulated annealing. Cost = travel time + price + weather penalty in the arrival month + anchor violations. N < 50, so this takes milliseconds.
3. **Transit days**: daytime legs over ~5h use a day (Fast: ~7h). Overnight buses, trains or ferries cost ~0.5 day and save a night of accommodation. Flights cost ~0.5 day.
4. **Allocate days**:
   - `available = total_days − transit_days − rest_buffer`. Chill adds 1 rest day per ~10 days.
   - Start from `days_ideal × pace_multiplier` (Chill 1.4, Balanced 1.0, Fast 0.7), clamp to min/max, and respect locked stops.
   - **Zone budgets (Schengen 90/180)**: if the plan goes over, move days from Schengen cities to non-Schengen cities, or drop optional Schengen cities. Never silently overstay.
   - **Too many days?** Drop the lowest-scoring optional cities first. **Spare days?** Extend high-score or long-stay cities.
5. **Validate**: rolling 90/180 check on actual dates (counted the way EES counts, with entry and exit days both counting), max stay per country, visas needed before arrival, weather warnings, anchors, too many 1-night stops in a row.
6. **Estimate cost**: Σ(days × daily_cost) + Σ(leg prices) + visa fees, shown as a range.

### 6.3 Flexible schedules
- Fixed dates → full calendar; fuzzy start → plan by month; open-ended → suggest an ideal length.
- Stops are **locked** (days or dates fixed) or **floating** (the engine may adjust them).

### 6.4 Road-trip mode
Driving is a **per-leg mode**, not a separate kind of trip. Consecutive car legs form a **rental segment** (pick up in city A, drop off in city B).

1. **Is the user allowed and comfortable?** No car at all if the user doesn't drive. Otherwise compare the user's profile with each country and city:
   - **Driving side.** Every country in our coverage drives on the right, so warn drivers whose licence comes from a left-driving country (e.g. UK, Australia, New Zealand, Japan) and lower the car score in busy cities for them.
   - **Traffic comfort.** A city whose difficulty is above the user's comfort level is never a pick-up/drop-off point and gets a warning if the route drives through it ("park outside and take the tram in").
   - **Manual gearbox / mountain roads / young driver.** Affect rental price and availability, and add warnings on mountain legs.
   - **Licence & IDP.** Warn when an International Driving Permit is required for that licence (depends on the country and the 1949/1968 road-traffic conventions).
2. **Where does a car help?** Score each leg and stop:
   - Public transport is weak: no curated connection, low frequency, or bus time > ~1.5× driving time.
   - The area is better by car: cities tagged `carUseful` (national parks, mountain villages, scattered sights).
   - Easy driving: low city difficulty, good roads, reasonable road-safety record.
3. **Build rental segments.** Group consecutive car-friendly legs into segments. Each segment must:
   - start and end in a city where renting is possible and driving difficulty is acceptable (often an airport or a mid-sized city rather than a capital's centre);
   - respect **cross-border rental rules** (some non-EU countries need extra fees and green-card insurance; Russia/Belarus/Ukraine are typically not allowed);
   - be long enough to be worth it (e.g. ≥ 2 driving legs or ≥ 2 days), otherwise keep public transport.
4. **Compare and choose.** For each segment, compare car vs public transport on time and money:
   - Car cost = rental days × rate + fuel (km × consumption × fuel price) + tolls/vignettes + parking nights × parking price + one-way/cross-border fees.
   - Driving days over ~4–5h count against the day like long bus legs (§6.2 step 3), and a driver can't take overnight buses, so the transit-day rules differ.
   - Suggest the car only if it clearly wins (or the user chose "prefer driving"); always show both options in the leg drawer so the user can switch.
5. **Validate.** Rental segment crosses a forbidden border, IDP missing, vignette needed, zero-alcohol countries, mountain roads for a user who opted out, car parked in a hard-to-park city for many nights → warnings.

---

## 7. AI layer (Phase 2)

Uses Claude via the Anthropic API, with a cheap model by default and a hard monthly spending limit set in the Anthropic console. At ~10 users this should cost a few USD/month.

| Use | How |
|---|---|
| **Natural-language setup** | "5 months, Balkans to Russia, love hiking and food, ~€40/day" → structured trip input |
| **Copilot edits** | Tool use: `add_city`, `remove_city`, `set_days`, `lock_stop`, `set_pace`, `reoptimize`, `get_city_info`, `get_connections`. The engine stays the source of truth |
| **Explanations** | "Why so few days in X?" answered from engine scores and Schengen math |
| **Grounded Q&A** | Answers only from our data + advisory text, with citations and dates. If we have no data, it says so |
| **Data building (offline, run by me)** | Extract connections, costs and tips from Wikivoyage text into the data files; I review the diff before committing |

The API key lives in a small serverless proxy, never in the browser. The proxy is protected with a simple secret plus rate limiting, since it's personal use.

---

## 8. Tech stack (lowest budget)

| Layer | Choice | Why | Cost |
|---|---|---|---|
| App | **Vite + React + TypeScript** single-page app, Tailwind, Zustand | No SSR needed; simplest setup | $0 |
| Map | **MapLibre GL JS** + **OpenFreeMap** tiles (no key); Protomaps as fallback | Free, no lock-in | $0 |
| Charts | Small custom SVG components (no chart library) | Only one chart type needed so far | $0 |
| Data | JSON/CSV files in the repo, bundled at build time | No database to run | $0 |
| Scripts | TypeScript (run with `tsx`) for fetching/building data | One language for everything | $0 |
| Hosting | **Cloudflare Pages** (static) + one **Pages Function / Worker** for the AI proxy | Generous free tier | $0 |
| Scheduled refresh | GitHub Actions cron: fetch advisories + FX → commit → auto-deploy | Free | $0 |
| AI | Anthropic API (Phase 2) | | a few $/month |
| Domain | Optional | | ~$10/yr |

**Why MapLibre instead of Mapbox:**
- Mapbox GL JS has been proprietary since v2 and is billed per map load beyond a free tier (check current pricing). If this ever grows, costs would grow with it.
- MapLibre is open source (BSD), needs no account or token, and works with any tile source:
  - **Now:** OpenFreeMap (free, no key)
  - **Fallback:** Protomaps (a single PMTiles file on Cloudflare R2, very cheap)
  - **Nicer styles later:** MapTiler
- MapLibre is a fork of Mapbox v1 with a nearly identical API, so switching later either way is days of work, not a rewrite.
- What we give up: Mapbox Studio's style editor, some polish, and Mapbox's search/directions APIs.

**Global-ready data layout** (needed before adding a second region):
- Split generated data per country (`data/gen/countries/XX.json`) and fetch only the countries in the trip; keep a small global city index for search and the map.
- The map shows cities by zoom level, so thousands of dots don't load at once.
- The planner already builds its travel graph only for the countries in the trip, so it scales with the trip, not with the world.
- Move the region-specific rules that are still in code into data files:
  - closed or restricted borders (Russia/Belarus/Ukraine in `graph.ts`)
  - the Kosovo → Serbia entry rule (`planner/index.ts`)
  - Schengen detection, which currently checks the passport's rule for Poland (`schengen.ts`, `planner/index.ts`)
  - the region presets (`data/presets.ts`)

Repo layout (single app, no monorepo):
```
src/
  planner/        engine + tests (pure TS, no UI)
  data/           dataset loader, region presets, test-case input
  store/          Zustand trip state, localStorage persistence
  map/            MapLibre map + layer controls
  panels/         setup, itinerary, drawers, timeline, header
  ui/             formatting, small UI kit
data/
  seed/           hand-curated CSV/JSON (countries, cities, costs, connections, notices)
  gen/            generated JSON imported by the app (committed)
scripts/          data pipeline (build-*, fetch-*)
functions/        ai-proxy (Phase 2, not built yet)
```
See README.md for the script → source → output table.

---

## 9. Data model (TypeScript types → data files)

```
Country    { iso2, name, population, languages[], religions{}, currency, plugTypes[],
             drivingSide, emergency{}, visaZone: 'schengen' | 'none' | ..., sources[],
             english: { level: 1..5, otherLanguages[], script } }
City       { id, iso2, name, lat, lon, population, tags[], popularity,
             days: {min, ideal, max}, longStayFriendly }
Climate    { cityId, month, tHigh, tLow, rainMm, rainDays, humidity, sunHours, comfort }
Cost       { cityId, tier, dormBed, privateRoom, mealCheap, mealMid, localTransportDay,
             groceryBasket, dailyTotal, currency, source, updatedAt }
Connection { from, to, mode, durationMin, priceMin, priceMax, frequency, overnight,
             operatorHint, bookingTip, source, updatedAt, confidence }
VisaRule   { passport, dest, requirement, maxStayDays, zone, evisaUrl, notes, source, updatedAt }
Advisory   { iso2, issuer, level, summary, sections{}, url, updatedAt }
Welcome    { iso2, lgbtqLegal{}, womenNotes, ethnicityNotes, sources[] }
CountryHealth    { iso2, tapWater: { level: 'safe' | 'safe_bottled' | 'boil' | 'bottled', note },
                   vaccines[], risks[], healthcare, cdcSlug }       // + city tapWater overrides
AirMonth         { cityId, month, pm25, daysOverWho }
Amenities        { cityId, supermarket, convenience, pharmacy, clinic, atm, nearestHospitalKm }
Shopping         { iso2, chains[], lateNight?, sunday? }
PriceLevel       { iso2, level, year, source: 'World Bank' | 'IMF' }   // US = 1.00
BigMac           { iso2, localPrice, currency }                      // + euro-area average
Payments         { iso2, cardLevel: 1..5, foreignCardsWork, mobilePay, cashFor, atm, note? }  // + city overrides
CityTransport    { cityId, ease: 1..5, modes[], walkable, pay?, note?,
                   rentals: ('bikeShare' | 'eScooter' | 'bike' | 'car' | 'moto')[], rentalNote? }
CountryTransport { iso2, taxi: { apps[], flagFall, perKm, tip },
                   rentals: { apps[], carDay: [min, max], motoDay?: [min, max] } }

CountryDriving { iso2, side: 'right' | 'left', idp: { required, forLicences[], note },
                 vignette?, tolls?, alcoholLimit, headlightsDay, roadDeathsPer100k,
                 fuelPriceEur, notes[], sources[] }
CityDriving    { cityId, difficulty: 1..5, parkingPerNightEur, centreRestricted,
                 carUseful, rentalAvailable, notes[] }
RentalRule     { fromIso2, allowedTo[], crossBorderFeeEur, greenCardNeeded,
                 oneWayFeeEur, dailyRateEur: { manual, automatic }, minAge, source }

Trip       { id, name, input{}, stops: Stop[], legs: Leg[], updatedAt }    // localStorage
TripInput.driving { canDrive, licenceCountry, trafficComfort: 1..5, manualOk,
                    mountainOk, age?, rentalPreference: 'never' | 'helpful' | 'prefer' }
Stop       { cityId, days, locked, startDate? }
Leg        { connectionId?, mode: 'public' | 'car', rentalSegmentId?, custom? }
```

---

## 10. Roadmap (solo, part-time)

| Phase | When | Scope | Milestone |
|---|---|---|---|
| **0. Data foundation** | Oct 2026 | Repo setup; data files for ~20 countries / ~50 core cities; climate normals script; visa rules for the supported passports; connections for the whole coverage region | Every city the test case needs has days, climate, cost and connections |
| **1. MVP planner** | Nov–Dec 2026 | Setup form → generated plan; map + itinerary + timeline editing; **Schengen calculator**; city/leg drawers; month slider + climate layer; localStorage + JSON export | **Test case runs end-to-end**; acceptance checks (§3.3) logged as bugs |
| **2. Refine, road trips + AI** | Jan–Feb 2027 | Advisories/FX auto-refresh; better cost estimates; print view; **road-trip mode** (driving data for all countries/cities, rental segments, car vs public comparison, driving layer); AI copilot (NL setup, tool-use edits, grounded Q&A) | All MVP acceptance checks pass, including the driving variant |
| **3. Mobile & offline** | Mar–Apr 2027 | Phone read-only view + offline (PWA); "today" screen | Phone view works offline with the test trip loaded |
| **Field test** | May–Sep 2027 | Use the site on the real trip; log bugs and data errors | Real-world bug list; data corrections |
| **Global rollout** | After Sep 2027 | Global-ready data layout (per-country files, lazy loading); automatic tier for every city above the threshold; then curated data region by region (order decided after the field test) | Any city can be planned with basic info; each new region passes its own test trip |

**If time runs short, cut in this order:** AI copilot → road-trip mode → cost layer → print view. Never cut the Schengen calculator or the visa warnings.

### Progress (5 Oct 2026)
- **Phase 0, done:** Vite + React + TS app; data pipeline in `scripts/` (GeoNames, Natural Earth, OSRM, Passport Index, Open-Meteo, FCDO + US State Dept, World Bank, FX). 22 countries, 69 cities, ~100 curated connections; costs and connections are seed estimates. Advisories use both FCDO and US levels: a country is excluded by default if either says "do not travel" (Russia, Ukraine, Belarus).
- **Phase 1, mostly done:** setup form → generated plan; map with route and layers (weather, cost, English, Schengen, safety); itinerary editing (± nights auto-locks + rebalances, lock, remove, drag to reorder, add from map, re-order); Schengen 90/180 counter enforced while planning; visa, advisory, border (Kosovo → Serbia), weather and pace checks; city and leg drawers; timeline; localStorage + JSON export/import.
- **Climate, done:** monthly averages for all 69 cities (Open-Meteo ERA5, 2016–2025). Weather now affects which cities are picked and when, plus heat/cold/wet checks. ERA5 tends to count slightly more wet days than weather stations, so the wet-month note says "days with ≥1 mm, often short showers".
- **Display currency, done:** currency picker in the header; every price (header total, legs, city costs, map cost layer) is converted; supermarket prices also show the local-currency amount.
- **English & language, done:** Language section in the city panel, an English map layer (route stops are coloured by the active layer), and a trip check naming stops where English is limited.
- **Local transport & taxis, done:** "Getting around" section in the city panel: public transport ease, kinds of transport, how to pay, walkability, taxi apps, start fare + per km, a 5 km ride estimate, scam tips, and rentals (bike share, e-scooters, bikes, cars, scooters/motorbikes) with apps, daily prices and what you need to rent. The data build fails if any city or country is missing.
- **Health, air & services, done:** "Health & water" section (tap water, monthly air pollution chart, vaccines, risks, healthcare + CDC link) and "Shops & services" section (OSM counts near the centre, nearest hospital, chains, Sunday/late-night). The OSM counts are still downloading (the shared Overpass server is slow), so the section shows "not loaded yet" for now. Air map layer by month; checks for undrinkable tap water and polluted months.
- **Money & payments, done:** city section with card acceptance (1–5), phone pay, cash needs, ATM tips, ATMs nearby, currency and rate; Cards map layer; checks for countries where foreign cards fail and for mostly-cash stops. The section jumps to the top in Russia.
- **Price level & Big Mac, done:** price level with a plain-language comparison (user picks the country) and a "how to read" explainer; costs estimated from the price level for countries without hand-entered prices; a warning when our hand-entered costs differ a lot from the level (currently Croatia ~36% higher, Albania ~21% lower); Big Mac reference price.
- **City panel tabs, done:** Overview (suggested days per pace + one line per topic, problems first) and tabs ordered by use: Transport, Weather, Money, Daily life, Safety, Entry. Red dots on tabs with a problem; the chosen tab stays when switching cities.
- **Weather colours, done:** temperature-style colours on the map layer, the timeline and the Overview: blue = cold, green = pleasant, orange/red = hot, grey = wet (same thresholds as the weather checks).
- **Test case:** runs end to end (`npm test`, plus manually in the browser). All automated acceptance checks pass for TW, US and EU passports.
- **Known data issue:** air quality comes from Copernicus CAMS models, which cover the whole world (a more detailed European model inside Europe, a global model everywhere else). Model values can be far off in big cities: Moscow reads ~26 µg/m³ on the European model vs ~16 on the global one, and Tokyo ~28 on the global model, while city stations usually report much lower. Plan: use station measurements (e.g. OpenAQ) where available and fall back to the model elsewhere.
- **Next:** verify the seed costs and connections; build the phone/offline view (Phase 3). The AI copilot (Phase 2) comes after the data is solid.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Visa info wrong → real harm (Schengen overstay, Russia) | Source + date on every rule, official links, EES-style day counting, re-check everything before the trip |
| Fast-changing situations (e.g. Russia borders, payments, advisories) | Automated advisory refresh; "last checked" dates; easy manual overrides in the data files |
| Not ready for the field test (solo, part-time) | Milestones above; cut list |
| Data licensing | Own curated files; only open-licensed sources; credit Wikivoyage (CC-BY-SA) where text is reused |
| Curated data doesn't scale to the whole world (solo) | Two tiers: automatic data everywhere, curated data region by region; country defaults before city details; AI-assisted extraction with review |
| Free APIs (Open-Meteo, Overpass, OSRM) are too slow or rate-limited for thousands of cities | Bulk sources instead (Copernicus CDS, Geofabrik OSM extracts, self-hosted OSRM); cache everything; refresh rarely |
| AI hallucination | AI answers only from our data; the engine owns the itinerary; citations required |
| Sensitive topics | Facts + sourced advisories only; no invented scores |
| Driving advice wrong (IDP rules, cross-border rental bans) → fines, invalid insurance, refused at a border | Source + date on every rule; link to official sites and the rental company's terms; "check with your rental company" on every rental segment |
| City "driving difficulty" ratings are subjective | Show what the rating is based on (congestion, parking, old-town rules), not just a number; let the user's comfort level decide, not the rating alone |

---

## 12. Competitors & inspiration

### Trip planners (closest to us)
| Product | What to study |
|---|---|
| **Wanderlog** | Map + day-by-day list side by side, drag-to-reorder, collaborative trips, budget tracking. Model for the editing experience. |
| **Stippl** | Very visual timeline + route map. Inspiration for our bottom timeline. |
| **Polarsteps** | Popular with long-term travelers; plans and tracks trips as a line on a map. Great map feel and route drawing. |
| **Roadtrippers** | Route-based planning with stops along the way. "The route is the product." Reference for road-trip segments. |
| **ViaMichelin** | Route planner with fuel and toll cost per trip. Reference for our car cost breakdown. |
| **Kiwi.com "Nomad"** | Finds the cheapest order and dates for several cities. Closest thing to our route-ordering engine, but flights only. |

### AI travel planners (for the copilot)
| Product | What to study |
|---|---|
| **Mindtrip** | Chat on one side, map and cards on the other. Best current example of AI + map together. |
| **Layla** | Chat-first planning: how to ask users questions and turn answers into a plan. |
| **Wonderplan** & other AI itinerary generators | Form in, itinerary out. Their limits are our opportunity: plans often ignore real travel times, visas and costs. |

### Getting between places
| Product | What to study |
|---|---|
| **Rome2Rio** | Every way from A to B with time and price. Exactly our leg drawer; copy the clarity. |
| **The Man in Seat 61** | Depth of practical detail that overland travelers want. |
| **12Go** (Asia), **Omio** (Europe), **Busbud** | Bus/train/ferry booking UX. |
| **Skyscanner "Everywhere"** | "Where can I fly cheaply this month?" Idea for an exploration feature. |

### Weather & best time to visit
| Product | What to study |
|---|---|
| **Weather Spark** | Beautiful month-by-month climate charts. Reference for our weather section. |
| **Where and When** / **Climate-Data.org** | "Best time to visit" by month. Similar to our month slider. |

### Costs & budget
| Product | What to study |
|---|---|
| **Budget Your Trip** | Daily cost by travel style from real travelers' spending. Very close to our cost model. |
| **Numbeo** | Supermarket item prices and cost categories. Reference for which items to show (don't copy data). |
| **Hostelworld** | Typical dorm/private prices and how backpackers judge hostels. |

### Visa, safety & welcomeness
| Product | What to study |
|---|---|
| **Passport Index** | Visa-free map for any passport. Reference for our visa layer. |
| **Sherpa** | Entry-requirement checker used by airlines. How to present rules clearly. |
| **Schengen calculators** (e.g. the EU's official short-stay calculator) | How to show 90/180 day counting. Test our calculator against the official one. |
| **UK FCDO / US travel.state.gov / Smartraveller** | Official advisories. FCDO's dedicated LGBT, women and ethnic-minority sections show a careful way to cover sensitive topics. |
| **Equaldex** | LGBTQ+ rights by country, clear and sourced. |
| **Nomads.com** (formerly Nomad List) | City scores with map filters. Closest to our city-info approach; also learn from criticism of oversimplified scores. |

### Content & community
| Product | What to study |
|---|---|
| **Wikivoyage** | Open-licensed "Get in / Get around / Eat / Sleep / Stay safe" for every city. Both inspiration and data source. |
| **r/solotravel, r/backpacking, r/balkans_travel** | The real questions backpackers ask, which guides feature priority. |
| **Lonely Planet** / **Atlas Obscura** | Editorial tone and "what's special here" content. |

### Map design
| Product | What to study |
|---|---|
| **Felt** | Very clean, modern map interface. |
| **Visited** / **Been** | Shareable colored-country maps. |

### Where we stand out
No single product combines **route + days planning**, **real overland transport between cities**, and **visa (Schengen!), weather and cost checks across the whole trip**. Each one covers only one or two of these.

**Suggested hands-on review (about an hour):**
1. Run the test case (or its Balkans part) through Wanderlog and Mindtrip, and note what they get wrong.
2. Rome2Rio + Weather Spark + Budget Your Trip: together, roughly the information we want in one place.
3. The EU Schengen calculator + Passport Index: how to present visa rules.

---

## 13. Open questions

1. **Which cities get automatic data?** Suggestion: population ≥ 50,000 plus a curated list of smaller tourist places (like Theth or Bled).
2. **Which region comes after the first one?** To decide after the field test.
