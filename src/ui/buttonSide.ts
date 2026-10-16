// Which side a phone's main buttons go (Settings › Display): the right, or the left for a left hand. Those over the map
// (the map's legend and dropdowns moving to the other side, out of their way) and the panels' ✕. Kept in this browser;
// `data-buttons` on the page puts MapLibre's own buttons there too (index.css).
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { usePhone } from './usePhone'

export type ButtonSide = 'left' | 'right'

type ButtonSideState = {
  side: ButtonSide
  setSide: (side: ButtonSide) => void
}

export const useButtonSide = create<ButtonSideState>()(
  persist(
    (set) => ({
      side: 'right',
      setSide: (side) => set({ side }),
    }),
    { name: 'rtw-map-buttons', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
)

/** Whether a phone's buttons go on the left (on a computer they stay where they are). */
export const useButtonsLeft = () => {
  const left = useButtonSide((s) => s.side) === 'left'
  return usePhone() && left
}

function apply(side: ButtonSide) {
  if (typeof document === 'undefined') return
  if (side === 'left') document.documentElement.dataset.buttons = 'left'
  else delete document.documentElement.dataset.buttons
}

apply(useButtonSide.getState().side)
useButtonSide.subscribe((s) => apply(s.side))
