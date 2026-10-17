// The user's expenses (the trip's items, store/items.ts): what they spent in each city, by day, in the money they paid
// in, with the total in the display currency at today's rates. In My trip (MyTrip.tsx). Added here, by the app's
// assistant (a photo of a receipt: PhotoFill.tsx), or by another app's (worker/mcp.ts). Private, like the rest of My
// visit.
import { BedDouble, Plus, Ticket } from 'lucide-react'
import { useState } from 'react'
import { dataset as ds } from '../data/dataset'
import { localToday, type ScheduledStop } from '../planner'
import { isEmptyItem, newItemId, useAllItems, useItems, type TripItem } from '../store/items'
import { ITEM_LIMITS, NO_PLACE } from '../store/itemsCore'
import { SHARED_TOKEN } from '../store/shareLink'
import { useTrip } from '../store/trip'
import { bookingName, cityName, dayDate, paid, shortDate } from '../ui/format'
import { AiMark } from '../ui/AiMark'
import { PublicToggle } from '../ui/PublicToggle'
import { Section, Sections } from '../ui/kit'
import { useMoney } from '../ui/useMoney'
import { useRightPanel } from '../ui/rightPanel'
import { nightStop } from './Journal'
import { PhotoFill } from './PhotoFill'
import { ExpenseFor } from './ExpenseLinks'
import { NewRecord, RecordCard, RecordNav, RecordRow, RecordTitle } from './RecordPage'
import { EditorButtons, field, small } from './Visit'

/** Units of a currency per EUR (undefined: no rate). */
const rateOf = (currency?: string) => (currency === 'EUR' ? 1 : currency ? ds.fx.rates[currency] : undefined)
/** The expenses' total in EUR (those in money without a rate left out). */
const totalEur = (list: TripItem[]) => list.reduce((sum, r) => sum + (r.amount !== undefined && rateOf(r.currency) ? r.amount / rateOf(r.currency)! : 0), 0)

/** The stop an expense on `date` is likely from: where that night is spent, or the last one reached by then. */
const stopOn = (stops: ScheduledStop[], date: string) => nightStop(stops, date) ?? [...stops].reverse().find((s) => s.arrive <= date) ?? stops[0]

/** My trip's Spending: the total so far, then each day's expenses (the newest first), each opening its page (where
 *  it's changed), and one to add. */
export function Spending() {
  const plan = useTrip((s) => s.plan)
  const items = useAllItems()
  const { fmt } = useMoney()
  const open = useRightPanel((s) => s.records.spending)
  const setRecord = useRightPanel((s) => s.setRecord)
  // A new one, written on a page of its own until it's done.
  const adding = useRightPanel((s) => s.adding.spending) ?? null
  const setAdding = (id: string | null) => useRightPanel.getState().setAdding('spending', id)
  if (!plan) return null
  const expenses = Object.values(items).filter((i) => i.kind === 'receipt' && !i.deleted)
  const kept = expenses.filter((r) => !isEmptyItem(r))
  // (By day, the newest first; those without a day last.)
  const days = [...new Set(expenses.map((r) => r.from ?? ''))].sort((a, b) => (!a ? 1 : !b ? -1 : b.localeCompare(a)))
  const unrated = expenses.filter((r) => r.amount !== undefined && !rateOf(r.currency)).length
  const byDay = (d: string) => expenses.filter((r) => (r.from ?? '') === d).sort((a, b) => a.updatedAt - b.updatedAt)
  if (adding !== null) {
    // (Done: its page, once something is written in it.)
    const done = () => {
      const expense = items[adding]
      // (Its page first, then not new: the new one's page replaced by its own, Back not going to the new one's.)
      if (expense && !expense.deleted && !isEmptyItem(expense)) setRecord('spending', adding)
      setAdding(null)
    }
    return <NewRecord back="All spending" onBack={() => setAdding(null)} title="New expense"><ExpenseEditor id={adding} onDone={done} autoFocus /></NewRecord>
  }
  const page = open ? items[open] : undefined
  if (page && !page.deleted && page.kind === 'receipt') {
    // (The list's order, for a page's expenses before and after it.)
    const ids = days.flatMap(byDay).map((r) => r.id)
    return <ExpensePage expense={page} ids={ids.includes(page.id) ? ids : [page.id]} />
  }
  return (
    <Sections>
      <Section
        title={kept.length ? 'Spent so far' : 'Nothing spent yet'}
        aside={!SHARED_TOKEN && <span className="flex items-center gap-1"><PhotoFill what="receipt" className={small} /><button onClick={() => setAdding(newItemId('receipt'))} className={`${small} shrink-0`}><Plus size={12} /> Add</button></span>}
      >
        {/* (Just its title while there are none.) */}
        {kept.length > 0 && <>
          <div className="text-[20px] font-semibold">{fmt(totalEur(kept))}</div>
          <p className="text-[12px] text-muted">
            {kept.length} expense{kept.length === 1 ? '' : 's'}, at today's rates{unrated > 0 && ` (${unrated} in money without a rate left out)`}
          </p>
        </>}
      </Section>
      {days.map((d) => {
        const list = byDay(d)
        const cities = [...new Set(list.filter((r) => r.at !== NO_PLACE).map((r) => cityName(r.at)))].join(', ')
        return (
          <Section key={d || 'none'} title={<>{d ? dayDate(d) : 'No day'}{cities && <span className="font-normal text-muted"> · {cities}</span>}</>} aside={<span className="shrink-0 text-[12px] font-medium">{fmt(totalEur(list))}</span>}>
            <ul className="flex flex-col">{list.map((r) => <ExpenseRow key={r.id} expense={r} onOpen={() => setRecord('spending', r.id)} />)}</ul>
          </Section>
        )
      })}
    </Sections>
  )
}

/** An expense in My trip's list: what for and how much (and the booking it paid for), opening its page. */
function ExpenseRow({ expense: r, onOpen }: { expense: TripItem; onOpen: () => void }) {
  return (
    <RecordRow
      title={r.title || 'An expense'} mark={<AiMark on={r.ai} />} sub={r.bookings?.length ? <ExpenseFor bookings={r.bookings} /> : undefined} isPublic={r.public} onOpen={onOpen}
      aside={r.amount !== undefined && <span className="font-medium tabular-nums">{paid(r.amount, r.currency)}</span>}
    />
  )
}

/** An expense on its page in My trip: its day and city, all of it, and Edit (changed there); `ids`: the list's, for
 *  the expenses before and after it. */
function ExpensePage({ expense: r, ids }: { expense: TripItem; ids: string[] }) {
  const setRecord = useRightPanel((s) => s.setRecord)
  const [editing, setEditing] = useState(false)
  const i = ids.indexOf(r.id)
  const where = [r.from && dayDate(r.from), r.at !== NO_PLACE && cityName(r.at)].filter(Boolean).join(' · ')
  return (
    <Sections>
      <RecordNav back="All spending" onBack={() => setRecord('spending', null)} prev={ids[i - 1]} next={ids[i + 1]} onGo={(id) => setRecord('spending', id)} prevLabel="Expense before" nextLabel="Expense after" at={r.id} />
      <RecordCard title={where || 'Expense'} isPublic={r.public} editing={editing} onEdit={() => setEditing(true)}>
        {editing ? <ExpenseEditor key={r.id} id={r.id} onDone={() => setEditing(false)} autoFocus /> : (
          <div className="flex flex-col gap-1.5 text-[13px]">
            <RecordTitle mark={<AiMark on={r.ai} />}>{r.title || 'An expense'}</RecordTitle>
            {r.amount !== undefined && <div className="text-[20px] font-semibold tabular-nums">{paid(r.amount, r.currency)}</div>}
            <ExpenseFor bookings={r.bookings} />
            {r.text && <p className="whitespace-pre-wrap">{r.text}</p>}
          </div>
        )}
      </RecordCard>
    </Sections>
  )
}

/** An expense as it's written: saved as it's typed; a new one is on today, at the stop of that day, in its money (or
 *  at no city, in the display currency). It may be for a stay or ticket kept. One left with nothing in it is removed
 *  on Done. */
function ExpenseEditor({ id, onDone, autoFocus }: { id: string; onDone: () => void; autoFocus?: boolean }) {
  const expense = useAllItems()[id] as TripItem | undefined
  const stops = useTrip((s) => s.plan?.stops ?? [])
  const display = useMoney().currency
  const { put, remove } = useItems.getState()
  const live = expense && !expense.deleted ? expense : undefined
  // (A new one's day, city and money until it's saved.)
  const [fresh] = useState(() => {
    const day = localToday()
    const city = stopOn(stops, day)?.cityId
    return { from: day, at: city ?? NO_PLACE, currency: city ? ds.countries[ds.cities[city].iso2]?.currency ?? display : display }
  })
  const items = useAllItems()
  const now = live ?? fresh
  const [typed, setTyped] = useState(live?.amount !== undefined ? String(live.amount) : '')
  const save = (patch: Partial<TripItem>) => put({ ...(expense ? {} : { kind: 'receipt', ...fresh }), id, ...patch })
  const done = () => {
    if (expense && isEmptyItem(expense)) remove(id)
    onDone()
  }
  // The trip's cities (and this one's), and the money of each with the display currency, EUR and USD.
  const cities = [...new Set([...stops.map((s) => s.cityId), now.at].filter((c) => c !== NO_PLACE))]
  /** Links it to a stay or ticket, or not. */
  const link = (booking: string, on: boolean) => {
    const ids = (live?.bookings ?? []).filter((b) => b !== booking)
    const next = on ? [...ids, booking] : ids
    save({ bookings: next.length ? next : undefined })
  }
  // The stays and tickets it may be for, by day.
  const bookings = Object.values(items).filter((b) => (b.kind === 'stay' || b.kind === 'ticket') && !isEmptyItem(b)).sort((a, b) => (a.from ?? '').localeCompare(b.from ?? ''))
  const currencies = [...new Set([now.currency, ...cities.map((c) => ds.countries[ds.cities[c]?.iso2]?.currency), display, 'EUR', 'USD'].filter((c): c is string => !!c && !!rateOf(c)))]
  const label = 'flex flex-col gap-0.5'
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-canvas p-2.5">
      <label className={label}>
        <span className="text-[11px] text-muted">What for</span>
        <input value={live?.title ?? ''} onChange={(e) => save({ title: e.target.value })} maxLength={ITEM_LIMITS.shortChars} placeholder="Dinner, bus day pass, museum…" className={field} autoFocus={autoFocus} />
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,6rem)] gap-2">
        <label className={label}>
          <span className="text-[11px] text-muted">Amount</span>
          <input
            value={typed} inputMode="decimal" placeholder="0.00" className={field}
            onChange={(e) => {
              setTyped(e.target.value)
              const n = Number(e.target.value.replace(',', '.'))
              if (!e.target.value.trim()) save({ amount: undefined })
              else if (Number.isFinite(n) && n >= 0 && n <= 1e9) save({ amount: Math.round(n * 100) / 100 })
            }}
          />
        </label>
        <label className={label}>
          <span className="text-[11px] text-muted">Currency</span>
          <select value={now.currency ?? ''} onChange={(e) => save({ currency: e.target.value })} className={field}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          <span className="text-[11px] text-muted">Day</span>
          <input type="date" value={now.from ?? ''} onChange={(e) => save({ from: e.target.value })} className={`${field} min-w-0`} />
        </label>
        <label className={label}>
          <span className="text-[11px] text-muted">Where</span>
          <select value={now.at} onChange={(e) => save({ at: e.target.value })} className={`${field} min-w-0`}>
            <option value={NO_PLACE} aria-label="None" />
            {cities.map((c) => <option key={c} value={c}>{cityName(c)}</option>)}
          </select>
        </label>
      </div>
      {bookings.length > 0 && (
        <div className={label}>
          <span className="text-[11px] text-muted">Paid for (several, for a package)</span>
          <ul className="max-h-40 overflow-y-auto rounded-md border border-line bg-panel py-1">
            {bookings.map((b) => {
              const on = !!live?.bookings?.includes(b.id)
              const Icon = b.kind === 'stay' ? BedDouble : Ticket
              return (
                <li key={b.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-[13px] hover:bg-canvas">
                    <input type="checkbox" checked={on} onChange={() => link(b.id, !on)} className="accent-accent" />
                    <Icon size={13} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{bookingName(b)}</span>
                    {b.from && <span className="shrink-0 text-[12px] text-muted">{shortDate(b.from.slice(0, 10))}</span>}
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <label className={label}>
        <span className="text-[11px] text-muted">Note</span>
        <textarea value={live?.text ?? ''} onChange={(e) => save({ text: e.target.value })} maxLength={ITEM_LIMITS.textChars} rows={2} placeholder="What was in it, who paid…" className={`${field} resize-y`} />
      </label>
      <EditorButtons
        onDone={done} onRemove={live ? () => { remove(id); onDone() } : undefined} what="expense"
        visibility={<PublicToggle on={!!live?.public} onChange={(on) => save({ public: on || undefined })} of="receipt" />}
      />
    </div>
  )
}
