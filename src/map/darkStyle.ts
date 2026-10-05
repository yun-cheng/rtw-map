import type { StyleSpecification } from 'maplibre-gl'

// OpenFreeMap's "dark" style is nearly black: land rgb(12), water rgb(27) (lighter than land), faint borders and
// dim labels. These colours keep it dark but separate land, water, borders and labels clearly, in the app's
// warm grey (see the dark tokens in index.css). Keyed by the style's layer ids; layers not listed keep their colours.

const LAND = '#423d39'
const WATER = '#18232f'
const PARK = '#38412f'
const ROAD = '#4a4541'
const ROAD_MAJOR = '#5a544f'
const HALO = '#24201d'
const LABEL = '#d6cfc8'
const LABEL_DIM = '#a39a92'
const LABEL_WATER = '#7c9cb8'

type Paint = Record<string, unknown>

const PAINT: Record<string, Paint> = {
  background: { 'background-color': LAND },
  water: { 'fill-color': WATER },
  waterway: { 'line-color': WATER },
  water_name: { 'text-color': LABEL_WATER, 'text-halo-color': WATER },
  landcover_ice_shelf: { 'fill-color': '#4a4a50' },
  landcover_glacier: { 'fill-color': '#4a4a50' },
  landuse_residential: { 'fill-color': '#4a4440' },
  landcover_wood: { 'fill-color': PARK },
  landuse_park: { 'fill-color': PARK },
  building: { 'fill-color': '#312d2a', 'fill-outline-color': '#4a4541' },
  'aeroway-area': { 'fill-color': '#433e3a' },
  'aeroway-runway': { 'line-color': ROAD_MAJOR },
  'aeroway-taxiway': { 'line-color': ROAD },
  road_area_pier: { 'fill-color': LAND },
  road_pier: { 'line-color': LAND },
  highway_path: { 'line-color': ROAD },
  highway_minor: { 'line-color': ROAD },
  highway_major_casing: { 'line-color': '#2e2a27' },
  highway_major_inner: { 'line-color': ROAD_MAJOR },
  highway_major_subtle: { 'line-color': ROAD },
  highway_motorway_casing: { 'line-color': '#2e2a27' },
  highway_motorway_inner: { 'line-color': '#6b645e' },
  highway_motorway_subtle: { 'line-color': ROAD_MAJOR },
  railway: { 'line-color': '#55504b' },
  railway_minor: { 'line-color': '#55504b' },
  railway_transit: { 'line-color': '#55504b' },
  railway_dashline: { 'line-color': LAND },
  railway_minor_dashline: { 'line-color': LAND },
  railway_transit_dashline: { 'line-color': LAND },
  highway_name_other: { 'text-color': LABEL_DIM, 'text-halo-color': HALO },
  highway_name_motorway: { 'text-color': LABEL_DIM },
  boundary_state: { 'line-color': '#6b645e' },
  'boundary_country_z0-4': { 'line-color': '#a39a92' },
  'boundary_country_z5-': { 'line-color': '#a39a92' },
  place_other: { 'text-color': LABEL_DIM, 'text-halo-color': HALO },
  place_suburb: { 'text-color': LABEL_DIM, 'text-halo-color': HALO },
  place_village: { 'text-color': LABEL_DIM, 'text-halo-color': HALO },
  place_town: { 'text-color': LABEL, 'text-halo-color': HALO },
  place_city: { 'text-color': LABEL, 'text-halo-color': HALO },
  place_city_large: { 'text-color': LABEL, 'text-halo-color': HALO },
  place_state: { 'text-color': LABEL_DIM, 'text-halo-color': HALO },
  place_country_other: { 'text-color': LABEL, 'text-halo-color': HALO },
  place_country_minor: { 'text-color': LABEL, 'text-halo-color': HALO },
  place_country_major: { 'text-color': LABEL, 'text-halo-color': HALO },
}

/** The dark base map with lighter, more distinct colours (used as MapLibre's transformStyle). */
export function recolorDark(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((l) => {
      const paint = PAINT[l.id]
      return paint && 'paint' in l ? ({ ...l, paint: { ...l.paint, ...paint } } as typeof l) : l
    }),
  }
}
