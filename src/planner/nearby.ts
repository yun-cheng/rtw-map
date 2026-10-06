import type { Amenities, Dataset } from './types'

type Counted = Exclude<keyof Amenities, 'nearestHospitalKm'>

/**
 * Places within the radius of a city centre. Both sources miss places, in different ways (OpenStreetMap depends on
 * local volunteers; business listings rarely include ATMs), so each count is the higher of the two. The nearest
 * hospital comes from OpenStreetMap; without it, the listings can still tell whether there's one within the
 * radius (`hospitalWithin`), and otherwise it's unknown. Null when neither source has the city.
 */
export function nearby(ds: Dataset, cityId: string): (Omit<Amenities, 'nearestHospitalKm'> & { nearestHospitalKm?: number | null; hospitalWithin?: number }) | null {
  const osm = ds.amenities.byCity[cityId]
  const listed = ds.businesses[cityId]
  if (!osm && !listed) return null
  const count = (k: Counted) => Math.max(osm?.[k] ?? 0, listed?.[k] ?? 0)
  return {
    supermarket: count('supermarket'), convenience: count('convenience'), pharmacy: count('pharmacy'),
    clinic: count('clinic'), atm: count('atm'),
    ...(osm ? { nearestHospitalKm: osm.nearestHospitalKm } : listed?.hospital ? { hospitalWithin: ds.amenities.radiusKm } : {}),
  }
}

/** The rough scale for counts, since neither source is complete: from "None found" (level 0) to "50+" (level 4). */
export const NEARBY_BANDS: { min: number; label: string }[] = [
  { min: 0, label: 'None found' }, { min: 1, label: '1–4' }, { min: 5, label: '5+' }, { min: 20, label: '20+' }, { min: 50, label: '50+' },
]

/** A count's level on the rough scale, 0–4. */
export const nearbyLevel = (n: number) => NEARBY_BANDS.findLastIndex((b) => n >= b.min)

/** A count as a rough scale: "None found", "1–4", "5+", "20+", "50+". */
export const roughCount = (n: number) => NEARBY_BANDS[nearbyLevel(n)].label

/** Distance to the nearest hospital, roughly: "<1 km", "~3 km", ">40 km". */
export const roughKm = (km: number | null) => (km == null ? '>40 km' : km < 1 ? '<1 km' : `~${Math.round(km)} km`)
