// A receipt's link to the stay or ticket it paid for (store/itemsCore.ts, `booking`): on the booking's card, what was
// paid for it; on the receipt, what it was for. Each opens the other's tab in My trip.
import { BedDouble, Ticket } from 'lucide-react'
import { isEmptyItem, useAllItems } from '../store/items'
import { useTrip } from '../store/trip'
import { bookingName, paid } from '../ui/format'
import { useRightPanel, type MyTripTab } from '../ui/rightPanel'

/** My trip, on a tab (closing a city's or journey's panel open in its place). */
const openTab = (tab: MyTripTab) => {
  useTrip.getState().select(null)
  useRightPanel.getState().show(tab)
}

/** On a stay's or ticket's card: what was paid for it, by its receipts ("Paid €84 · receipt"); a receipt for a
 *  package (it and other bookings, paid together) is its whole amount, said so. */
export function PaidFor({ id }: { id: string }) {
  const receipts = Object.values(useAllItems()).filter((r) => r.kind === 'receipt' && r.bookings?.includes(id) && !isEmptyItem(r) && r.amount !== undefined)
  if (!receipts.length) return null
  const others = Math.max(...receipts.map((r) => r.bookings!.length)) - 1
  return (
    <div>
      <span className="text-muted">Paid </span>{receipts.map((r) => paid(r.amount!, r.currency)).join(' + ')}
      {others > 0 && <span className="text-muted"> with {others} other booking{others === 1 ? '' : 's'}</span>}{' '}
      <button onClick={() => openTab('receipts')} className="text-accent hover:underline">· receipt{receipts.length === 1 ? '' : 's'}</button>
    </div>
  )
}

/** On a receipt: the stays and tickets it paid for, those still kept ("for KLM KL 808 + 2 more"), opening the first's
 *  tab. */
export function ReceiptFor({ bookings }: { bookings?: string[] }) {
  const items = useAllItems()
  const kept = (bookings ?? []).map((id) => items[id]).filter((b) => b && !b.deleted)
  if (!kept.length) return null
  const first = kept[0]
  const Icon = first.kind === 'stay' ? BedDouble : Ticket
  return (
    <button onClick={() => openTab(first.kind === 'stay' ? 'stays' : 'tickets')} className="flex min-w-0 items-center gap-1 text-[12px] text-accent hover:underline">
      <Icon size={11} className="shrink-0" />
      <span className="truncate">for {bookingName(first)}{kept.length > 1 && ` + ${kept.length - 1} more`}</span>
    </button>
  )
}
