import { useMemo } from 'react'
import { useTrip } from '../store/trip'
import { money } from './format'

/** Money formatter bound to the user's display currency; re-renders when it changes. */
export function useMoney() {
  const currency = useTrip((s) => s.currency)
  return useMemo(() => ({ currency, fmt: (nEur: number, precise = false) => money(nEur, currency, precise) }), [currency])
}
