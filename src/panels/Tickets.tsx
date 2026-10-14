// The user's tickets for a journey (the trip's items, store/items.ts): each flight, train, bus or ferry booked, with
// its times (each in its place's own time, as the booking gives them), where it leaves from and arrives, the booking
// reference, price and link, and a note (the seat, the baggage). In the journey's panel, on Today, and marked by the
// journey in the itinerary. Added here, by the app's assistant, or by another app's (an AI app reading the user's
// email: worker/mcp.ts). Private, like the rest of My visit.
import { Bus, ExternalLink, Pencil, Plane, Plus, Ship, Ticket, TrainFront } from 'lucide-react'
import { useState } from 'react'
import { isEmptyItem, newItemId, useAllItems, useItems, useItemsAt, type TripItem } from '../store/items'
import { ITEM_LIMITS, TICKET_MODES, type TicketMode } from '../store/itemsCore'
import { SHARED_TOKEN } from '../store/shareLink'
import { dayDate } from '../ui/format'
import { Section } from '../ui/kit'
import { external, host } from '../ui/links'
import { EditorButtons, field, small, UrlInput } from './Visit'

const MODES: Record<TicketMode, string> = { flight: 'Flight', train: 'Train', bus: 'Bus', ferry: 'Ferry', other: 'Other' }
/** A ticket's mark: a plane, a train… */
function ModeIcon({ mode, size, className }: { mode?: TicketMode; size: number; className?: string }) {
  switch (mode) {
    case 'flight': return <Plane size={size} className={className} />
    case 'train': return <TrainFront size={size} className={className} />
    case 'bus': return <Bus size={size} className={className} />
    case 'ferry': return <Ship size={size} className={className} />
    default: return <Ticket size={size} className={className} />
  }
}

/** A departure or arrival's day and time ('' without a time). */
const dayOf = (at?: string) => at?.slice(0, 10) ?? ''
const timeOf = (at?: string) => at?.slice(11, 16) ?? ''
const byDeparture = (a: TripItem, b: TripItem) => (a.from ?? '').localeCompare(b.from ?? '')

/** When it leaves and arrives: "Tue 4 May 07:35 → 09:10", the arrival's day too when it's another. */
function when(t: TripItem) {
  if (!t.from && !t.to) return ''
  const leaves = t.from ? `${dayDate(dayOf(t.from))}${timeOf(t.from) && ` ${timeOf(t.from)}`}` : '…'
  const arrives = !t.to ? '' : dayOf(t.to) === dayOf(t.from) ? timeOf(t.to) : `${dayDate(dayOf(t.to))}${timeOf(t.to) && ` ${timeOf(t.to)}`}`
  return arrives ? `${leaves} → ${arrives}` : leaves
}

/** A journey's tickets (`at` its `legKey(from, to)`), each to open and change, and one to add (leaving on `date`);
 *  `hideEmpty`: nothing without any (on Today). */
export function Tickets({ at, date, hideEmpty }: { at: string; date?: string; hideEmpty?: boolean }) {
  const tickets = [...useItemsAt(at, 'ticket')].sort(byDeparture)
  const [editing, setEditing] = useState<string | null>(null)
  if (SHARED_TOKEN || (hideEmpty && !tickets.length)) return null
  return (
    <Section
      title="My tickets"
      aside={editing === null && <button onClick={() => setEditing(newItemId('ticket'))} className={small}><Plus size={12} /> Add a ticket</button>}
    >
      {tickets.length === 0 && editing === null && (
        <p className="text-[12px] text-muted">Your flight, train, bus or ferry: its times, where it leaves from and the booking ref, kept on this device too, for when there's no connection.</p>
      )}
      <ul className="flex flex-col gap-2">
        {tickets.map((t) => (
          <li key={t.id}>{editing === t.id ? <TicketEditor id={t.id} at={at} date={date} onDone={() => setEditing(null)} /> : <TicketCard ticket={t} onEdit={() => setEditing(t.id)} />}</li>
        ))}
        {editing !== null && !tickets.some((t) => t.id === editing) && (
          <li><TicketEditor id={editing} at={at} date={date} onDone={() => setEditing(null)} autoFocus /></li>
        )}
      </ul>
    </Section>
  )
}

function TicketCard({ ticket: t, onEdit }: { ticket: TripItem; onEdit: () => void }) {
  const places = [t.fromPlace, t.toPlace].some(Boolean) && `${t.fromPlace || '…'} → ${t.toPlace || '…'}`
  return (
    <div className="rounded-lg border border-line px-3 py-2 text-[13px]">
      <div className="flex items-start gap-2">
        <ModeIcon mode={t.mode} size={15} className="mt-0.5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{t.title || (t.mode ? MODES[t.mode] : 'A ticket')}</div>
          {when(t) && <div className="text-[12px] text-muted">{when(t)}</div>}
        </div>
        <button onClick={onEdit} className={small} aria-label="Change this ticket"><Pencil size={12} /> Edit</button>
      </div>
      <div className="mt-1.5 flex flex-col gap-1 pl-[23px] text-[12px]">
        {places && <div>{places}</div>}
        {t.ref && <div><span className="text-muted">Booking ref </span><span className="font-mono select-all">{t.ref}</span></div>}
        {t.price && <div><span className="text-muted">Price </span>{t.price}</div>}
        {t.url && <a href={t.url} {...external} className="flex items-center gap-1 text-accent hover:underline">{host(t.url)}<ExternalLink size={11} /></a>}
        {t.text && <p className="whitespace-pre-wrap">{t.text}</p>}
      </div>
    </div>
  )
}

/** A ticket as it's written: saved as it's typed; one left with nothing in it is removed on Done. */
function TicketEditor({ id, at, date, onDone, autoFocus }: { id: string; at: string; date?: string; onDone: () => void; autoFocus?: boolean }) {
  const ticket = useAllItems()[id] as TripItem | undefined
  const { put, remove } = useItems.getState()
  const live = ticket && !ticket.deleted ? ticket : undefined
  // (A new ticket leaves on the journey's day.)
  const save = (patch: Partial<TripItem>) => put({ ...(ticket ? {} : { kind: 'ticket', at, ...(date && { from: date }) }), id, ...patch })
  const done = () => {
    if (ticket && isEmptyItem(ticket)) remove(id)
    onDone()
  }
  const input = (k: 'title' | 'fromPlace' | 'toPlace' | 'ref' | 'price', label: string, placeholder: string) => (
    <label className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted">{label}</span>
      <input value={live?.[k] ?? ''} onChange={(e) => save({ [k]: e.target.value })} maxLength={ITEM_LIMITS.shortChars} placeholder={placeholder} className={field} autoFocus={autoFocus && k === 'title'} />
    </label>
  )
  /** A departure's or arrival's day and time, each typed apart (the time only with a day). */
  const moment = (k: 'from' | 'to', label: string) => {
    const now = live ? live[k] : k === 'from' ? date : undefined
    const set = (day: string, time: string) => save({ [k]: day ? (time ? `${day}T${time}` : day) : '' })
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] text-muted">{label}</span>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,7rem)] gap-1">
          <input type="date" value={dayOf(now)} onChange={(e) => set(e.target.value, timeOf(now))} aria-label={`${label}: day`} className={`${field} min-w-0`} />
          <input type="time" value={timeOf(now)} disabled={!dayOf(now)} onChange={(e) => set(dayOf(now), e.target.value)} aria-label={`${label}: time`} className={`${field} min-w-0 disabled:opacity-50`} />
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-canvas p-2.5">
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="How">
        {TICKET_MODES.map((m) => {
          const on = live?.mode === m
          return (
            <button key={m} role="radio" aria-checked={on} onClick={() => save({ mode: on ? undefined : m })}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}>
              <ModeIcon mode={m} size={12} /> {MODES[m]}
            </button>
          )
        })}
      </div>
      {input('title', 'Carrier and number', 'LOT LO 335, Railjet 73…')}
      {moment('from', 'Leaves (local time)')}
      {moment('to', 'Arrives (local time)')}
      <div className="grid grid-cols-2 gap-2">
        {input('fromPlace', 'From', 'Airport, station, port')}
        {input('toPlace', 'To', 'Airport, station, port')}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {input('ref', 'Booking ref', 'ABC123')}
        {input('price', 'Price', '€84, paid')}
      </div>
      <UrlInput value={live?.url ?? ''} onChange={(url) => save({ url })} label="Booking link" />
      <label className="flex flex-col gap-0.5">
        <span className="text-[11px] text-muted">Note</span>
        <textarea value={live?.text ?? ''} onChange={(e) => save({ text: e.target.value })} maxLength={ITEM_LIMITS.textChars} rows={2} placeholder="Seat, baggage, terminal, check-in closes…" className={`${field} resize-y`} />
      </label>
      <EditorButtons onDone={done} onRemove={live ? () => { remove(id); onDone() } : undefined} what="ticket" />
    </div>
  )
}

/** A journey's mark in the itinerary when it has tickets: what they are on hover. */
export function TicketMark({ at }: { at: string }) {
  const tickets = useItemsAt(at, 'ticket').filter((t) => !isEmptyItem(t))
  if (SHARED_TOKEN || !tickets.length) return null
  const said = [...tickets].sort(byDeparture).map((t) => [t.title || (t.mode ? MODES[t.mode] : 'A ticket'), when(t)].filter(Boolean).join(', ')).join('; ')
  return <span title={said} aria-label={`Booked: ${said}`} className="shrink-0 text-muted"><ModeIcon mode={tickets[0].mode} size={12} /></span>
}
