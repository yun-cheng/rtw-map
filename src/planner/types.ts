// ---------- Data (generated into data/gen by scripts/) ----------

export type Meta = { source: string; updatedAt: string; confidence?: string }

export type Country = {
  iso2: string
  name: string
  block: string
  fcdoSlug: string
  schengen: boolean
  eu: boolean
  currency: string
  languages: string[]
  religion: string
  plugs: string[]
  voltage: number
  emergency: string
  notes: string[]
  /** How easy it is to get by in English: 1 = hard … 5 = easy almost everywhere (our estimate). */
  english: { level: number; otherLanguages: string[]; script: string }
}

export type City = {
  id: string
  name: string
  iso2: string
  lat: number
  lon: number
  population: number | null
  timezone: string | null
  tags: string[]
  popularity: number
  days: { min: number; ideal: number; max: number }
  costFactor: number
  longStay: boolean
  blurb: string
}

export type ClimateMonth = {
  month: number
  tHigh: number
  tLow: number
  /** "Feels like" (apparent temperature: heat with humidity, cold with wind), average daily max and min. */
  feelsHigh?: number
  feelsLow?: number
  rainMm: number
  rainDays: number
  sunHours: number
  humidity: number
  comfort: number
}

/** Shop prices: water 1.5 L, Coca-Cola 0.5 L, local beer 0.5 L, a loaf of bread, 10 eggs, milk 1 L, pasta 500 g, bananas 1 kg, tomatoes 1 kg, chicken breast 500 g. */
export type GroceryKey = 'water15' | 'coke05' | 'beer05' | 'bread' | 'eggs10' | 'milk1l' | 'pasta500g' | 'bananas1kg' | 'tomatoes1kg' | 'chicken500g'

/** A country's typical prices in EUR (the seed file has them in local money; see costsInEur). */
export type CostProfile = {
  dormBed: number
  privateRoom: number
  mealLocal: number
  mealDinner: number
  localTransportDay: number
  /** A cappuccino (or the usual café coffee) at an ordinary café. */
  coffee: number
  /** 0.5 L of local beer at an ordinary bar. */
  beerBar: number
  groceries: Record<GroceryKey, number>
}

/** The same prices in the money they're quoted in (`currency`), as in data/seed/costs.csv. */
export type LocalCostProfile = CostProfile & { currency: string }

export type Connection = {
  from: string
  to: string
  mode: string
  durationMin: number
  priceMin: number
  priceMax: number
  frequency: string
  overnight: boolean
  note?: string
}

export type Road = { a: string; b: string; driveMin: number; km: number }

export type VisaReq =
  | 'free_movement' | 'visa_free' | 'eta' | 'e_visa' | 'visa_on_arrival'
  | 'visa_required' | 'no_admission' | 'own_country' | 'unknown'

export type VisaRule = { req: VisaReq; days?: number; raw?: string }

export type Advisory = {
  issuer: string
  level: number
  alertStatus: string[]
  excludedByDefault: boolean
  summary: string
  warnings: string
  safety: { heading: string; text: string }[]
  url: string
  updatedAt: string
  us: { level: number; title: string; url: string; updatedAt: string } | null
}

export type TransitMode = 'metro' | 'tram' | 'trolleybus' | 'bus' | 'minibus' | 'train' | 'ferry' | 'funicular' | 'cablecar'

export type RentalKind = 'bikeShare' | 'eScooter' | 'bike' | 'car' | 'moto'

/** Getting around a city: 1 = little or no public transport … 5 = excellent network. */
export type CityTransport = {
  ease: number
  modes: TransitMode[]
  walkable: boolean
  pay?: string
  note?: string
  rentals: RentalKind[]
  rentalNote?: string
}

/** Taxis and rentals in a country: apps travellers use and typical prices in EUR. */
export type CountryTransport = {
  taxi: { apps: string[]; flagFall: number; perKm: number; tip: string }
  /** Shared bike/e-scooter apps; daily rental price ranges for a small car and a scooter/motorbike. */
  rentals: { apps: string[]; carDay: [number, number]; motoDay?: [number, number] }
}

export type TapWater = 'safe' | 'safe_bottled' | 'boil' | 'bottled'

export type CountryHealth = {
  tapWater: { level: TapWater; note: string }
  vaccines: string[]
  risks: string[]
  healthcare: string
  cdcSlug: string
}

/** A vaccine or medicine for a country, from CDC (scripts/fetch-health.ts): recommended for most travellers, or worth
 *  considering depending on the trip, with a short note on who it's for. */
export type VaccineAdvice = { name: string; advice: 'recommended' | 'consider'; note: string }

/** Mobile internet measured on phones in a city: average download and upload speed, latency and how many tests. */
export type MobileSpeed = { downMbps: number; upMbps: number; latencyMs: number; tests: number }

/** Monthly fine-particle pollution: average PM2.5 (µg/m³) and days per month above the WHO 24-hour guideline. */
export type AirMonth = { month: number; pm25: number; daysOverWho: number }

/** Services within ~1.5 km of the city centre (OpenStreetMap), and the nearest hospital. */
export type Amenities = {
  supermarket: number
  convenience: number
  pharmacy: number
  clinic: number
  atm: number
  nearestHospitalKm: number | null
}

export type Shopping = { chains: string[]; lateNight?: string; sunday?: string }

/** How far money goes in a country compared with the United States (= 1.00). */
export type PriceLevel = { level: number; year: number; source: string }

export type BigMac = { localPrice: number; currency: string }

/** The everyday phrases each city's Phrases tab shows, in this order. */
export type PhraseKey = 'hello' | 'thanks' | 'bye' | 'howMuch' | 'thisOne' | 'dontUnderstand' | 'cheers'
/** A phrase in the local script, how to say it, and a note if it needs one. */
export type Phrase = { text: string; say: string; note?: string }
/** A language's phrases, keyed by its language tag ("sr", "zh-TW"). */
export type PhraseLanguage = { name: string; note?: string; phrases: Record<PhraseKey, Phrase> }
/** Where each language is spoken: the first is the main one, the rest can be switched to. */
export type PhrasePlace = { languages: string[]; note?: string }
export type Phrases = {
  languages: Record<string, PhraseLanguage>
  /** A country's languages; none where English is the common language (Singapore), with a note saying so. */
  countries: Record<string, PhrasePlace>
  /** A city whose languages differ from its country's (Barcelona: Catalan and Spanish). */
  cities?: Record<string, PhrasePlace>
}

/** How you pay in a country: 1 = cash only … 5 = cards and phones everywhere. */
export type CountryPayments = {
  cardLevel: number
  foreignCardsWork: boolean
  mobilePay: 'common' | 'some' | 'none'
  cashFor: string
  atm: string
  note?: string
}

export type Notice = { id: string; appliesTo: string; title: string; text: string; url: string }

export type Dataset = {
  countries: Record<string, Country>
  /** Every country in the world by code: its name (Natural Earth), including the many with no cities in the app yet. */
  world: Record<string, string>
  cities: Record<string, City>
  climate: Record<string, ClimateMonth[]>
  costs: Record<string, CostProfile>
  connections: Connection[]
  roads: Road[]
  visa: { passports: { code: string; name: string }[]; rules: Record<string, Record<string, VisaRule>> }
  advisories: Record<string, Advisory>
  fx: { base: string; display: string[]; rates: Record<string, number> }
  notices: Notice[]
  population: Record<string, { value: number; year: number }>
  localTransport: { cities: Record<string, CityTransport>; countries: Record<string, CountryTransport> }
  health: { countries: Record<string, CountryHealth>; cities: Record<string, { tapWater?: CountryHealth['tapWater'] }> }
  cdc: Record<string, { url: string; items: VaccineAdvice[]; malaria: boolean }>
  mobile: Record<string, MobileSpeed>
  air: { whoDaily: number; byCity: Record<string, AirMonth[]> }
  amenities: { radiusKm: number; byCity: Record<string, Amenities> }
  /** Business listings near each city centre (scripts/build-places.ts), same radius as amenities. */
  businesses: Record<string, Omit<Amenities, 'nearestHospitalKm'> & { hospital?: number }>
  shopping: Record<string, Shopping>
  priceLevels: { compare: { iso2: string; name: string; currency: string }[]; levels: Record<string, PriceLevel> }
  bigMac: { date: string; euroArea: BigMac | null; prices: Record<string, BigMac> }
  payments: { tips: string[]; countries: Record<string, CountryPayments>; cities: Record<string, { cardLevel?: number; note?: string }> }
  phrases: Phrases
  meta: Record<string, Meta>
}

// ---------- Trip input ----------

export type Pace = 'chill' | 'balanced' | 'fast'
/** Travel style: a preset of the day's choices and travel preferences (the assistant can apply one). */
export type Budget = 'shoestring' | 'backpacker' | 'private' | 'midrange' | 'comfort'

/** Where cool, pleasant, warm and hot start, in °C, in rising order. */
export type TempBreaks = [number, number, number, number]

/**
 * How someone likes to travel (the preferences in the Trip tab). A travel style preset (input.budget) can fill in the style
 * fields; all are the traveller's to change. Amounts are in EUR, like all prices.
 */
export type TravelPrefs = {
  /** Where the traveller starts from (and returns to, with returnHome); not a stop of the trip. */
  homeCityId: string | null
  returnHome: boolean
  /** The bed the daily cost counts (hotels and apartments come with their prices). */
  room: 'dorm' | 'private'
  maxPerNight: number | null
  /** Each meal of a normal day: what the daily cost counts for it. */
  breakfast: BreakfastChoice
  lunch: MealChoice
  dinner: MealChoice
  /** Café coffees and bar beers a day. */
  coffees: 0 | 1 | 2
  beers: 0 | 1 | 2
  betweenCities: 'cheapest' | 'balanced' | 'fastest'
  overnight: boolean
  maxTravelHours: 3 | 5 | 8 | null
  /** What the planner favours: a balance, as many countries as fit, or the most popular places. */
  focus: 'balanced' | 'countries' | 'highlights'
  /** Expensive places (well above the trip's typical daily cost): no change, shorter stays, or skipped where optional. */
  expensive: 'ignore' | 'shorter' | 'skip'
  /** The traveller's temperature bands: where cool, pleasant, warm and hot start, in °C (below the first is cold). The
   *  map and each city's weather colour by them, and Checks flags cold and hot stays by them. */
  tempBreaks: TempBreaks
  /** The planner avoids months whose highs are cold, or hot, by the bands (Checks warns about cold and hot stays either way). */
  avoidCold: boolean
  avoidHot: boolean
  avoidRain: boolean
  dailyBudget: number | null
}
/**
 * One meal of the day: skipped, DIY from the supermarket (groceryMeal), at a simple local
 * place (mealLocal) or at a sit-down restaurant (mealDinner).
 */
export type MealChoice = 'skip' | 'diy' | 'local' | 'restaurant'
/** Breakfast leaves out the restaurant. */
export type BreakfastChoice = Exclude<MealChoice, 'restaurant'>

/**
 * What one traveller pays for on a day in a city. The preferences give every city the same choices; a trip can
 * change them for one city (TripInput.cityCosts).
 */
export type DayChoices = {
  bed: 'dorm' | 'private'
  breakfast: BreakfastChoice
  lunch: MealChoice
  dinner: MealChoice
  coffees: 0 | 1 | 2
  beers: 0 | 1 | 2
  /** Taxi rides of ~5 km a day, on top of the day of public transport (chosen per city; none by default). */
  taxis: 0 | 1 | 2 | 3
}

export type DateFlex = { start: string; end: string; startDays: number; endDays: number }

export type CountryMode = 'must' | 'optional' | 'excluded'

/** A country of the trip: must visit, optional or left out, and the days to spend there if it's visited (the nights at
 *  its stops; either end may be left open). */
export type TripCountry = { iso2: string; mode: CountryMode; minDays?: number | null; maxDays?: number | null }

/** A part of the trip, e.g. "Balkans" or "Poland": a region or a country added on its own (visited in the order
 *  they're listed only with `keepGroupOrder`). */
export type TripGroup = {
  id: string
  name: string
  countries: TripCountry[]
  /** The days to spend in the region, all its countries told (the nights at their stops; either end may be left open). */
  minDays?: number | null
  maxDays?: number | null
}

export type TripInput = {
  /** The trip's dates: as entered, or with `flex` the ones the plan was made for (within the flexible range). */
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD (departure day from the last stop)
  /** Flexible dates: the dates asked for and how many days earlier or later each may be. Generating a plan picks
   *  `startDate` and `endDate` within them so the trip fits its stops (see generatePlan). */
  flex?: DateFlex
  groups: TripGroup[]
  keepGroupOrder: boolean
  startCityId: string | null
  endCityId: string | null
  mustCities: string[]
  pace: Pace
  budget: Budget
  prefs: TravelPrefs
  interests: string[]
  /** How many stops the plan should have (each optional); the planner keeps within them where the trip allows. */
  minStops?: number | null
  maxStops?: number | null
  /** Free-text wishes for the assistant ("Plan with AI"), e.g. fixed dates or places to avoid. */
  wishes?: string
  passport: string
  schengenDaysBefore: number
  /** Changes to the daily cost choices for single cities of this trip (city id → the choices that differ). */
  cityCosts?: Record<string, Partial<DayChoices>>
  /** The setup the plan was last made or updated from (by Plan with AI, Update plan or another change by the
   *  assistant), to tell what changed since. */
  planned?: Omit<TripInput, 'planned' | 'plannedStops'>
  /** The stops as the assistant left them then, to tell the user's own edits since. */
  plannedStops?: Stop[]
}

// ---------- Plan output ----------

export type Stop = {
  cityId: string
  nights: number
  locked: boolean
  groupId: string
}

export type LegHop = {
  from: string
  to: string
  mode: string
  durationMin: number
  priceMin: number
  priceMax: number
  overnight: boolean
  estimated: boolean
  frequency?: string
  note?: string
}

export type Leg = {
  from: string
  to: string
  hops: LegHop[]
  durationMin: number
  priceMin: number
  priceMax: number
  overnight: boolean
  estimated: boolean
  reachable: boolean
}

export type ScheduledStop = Stop & { arrive: string; depart: string }

export type WarningKind =
  | 'schengen' | 'visa' | 'advisory' | 'weather' | 'pace' | 'dropped' | 'border' | 'unreachable' | 'time' | 'notice' | 'language' | 'health' | 'money' | 'coverage'
  /** Against the preferences: the daily budget, the most per night, expensive places; travel days too long or overnight. */
  | 'budget' | 'travel'

export type PlanWarning = {
  kind: WarningKind
  severity: 'info' | 'warn' | 'error'
  title: string
  /** Average high (or, with tempIsLow, the low) in °C for weather warnings, shown in the user's unit after the title (see warningTitle). */
  tempC?: number
  tempIsLow?: boolean
  /** The temperature is how it feels (the user's display setting), not measured. */
  tempFeels?: boolean
  /** For budget warnings: the amount and the preference's limit in EUR, a day or a night, shown in the user's
   *  currency after the title (see warningTitle). */
  amount?: { eur: number; limitEur: number; per: 'day' | 'night' }
  detail?: string
  /** The stop it's about (shown on the stop in the itinerary and in its city panel). */
  cityId?: string
  /** The leg it's about (index into the plan's legs), for travel warnings. */
  leg?: number
  iso2?: string
  url?: string
}

export type SchengenSummary = {
  applies: boolean
  maxInWindow: number
  limit: number
  firstViolation: string | null
  days: number
}

export type Plan = {
  stops: ScheduledStop[]
  legs: Leg[]
  warnings: PlanWarning[]
  schengen: SchengenSummary
  cost: { min: number; max: number; perDay: number }
  /** Getting from home to the first stop, and from the last stop back home (null without a home city). */
  home: { out: Leg | null; back: Leg | null }
  /** The trip's dates (with flexible dates, the ones picked when it was generated). */
  dates: { start: string; end: string }
  totalNights: number
  assignedNights: number
  dropped: string[]
}
