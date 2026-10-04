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
  | 'schengen' | 'visa' | 'advisory' | 'weather' | 'pace' | 'dropped' | 'border' | 'unreachable' | 'time' | 'notice' | 'language'

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
