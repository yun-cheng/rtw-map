import { useMemo } from 'react'
import { useTrip } from '../store/trip'
import { temp, tempRange } from './format'

/** Temperature formatters bound to the user's unit (°C or °F); re-renders when it changes. */
export function useTemp() {
  const unit = useTrip((s) => s.tempUnit)
  return useMemo(() => ({
    unit,
    t: (c: number) => temp(c, unit),
    range: (lo: number, hi: number) => tempRange(lo, hi, unit),
  }), [unit])
}

