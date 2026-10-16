// The right panel, My trip (panels/MyTrip.tsx): Today while the trip is under way, and the trip's stays, tickets,
// receipts and journal, in one place. Beside the map on a computer, open or folded to a strip, with its tab remembered
// in this browser. On a phone it's a sheet, opened from a button over the map.
import { BedDouble, BookOpen, MapPin, Receipt, Ticket, type LucideIcon } from 'lucide-react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isTravelling, localToday } from '../planner'
import { useSharedItems } from '../store/items'
import { useSharedJournal } from '../store/journal'
import { SHARED_TOKEN } from '../store/shareLink'
import { useTrip } from '../store/trip'
import { usePhone } from './usePhone'

export type MyTripTab = 'today' | 'stays' | 'tickets' | 'receipts' | 'daily'
/** The panel's name: the user's own, or neutral on a shared trip's page (it's its owner's). */
export const MY_TRIP_NAME = SHARED_TOKEN ? 'Trip details' : 'My trip'
export const MY_TRIP_TABS: MyTripTab[] = ['today', 'stays', 'tickets', 'receipts', 'daily']
export const MY_TRIP_LABELS: Record<MyTripTab, string> = { today: 'Today', tickets: 'Tickets', stays: 'Stays', daily: 'Journal', receipts: 'Receipts' }
/** The tabs' icons, on the tab bar and on the folded panel's strip. */
export const MY_TRIP_ICONS: Record<MyTripTab, LucideIcon> = { today: MapPin, tickets: Ticket, stays: BedDouble, daily: BookOpen, receipts: Receipt }

type RightPanel = {
  /** Open beside the map (on a computer). */
  open: boolean
  /** Its sheet open (on a phone; not remembered). */
  sheet: boolean
  tab: MyTripTab
  /** The record open on its page, by tab (a stay's, ticket's or receipt's id; not remembered). */
  records: Partial<Record<MyTripTab, string>>
  /** The new one being written on its page, by tab (its id; not remembered). */
  adding: Partial<Record<MyTripTab, string>>
  /** Opens it (beside the map, or its sheet), on a tab. */
  show: (tab?: MyTripTab) => void
  /** A record's page, or (null) its tab's list; `show`: opening My trip on that tab too. */
  setRecord: (tab: MyTripTab, id: string | null, show?: boolean) => void
  /** A new record's page, or (null) its tab's list; `show`: opening My trip on that tab too. */
  setAdding: (tab: MyTripTab, id: string | null, show?: boolean) => void
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
      records: {},
      adding: {},
      show: (tab) => set((s) => ({ open: true, sheet: true, tab: tab ?? s.tab })),
      setRecord: (tab, id, show) => set((s) => ({ records: { ...s.records, [tab]: id ?? undefined }, ...(show && { open: true, sheet: true, tab }) })),
      setAdding: (tab, id, show) => set((s) => ({ adding: { ...s.adding, [tab]: id ?? undefined }, ...(show && { open: true, sheet: true, tab }) })),
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

/** My trip on a record's page (or, `id` null, its tab's list). */
export function openRecord(tab: MyTripTab, id: string | null) {
  useRightPanel.getState().setRecord(tab, id, true)
}

/** My trip on a new record's page (`id`: the one it will be). */
export function addRecord(tab: MyTripTab, id: string) {
  useRightPanel.getState().setAdding(tab, id, true)
}

/** Whether there's a My trip panel: once the trip is planned; on a shared trip's page, if its owner made anything in it
 *  public. */
export function useHasRightPanel() {
  const plan = useTrip((s) => !!s.plan)
  const shared = useSharedItems((s) => s.entries)
  const days = useSharedJournal((s) => s.entries)
  return plan && (!SHARED_TOKEN || Object.keys(shared).length + Object.keys(days).length > 0)
}

/** Its tabs: Today only while the trip is under way (not on a shared trip's page: it's its owner's). */
export function useMyTripTabs(): MyTripTab[] {
  const travelling = useTrip((s) => !SHARED_TOKEN && !!s.plan && isTravelling(s.input, localToday()))
  return travelling ? MY_TRIP_TABS : MY_TRIP_TABS.slice(1)
}

/** Whether My trip is open beside the map now (on a computer). */
export function useRightPanelBeside() {
  const has = useHasRightPanel()
  const open = useRightPanel((s) => s.open)
  const phone = usePhone()
  return has && open && !phone
}
