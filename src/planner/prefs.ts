import type { Budget, TravelPrefs } from './types'

/** The preferences each travel style sets; the others (who, limits, comfort) are left as they are. */
type StyleFields = Pick<TravelPrefs, 'room' | 'breakfast' | 'lunch' | 'dinner' | 'coffees' | 'beers' | 'betweenCities' | 'overnight'>

export const STYLES: { value: Budget; label: string; about: string; prefs: StyleFields }[] = [
  {
    value: 'shoestring', label: 'Shoestring', about: 'Dorm bed and DIY meals',
    prefs: { room: 'dorm', breakfast: 'diy', lunch: 'diy', dinner: 'diy', coffees: 0, beers: 0, betweenCities: 'cheapest', overnight: true },
  },
  {
    value: 'backpacker', label: 'Backpacker', about: 'Dorm bed, DIY breakfast, local places for lunch and dinner',
    prefs: { room: 'dorm', breakfast: 'diy', lunch: 'local', dinner: 'local', coffees: 1, beers: 1, betweenCities: 'cheapest', overnight: true },
  },
  {
    value: 'private', label: 'Budget private', about: 'Your own room in a guesthouse or budget hotel, local places',
    prefs: { room: 'private', breakfast: 'diy', lunch: 'local', dinner: 'local', coffees: 1, beers: 1, betweenCities: 'balanced', overnight: true },
  },
  {
    value: 'midrange', label: 'Mid-range', about: 'A ~3★ hotel, local breakfasts and lunches, restaurant dinners',
    prefs: { room: 'private', breakfast: 'local', lunch: 'local', dinner: 'restaurant', coffees: 1, beers: 1, betweenCities: 'balanced', overnight: true },
  },
  {
    value: 'comfort', label: 'Comfort', about: 'A ~4★ hotel, restaurants and the fastest way between cities',
    prefs: { room: 'private', breakfast: 'local', lunch: 'restaurant', dinner: 'restaurant', coffees: 2, beers: 1, betweenCities: 'fastest', overnight: false },
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
  homeCityId: null, returnHome: true, ...STYLES[1].prefs, maxPerNight: null, maxTravelHours: null,
  focus: 'balanced', expensive: 'ignore', maxHeatC: null, minHighC: null, maxLowC: null, minLowC: null, avoidRain: false, dailyBudget: null,
}

/** Trips saved before preferences existed get those of their travel style; newer fields get their defaults. */
export function withPrefs<T extends { budget: Budget; prefs?: Partial<TravelPrefs> }>(input: T): T & { prefs: TravelPrefs } {
  // Preferences saved before they were removed are left out: the number of travellers (costs are one traveller's),
  // paid sights and needing fast internet.
  type Saved = Partial<TravelPrefs> & { travellers?: unknown; sights?: unknown; needInternet?: unknown }
  const { travellers: _t, sights: _s, needInternet: _i, ...saved } = (input.prefs ?? {}) as Saved
  const prefs = { ...stylePrefs(input.budget), ...saved }
  // Older saved values: rooms other than a dorm (private rooms, hotels, apartments) are a private room; breakfast
  // "with the room" (no hotel prices include it yet) is local; "cook" and "shop" are "diy".
  if (prefs.room !== 'dorm') prefs.room = 'private'
  if ((prefs.breakfast as string) === 'included') prefs.breakfast = 'local'
  for (const m of ['breakfast', 'lunch', 'dinner'] as const) if (['cook', 'shop'].includes(prefs[m] as string)) prefs[m] = 'diy'
  return { ...input, prefs }
}
