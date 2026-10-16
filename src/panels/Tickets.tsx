// The user's tickets for a journey (the trip's items, store/items.ts): each flight, train, bus or ferry booked, with
// its times (each in its place's own time, as the booking gives them), where it leaves from and arrives, the booking
// reference, price and link, and a note (the seat, the baggage). In the journey's panel, on Today, all of them in My
// trip (MyTrip.tsx), and marked by the journey in the itinerary. Added here, by the app's assistant, or by another app's (an AI app reading the user's
// email: worker/mcp.ts). Private, like the rest of My visit.
import { Bus, ExternalLink, Pencil, Plane, Plus, Ship, Ticket, TrainFront } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { isEmptyItem, newItemId, useAllItems, useItems, useItemsAt, type TripItem } from '../store/items'
import { ITEM_LIMITS, NO_PLACE, TICKET_MODES, type TicketMode } from '../store/itemsCore'
import { SHARED_TOKEN } from '../store/shareLink'
import { legKey, useTrip } from '../store/trip'
import { localToday } from '../planner'
import { cityName, dayDate, dayDateNoYear, shortDate } from '../ui/format'
import { AiMark } from '../ui/AiMark'
import { PublicMark, PublicToggle } from '../ui/PublicToggle'
import { Section, Sections } from '../ui/kit'
import { external, host } from '../ui/links'
import { addRecord, useRightPanel } from '../ui/rightPanel'
import { PhotoFill } from './PhotoFill'
import { PaidFor } from './ReceiptLinks'
import { NewRecord, RecordCard, RecordNav, RecordRow, RecordTitle } from './RecordPage'
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
  // (The year once: by the day it arrives, when that's another day of the same year.)
  const sameYear = !!t.to && dayOf(t.to) !== dayOf(t.from) && t.to.slice(0, 4) === t.from?.slice(0, 4)
  const leaves = t.from ? `${(sameYear ? dayDateNoYear : dayDate)(dayOf(t.from))}${timeOf(t.from) && ` ${timeOf(t.from)}`}` : '…'
  const arrives = !t.to ? '' : dayOf(t.to) === dayOf(t.from) ? timeOf(t.to) : `${dayDate(dayOf(t.to))}${timeOf(t.to) && ` ${timeOf(t.to)}`}`
  return arrives ? `${leaves} → ${arrives}` : leaves
}

/** A journey's tickets (`at` its `legKey(from, to)`), each to open and change, and one to add (leaving on `date`);
 *  `hideEmpty`: nothing without any (on Today); `brief`: one journey of many in My trip (added to from its top), only
 *  its title without any; `onOpen`: each a row opening its page in My trip (TicketPage), where one is added too. */
export function Tickets({ at, date, hideEmpty, title = SHARED_TOKEN ? 'Tickets' : 'My tickets', brief, onOpen }: { at: string; date?: string; hideEmpty?: boolean; title?: ReactNode; brief?: boolean; onOpen?: (id: string) => void }) {
  const tickets = [...useItemsAt(at, 'ticket')].sort(byDeparture)
  const [editing, setEditing] = useState<string | null>(null)
  // (A shared trip's page: only those there are, read-only.)
  if ((SHARED_TOKEN || hideEmpty) && !tickets.length) return null
  return (
    <Section
      title={title}
      aside={editing === null && !brief && !SHARED_TOKEN && <button onClick={() => (onOpen ? addRecord('tickets', newItemId('ticket')) : setEditing(newItemId('ticket')))} className={`${small} shrink-0`}><Plus size={12} /> Add a ticket</button>}
    >
      {/* (One of many with none: just its name and Add.) */}
      {(!brief || tickets.length > 0 || editing !== null) && <>
      {tickets.length === 0 && editing === null && (
        <p className="text-[12px] text-muted">Your flight, train, bus or ferry: its times, where it leaves from and the booking ref, kept on this device too, for when there's no connection.</p>
      )}
      {onOpen ? <ul className="flex flex-col">{tickets.map((t) => <TicketRow key={t.id} ticket={t} onOpen={() => onOpen(t.id)} />)}</ul> : <ul className="flex flex-col gap-2">
        {tickets.map((t) => (
          <li key={t.id}>{editing === t.id ? <TicketEditor id={t.id} at={at} date={date} onDone={() => setEditing(null)} /> : <TicketCard ticket={t} onEdit={() => setEditing(t.id)} />}</li>
        ))}
        {editing !== null && !tickets.some((t) => t.id === editing) && (
          <li><TicketEditor id={editing} at={at} date={date} onDone={() => setEditing(null)} autoFocus /></li>
        )}
      </ul>}
      </>}
    </Section>
  )
}

const ticketName = (t: TripItem) => t.title || (t.mode ? MODES[t.mode] : 'A ticket')

function TicketCard({ ticket: t, onEdit }: { ticket: TripItem; onEdit: () => void }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2 text-[13px]">
      <div className="flex items-start gap-2">
        <ModeIcon mode={t.mode} size={15} className="mt-0.5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-medium">{ticketName(t)}<AiMark on={t.ai} /></div>
          {when(t) && <div className="text-[12px] text-muted">{when(t)}</div>}
        </div>
        {/* (Public or not by Edit, as everywhere in My trip.) */}
        <span className="flex shrink-0 items-center gap-1"><PublicMark on={t.public} />{!SHARED_TOKEN && <button onClick={onEdit} className={small} aria-label="Change this ticket"><Pencil size={12} /> Edit</button>}</span>
      </div>
      <TicketFacts ticket={t} className="mt-1.5 pl-[23px] text-[12px]" />
    </div>
  )
}

/** What's kept of a ticket besides its name and times: from and to where, its booking, link, what was paid, note. */
function TicketFacts({ ticket: t, className }: { ticket: TripItem; className: string }) {
  const places = [t.fromPlace, t.toPlace].some(Boolean) && `${t.fromPlace || '…'} → ${t.toPlace || '…'}`
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {places && <div>{places}</div>}
      {t.ref && <div><span className="text-muted">Booking ref </span><span className="font-mono select-all">{t.ref}</span></div>}
      {t.price && <div><span className="text-muted">Price </span>{t.price}</div>}
      {t.url && <a href={t.url} {...external} className="flex items-center gap-1 text-accent hover:underline">{host(t.url)}<ExternalLink size={11} /></a>}
      <PaidFor id={t.id} />
      {t.text && <p className="whitespace-pre-wrap">{t.text}</p>}
    </div>
  )
}

/** A ticket in My trip's list: its name and times, opening its page. */
function TicketRow({ ticket: t, onOpen }: { ticket: TripItem; onOpen: () => void }) {
  return <RecordRow icon={<ModeIcon mode={t.mode} size={15} />} title={ticketName(t)} mark={<AiMark on={t.ai} />} sub={when(t)} isPublic={t.public} onOpen={onOpen} />
}

/** A ticket on its page in My trip: its journey, all of it, and Edit (changed there); `ids`: the list's, for the
 *  tickets before and after it. */
function TicketPage({ ticket: t, ids, legIndex, date }: { ticket: TripItem; ids: string[]; legIndex?: number; date?: string }) {
  const select = useTrip((s) => s.select)
  const setRecord = useRightPanel((s) => s.setRecord)
  const [editing, setEditing] = useState(false)
  const i = ids.indexOf(t.id)
  return (
    <Sections>
      <RecordNav back="All tickets" onBack={() => setRecord('tickets', null)} prev={ids[i - 1]} next={ids[i + 1]} onGo={(id) => setRecord('tickets', id)} prevLabel="Ticket before" nextLabel="Ticket after" at={t.id} />
      <RecordCard
        title={t.at === NO_PLACE ? 'Ticket' : legIndex !== undefined ? <button onClick={() => select({ type: 'leg', index: legIndex })} className="hover:text-ink hover:underline">{journeyName(t.at)}</button> : journeyName(t.at)}
        isPublic={t.public} editing={editing} onEdit={() => setEditing(true)}
      >
        {editing ? <TicketEditor key={t.id} id={t.id} at={t.at} date={date} onDone={() => setEditing(false)} autoFocus /> : (
          <div className="flex flex-col gap-1.5 text-[13px]">
            <RecordTitle mark={<AiMark on={t.ai} />}><ModeIcon mode={t.mode} size={18} className="shrink-0 text-muted" />{ticketName(t)}</RecordTitle>
            {when(t) && <div className="text-muted">{when(t)}</div>}
            <TicketFacts ticket={t} className="mt-1" />
          </div>
        )}
      </RecordCard>
    </Sections>
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
  /** A departure's or arrival's day and time, each typed apart (the time only with a day). The arrival is on the
   *  departure's day until another is given, and a departure moved to another day takes it along. */
  const moment = (k: 'from' | 'to', label: string) => {
    const leaves = live ? live.from : date
    const now = k === 'from' ? leaves : live?.to ?? dayOf(leaves)
    const set = (day: string, time: string) => {
      const at = day ? (time ? `${day}T${time}` : day) : ''
      const follows = k === 'from' && dayOf(live?.to) === dayOf(leaves) && day
      save({ [k]: at, ...(follows && { to: `${day}${timeOf(live?.to) && `T${timeOf(live?.to)}`}` }) })
    }
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
      <EditorButtons
        onDone={done} onRemove={live ? () => { remove(id); onDone() } : undefined} what="ticket"
        visibility={<PublicToggle on={!!live?.public} onChange={(on) => save({ public: on || undefined })} of="booking" />}
      />
    </div>
  )
}

/** My trip's Tickets: the journeys with tickets, in the plan's order (their names open their panels), then those
 *  kept for journeys no longer in it; one to add, on a journey picked (the next one first), or from a photo. */
export function AllTickets() {
  const plan = useTrip((s) => s.plan)
  const select = useTrip((s) => s.select)
  const items = useAllItems()
  const open = useRightPanel((s) => s.records.tickets)
  const setRecord = useRightPanel((s) => s.setRecord)
  // A new one, written on a page of its own until it's done (from Today too).
  const adding = useRightPanel((s) => s.adding.tickets) ?? null
  const setAdding = (id: string | null) => useRightPanel.getState().setAdding('tickets', id)
  if (!plan) return null
  const tickets = Object.values(items).filter((i) => i.kind === 'ticket' && !isEmptyItem(i))
  const legs = plan.legs.map((l, index) => ({ at: legKey(l.from, l.to), index, date: plan.stops[index].depart }))
  const booked = legs.filter((l) => tickets.some((t) => t.at === l.at))
  const others = [...new Set(tickets.map((t) => t.at).filter((at) => !legs.some((l) => l.at === at)))]
  const today = localToday()
  // (The list's order, for a page's tickets before and after it: by journey, then the others.)
  const ids = [...booked.map((l) => l.at), ...others]
    .flatMap((at) => tickets.filter((t) => t.at === at).sort(byDeparture)).map((t) => t.id)
    .filter((id, i, all) => all.indexOf(id) === i)
  if (adding !== null) {
    // (Done: its page, once something is written in it.)
    const done = () => {
      const ticket = items[adding]
      setAdding(null)
      if (ticket && !ticket.deleted && !isEmptyItem(ticket)) setRecord('tickets', adding)
    }
    return (
      <NewRecord back="All tickets" onBack={() => setAdding(null)} title="New ticket">
        <NewTicket id={adding} legs={legs} first={legs.find((l) => l.date >= today) ?? legs[0] ?? NO_LEG} onDone={done} />
      </NewRecord>
    )
  }
  const page = open ? items[open] : undefined
  if (page && !page.deleted && page.kind === 'ticket') {
    const leg = legs.find((l) => l.at === page.at)
    return <TicketPage ticket={page} ids={ids.includes(page.id) ? ids : [page.id]} legIndex={leg?.index} date={leg?.date} />
  }
  const onOpen = (id: string) => setRecord('tickets', id)
  return (
    <Sections>
      <Section
        title={tickets.length ? `${tickets.length} ticket${tickets.length === 1 ? '' : 's'} for ${booked.length} of ${legs.length} journeys` : 'No tickets yet'}
        aside={!SHARED_TOKEN && <span className="flex items-center gap-1"><PhotoFill what="ticket" className={small} /><button onClick={() => setAdding(newItemId('ticket'))} className={`${small} shrink-0`}><Plus size={12} /> Add</button></span>}
      >{null}</Section>
      {booked.map((l) => (
        <Tickets
          key={`${l.index}${l.at}`} at={l.at} date={l.date} brief onOpen={onOpen}
          title={<button onClick={() => select({ type: 'leg', index: l.index })} className="text-left hover:underline">{journeyName(l.at)} <span className="font-normal text-muted">· {shortDate(l.date)}</span></button>}
        />
      ))}
      {others.map((at) => (
        <Tickets
          key={at} at={at} brief onOpen={onOpen}
          title={at === NO_PLACE ? null : <>{journeyName(at)} <span className="font-normal text-muted">· not in this plan</span></>}
        />
      ))}
    </Sections>
  )
}

const journeyName = (at: string) => at.split('>').map(cityName).join(' → ')
/** A journey of the plan; or none (NO_LEG: a ticket kept for the trip, not for any of its journeys). */
type Leg = { at: string; index: number; date?: string }
const NO_LEG: Leg = { at: NO_PLACE, index: -1 }

/** A ticket added in My trip: its journey picked (or none), then written as anywhere else. A journey changed moves it
 *  there (with that journey's day, unless another was given). */
function NewTicket({ id, legs, first, onDone }: { id: string; legs: Leg[]; first: Leg; onDone: () => void }) {
  const [leg, setLeg] = useState(first)
  const ticket = useAllItems()[id] as TripItem | undefined
  const move = (to: Leg) => {
    const day = ticket?.from?.slice(0, 10)
    if (ticket && !ticket.deleted) useItems.getState().put({ id, at: to.at, ...(to.date && (!day || day === leg.date) && { from: to.date }) })
    setLeg(to)
  }
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-0.5">
        <span className="text-[11px] text-muted">Journey</span>
        <select value={leg.index} onChange={(e) => move(legs.find((l) => l.index === Number(e.target.value)) ?? NO_LEG)} className={field}>
          <option value={NO_LEG.index} aria-label="None" />
          {legs.map((l) => <option key={l.index} value={l.index}>{shortDate(l.date!)} · {journeyName(l.at)}</option>)}
        </select>
      </label>
      <TicketEditor key={leg.index} id={id} at={leg.at} date={leg.date} onDone={onDone} autoFocus />
    </div>
  )
}

/** A journey's mark in the itinerary when it has tickets: what they are on hover. */
export function TicketMark({ at }: { at: string }) {
  const tickets = useItemsAt(at, 'ticket').filter((t) => !isEmptyItem(t))
  if (!tickets.length) return null
  const said = [...tickets].sort(byDeparture).map((t) => [t.title || (t.mode ? MODES[t.mode] : 'A ticket'), when(t)].filter(Boolean).join(', ')).join('; ')
  return <span title={said} aria-label={`Booked: ${said}`} className="shrink-0 text-muted"><ModeIcon mode={tickets[0].mode} size={12} /></span>
}
