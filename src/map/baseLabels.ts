import type { DataDrivenPropertyValueSpecification, Map as MlMap, StyleSpecification } from 'maplibre-gl'

// The base map's labels: a place's English name (`name_en`) where it has one; where its own name isn't in Latin
// script, the Latin one with the local one after it (OpenFreeMap's styles), which `localNames` can leave out.
//
// OpenFreeMap's tiles can also carry a broken English name: since its October 2026 build Türkiye's is just "T". A name
// of one letter falls back to the international name (`name_int`), or else the local one; a missing one is left to
// the style, as before.

const NAME_EN = ['get', 'name_en']
const BROKEN = ['all', ['has', 'name_en'], ['<', ['length', ['to-string', NAME_EN]], 2]]
/** Where a layer keeps the style's own label text, to make it again when the setting changes. */
const ORIGINAL = 'rtw:text-field'

const isGet = (e: unknown, key: string) => Array.isArray(e) && e.length === 2 && e[0] === 'get' && e[1] === key

/** A label's text from the style's own: the English name checked, and without the local name unless `localNames`. */
export function labelText(e: unknown, localNames: boolean): unknown {
  if (!Array.isArray(e)) return e
  // `["coalesce", ["get", "name_en"], …]`: the same with `["get", "name_int"]` first when the English name is broken.
  if (e[0] === 'coalesce' && isGet(e[1], 'name_en')) return ['case', BROKEN, ['coalesce', ['get', 'name_int'], ...e.slice(2)], e]
  // `["concat", latin, separator, ["get", "name:nonlatin"]]`: just the Latin name.
  if (!localNames && e[0] === 'concat' && e.length === 4 && isGet(e[3], 'name:nonlatin')) return labelText(e[1], localNames)
  return e.map((x) => labelText(x, localNames))
}

/** The base map with its labels' text from `labelText` (used in MapLibre's transformStyle). */
export function withLabels(style: StyleSpecification, localNames: boolean): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((l) => {
      if (l.type !== 'symbol' || !l.layout?.['text-field']) return l
      const field = l.layout['text-field']
      return { ...l, metadata: { ...(l.metadata as object), [ORIGINAL]: field }, layout: { ...l.layout, 'text-field': labelText(field, localNames) } } as typeof l
    }),
  }
}

/** Change the shown base map's labels for the setting. */
export function showLocalNames(map: MlMap, localNames: boolean) {
  for (const l of map.getStyle()?.layers ?? []) {
    const field = (l.metadata as Record<string, unknown> | undefined)?.[ORIGINAL]
    if (field) map.setLayoutProperty(l.id, 'text-field', labelText(field, localNames) as DataDrivenPropertyValueSpecification<string>)
  }
}
