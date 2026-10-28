---
dataset: places
version: 1
fills: the places to see in each city (new), and later the days to spend there (daysMin, daysIdeal, daysMax in data/seed/cities.csv)
schema: places.schema.json
---

# The places to see in each city

You are listing what to see in cities for a travel-planning app, which works out from it how many days a city is
worth. Today is {{date}}.

For each city below, list the places a first-time visitor actually goes to, best first: what an experienced travel
writer who knows the city well would put in a guide, judged from everything you know of it (guidebooks, travel
writing, what visitors do and say), not from any single website's ranking. Then the day trips people take from it.

{{cities}}

## What to list

- **In the city:** up to 15 places, fewer where the city has fewer worth going to. A small town may have only two or
  three: never pad the list.
- **Day trips:** up to 5 places outside the city that visitors staying there go to and come back the same day.
- A place is somewhere a visitor goes: a sight, a museum, a temple, an old quarter or street, a market, a viewpoint,
  a park, a beach, a natural site, or an evening out (a night market, a show). Not a hotel, a restaurant, a shop, or
  a festival held only a few days a year.
- **Rank** them in the order a first-time visitor with limited time would choose them, 1 first, the city's places
  and its day trips each ranked on their own.

## What each place has

| Key | What it is |
|---|---|
| `name` | Its usual name in English. |
| `local` | Its name in the local language and script (九份, Старый Арбат), where that's different. |
| `rank` | 1 for the place to see first, then 2, 3… (the city's places and its day trips each from 1). |
| `tier` | `must` (most visitors go), `worth` (many do), or `extra` (if you have time or a particular interest). |
| `kind` | One of: `museum`, `palace` (palace or castle), `religious`, `monument`, `area` (an old quarter, street or square), `landmark` (a landmark or viewpoint), `market`, `park`, `nature`, `beach`, `theme park` (also a zoo or aquarium), `activity` (a tour, a class, a hike), `evening` (a night market, a show, a nightlife street). |
| `minutes` | How long a typical visit takes, not counting getting there. For a day trip, the time spent there. |
| `dayTrip` | `true` for a day trip, else `false`. |
| `km` | How far it is from the city centre, roughly, by road. |
| `getThere` | For a day trip only: how most visitors get there and how long it takes one way (*"train and bus, 1 h 30"*). |
| `wikipedia` | The title of its article on English Wikipedia (*"Jiufen"*), or `null` if it has none. Don't guess a title: leave it `null` if you aren't sure the article exists. |
| `why` | One sentence on what it is and why people go. |
| `sure` | How sure you are of the place as you've described it: `high` (you know it well), `medium`, or `low` (you've seen little about it). |
| `note` | Only if needed: closed for now or for renovation, open only in some seasons, or anything you checked on the web. |

## Rules

- **Don't make up a place.** If you aren't sure a place exists, or still exists, leave it out, or search the web to
  check it, and say so in `note`.
- **Check what may have changed.** For places that may have closed, moved or reopened in the last few years, search
  the web, and say what you found in `note`.
- A place visited as part of another (a hall in a palace, a temple in a quarter) isn't listed on its own.
- A day trip may be a city or town that has its own entry in the app (Ayutthaya from Bangkok): list it as a day trip
  all the same.
- Names and notes in English; keep `why` and `note` to one sentence.

## Answer

Reply with **only** one JSON object, no text before or after it, in this shape: one entry per city, under its `id`.

```json
{
  "cities": {
    "taipei": {
      "city": "Taipei",
      "places": [
        { "name": "Taipei 101", "local": "台北101", "rank": 1, "tier": "must", "kind": "landmark", "minutes": 90, "dayTrip": false, "km": 4, "wikipedia": "Taipei 101", "why": "The city's landmark tower, with an observatory on the 89th floor.", "sure": "high" },
        { "name": "Jiufen", "local": "九份", "rank": 1, "tier": "must", "kind": "area", "minutes": 240, "dayTrip": true, "km": 40, "getThere": "bus, 1 h 30", "wikipedia": "Jiufen", "why": "Hillside old mining town of teahouses and lantern-lit lanes above the sea.", "sure": "high" }
      ]
    }
  }
}
```
