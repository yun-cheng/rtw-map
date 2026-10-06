import type { Budget, TravelPrefs } from './types'

/** The preferences each travel style sets; the others (who, limits, comfort) are left as they are. */
type StyleFields = Pick<TravelPrefs, 'room' | 'hotelStars' | 'cooking' | 'eatingOut' | 'coffee' | 'alcohol' | 'cityTransport' | 'betweenCities' | 'overnight' | 'sights'>

export const STYLES: { value: Budget; label: string; about: string; prefs: StyleFields }[] = [
  {
    value: 'shoestring', label: 'Shoestring', about: 'Dorm bed, mostly cooking, walking and free sights',
    prefs: { room: 'dorm', hotelStars: 2, cooking: 'mostly', eatingOut: 'street', coffee: false, alcohol: 'none', cityTransport: 'public', betweenCities: 'cheapest', overnight: true, sights: 'few' },
  },
  {
    value: 'backpacker', label: 'Backpacker', about: 'Dorm bed, street food and cheap local places',
    prefs: { room: 'dorm', hotelStars: 2, cooking: 'half', eatingOut: 'street', coffee: true, alcohol: 'some', cityTransport: 'public', betweenCities: 'cheapest', overnight: true, sights: 'few' },
  },
  {
    value: 'private', label: 'Budget private', about: 'Your own room in a guesthouse or budget hotel, cheap restaurants',
    prefs: { room: 'own_bath', hotelStars: 2, cooking: 'half', eatingOut: 'casual', coffee: true, alcohol: 'some', cityTransport: 'public', betweenCities: 'balanced', overnight: true, sights: 'daily' },
  },
  {
    value: 'midrange', label: 'Mid-range', about: 'A ~3★ hotel, casual lunches and restaurant dinners',
    prefs: { room: 'hotel', hotelStars: 3, cooking: 'rarely', eatingOut: 'casual', coffee: true, alcohol: 'some', cityTransport: 'taxi_sometimes', betweenCities: 'balanced', overnight: true, sights: 'daily' },
  },
  {
    value: 'comfort', label: 'Comfort', about: 'A ~4★ hotel, nice restaurants, taxis and tours',
    prefs: { room: 'hotel', hotelStars: 4, cooking: 'rarely', eatingOut: 'nice', coffee: true, alcohol: 'some', cityTransport: 'taxi_often', betweenCities: 'fastest', overnight: false, sights: 'lots' },
  },
]

const styleOf = (b: Budget) => STYLES.find((s) => s.value === b) ?? STYLES[1]

/** Preferences for a travel style, keeping the traveller's own settings from `base`. */
export function stylePrefs(style: Budget, base: TravelPrefs = DEFAULT_PREFS): TravelPrefs {
  return { ...base, ...styleOf(style).prefs }
}

/** Whether the preferences still match the travel style exactly (otherwise they're "custom", based on it). */
export function matchesStyle(prefs: TravelPrefs, style: Budget): boolean {
  return Object.entries(styleOf(style).prefs).every(([k, v]) => prefs[k as keyof TravelPrefs] === v)
}

export const DEFAULT_PREFS: TravelPrefs = {
  travellers: 1, homeCityId: null, returnHome: true, ...STYLES[1].prefs, maxPerNight: null, maxTravelHours: null,
  focus: 'balanced', expensive: 'ignore', maxHeatC: null, minHighC: null, maxLowC: null, minLowC: null, avoidRain: false, needInternet: false, dailyBudget: null,
}

/** Trips saved before preferences existed get those of their travel style; newer fields get their defaults. */
export function withPrefs<T extends { budget: Budget; prefs?: Partial<TravelPrefs> }>(input: T): T & { prefs: TravelPrefs } {
  return { ...input, prefs: { ...stylePrefs(input.budget), ...input.prefs } }
}
