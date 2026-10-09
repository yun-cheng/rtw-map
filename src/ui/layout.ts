/** Width (px) of the city or journey panel that opens over the right of the map; the map's controls stop short of it. */
export const DRAWER_WIDTH = 420

/** Width (px) of the left panel (Trip, Preferences, Itinerary, Assistant) when open. */
export const SIDEBAR_WIDTH = 380

/** Below this window width, opening the city or journey panel folds the left panel away, so the map keeps some room
 *  (both panels plus at least ~400px of map). */
export const BOTH_PANELS_MIN_WIDTH = SIDEBAR_WIDTH + DRAWER_WIDTH + 400

/** A phone-sized window: the map fills the screen and the panels become bottom sheets. Tailwind's `md` breakpoint,
 *  so `max-md:` classes match it. */
export const PHONE_QUERY = '(max-width: 767px)'
