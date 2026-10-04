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
  rainMm: number
  rainDays: number
  sunHours: number
  humidity: number
  comfort: number
}

export type CostProfile = {
  dormBed: number
  privateRoom: number
  mealCheap: number
  mealMid: number
  localTransportDay: number
  groceries: Record<'bread' | 'eggs12' | 'milk1l' | 'rice1kg' | 'chicken1kg' | 'tomatoes1kg' | 'beer05' | 'water15', number>
}

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
  air: { whoDaily: number; byCity: Record<string, AirMonth[]> }
  amenities: { radiusKm: number; byCity: Record<string, Amenities> }
  shopping: Record<string, Shopping>
  priceLevels: { compare: { iso2: string; name: string; currency: string }[]; levels: Record<string, PriceLevel> }
  bigMac: { date: string; euroArea: BigMac | null; prices: Record<string, BigMac> }
  payments: { tips: string[]; countries: Record<string, CountryPayments>; cities: Record<string, { cardLevel?: number; note?: string }> }
  meta: Record<string, Meta>
}

// ---------- Trip input ----------

export type Pace = 'chill' | 'balanced' | 'fast'
export type Budget = 'shoestring' | 'backpacker' | 'midrange' | 'comfort'
export type CountryMode = 'must' | 'optional' | 'excluded'

/** An ordered part of the trip, e.g. "Western Balkans" then "Poland". */
export type TripGroup = {
  id: string
  name: string
  countries: { iso2: string; mode: CountryMode }[]
  longer: boolean
}

export type TripInput = {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD (departure day from the last stop)
  groups: TripGroup[]
  keepGroupOrder: boolean
  startCityId: string | null
  endCityId: string | null
  mustCities: string[]
  pace: Pace
  budget: Budget
  interests: string[]
  passport: string
  schengenDaysBefore: number
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
  | 'schengen' | 'visa' | 'advisory' | 'weather' | 'pace' | 'dropped' | 'border' | 'unreachable' | 'time' | 'notice' | 'language' | 'health' | 'money'

export type PlanWarning = {
  kind: WarningKind
  severity: 'info' | 'warn' | 'error'
  title: string
  detail?: string
  cityId?: string
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
  totalNights: number
  assignedNights: number
  dropped: string[]
}
