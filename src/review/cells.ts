// How the data review page shows, sorts and filters a cell (see DataTable).
import type { Value } from './sources'

export type Kind = 'number' | 'bool' | 'list' | 'text'

export const EMPTY = '∅'
export const isEmpty = (v: Value) => v === null || v === '' || (Array.isArray(v) && !v.length)

/** A cell as plain text: "yes"/"no", a pair of numbers as "25–45", lists joined with " · ". */
export function textOf(v: Value): string {
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (Array.isArray(v)) return v.length === 2 && v.every((x) => typeof x === 'number') ? `${v[0]}–${v[1]}` : v.map(textOf).join(' · ')
  return String(v)
}

export function kindOf(values: Value[]): Kind {
  const filled = values.filter((v) => !isEmpty(v))
  if (filled.some(Array.isArray)) return 'list'
  if (filled.length && filled.every((v) => typeof v === 'number')) return 'number'
  if (filled.length && filled.every((v) => typeof v === 'boolean')) return 'bool'
  return 'text'
}

/**
 * Whether a cell passes its column's filter. From the dropdowns: "∅" (empty), "=x" (exactly x) or "∋x" (a list that
 * has x). Typed: "empty", or for numbers "5", ">5", "<=5", "2..5"; otherwise text the cell contains.
 */
export function matches(v: Value, filter: string, kind: Kind): boolean {
  const f = filter.trim()
  if (!f) return true
  if (f === EMPTY || f.toLowerCase() === 'empty') return isEmpty(v)
  if (f.startsWith('=')) return textOf(v) === f.slice(1)
  if (f.startsWith('∋')) return Array.isArray(v) && v.some((x) => textOf(x) === f.slice(1))
  if (kind === 'number') {
    const range = f.match(/^(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)$/)
    const cmp = f.match(/^(<=|>=|<|>|=)?\s*(-?[\d.]+)$/)
    if (range || cmp) {
      if (typeof v !== 'number') return false
      if (range) return v >= Number(range[1]) && v <= Number(range[2])
      const n = Number(cmp![2])
      return { '<': v < n, '<=': v <= n, '>': v > n, '>=': v >= n, '=': v === n }[cmp![1] ?? '='] ?? false
    }
  }
  return textOf(v).toLowerCase().includes(f.toLowerCase())
}
