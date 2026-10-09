import { describe, expect, it } from 'vitest'
import { createExpression, type StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec'
import type { StyleSpecification } from 'maplibre-gl'
import { withLabels } from './baseLabels'

// The country labels' text in OpenFreeMap's styles.
const TEXT_FIELD = ['case', ['has', 'name:nonlatin'], ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']], ['coalesce', ['get', 'name_en'], ['get', 'name']]]
const style = {
  version: 8,
  sources: {},
  layers: [{ id: 'place_country_major', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-field': TEXT_FIELD } }],
} as unknown as StyleSpecification

function label(properties: Record<string, string>, localNames = true) {
  const field = (withLabels(style, localNames).layers[0] as { layout: { 'text-field': unknown } }).layout['text-field']
  const e = createExpression(field, 'text-field', { type: 'string', expression: { parameters: ['zoom', 'feature'] } } as StylePropertySpecification)
  if (e.result !== 'success') throw new Error(JSON.stringify(e.value))
  return e.value.evaluate({ zoom: 4 }, { type: 'Point', properties } as never)
}

const CHAD = { name: 'Tchad تشاد', 'name:latin': 'Chad', 'name:nonlatin': 'تشاد', name_en: 'Chad' }

describe('withLabels', () => {
  it('skips an English name of one letter', () => {
    // Türkiye in OpenFreeMap's tiles of October 2026.
    expect(label({ name: 'Türkiye', name_en: 'T', 'name:latin': 'Türkiye', name_int: 'Turkey' })).toBe('Turkey')
    expect(label({ name: 'Türkiye', name_en: 'T' })).toBe('Türkiye')
  })
  it('keeps the rest', () => {
    expect(label({ name: 'Türkmenistan', name_en: 'Turkmenistan', name_int: 'Turkmenistan' })).toBe('Turkmenistan')
    expect(label(CHAD)).toBe('Chad\nتشاد')
    expect(label({ name: 'Ísland' })).toBe('Ísland')
  })
  it('leaves out local names when they are off', () => {
    expect(label(CHAD, false)).toBe('Chad')
    expect(label({ name: 'Türkiye', name_en: 'T', 'name:latin': 'Türkiye', name_int: 'Turkey' }, false)).toBe('Turkey')
    expect(label({ name: 'Ísland' }, false)).toBe('Ísland')
  })
  it('keeps the style\'s own text', () => {
    const layer = withLabels(style, false).layers[0]
    expect(layer.metadata).toEqual({ 'rtw:text-field': TEXT_FIELD })
  })
})
