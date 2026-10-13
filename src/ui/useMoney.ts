import { createContext, useContext, useMemo } from 'react'
import { useTrip } from '../store/trip'
import { money } from './format'

/** A currency that replaces the display currency inside it (a city's own, in its daily cost when asked for). */
export const MoneyCurrency = createContext<string | null>(null)

/** Money formatter bound to the user's display currency; re-renders when it changes. */
export function useMoney() {
  const display = useTrip((s) => s.currency)
  const currency = useContext(MoneyCurrency) ?? display
  return useMemo(() => ({ currency, fmt: (nEur: number, precise = false) => money(nEur, currency, precise) }), [currency])
}
