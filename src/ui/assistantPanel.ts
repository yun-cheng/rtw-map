// The Assistant's own panel (App, panels/AssistantPanel.tsx). On a computer it's opened from the top bar, beside the
// map on the side away from the panel last used (in My trip's place, or the left panel's, while it's open), and can be
// moved to the other; whether it's open is remembered in this browser. On a phone it's a sheet, opened from a button
// over the map.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type AssistantPanel = {
  /** Open beside the map (on a computer). */
  open: boolean
  /** Which side of the map it's on. */
  side: 'left' | 'right'
  /** The side panel last used (clicked or typed in): the left panel, or My trip on the right. */
  active: 'left' | 'right'
  /** Its sheet open (on a phone; not remembered). */
  sheet: boolean
  /** Counts the times it was opened to ask something (App focuses where to type). */
  asks: number
  /** Opens it (beside the map, on the side away from the panel last used, or its sheet); `ask`: ready to type. */
  show: (ask?: boolean) => void
  setActive: (side: 'left' | 'right') => void
  hide: () => void
  setSheet: (sheet: boolean) => void
  /** Moves it to the other side. */
  swap: () => void
}

export const useAssistantPanel = create<AssistantPanel>()(
  persist(
    (set) => ({
      open: false,
      side: 'right',
      active: 'left',
      sheet: false,
      asks: 0,
      show: (ask) => set((s) => ({ open: true, sheet: true, ...(!s.open && { side: s.active === 'left' ? 'right' : 'left' }), ...(ask && { asks: s.asks + 1 }) })),
      setActive: (active) => set((s) => (s.active === active ? s : { active })),
      hide: () => set({ open: false }),
      setSheet: (sheet) => set({ sheet }),
      swap: () => set((s) => ({ side: s.side === 'left' ? 'right' : 'left' })),
    }),
    {
      name: 'rtw-map-assistant',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ open: s.open, side: s.side, active: s.active }),
    },
  ),
)

/** Opens the Assistant (from anywhere: a button, a notification, a link). */
export const openAssistant = () => useAssistantPanel.getState().show()

/** Opens the Assistant ready to type: "Ask AI" and the like. */
export const askAssistant = () => useAssistantPanel.getState().show(true)
