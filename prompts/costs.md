---
dataset: costs
version: 2
fills: data/seed/costs.csv (per country, in local money) and the cities' cost factors in data/seed/cities.csv
schema: costs.schema.json
---

# Prices by city

You are collecting today's prices for a travel-planning app. Today is {{date}}.

For each city below, find what a traveller **actually pays today** there, for each thing exactly as it's described
below (neither the cheapest nor the dearest of its kind). Search the web for every value, one by one: hostel and
booking sites, menus and food-delivery apps, supermarket websites and flyers, the city's transport operator, taxi
fares set by the city, rental companies, recent traveller reports. Prefer sources from the last 12 months.

**Don't take values from cost-of-living databases** (Numbeo, Expatistan, LivingCost and the like): their terms don't
allow their data to be reused. You may look at them to check that a number you found elsewhere is reasonable, but
never give one as a `source`.

{{cities}}

## What each value is

**In every city:**

| Key | What it is |
|---|---|
| `dormBed` | One bed in a dorm at an ordinary hostel rated 8 or more out of 10 on Hostelworld or Booking.com. Not a boutique hostel. |
| `privateRoom` | A budget private room: a double at a guesthouse, a 1–2★ hotel or a hostel's private room, rated 8 or more out of 10. |
| `hotelMid` | A double at a 3★ hotel rated 8 or more out of 10 on Booking.com. |
| `hotelUpscale` | A double at a 4★ hotel rated 8 or more out of 10 on Booking.com. |
| `apartment` | A whole 1-bedroom apartment rated 4.7 or more out of 5 on Airbnb (or 8 or more on Booking.com apartments or the country's own rental sites), for a 3-night stay, cleaning and service fees included. |
| `mealLocal` | One person's lunch or dinner at a simple place where locals eat every day (a street stall, food court, canteen, noodle or kebab shop), not a fast-food chain: one main dish, no drink. What you actually pay, including tax and any usual tip. |
| `mealDinner` | One person's dinner at a sit-down restaurant with table service, the kind locals choose for a nice evening out (not fast food, not fine dining, not a tourist trap): one main course, no drink. What you actually pay, including tax, any service charge and the usual tip. |
| `coffee` | A cappuccino, or the usual café coffee, at an ordinary café (sit-down or takeaway). |
| `beerBar` | Half a litre of local beer at an ordinary bar or pub, including any service charge or usual tip. |
| `localTransportDay` | A day of getting around the city by public transport: a 24-hour pass, or 3 single tickets where there's no such pass. 0 if it's free. |
| `taxiStart` | A licensed taxi's (or the main ride-hailing app's) starting fare: what the meter starts at, or the app's base fare. |
| `taxiPerKm` | The same taxi's price per kilometre, by day. |

<!-- shop and rentals -->
{{shopAndRentals}}

| Key | What it is |
|---|---|
| `carDay` | A day of renting a small economy car from a rental company in the city, basic insurance included. |
| `scooterDay` | A day of renting a scooter or small motorbike (125 cc or less) where tourists rent them; `null`, with a note, where that isn't usual. |
| `water15` | 1.5 L of still drinking water. |
| `coke05` | 0.5 L of Coca-Cola. |
| `beer05` | 0.5 L of the local beer. |
| `bread` | 500 g of ordinary white bread (a loaf, or sliced bread where that's what's usual). |
| `eggs10` | 10 eggs. |
| `milk1l` | 1 L of milk: fresh, or long-life (UHT) where that's what's usual. |
| `pasta500g` | 500 g of dry pasta. |
| `bananas1kg` | 1 kg of bananas. |
| `tomatoes1kg` | 1 kg of tomatoes. |
| `chicken500g` | 500 g of boneless, skinless chicken breast. |
<!-- /shop and rentals -->

## Rules

- **Rooms** (all five: `dormBed`, `privateRoom`, `hotelMid`, `hotelUpscale` and `apartment`) are the total for one
  night, taxes and fees included (a bed for a dorm, the room or apartment for the others), for a weeknight 4 to 8
  weeks after today, not a holiday or festival: the price a traveller booking now would see. Take a typical
  well-rated place, not the cheapest or the dearest.
<!-- shop and rentals -->
- **Shop items** (all ten: water, Coca-Cola, beer, bread, eggs, milk, pasta, bananas, tomatoes and chicken) are at
  an ordinary supermarket of the country's big chains (not a convenience store, market stall or premium shop), the
  supermarket's own or the cheapest common brand, not organic or premium. Where it's sold in another size (6 or 12
  eggs, a 330 ml can, a 400 g loaf, bananas by the piece), scale the price to the size above and say what you scaled
  from in `note`. The same for a beer in a bar served in another size.
<!-- /shop and rentals -->
- **Every value needs a source**: the web page that shows the price (`source`), not the site's home page, and the
  month it's from (`seen`, as `YYYY-MM`).
- **An estimate is allowed, but always marked, and only from this city's own prices**: an older price raised by
  inflation since, or a price for another size or quantity scaled. Add `"estimated": true` and a `basis` saying how
  (*"the 2024 menu price on the source, raised by inflation since"*), with `confidence` `low`, and the page it's
  based on as `source`. Never give an estimate as a value you found, and never take another city's or the country's
  price for this city: the app shows the capital's beside it.
- **Doesn't exist here:** where the city has no such thing (no metered taxis, no public transport, no hostels), give
  `"value": null` and `"none": true`, and say so in `note`, with the page that says so as `source` if there is one.
  Only when it really doesn't exist, not when you couldn't find a price.
- **Couldn't find it**, nor estimate it from this city's own prices: give `"value": null`, `"source": null`,
  `"seen": null` and say why in `note`.
- Amounts are numbers (no symbols, no thousands separators) in the currency named for the city. Where the source
  gives the price in another currency (US dollars in Cambodia, euros on a rental site), **don't convert it**: give
  the amount as the source shows it and that currency's code as the value's own `currency`.
- `confidence`, for the page the value is from: `high` for a price list, menu or booking page from the last 12
  months; `medium` for a recent traveller report or a price-comparison site; `low` for a page older than 12 months.
- Keep notes short (one sentence), in English.

## Answer

Reply with **only** one JSON object, no text before or after it, in this shape: one entry per city, under its `id`,
with every key above that's asked for it.

```json
{
  "cities": {
    "tirana": {
      "city": "Tirana",
      "currency": "ALL",
      "values": {
        "dormBed": { "value": 1300, "source": "https://www.hostelworld.com/…", "seen": "2026-10", "confidence": "high" },
        "coffee": { "value": 180, "source": "https://…", "seen": "2025-06", "confidence": "low", "estimated": true, "basis": "The 2025 menu price, raised by inflation since." },
        "apartment": { "value": 45, "currency": "EUR", "source": "https://…", "seen": "2026-10", "confidence": "medium" },
        "taxiStart": { "value": null, "none": true, "source": "https://…", "seen": "2026-10", "confidence": "medium", "note": "No metered taxis: drivers quote a fixed price per trip." },
        "beer05": { "value": null, "source": null, "seen": null, "confidence": "low", "note": "No supermarket list online." }
      }
    }
  }
}
```
