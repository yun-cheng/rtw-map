# The app's data: where it comes from, and the prompts that fill it

Every dataset the app uses, how it's made and kept, and, for the data no open source has (prices, routes, phrases…),
the prompt an AI service runs to collect it with a source for each value. Runs are kept beside the data, never in
it: they're compared on the review page, and you choose which source the app uses.

## The datasets

**Open data**, made by scripts and rebuilt whenever they run (`npm run data:build`, `npm run data:refresh`; each
script's source and licence is in the README's "Data" table): cities and capitals (GeoNames, Wikidata), borders
(Natural Earth), roads (OSRM), visa rules (Passport Index), stays allowed (Wikipedia), weather and air (Open-Meteo),
mobile internet (Ookla), shops nearby (OpenStreetMap), travel advice (UK FCDO, US State Dept), health (CDC),
population and price levels (World Bank), exchange rates, Big Mac index, holidays (Google Calendar).

**Seed data** (`data/seed/`), which no open source has for every country:

| File | What | How it was made | Prompt |
|---|---|---|---|
| `costs.csv` | Beds (a dorm bed and a budget private room), meals, coffee, beer, a day of transport and 10 supermarket items, per country, in local money; a city's are these times its cost factor (`cities.csv`). The prompt asks each city for its own, also 3★ and 4★ hotels and a whole apartment (Airbnb), kept in the runs only until the app uses them, and the taxi fares and rentals `local-transport.json` has | Written in Claude Code sessions: the first 30 countries early in October 2026, the other 202 on 2026-10-13 | [costs.md](costs.md) |
| `cities.csv` | Each city's tags, popularity, days to spend, cost factor and description | Same | Which cities, their days, tags and popularity: [destinations.md](destinations.md); cost factor: [costs.md](costs.md), each city's own prices; days to spend: also [places.md](places.md), from the places to see |
| `connections.csv` | Routes between cities: mode, minutes, price, how often | Same | — |
| `countries.json` | Block, languages, religion, emergency numbers, English level, notes | Same | — |
| `health.json` | Tap water, health risks, healthcare | Same, from CDC and UK health advice pages | — |
| `local-transport.json` | Getting around a city, taxis, ride-hailing apps, rentals | Same, from Wikivoyage and operators' sites | Taxi fares and rentals: [costs.md](costs.md) |
| `payments.json` | Cards, contactless, cash, ATMs | Same | — |
| `shopping.json` | Supermarket chains, opening hours | Same | — |
| `phrases.json` | Seven everyday phrases per language, with how to say them | Same; not checked by native speakers | — |
| `notices.json` | Entry notices (EU entry systems) | Same, from the official pages they link to | — |
| (none yet) | The places to see in each city and its day trips, ranked, with how long each takes | A prototype (branch `places-prototype`, 5 cities) took them from Wikivoyage and ranked them by English Wikipedia page views, which put fame ahead of what visitors do (Jiufen far down for Taipei); not merged | [places.md](places.md) |

What's known of how the seed data was written: the 202 countries of 2026-10-13 were written by Claude in one session
from its own knowledge, region by region, with no web search and no source kept for any value (each file's
`_meta.source` says they're AI-drafted and not yet checked). The earlier rows were also written in Claude Code
sessions; which values were looked up then wasn't recorded either. So none of it has a source per value: the
prompts below collect values that do.

## The prompts

| Prompt | Asks, for each | |
|---|---|---|
| [destinations.md](destinations.md) | country: the places worth staying in (cities, towns, islands, bases for a park), ranked, each scored against the whole world (1 to 5), with their days and tags | from what the model knows |
| [places.md](places.md) | city: the places to see and the day trips, ranked, with how long each takes | from what the model knows |
| [costs.md](costs.md) | city: rooms, meals, drinks, transport, taxis; once per country the supermarket and rentals | each value searched on the web |

The destinations prompt isn't shown our cities, so it isn't swayed by them: the review page compares its list with
ours afterwards.

## Two kinds of prompt

**Costs** change every month and a model's remembered numbers are stale and easy to get wrong, so its prompt has
every value searched on the web, with the page it's from (or marked as an estimate). **Places** (and destinations)
change slowly, and a big model has read more about a city (guidebooks, travel writing, what visitors say) than any
one website ranks, so its prompt asks for what the model knows, as a travel writer would rank it, searching the web
only to check what may have closed or that a place it's unsure of exists. It says how sure it is of each place, and
gives its English Wikipedia article where there is one (`null` rather than a guess), which a script (not built yet)
can check and take the place's location from. Runs from two models (`--model`) show where they agree: a place both
rank highly is safe.

## Running a prompt each month

A prompt asks about cities, by their id in `cities.csv` (`costs` or `places` in the commands below), or countries,
by their code (`destinations`, with `--country VN` where the commands say `--city`): for costs, each city's rooms,
meals, coffee, beer, public transport and taxis, and once per country, in its capital, the supermarket and
rentals, which cost about the same across a country (only that city's prompt asks for them; an agent's list marks it
`shop_and_rentals`). For costs, it's told to search the web for every value and give each one's page, month and
confidence (where no page has a value it may estimate one, marked `estimated` with its `basis`, or give none). For
places, see above. The costs prompt describes each thing exactly and says nothing of who the traveller is: "budget"
or "backpacker" would pull every answer towards the cheapest. The list of cities is made from `cities.csv` each
time, so a city added later is simply in the next one.

### Versions and models

Each prompt has a `version` in its front matter. Raise it when a change alters what's asked (a new definition, a
new value): answers to the old version are kept apart from the new one's, with the prompt they answered. Wording
that doesn't change what's asked keeps the version. Each run is kept by the model that answered it
(`gemini-2.5-pro`, `gpt-5-codex`…), so several models can answer the same prompt and be compared.

### With an agent, on any computer: the prompts repo

An agent that splits the work itself (an IDE's agent running Gemini, Codex or another model) works in the prompts
repo, [yun-cheng/rtw-map-prompts](https://github.com/yun-cheng/rtw-map-prompts) (private, cloned beside this
project; another place with `RTW_PROMPTS_DIR`). It needs nothing of this project: each prompt is a folder there,
`<dataset>/v<version>/`, with `prompt.md`, its list (`cities.csv` or `countries.csv`) and the answers, in
`answers/<month>/<model>/<id>.json`, one per city or country; its README tells an agent how to work (pull first,
commit and push every few answers, touch only its own answers).

```bash
npx tsx scripts/prompts.ts render costs --agent   # the prompt and its list into the prompts repo; commit and push it
npx tsx scripts/prompts.ts check costs --agent    # after pulling it: check and keep every model's answers so far
```

On the other computer, pull the prompts repo and tell the agent: *Follow costs/v1/prompt.md.* (or name the folder:
*…, writing to answers/2026-11/gpt-5-codex*). It must be able to search the web: without that, it answers from
memory. Each month and model is kept as one run; `--month` and `--model` check just one. After adding cities,
`render costs --agent` again: the new cities are in the list, and the answers already there stay. The agent's prompt
has no date in it (it uses the day it runs), so one version serves every month.

### One at a time: Gemini CLI or a chat

One city (or country) a prompt, each with one answer (`{ "cities": { … } }`), kept under its id, so adding or
removing cities never mixes up the runs (`list costs` shows them, with ✓ by those a model has run this month):

```bash
npx tsx scripts/prompts.ts run costs --city tirana                    # Gemini CLI: searches, answers, kept
npx tsx scripts/prompts.ts run costs --all                            # every city not yet run this month
npx tsx scripts/prompts.ts render costs --city tirana | pbcopy        # for a chat: paste it in…
npx tsx scripts/prompts.ts check costs reply.json --city tirana --model gemini-app   # …and keep its reply
npx tsx scripts/prompts.ts render costs --all --out <folder>          # every city's prompt as a file (tirana.md…)
npx tsx scripts/prompts.ts check costs <folder> --model <name>        # and the answers beside them (tirana.json…)
```

Gemini CLI (signed in with your Google account, so runs count against your subscription, not an API bill) may only
search and fetch pages (`--allowed-tools google_web_search,web_fetch`); it's asked nothing else and changes no
files. It uses its own default model, and its runs are kept as `gemini-cli`, unless `--model` names one (then also
the run's name). Its full answer is kept too (`answers/<id>.txt`). `--month 2026-11` files a run under another
month. Then `npm run data:push` keeps the runs in R2 with the rest of the data.

## Where runs are kept

`data/runs/<dataset>/v<version>/<month>/<model>/<name>.json` (in R2, not git; `agent.json` for an agent's answers,
else the city's id): what was asked, the problems the check found (missing cities or prices, prices asked only of
the capital given for another, values that aren't numbers, sources that aren't web addresses, values with no
source that aren't marked estimated, ranks out of order…), and the answers. A run with problems is still kept, so
you can see what went wrong; run it again to replace it. An answer for a city no longer in the list is left out. The
review page labels each run *model month version* (`gemini-2.5-pro 2026-10 v1`).

## Comparing them

`npm run dev`, then `/data.html` → **Costs: all sources**: one row per city and price (the supermarket and rentals
once per country, in its capital), ours and each run's side by side, with each run's page, month, confidence
and note, how far it is from ours (more than a third off is marked), and each estimate marked with its basis. Ours
for a city is what the app works out: the country's price (`costs.csv`, or `local-transport.json` for taxis and
rentals), times the city's cost factor (`factor`) for rooms, meals, coffee and beer. So a city whose runs are all
off by the same share has a cost factor that's off. The prompt's meals are the dish alone, while ours include a
drink, so a run's meals come out lower than ours by about a drink; the app's definitions change only when the runs
become its data.

**Places: all sources** has one row per run, city and place, in rank order (the city's places, then its day
trips), with each place's tier, kind, visit time, Wikipedia article, why to go and how sure the run is (unsure is
marked); "also in" lists the other runs that name the same place.

**Destinations: all sources** sets each country's places to stay from every run against our cities, matched by
name (accents, case and punctuation aside): one row per run and place in rank order, then our cities that run
doesn't list. Its `status` column is `both`, `run only` (one to consider adding) or `ours only` (one to consider
dropping, or one whose name the run spells otherwise), the last two marked; our days, tags and popularity are beside
the run's. From v3 each place's `world` score (1 to 5, how it compares with places worldwide, which is what our
popularity means: the planner weighs it to choose between cities in different countries) replaces the tier within its
country, which couldn't be compared from one country to another; one 2 or more from our popularity is marked.

## Choosing the source

Not built yet: after looking at the runs, which source the app uses, for a whole dataset, a price, a country or a
city, is to be kept in `prompts/choices.json` (in git), and the build to take each value from the source chosen for
it. With prices per city, the app could then keep each city's own prices instead of the country's times a cost
factor.

## Writing a prompt

A prompt file is plain Markdown that any service can run: front matter (`dataset`, its `version`, what it `fills`, its `schema`), what to collect, what each value means (the app's own definitions, as in `COST_HINTS`), the
rules (a source for every value; an estimate only when marked) and the answer's shape. `{{date}}` and `{{cities}}`
are filled in (in an agent's prompt, `{{cities}}` points to `cities.csv`). The dataset's list of cities, what's asked
of each and the checks are in `scripts/prompts.ts`.
