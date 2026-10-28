---
dataset: destinations
version: 3
fills: which cities each country has in the app (data/seed/cities.csv), with their days, tags and popularity (from `world`)
schema: destinations.schema.json
---

# The places worth staying in, by country

You are choosing, for a travel-planning app, the places in each country where travellers stay: the cities, towns,
islands and other bases a trip through the country is planned around. Today is {{date}}.

For each country below, list the places a traveller would stay at least a night in, best first: what an experienced
travel writer who knows the country well would put in a guide, judged from everything you know of it (guidebooks,
travel writing, where visitors go and what they say of it), not from any single website's ranking.

{{countries}}

## What to list

- **Places to stay**: a city, a town, an island, a beach town, a mountain village, or a base for a national park or
  a region (the town people stay in to see it). As many as someone spending a month or two in the country would
  choose from, best first, up to 25; a small country may have only one to three. Never pad the list.
- **Not a day trip.** A place most visitors see in a day from somewhere else on your list (Jiufen from Taipei,
  Ayutthaya from Bangkok for most) isn't a place to stay: leave it out. List it only if many visitors do stay there.
- Not a place that's only a transit stop, or a resort that's a hotel rather than a town.
- **Rank** them in the order a first-time visitor to the country with limited time would choose them, 1 first.
- **Score each against the whole world** (`world`, below), not against the rest of its country: the app plans
  trips through many countries, and uses it to choose between a place in one and a place in another.

## What each place has

| Key | What it is |
|---|---|
| `name` | Its usual name in English. |
| `local` | Its name in the local language and script (Kraków, Пермь, 台南), where that's different. |
| `rank` | 1 for the place to go first, then 2, 3… |
| `world` | How it compares with places to stay worldwide, 1 to 5 (below). |
| `kind` | One of: `city`, `town`, `island`, `beach` (a beach town or resort area), `mountains` (a mountain town or village), `nature` (a national park or nature area, with its `base`). |
| `days` | How many days visitors usually spend there: `min` (the least that's worth the journey), `ideal`, and `max` (as long as most would stay before moving on), whole days, or halves for a short stop (0.5). |
| `tags` | What it's good for, from: `city`, `culture`, `history`, `food`, `nightlife`, `nature`, `hiking`, `beach`. Two to four of them. |
| `wikipedia` | The title of its article on English Wikipedia (*"Hội An"*), or `null` if it has none. Don't guess a title: leave it `null` if you aren't sure the article exists. |
| `base` | Only for a place that's an area rather than a town (a bay, a national park, a mountain range, an island group, a region): the town or village most visitors stay in to see it, as `{ "name": …, "local": …, "wikipedia": … }` (*Hạ Long Bay*: *Hạ Long*; *Taman Negara*: *Kuala Tahan*). Leave it out for a city, a town, or a single island with its own town. |
| `why` | One sentence on what it is and why people go. |
| `sure` | How well established it is as a place to stay, from what's written about it: `high` (the major guidebooks cover it as a place to stay, and many travellers do), `medium` (known to travellers, but covered mostly by a few guides or blogs, or more as a stop than a stay), `low` (little written about it in English). |
| `note` | Only if needed: hard to reach, open only in some seasons, unsafe now, or anything you checked on the web. |

## How it compares worldwide

`world` is the same scale in every country. Most countries have no 5 and few 4s, and a small or little-visited
country's best place may be a 2: judge each place as a traveller choosing among the whole world would, not by how it
stands in its country.

| `world` | What it means | About how many in the world | For example |
|---|---|---|---|
| 5 | Known around the world: people plan a trip to that part of the world around it. | 100 | Kyoto, Paris, Rome, New York, Cusco, Cape Town, Siem Reap |
| 4 | Well known abroad: most travellers in that part of the world consider going. | 400 | Chiang Mai, Hội An, Dubrovnik, Oaxaca, Queenstown, Chefchaouen |
| 3 | Worth a detour for a traveller nearby. | 1,000 | Battambang, Ohrid, Salta, Nafplio, Kampot |
| 2 | Worth a stop on the way: visited mostly by people already travelling in the country. | most of the rest | Taichung, Ipoh, Niš, Podgorica |
| 1 | For a long stay in the country or a particular interest. | | Kratié, Sangkhlaburi |

## Rules

- **Don't make up a place**, and don't list one you aren't sure travellers go to: leave it out, or search the web
  to check it, and say so in `note`.
- **Check what may have changed.** Where travel to a place has changed in the last few years (new transport, closed
  borders, conflict, a disaster), search the web, and say what you found in `note`.
- Names and notes in English; keep `why` and `note` to one sentence.

## Answer

Reply with **only** one JSON object, no text before or after it, in this shape: one entry per country, under its
`code`.

```json
{
  "countries": {
    "VN": {
      "country": "Vietnam",
      "places": [
        { "name": "Hanoi", "local": "Hà Nội", "rank": 1, "world": 5, "kind": "city", "days": { "min": 2, "ideal": 3, "max": 5 }, "tags": ["city", "food", "history", "culture"], "wikipedia": "Hanoi", "why": "The capital: an old quarter of street food and shophouses, lakes and French colonial streets.", "sure": "high" },
        { "name": "Hội An", "rank": 2, "world": 4, "kind": "town", "days": { "min": 1, "ideal": 3, "max": 5 }, "tags": ["history", "culture", "food", "beach"], "wikipedia": "Hội An", "why": "Lantern-lit old trading port of yellow shophouses, with beaches nearby.", "sure": "high" },
        { "name": "Hạ Long Bay", "local": "Vịnh Hạ Long", "rank": 4, "world": 4, "kind": "nature", "days": { "min": 1, "ideal": 2, "max": 3 }, "tags": ["nature", "beach"], "wikipedia": "Hạ Long Bay", "base": { "name": "Hạ Long", "wikipedia": "Hạ Long" }, "why": "Thousands of limestone islands in an emerald bay, seen by boat from Hạ Long.", "sure": "high" }
      ]
    }
  }
}
```
