# RTW Map — Product & Technical Plan (draft v0.4)

A map-based trip planner for long, multi-country trips anywhere in the world: round-the-world, one region, or a few countries. Data is filled in region by region, starting with the region of my RTW plan (the Balkans, Eastern Europe, Poland, the Baltic States and Russia). The user says roughly **where**, **how long**, and **how they like to travel**. We suggest a route and how many days to spend in each city. Every stop and every leg comes with practical information: weather, costs, how to get there, visas, safety, and local context.

---

## 0. Decisions (Oct 2026)

| Topic | Decision |
|---|---|
| First user | Me (personal use). **Test case:** my RTW trip, May–Sept 2027: Balkans → Eastern Europe → Poland (longer) → Baltics → Russia. The website plans it; we use it to find bugs (§3.3) |
| Coverage | **Global cities.** Basic data comes automatically for any city; detailed hand-checked data is added region by region (§3.0). Region 1: Balkans, Central & Eastern Europe (incl. Austria), Poland, Baltic States, Russia (the test case). Region 2: Taiwan, Japan, Thailand, Vietnam, Malaysia, Singapore, Cambodia (§3.5). Order of later regions: decided after the field test |
| Language | English only |
| Passports | A few: EU/EEA/Swiss (one group), UK, US, Canada, Australia, New Zealand, Japan, South Korea, **Taiwan** |
| Platform | Desktop-first web app; a simple read-only phone view for use on the road |
| Team & budget | Solo developer, lowest possible budget, ~10 daily users |
| Type | Side project, no SEO, so **no SSR**: a plain single-page app |
| Accounts | Optional **Sign in with Google**: saves trips to the account (several trips, any device) and unlocks the trip assistant. Signed out, one trip is kept in the browser. No import/export |
| Name | rtw-map (working name) |
| Target | Test case runs end-to-end by ~Jan 2027 so there's time to fix bugs; phone/offline view ready by May 2027 for the field test |
| "Do not travel" countries | Excluded from routes by default (e.g. Ukraine, Belarus) |
| Spend logging | Out of scope |
| Currency | The user picks a display currency (USD by default; EUR, GBP, TWD, JPY, …); all prices are shown in it. Country prices (beds, meals, transport, supermarket) are stored in local money, route prices in EUR, and converted with daily rates. City pages also show the local currency and the exchange rate |
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
| Duration | Fixed dates, each optionally ± a few days · "~N days starting around <month>" · open-ended |
| Where | Countries, regions ("Balkans") or specific cities, each marked *must* or *nice to have*. Countries in a region start as nice to have (every region still gets at least one stop); a country added on its own starts as must or nice to have, as chosen |
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
- Click a **city** for its panel, split into tabs ordered by how often they're needed (the bar scrolls sideways): **Overview** (description, suggested days per pace, one line per topic at a glance), **Transport** (in the city, to other cities), **Weather** (weather, air quality), **Money** (costs, price level, paying & cash), **Daily life** (language, phone & power, shops, people & culture), **Health** (vaccines & medicines, health, medical help nearby), **Safety** (travel advice, emergency number, insurance) and **Entry** (visa & entry). Safety and Entry come last because they're read once per country; their problems (a visa needed for this passport, a do-not-travel advisory, foreign cards not working) still come first in red on the Overview, most serious first, and put a red dot on their tab. The chosen tab stays when switching cities, so cities are easy to compare.
- Click a **leg** for transport options with duration, price range, frequency and booking tips. When driving is an option, public transport and car are compared side by side (time, cost, difficulty).
- City drawer gets a **Driving** section: how hard it is to drive and park there, old-town restrictions, whether a car is useful for the area.
- **Month slider + map layers**: climate quality, Schengen vs. non-Schengen, cost level, **driving** (road safety per country, driving difficulty per city).

### ⑤ Save / export
- Auto-save: signed in, to the account (Cloudflare Durable Object per user, SQLite) a moment after each change; signed out, to localStorage. Several trips per account, with a trip menu to switch, create, rename and delete.
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
| Central & Eastern Europe | Bulgaria, Romania, Hungary, Slovakia, Czechia, Austria | Yes |
| | Moldova | No |
| Poland | Poland | Yes |
| Baltic States | Lithuania, Latvia, Estonia | Yes |
| Russia | Russia (the cities most travellers visit: St Petersburg and Moscow, the Golden Ring, the Volga, Karelia and the Arctic north, Kaliningrad, Sochi, and the Trans-Siberian to Vladivostok) | No |

Countries with "do not travel" advisories (e.g. Ukraine, Belarus) are **excluded from routes by default**.

### 3.1b Second region: East & Southeast Asia (7 countries, 43 cities)
Taiwan (Taipei, Taichung, Tainan, Kaohsiung, Hualien), Japan (Tokyo, Hakone, Kyoto, Nara, Osaka, Hiroshima, Kanazawa, Takayama, Fukuoka, Sapporo), Thailand (Bangkok, Ayutthaya, Kanchanaburi, Chiang Mai, Pai, Chiang Rai, Krabi, Phuket, Koh Samui), Vietnam (Hanoi, Sa Pa, Ha Long, Ninh Binh, Hue, Hoi An, Da Nang, Da Lat, Ho Chi Minh City), Malaysia (Kuala Lumpur, George Town, Melaka, Cameron Highlands, Langkawi), Singapore, Cambodia (Phnom Penh, Siem Reap, Battambang, Kampot). All curated data types are filled in. What this region added:
- **Flights** as a connection mode (islands, and long distances where buses make no sense), with ~2½ h airport time per flight and a fare term in route costs, so cheap ground routes still win when they're reasonable. Ground routes where they're good: shinkansen, Taiwan HSR, Vietnam sleeper trains, border buses (Thailand–Cambodia, Vietnam–Cambodia, Malaysia–Singapore).
- **Voltage per country** (Japan 100V, Taiwan 110V; was assumed 230V).
- **Population from national statistics where the World Bank has none:** Taiwan's comes from the Ministry of the Interior household registration open data (was the IMF).
- **Test trip:** Taiwan → Japan → Southeast Asia (Oct–Dec 2027) in `planner.test.ts`.

### 3.2 Features this region forces into the MVP
- **Schengen 90/180 calculator.** Most of this region is Schengen (Croatia joined in 2023, Bulgaria and Romania in 2025). Any long trip here hits the 90-day limit for non-EU passports, so the engine must treat Schengen days as a budget while planning, not just warn afterwards.
- **EES / ETIAS notices.** The EU's Entry/Exit System counts days automatically, and ETIAS pre-travel authorization is expected to apply to visa-free visitors by 2027. The site should show the current status.
- **"Hard border" warnings for Russia**, e.g. visa required, no EU flights, limited land crossings, foreign cards not working (bring cash), advisories and insurance gaps. These are data the website shows; they must be refreshable because they change often.

### 3.3 Test case: the Balkans → Russia trip (May–Sept 2027)
The website itself plans this trip. We use it as the main end-to-end test to find bugs and gaps. We do not hand-plan it here.

**Test input:** May–Sept 2027 · Balkans → Eastern Europe → Poland (14–21 days) → Baltics → Russia · pace/budget/passport set at test time.

**What the website should do (acceptance checks):**
- [ ] Turns the rough country list into a city route with suggested days per city, in a sensible geographic order
- [ ] Gives Poland the days asked for there (14–21)
- [ ] Keeps Schengen days ≤ 90 in every 180-day window, rebalancing towards non-Schengen countries if needed, and explains why
- [ ] Shows weather fit per stop for the actual month (e.g., warns about inland Balkan heat in midsummer)
- [ ] Shows visa requirements and the Russia warnings for the chosen passport
- [ ] Has a realistic transport option for every leg, including the Baltics → Russia border crossing
- [ ] Estimates the total cost as a range
- [ ] Re-plans correctly after manual edits (lock a stop, change days, reorder, change pace)
- [ ] Survives a reload, and (signed in) opens the same trip on another device
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
│ rtw-map  My trip ▾  1 May–30 Sep · 152 nights · €7.1k   EUR °C/°F ☾ (me) │
├───────────────────┬──────────────────────────────────────────────────────┤
│ ITINERARY         │                                                      │
│ 1 Tirana     3d   │                 MAP (MapLibre)                       │
│   └ 🚌 3h €10     │  ● stops numbered by arrival day, sized by nights    │
│ 4 Berat      2d   │  views: [Route][Weather][Air][Cost]…[Schengen]       │
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
| **Costs** | Hostel dorm bed, private room, street meal, restaurant, local transport, **supermarket basket** | Curated seed data in local money, World Bank price levels as fallback (Open Prices checked Oct 2026: too few prices for our countries) | Manual |
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
2. **Order the route** (regions in the user's order; free order inside each region): nearest-neighbour from several starting cities, then local search (2-opt, moving 1–3 cities, swapping two cities) and a seeded shake-and-reoptimize loop. Leg cost = door-to-door time (incl. ~2½ h airport time per flight) + 1.5 min per € of fare. Weather enters through which cities are picked for each month. The route is re-ordered once more after cities are added or dropped. About 0.5 s for a 40-stop trip.
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

Uses **Google Gemini** (paid tier, so chats aren't used for training) through the Gemini API directly: **Gemini 3.8 Flash**, with a "Think harder" switch (thinking level low → high). OpenRouter was considered; direct is cheaper (no fee), keeps the extra party out, and fully supports Gemini's thinking and tool calling. Roughly 1–3 US cents per chat message.

**Built: the trip assistant** (Assistant tab). The user chats; Gemini answers and changes the trip with 19 tools (read: trip, cities, city details with optional full sections, compare many cities, route between any two cities, what the user shared from the screen, options; change: settings, regions, country modes, re-plan, add/remove/move stop, nights, lock, optimise route, re-fit nights). The tools run in the browser on the same store actions as the app's buttons, so manual and AI edits stay in sync. Changes apply right away; each reply that changed the trip lists the changes with **Undo**. The trip as it was when the user asked is sent with every step of a reply, so relative requests ("2 more days") count from that state. So is a short overview of what the user is looking at (open city and tab, open journey, map view), shown as **Context** chips the user can switch off; `get_shared_view` returns the values on screen, for shared items only. The user's currency, °C/°F and language are passed along too.

| Use | How |
|---|---|
| **Natural-language setup** | "5 months, Balkans to Russia, love hiking and food, ~€40/day" → structured trip input |
| **Copilot edits** | Tool use: `add_city`, `remove_city`, `set_days`, `lock_stop`, `set_pace`, `reoptimize`, `get_city_info`, `get_connections`. The engine stays the source of truth |
| **Explanations** | "Why so few days in X?" answered from engine scores and Schengen math |
| **Grounded Q&A** | Answers only from our data + advisory text, with citations and dates. If we have no data, it says so |
| **Data building (offline, run by me)** | Extract connections, costs and tips from Wikivoyage text into the data files; I review the diff before committing |

The API key lives in the site's Cloudflare Worker (`/api/chat`, a secret), never in the browser. The Worker adds the instructions and tools itself (so the endpoint only works as the trip assistant), checks every request (roles, part types, size, length) and allows same-site calls only.

**Sign-in and limits.** The assistant needs **Sign in with Google** (the rest of the app doesn't). The Worker verifies Google's ID token, then keeps the user signed in with its own signed, HttpOnly session cookie (30 days). Each Google account may cost at most **$1 a day** (UTC). The Worker prices every call (retries too) from Gemini's token counts and the paid-tier prices of that day (`PRICES` and `costOf()` in `worker/limits.ts`: gemini-3.8-flash input $0.75, cached input $0.075, output and thinking $3.75 per million in 2026, double from 2027). A quick question costs about a cent, a 40-step Plan with AI run up to ~$0.75 in 2026 (~$1.50 from 2027, so it may stop at the cap, keeping the changes made so far; Gemini's automatic caching makes most runs cheaper). A new message needs $0.20 left; its tool rounds may use the rest, and no call goes out unless its request (judged by size) fits in what's left. The Assistant tab and the account menu show the percent left for new messages. **Per-account limits:** admins (emails in the `ADMIN_EMAILS` Worker secret) edit a list of emails with their own daily limit ($0–50; $0 turns the assistant off) under *Assistant limits…* in the account menu (`/api/admin/limits`). The list lives in a `_settings` instance of the Account Durable Object, so edits apply from the next message without a deploy. For this the session cookie now carries the email, when Google says it's verified; it's never stored, and accounts signed in before need to sign in again for their limit to apply. Users see a different allowance as a multiple, never in dollars: "5× the usual allowance" next to the percent left (Assistant tab, account menu), a one-time notice in the Assistant tab when it's raised (remembered per account in the browser), and "The assistant is turned off for this account" at $0. A message takes up to 12 model calls, or 40 for Plan with AI and Think harder, and there's a 20-calls-a-minute burst limit. Counts live in the account's Durable Object (with its saved trips), keyed by Google's account ID; no one's email is stored except the ones an admin lists. A daily request quota on the Google Cloud project is the hard spending cap.

---

## 8. Tech stack (lowest budget)

| Layer | Choice | Why | Cost |
|---|---|---|---|
| App | **Vite + React + TypeScript** single-page app, Tailwind, Zustand | No SSR needed; simplest setup | $0 |
| Map | **MapLibre GL JS** + **OpenFreeMap** tiles (no key); Protomaps as fallback | Free, no lock-in | $0 |
| Charts | Small custom SVG components (no chart library) | Only one chart type needed so far | $0 |
| Data | JSON/CSV files in the repo, bundled at build time | No database to run | $0 |
| Scripts | TypeScript (run with `tsx`) for fetching/building data | One language for everything | $0 |
| Hosting | **Cloudflare Worker** (`wrangler.jsonc`): static files plus `/api/chat` for the trip assistant; published by GitHub Actions on each push and after the weekly data refresh | Free tier, unlimited static requests | $0 |
| Data storage | **Cloudflare R2** private bucket for `data/` (seed + generated), not git; dated copies of seed data. The site build pulls it first | Free up to 10 GB, no download fees | $0 |
| Scheduled refresh | GitHub Actions cron: fetch advisories + FX → commit → auto-deploy | Free | $0 |
| AI | Google Gemini API, Gemini 3.8 Flash (paid tier) | Tool calling, thinking levels, cheap | ~1–3 ¢ per message |
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
  gen/            generated JSON imported by the app
                  (data/ is not in git: synced with a private Cloudflare R2 bucket, dated copies of seed/)
scripts/          data pipeline (build-*, fetch-*)
worker/           the site's Worker: static files, Google sign-in, per-user data (saved trips, limits), /api/chat (Gemini)
src/agent/        trip assistant: instructions + tools (schema.ts), tool runner, chat loop
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
Cost       { cityId, tier, dormBed, privateRoom, mealLocal, mealDinner, localTransportDay, coffee, beerBar,
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
Phrases          { languages: { [tag]: { name, note?, phrases: { hello, thanks, bye, howMuch, thisOne, dontUnderstand, cheers: { text, say, note? } } } },
                   countries: { [iso2]: { languages[], note? } } }   // + city overrides
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

### Progress (9 Oct 2026)
- **Phase 0, done:** Vite + React + TS app; data pipeline in `scripts/` (GeoNames, Natural Earth, OSRM, Passport Index, Open-Meteo, FCDO + US State Dept, World Bank, FX). 22 countries, 69 cities, ~100 curated connections; costs and connections are seed estimates. Advisories use both FCDO and US levels: a country is excluded by default if either says "do not travel" (Russia, Ukraine, Belarus).
- **Phase 1, mostly done:** setup form → generated plan; map with route and layers (weather, cost, English, Schengen, safety); itinerary editing (± nights auto-locks + rebalances, lock, remove, drag to reorder, add from map, re-order); Schengen 90/180 counter enforced while planning; visa, advisory, border (Kosovo → Serbia), weather and pace checks; city and leg drawers; timeline; localStorage + JSON export/import.
- **Climate, done:** monthly averages for every city (Open-Meteo ERA5, 2016–2025). Weather now affects which cities are picked and when, plus heat/cold/wet checks. ERA5 tends to count slightly more wet days than weather stations, so the wet-month note says "days with ≥1 mm, often short showers".
- **Display currency, done:** currency picker in the header; every price (header total, legs, city costs, map cost layer) is converted; supermarket prices also show the local-currency amount.
- **English & language, done:** Language section in the city panel, an English map layer (later removed; route stops are coloured by the active layer), and a trip check naming stops where English is limited.
- **Local transport & taxis, done:** "Getting around" section in the city panel: public transport ease, kinds of transport, how to pay, walkability, taxi apps, start fare + per km, a 5 km ride estimate, scam tips, and rentals (bike share, e-scooters, bikes, cars, scooters/motorbikes) with apps, daily prices and what you need to rent. The data build fails if any city or country is missing.
- **Health, air & services, done:** "Health & water" section (tap water, monthly air pollution chart, vaccines, risks, healthcare + CDC link) and "Shops & services" section (OSM counts near the centre, nearest hospital, chains, Sunday/late-night). The OSM counts are still downloading (the shared Overpass server is slow), so the section shows "not loaded yet" for now. Air map layer by month; checks for undrinkable tap water and polluted months.
- **Money & payments, done:** city section with card acceptance (1–5), phone pay, cash needs, ATM tips, ATMs nearby, currency and rate; Cards map layer (later removed); checks for countries where foreign cards fail and for mostly-cash stops. The section jumps to the top in Russia.
- **Price level & Big Mac, done:** price level with a plain-language comparison (user picks the country) and a "how to read" explainer; costs estimated from the price level for countries without hand-entered prices; a warning when our hand-entered costs differ a lot from the level (currently Croatia ~36% higher, Albania ~21% lower); Big Mac reference price.
- **City panel tabs, done:** Overview (suggested days per pace + one line per topic, problems first) and tabs ordered by use: Transport, Weather, Money, Daily life, Safety, Entry. Red dots on tabs with a problem; the chosen tab stays when switching cities.
- **Weather colours, done:** temperature-style colours on the map layer, the timeline and the Overview: blue = cold, green = pleasant, orange/red = hot, grey = wet (same thresholds as the weather checks). On the map, rain is a ring around each stop (share of rainy days) and the legend shows the temperature ranges.
- **Routing, improved:** leg costs count ~2½ h airport time per flight and the fare, so routes stop zig-zagging by plane; the search adds swap moves, a seeded shake-and-reoptimize loop, and re-orders the route after cities are added or dropped.
- **East & Southeast Asia, done:** 7 countries, 43 cities, all curated data (§3.1b).
- **Schengen:** the 90/180 counter moved from the header to the Schengen map view's legend; the Route view and the itinerary colour stops one colour instead of Schengen blue/amber (the timeline still shows Schengen).
- **Austria, done:** Vienna, Salzburg, Hallstatt, Innsbruck and Graz with all curated data and 17 connections; the "Eastern Europe" region is now "Central & Eastern Europe" and includes Austria.
- **Country defaults:** countries added as part of a region start as optional (the planner picks the best ones, and every region gets at least one stop); a country added on its own starts as must visit.
- **Test case:** runs end to end (`npm test`, plus manually in the browser). All automated acceptance checks pass for TW, US and EU passports.
- **Known data issue:** air quality comes from Copernicus CAMS models, which cover the whole world (a more detailed European model inside Europe, a global model everywhere else). Model values can be far off in big cities: Moscow reads ~26 µg/m³ on the European model vs ~16 on the global one, and Tokyo ~28 on the global model, while city stations usually report much lower. Plan: use station measurements (e.g. OpenAQ) where available and fall back to the model elsewhere.
- **Data out of git:** `data/` (hand-curated seed and generated files) lives in a private Cloudflare R2 bucket, synced with `npm run data:pull` / `data:push`; each push that changes seed data keeps a dated copy of it. The refresh workflow now runs weekly (Mondays; by hand after a big advisory change) and pulls, refreshes, tests and pushes instead of committing. Earlier versions remain in the public git history.
- **Trip assistant, done:** chat with Gemini 3.8 Flash in the Assistant tab to ask about or change the trip (see §7); changes apply right away with Undo. Needs Google sign-in; a daily allowance per account (first 20 messages, now at most $1 of Gemini use).
- **Assistant context & data, done:** Context chips (what's on screen, each can be left out), `get_shared_view`, full city sections, `compare_cities`, `get_route`; answers in the user's units and language.
- **Saved trips, done:** signed-in users' trips (and each trip's chat) are saved to their account automatically; trip menu at the top left to switch, create, rename and delete; account menu at the top right with Sign out. Import/export removed.
- **Display & map, done:** dark theme (with a recoloured dark base map), °C/°F, view state in the URL, map views default to the trip's dates, a legend for the Route view (travel modes, timetable vs estimated), stops numbered by arrival day, click priority for stops over route lines, the map brings a picked city into view. Source/date lines under each section were removed from the panels (sources stay in the README).
- **Open sources for hand-made data, checked (Oct 2026):** CDC destination pages are now the source for vaccines and medicines (`fetch-health.ts`, weekly; our list is the fallback), with a malaria check. Wikidata (country details) and World Bank Findex (card use in shops, 16 of our 30 countries) are only good for cross-checking; Findex led to Kosovo and Cambodia moving to "mostly cash". No open source covers English level for our countries (Eurobarometer is EU-only, CLDR covers half and is dated, EF EPI is copyrighted), so it stays hand-made.
- **Temperature preferences, done:** instead of two fixed choices, a comfortable range for daily highs (0–26° to 20–40°) and for nightly lows (−10–16° to 14–28°), either end open, in the user's unit. The planner lowers a city's score for months outside them (days more than nights); Checks flags hot or cold days and warm or cold nights (the title says whether the temperature is the high or the low).
- **Weather lows, done:** hovering a city on the Weather view shows high / low; a High | Low switch in the legend colours and numbers the stops by the average low instead, kept in the address (`temp=low`). Highs, lows and "feels like" share one scale (`tempKind`: cold < 12, cool 12–18, pleasant 18–28, warm 28–32, hot 32°C+), since a temperature feels the same by day or night; nights used their own ranges at first.
- **Home city, done:** `prefs.homeCityId` and `returnHome`; `plan.home` holds the journey from home to the first stop and back (`homeLeg`: the app's own route if reasonable, else an estimated flight), shown at both ends of the itinerary, dashed on the map (not clickable, not in fit-to-route) and included in the cost. The assistant can set it. Taipei → Athens: ≈17 h, €463–926. Only cities the app knows can be home for now.
- **Plans in a trip, done:** `plans` (up to 8: id, name, setup, stops) and `activePlanId` in the trip store and in saved trips; the active plan's setup and stops stay at the top of the saved data, so the trip list and older code read them unchanged, and trips saved before open as "Plan A". Plan bar with + Plan (copy), rename/delete, and Compare. The assistant knows the plans and can add (copy), switch, rename and delete them; Undo restores the plans too. Next: compare_plans for the assistant (a what-if answered as a new plan), pin_dates, find_places.
- **Long assistant runs, done:** `reorder_stops` puts all stops in a new order in one call (`reverse: true` also reverses the regions and swaps start and end city). While the assistant works, older tool results drop their out-of-date trip summary (and older lookups over 2,000 characters are shortened), and the oldest turns are dropped to stay under the request limits (80 turns, 200 KB); before, a long chat or many changes in a row ended in "This conversation is too long".
- **Number of stops, done:** optional minimum and maximum on the Trip tab. The planner stops adding places at the maximum (the nights go to the chosen ones) and adds the next best places to reach the minimum (shorter stays); places that are required still come first. Checks notes a plan outside the range. Test trip: none 41 stops, at most 20 → 20 (3–16 nights each), at least 55 → 55 (1–7). Later the Trip tab set a number give or take some (− / +, up to ± 20; `stopsFlex`, and the fewest and most follow from it); the assistant's `update_settings` takes `stops` and `stops_flex`. The flexible days are set with − / + buttons too.
- **Plan with AI, done:** a second button next to Generate plan. The planner stays the source of plans (instant, free, rule-checked); the assistant then edits the result to the trip's free-text wishes (`TripInput.wishes`, e.g. fixed dates, places to avoid) and the preferences, without calling generate_plan, and reports which wishes it met and which it couldn't. It always uses the thinking model ("Think harder"), whatever the chat switch says, and may take up to 24 model calls, like a chat message with "Think harder" on (otherwise 8); when the per-minute limit is hit it waits and retries (15, 30, 45 s), but stops at the daily limits.
- **Assistant and preferences, done:** the assistant sees every preference with each message and can change any of them (`update_preferences`; travel style stays in `update_settings`); changes are listed under its reply with Undo, and a new travel style is listed once.
- **Trip goals and weather limits, done:** preferences the planner uses when generating. *More countries* plans shorter stays and takes the best city in each country first; *Top highlights* weighs popularity more, leaves out lesser-known places (popularity ≤ 3) and lets famous ones take longer stays; expensive places (daily cost > 1.3× the trip's median on its travel style) can get *shorter stays* (down to 60%) or be *skipped where optional*. Heat, cold and rain limits lower a city's score in months outside them and set the weather checks' thresholds. On the test trip: more countries 41 → 57 stops; skip expensive 8 → 1 expensive stops; shorter stays 20 → 16 nights in them.
- **Left panel tabs, done:** Trip (renamed from Setup: dates, regions, start/end city, Schengen days used) · Preferences (now also passport, pace and interests, which describe the traveller rather than the trip; new trips copy them) · Itinerary · Assistant.
- **Preferences tab, done (step 1):** a left-panel tab with a travel style preset (adds **Budget private** between Backpacker and Mid-range) and detailed preferences saved with the trip (`TripInput.prefs`); older trips get their style's preferences. Next: per-city prices for each room type, meal and activity, and daily costs built from the preferences (travellers splitting rooms, seasons), then cross-checked between models.
- **Scale colours, done:** every five-level scale (air, mobile, cost, nearby, the level bars) uses the same fixed colours, red → orange → yellow → light green → dark green (`LEVEL_COLORS`), instead of a blend whose top steps looked alike.
- **Shops and medical help, done:** counts near each centre from OpenStreetMap and Overture business listings, whichever is higher (OSM is richer in the Balkans and for ATMs, the listings in Central Europe and Asia), shown as a rough scale since neither is complete (none found, 1–4, 5+, 20+, 50+). A **Nearby** map view shows one kind at a time (supermarkets, pharmacies, clinics & doctors, ATMs; `kind=` in the address). Hospital distance isn't on the map: nearly every city has one within 2 km.
- **Mobile internet, done:** typical mobile download speed per city in five bands (slow <25, OK 25–50, good 50–100, fast 100–200, very fast 200+ Mbps), as a map view, an Overview line and a Daily life row; the app doesn't name the source (it's in the README).
- **Russia, more cities:** from 5 to 20, the places most travellers visit: Sergiev Posad, Vladimir, Suzdal, Yaroslavl, Nizhny Novgorod, Samara, Volgograd, Kaliningrad, Petrozavodsk (Kizhi), Murmansk, Sochi, Yekaterinburg, Novosibirsk, Irkutsk (Lake Baikal) and Vladivostok, with local transport and 37 connections (Lastochka and overnight trains, the Trans-Siberian, and domestic flights for the long hops; Kaliningrad by air only, since the land routes cross the EU).
- **Assistant step budget:** Plan with AI once spent all its calls on 22 one-at-a-time lookups and changed nothing. Now `get_route` takes many `pairs` and `get_city_info` many `cities` per call, tool results carry `steps_left` (with a wrap-up note from 3 left), the last call goes out with tools off (`final`, function calling `NONE`) so the reply always says what was done and what's left, and a message may take 12 model calls, or 40 for Plan with AI and Think harder. Gemini sometimes returns a broken reply (`MALFORMED_RESPONSE`, or no content); the Worker asks again up to 3 times (`isBrokenReply`).
- **Route numbers:** a **Day | Nights** switch in the Route legend (like the Weather view's High | Low) numbers the stops by the trip day you arrive or by the nights there (`routeBy`, kept in the address as `show=nights`); circles are sized by nights either way.
- **Timeline follows the map:** stop bars take the stop's colour in the current map view and the map's hover text (`cityMetrics()` in `src/map/cityMetric.ts`, shared by both); the Schengen colours, weather strip and legend are gone (the map's legend explains the colours). Hovering a bar shows the same box as hovering the stop on the map, without the city name (it's on the bar), at once (`HoverTip`, not the browser's delayed `title`): the name in bold, then the view's value in a few characters, one per line, the first normal and the rest smaller and grey ("15–24°C" / "5 rain days", "OK" / "14 µg/m³", "~NT$2,439/day", "50+ pharmacies"; in the Route view "Day 12 · 4 nights"); `stopTip`/`cityTip` content, laid out by `TipBody` in the app and `tipElement` in the map's popup.
- **Timeline scrolls:** at least 12 px per day, so a long trip scrolls sideways (months, stops and weather together; a thin scrollbar, and the mouse wheel scrolls it too via `useSideScroll`, shared with the city panel's tabs) instead of squeezing dozens of stops into slivers; selecting a city scrolls it into view.
- **Collapsible left panel:** « folds it to a 40px strip with » and an icon per tab (lucide-react: Map, SlidersHorizontal, ListOrdered, Sparkles; the current tab highlighted, labels at once beside each button via `HoverTip` side="right") to open it again, on that tab, and, with more than one plan, a round button per plan (`planMark`: "B" for "Plan B", else the start of the name; the open one highlighted) that switches plans without opening the panel (kept mounted, so nothing resets; remembered in localStorage). Below `BOTH_PANELS_MIN_WIDTH` (left panel + city panel + ~400px of map) only one side panel shows at a time: a city or journey panel folds the left one (it returns when that closes), and opening the left one closes the city or journey panel (`useSidebar` in `App.tsx`; widths in `src/ui/layout.ts`).
- **Map controls and the side panel:** with a city or journey panel open, the map's view tabs, month picker and legend stop at the panel's edge (`DRAWER_WIDTH`) and wrap instead of being hidden under it.
- **Weather month and chart:** the city panel (Overview, Weather tab, air) follows a month picked on the map's Weather or Air view, for stops too (before, stops always showed their stay); "Trip dates" goes back to the stay. The chart legend says "Map month", "Your stay" or "Trip month". The climate chart's temperature axis fits each city's year (`tempScale`: a gridline every 5°C / 10°F, labels on every other one when there are many, below zero too); ranges below zero read "-24 to -15°C". A Sunshine chart (hours a day by month, deeper yellow for sunnier months; ERA5 sunshine duration) sits under the weather chart. The weather, sunshine and air charts are drawn with Recharts (hovering or tapping a month shades its column and puts its details in the line under the chart, instead of a box over it; month names as Jan–Dec; Recharts' own legend (its icons and colours) for the series, plus items for the highlighted months and the WHO line; clicking High, Low or Rain days in the weather legend hides or shows it; resize with the panel; no focus box on click), loaded only when a Weather tab is first opened (~110 KB gzipped, kept out of the main bundle).
- **How the weather feels:** "feels like" temperatures (Open-Meteo apparent temperature: heat with humidity, cold with wind; monthly averages of the daily max and min, `feelsHigh`/`feelsLow`, fetched separately into `.cache/climate/<id>.feels.json`), one app-wide **Feels like | Real** setting (`tempFeels`, saved with the display settings, "Feels like" by default; `shownTemps()`), with the same toggle (`FeelsToggle`) in the map's Weather legend and the city panel's Weather heading, always in sync: it drives the map colours/numbers, timeline colours, Overview line, month line ("July: feels like 32–40°C, 21 rain days, 82% humidity") and chart lines; the assistant gets both values and which one the user sees; planning and the preference limits stay on measured temperatures.
- **Reply buttons, done:** when the assistant asks the user to choose or confirm, it ends with a `Choices: [..] [..]` line (2–4 short replies, as the user would say them); the app shows them as buttons under the latest reply and sends the clicked one with the same Think harder setting. The app adds **Continue** when a run ran out of steps and **Try again** on a failed reply (replaces the failed attempt instead of repeating the message).
- **Map legends, done:** every coloured view shows all five of its bands with real values (PM2.5 µg/m³, daily cost in the display currency for the chosen budget), from one set of scales shared by the map and the legend (`src/map/scales.ts`). The Cards, English and Safety map views were removed as not useful enough for the space they took (the city panels and checks still cover all three). Stops show the arrival day and are sized by nights only in the Route view (legend: "Bigger = longer stay"); map labels show just the city name, on whichever side of the stop is free (away from its route lines first; names never cover a stop, and are left out where there's no room); Weather shows the average high and Air the PM2.5 instead, the other views leave the circle plain.
- **Seed data review, done:** `/data.html` in development (`npm run dev`; not part of the build, so never deployed) shows each hand-curated seed file as a table (TanStack Table v8): sort, search, a filter per column (dropdowns for short lists and yes/no, `>5` / `2..5` / `empty` for numbers), CSV line numbers, and red cells for unknown cities or countries, repeated rows, values out of order and empty required fields, plus a list of countries or cities with no row. All seed files pass today. The CSV parser moved to `src/data/csv.ts` (shared with `scripts/`), and `.gitignore` now ignores only the top-level `data/` (it also hid `src/data/`).
- **Costs in local money, new supermarket list:** `costs.csv` now holds each country's prices in the money they're quoted in (`currency` column: the country's own, US dollars in Cambodia), converted to EUR in the app at the current rates (`costsInEur`), so they no longer drift when a currency moves; beds, meals and transport were converted from the old EUR values. The supermarket list is now what travellers buy: water 1.5 L, Coca-Cola 0.5 L, beer 0.5 L, bread, eggs (10), milk 1 L, pasta 500 g, bananas 1 kg, tomatoes 1 kg, chicken breast 500 g (rice and 12 eggs dropped, chicken per 500 g), re-estimated in local money. The day of cooking is a loaf of bread, 6 eggs, ½ L milk, 250 g pasta, 2 bananas, ~330 g chicken and tomatoes and 1.5 L water (about €1–3 more than before in Europe). Still estimates: no open source has these prices for all our countries (Numbeo's terms forbid reuse; Open Prices has almost nothing here; World Bank ICP has food-group price levels only). The review page's Costs table adds the day of groceries (in the row's currency) and the comparison with the price level, and a **Prices: As entered | All in USD** switch shows every money column (costs, routes, taxis, rentals) in the app's display currency. The display currency now defaults to US dollars for new visitors (a saved choice is kept). Review tables also pin columns (TanStack column pinning; defaults: line number plus the row's key, e.g. country, city id and name, route from/to; remembered per table) and select rows by clicking (**Only these** shows just the selected ones).
- **Cost view kinds:** the Cost map view picks one kind of cost with buttons under the view tabs (like Nearby): Per day (the budget's daily cost, as before), Dorm bed, Private room, Cheap meal, Groceries (a day of cooking) and Transport (a day); `costOf()` in `planner/cost.ts`, bands per kind (`costScale(kind, …)`, about a fifth of the cities each; small amounts keep their cents), hover and timeline text per kind ("~€6.60/meal"), `kind=` in the address, and the assistant sees which kind is shown. Beds and meals follow each city's cost factor; groceries and transport are national.
- **Meals defined, café coffee and bar beer:** "Cheap meal" and "Mid-range dinner" became **Local meal** (`mealLocal`: one main dish with water or a soft drink at a simple place where locals eat, not a fast-food chain) and **Restaurant dinner** (`mealDinner`: a main course and a drink at a sit-down restaurant locals pick for a nice evening out), both all-in (tax, service charge and the usual tip), re-estimated for every country. New prices in `costs.csv`: `coffee` (a café cappuccino) and `beerBar` (0.5 L of local beer in an ordinary bar), seed estimates like the meals. An ⓘ by a price explains what it counts (a tooltip like the map's), in the city panel and on the review page. A spot check against real menus in Taipei found the restaurant dinner ~40% high (NT$620 vs ~NT$450 at Din Tai Fung); the estimates still need checking.
- **Daily costs from your choices:** the five fixed formulas per travel style (with flat extras of €3–30) are gone; a day is the sum of what you pick: bed (dorm or private room, halved for two travellers), breakfast (DIY, local meal or skip), lunch and dinner (DIY, local meal, restaurant or skip), café coffees and bar beers (0–2 a day), a day of public transport (always counted) and taxi rides of ~5 km (0–3). A DIY meal is supermarket food: breakfast 2 slices of bread, an egg and a banana (~400 kcal); lunch and dinner each 125 g pasta, 150 g chicken breast and 200 g tomatoes (~650 kcal). The day of groceries is these three plus 1.5 L of water (it was a loaf of bread, 6 eggs, ½ L milk, pasta, 2 bananas, chicken, tomatoes and water). Preferences' **A day in a city** sets the choices for every city (bed, meals, coffees and beers; no taxis); the city panel's **Daily cost** changes them for one city, item by item, with a reset per item and **Reset all to preferences**, saved with the trip (`TripInput.cityCosts`, only what differs) and counted in the plan's total. Preferences has no travel style section any more: travel styles are presets the assistant can apply; room types without prices (hotels, apartments, hotel level) were removed until there are prices for them. Next: hotel and apartment prices (and breakfast "with the room"), letting the assistant change a city's choices.
- **Money sub-tabs:** the city panel's Money tab has three sub-tabs, **Daily cost**, **Prices** (Stay, Food & drink, supermarket, price level, Big Mac) and **Paying & cash**, in the panel's sticky header; the open one is kept per tab, in the address (`part=`), and Overview links open the right one (a cash-only country marks Paying & cash).
- **Phrases tab:** each city has a **Phrases** tab with seven everyday phrases, just enough for a few days: Hello, Thank you, Bye, How much?, This one, I don't understand, Cheers! Each is in the local script, with how to say it (English-style spelling with the stressed part in capitals; pinyin for Mandarin, romaji for Japanese) and a note where needed (Thai's polite khrap/kha). `data/seed/phrases.json` has 28 languages; each country lists its languages, main one first (Singapore none, with a note that English is the common language), and a city can have its own (`cities`, for later: Barcelona, Montreal). Where there is more than one (Kosovo, North Macedonia, Moldova, Belarus, Malaysia), a switch picks the language. The phrases were written for the app (AI-drafted) and not yet checked by native speakers: compare with the Wikivoyage phrasebooks, Khmer and Macedonian first. The seed build checks every country has an entry and every language every phrase; the review page shows countries and languages; the assistant sees a city's phrases (`get_city_info` daily section, and the shared view on the Phrases tab).
- **City panel tabs as icons:** nine tabs no longer fit, so each is an icon (lucide-react: LayoutGrid, TramFront, CloudSun, CircleDollarSign, Coffee, Languages, HeartPulse, ShieldCheck, Stamp); the open tab also shows its name and the others name themselves on hover (`HoverTip`, like the folded left panel). The Money tab is now **Costs** (`tab=costs` in the address; old `tab=money` links open the Overview).
- **Sections as cards:** sections in the city and journey panels were hard to tell apart (small grey headings, faint dividers, the same spacing inside and between them). Each is now a card (`Section`, in `Sections`) on the drawer's darker background (`canvas`), with a 13px bold heading; the Overview is two cards (about the city, At a glance).
- **More kinds on the Cost view:** **Restaurant** (dinner), **Café** (coffee) and **Bar** (0.5 L of beer), from the same prices as the city panel and following each city's cost factor; **Taxi** (a ~5 km ride, as in the daily cost); **Car rental** and **Scooter rental** (a day, the middle of the country's range), coloured only where the city's transport lists that rental (110 and 37 of 132 cities), the rest grey with "No car rental here". Taxis and rentals are national, like groceries and transport.
- **Cost view groups:** the twelve kinds no longer fit in one row, so the Cost view picks a group (**Per day**, **Stay**, **Food & drink**, **Getting around**: `COST_GROUPS` in `map/scales.ts`) and then the kind in it on a second row, styled like the city panel's sub-tabs; each group remembers its last kind.
- **Trip total in the Itinerary:** the estimated cost moved from the top bar (which keeps dates, nights and stops) to the top of the Itinerary tab, "Estimated cost" with an ⓘ on what it counts (each stop's daily cost for its nights, plus travel between cities and from home) and ~per day.
- **Map credits folded:** the map's credits (OpenFreeMap, OpenMapTiles, OpenStreetMap) start folded into their ⓘ button, which shows them; they can't be removed (the licences ask for them with the map). MapLibre opens them when its sources first say what to credit, some time after loading, so a MutationObserver folds them the moment it does.
- **Month picker in one row:** the Weather and Air views' months (Trip dates, Jan–Dec) are one row that scrolls sideways when it doesn't fit (the mouse wheel too, edges fading where more is hidden), instead of wrapping; the picked month scrolls into view.
- **Phone layout:** under 768px wide (`PHONE_QUERY`, Tailwind's `md`; `usePhone`) the map fills the screen and the panels become bottom sheets, like Google Maps' place card (`ui/BottomSheet.tsx`). A city or journey panel opens at half the map, with the city moved into the half above; drag its header or the grip to just the header (name, stop, tabs), half or all of the map (a flick carries on; tap the grip to step up), and below the header to close it; choosing a tab while only the header shows opens it to half. The left panel is a sheet too (half open on a new trip, else just its tabs), out of the way while a city's is open; its tab bar is the header, as icons (as on the folded strip) with the open tab's name, each tab as wide as its content plus an equal share of the room so the edges match. The map's legend stays at the top in one row that scrolls sideways; its controls move to the bottom, riding above the sheet (`--sheet-height`, set by `BottomSheet`), as one row of dropdowns (`Pick` in `MapControls.tsx`: the view; its month, places or cost, the cost kinds under their groups as `optgroup`s; Feels like/Real and High/Low on Weather; Day/Nights on Route) instead of rows of buttons and switches, with the ⓘ credits beside them. The timeline, the left panel's fold strip and the map's zoom buttons (pinch instead) are hidden. The page is `100dvh` with no pull-to-refresh. Wider windows are unchanged.
- **Phone settings panel:** on a phone the top bar is hidden, so the map reaches the top of the screen; a gear at the map's top right opens `SettingsPanel`, sliding in from the right over a dimmed map, with the top bar's contents as cards (Trip: the trip switcher and the dates; Display: currency, °C/°F, theme as Light/Dark/Device; Account: the Google sign-in button, or the account shown as it is rather than behind its avatar's menu). The account's layout, the same in the top bar's account menu (`AccountDetails`): picture and name, today's assistant use as a bar (amber at 15% or less), then Assistant limits (admins) and Sign out (red) as full-width rows.
- **Ask AI from a city:** a city or journey panel's header has **Ask AI** (`AskButton`), which opens the Assistant; it already sees the open panel and tab as a chip (`agent/view.ts`), so it only has to be within reach. Beside a wider window's panel the left panel opens on the Assistant, even below `BOTH_PANELS_MIN_WIDTH` (`showBeside`: both stay open until the city panel closes). On a phone the left panel's sheet comes up over the city's at full height on the Assistant; closing it (drag down) goes back to the city where it was, and the left sheet to its old height (sheets coming up over each other hand back `--sheet-height`). The message box is focused once it's in view. Chosen over a floating button at the bottom right, which would cover the panel's last lines, crowd the map's controls and credits on a phone, and not say what it's about.
- **Legends without the view's name:** a legend no longer starts with what it measures ("Restaurant dinner", "PM2.5 µg/m³", "Mobile Mbps", "Within 1.5 km", "High"): the view's button or dropdown already says it. What the numbers are (and their unit) is the legend's hover text instead (`COST_ABOUT` and `about` in `MapControls.tsx`).
- **Left panel tabs as icons:** the left panel's tabs (Trip, Preferences, Itinerary, Assistant) are icons on every screen, not only in a phone's sheet: the same icons as the folded strip, the open tab with its name and the others named on hover, like the city panel's tabs.
- **Map switch rows scroll sideways:** like the month picker, the rows of buttons over the map (the views; the Nearby places; the cost groups and each group's kinds) are one line that scrolls sideways when it doesn't fit (beside a city panel, or a narrow window) instead of wrapping. One `SwitchRow` in `MapControls.tsx` holds them all, months included, and keeps the pressed button in sight when it changes, a link opens it, or a panel narrows the room.
- **Flexible dates:** each of the trip's dates can be exact or flexible by ± 1–14 days (`flex` in the trip input: the dates asked for and the days either way). Generating plans for the dates asked for, then moves the end (and if that's not enough, the start) within them so the trip is as long as its stops' suggested stays add up to, rather than stretching or squeezing them, and plans again for those dates: two runs, since each takes a few hundred ms and trying every pair of dates would take seconds. The plan's dates become the trip's (`startDate`/`endDate`, `Plan.dates`); the Trip tab keeps the dates asked for in its inputs and shows the planned ones under its title, with the nights and stops. Not used for better weather: a few days hardly change the month.
- **The whole world to pick from:** every country (232, Natural Earth's outlines with names and population, `ds.world`) in 29 travellers' regions (`data/regions.ts`: based on the UN subregions, the broad ones split, e.g. Southern Europe into Iberia, Italy & Malta and the Balkans; a test checks each country is in exactly one). Countries without cities in the app yet can be added; the plan leaves them out and Checks lists them (`coverage`). Replaces the seven region presets; the assistant's tools take any region or country.
- **Picking places on the map:** the Trip tab adds regions or single countries (chosen first, then any number) from a searchable list or by clicking the map, which while the tab is open shows the trip's countries (must visit strong, optional faint, excluded grey) instead of its route and stops, every country's outline while adding, and what a click would do on hover. A country can be added as must visit or optional (an optional one on its own is the planner's choice; only regions are always visited). Pointing at a card or country in the list shades it blue on the map and brings it into view (`map/shapes.ts`: the middle of a country's main land, or of a region weighted by population; a huge one shown in part around its cities; zoom 3–6). Regions are in no particular order unless **In this order** is ticked; a click on a country goes optional → must → excluded.
- **Base map labels:** OpenFreeMap's tiles of October 2026 give Türkiye the English name "T"; the base map's labels now fall back to the international name (then the local one) when the English one is a single letter (`map/baseLabels.ts`, applied when the style loads). The same place adds **Local names on the map** (theme menu; Settings on a phone; saved with the display settings): off, a label drops the local-script line OpenFreeMap's styles add under non-Latin names, changed in place without reloading the map.
- **Trip tab, simpler:** the flexible days and the number of stops are set with − / + (a number, give or take some stops: `stopsFlex`, the fewest and most following from it); the planned dates, nights and stops sit under the tab's title instead of lines under the dates; the explanations under Where and the dates (now in the chips' hover text), Load test case, and start / end city are gone from the form (the planner and the assistant still take a start or end city).
- **Trip and preferences in one tab:** the Preferences tab is gone; its topics are folded cards under the Trip tab's own (each says in a line what's set), the trip's parts are cards too, and Generate plan / Plan with AI are pinned to the panel's bottom. Old links and saved state with `panel=prefs` open the Trip tab. Preference cards open one at a time. The left panel's three tabs each show their name, the same width.
- **Region cards fold:** the Trip tab's region cards fold to their name and a line counting their must, optional and excluded countries, one open at a time. Pointing at a region or country (the trip's own, or in the add list) brings it into view zooming out to fit it but never in, so moving down a list stays calm.
- **Days per country, instead of "Longer" regions:** each country of the trip can have a fewest and a most days (the nights at its stops; empty for any), set in its region's card or by the assistant (`set_country_mode` with `min_days` / `max_days`). The planner picks no more cities in a country than fit its most (always one), adds cities in one visited for fewer days than its fewest, moves nights between unlocked stops after assigning them (`keepCountryDays`), keeps the Schengen fix-up and flexible dates within the ranges where it can (Schengen first), and Checks warns about a country outside its range. The region-wide "Longer" option is gone; the test case asks for 14–21 days in Poland.
- **Next:** verify the seed costs and connections; the offline part of Phase 3 (PWA) and a "today" screen.

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
