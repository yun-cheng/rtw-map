// The countries in Europe's open-border and free-movement areas, all of them (not only those with cities in the app),
// so the map can colour the whole area and the visa rules can cover every destination. The app's countries carry the
// same as their `schengen` and `eu` flags (areas.test.ts checks they agree).

/** The Schengen area (since Bulgaria and Romania joined fully in 2025): no border checks inside, one 90/180 limit. */
export const SCHENGEN = new Set([
  'AT', 'BE', 'BG', 'CH', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IS',
  'IT', 'LI', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
])

/** The European Union. */
export const EU = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
])

/** Where an EU / EEA / Swiss passport has free movement: the EU, the rest of the EEA, and Switzerland. */
export const FREE_MOVEMENT = new Set([...EU, 'IS', 'LI', 'NO', 'CH'])
