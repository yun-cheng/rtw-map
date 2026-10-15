// The right panel, My trip (panels/MyTrip.tsx): the trip's stays, tickets, receipts and journal in one place. Beside
// the map on a computer, open or folded to a strip, with its tab remembered in this browser; while it's open, a city or
// journey panel opens in its place instead of over the map. On a phone it's a sheet, opened from a button over the map.
import { BedDouble, BookOpen, Receipt, Ticket, type LucideIcon } from 'lucide-react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { SHARED_TOKEN } from '../store/shareLink'
import { useTrip } from '../store/trip'
import { isPhone, usePhone } from './usePhone'

export type MyTripTab = 'stays' | 'tickets' | 'receipts' | 'daily'
export const MY_TRIP_TABS: MyTripTab[] = ['stays', 'tickets', 'receipts', 'daily']
export const MY_TRIP_LABELS: Record<MyTripTab, string> = { tickets: 'Tickets', stays: 'Stays', daily: 'Daily', receipts: 'Receipts' }
/** The tabs' icons, on the tab bar and on the folded panel's strip. */
export const MY_TRIP_ICONS: Record<MyTripTab, LucideIcon> = { tickets: Ticket, stays: BedDouble, daily: BookOpen, receipts: Receipt }

type RightPanel = {
  /** Open beside the map (on a computer). */
  open: boolean
  /** Its sheet open (on a phone; not remembered). */
  sheet: boolean
  tab: MyTripTab
  /** Opens it (beside the map, or its sheet), on a tab. */
  show: (tab?: MyTripTab) => void
  setSheet: (sheet: boolean) => void
  hide: () => void
  setTab: (tab: MyTripTab) => void
}

export const useRightPanel = create<RightPanel>()(
  persist(
    (set) => ({
      open: false,
      sheet: false,
      tab: 'stays',
      show: (tab) => set((s) => ({ open: true, sheet: true, tab: tab ?? s.tab })),
      setSheet: (sheet) => set({ sheet }),
      hide: () => set({ open: false }),
      setTab: (tab) => set({ tab }),
    }),
    {
      name: 'rtw-map-right-panel',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ open: s.open, tab: s.tab }),
    },
  ),
)

/** Whether there's a My trip panel: on the user's own trip (My visit and the journal are private), once it's planned. */
export const useHasRightPanel = () => useTrip((s) => !!s.plan) && !SHARED_TOKEN

/** Whether My trip is open beside the map now (on a computer). */
export function useRightPanelBeside() {
  const has = useHasRightPanel()
  const open = useRightPanel((s) => s.open)
  const phone = usePhone()
  return has && open && !phone
}

/** Whether a city or journey panel is open over the right of the map (not in My trip's place): the map's controls
 *  stop short of it. */
export function useDrawerOverMap() {
  const selected = useTrip((s) => !!s.selected)
  const beside = useRightPanelBeside()
  return selected && !beside
}

/** The same, read once (outside React: the map's camera moves). */
export const drawerOverMap = () => {
  const { selected, plan } = useTrip.getState()
  return !!selected && !(plan && !SHARED_TOKEN && useRightPanel.getState().open && !isPhone())
}
