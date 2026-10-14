// What the user keeps for a city (the trip's items, store/items.ts): where they stay, photo albums and links, with
// their notes, in the city panel's "My visit" tab; tonight's stay on Today; a stop's stay and album by it in the
// itinerary, and its album in the journal. Kept per city for the trip (whichever plan), also on a read-only trip, and
// private (never in a shared trip). A stay carries its dates, so two visits to a city each show theirs. A link to a
// social post can show the post (PostPreview.tsx). A journey's tickets are in Tickets.tsx.
import { BedDouble, Camera, Check, ExternalLink, Link2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { localToday, type ScheduledStop } from '../planner'
import { isEmptyItem, newItemId, useAllItems, useItems, useItemsAt, webUrl, type Items, type TripItem } from '../store/items'
import { ITEM_LIMITS } from '../store/itemsCore'
import { SHARED_TOKEN } from '../store/shareLink'
import { useTrip } from '../store/trip'
import { cityName, dayDate } from '../ui/format'
import { Section } from '../ui/kit'
import { external, host } from '../ui/links'
import { AiHelp } from './AiHelp'
import { NoteBox } from './Notes'
import { PostPreview } from './PostPreview'
import { socialPost } from './socialPost'

/** Whether a stay is for a stop's visit (one without dates is for every visit). */
const stayCovers = (stay: TripItem, stop: Pick<ScheduledStop, 'arrive' | 'depart'>) =>
  (!stay.from || stay.from < stop.depart) && (!stay.to || stay.to > stop.arrive)
/** The night of `date` is spent there. */
const stayOn = (stay: TripItem, date: string) => (!stay.from || stay.from <= date) && (!stay.to || date < stay.to)

const byDate = (a: TripItem, b: TripItem) => (a.from ?? '').localeCompare(b.from ?? '')
/** A link's name when it has no title: the post's network ("Instagram post"), or the site. */
const linkName = (url: string) => {
  const post = socialPost(url)
  return post ? `${post.platform} ${post.ratio ? 'video' : 'post'}` : host(url)
}
const mapUrl = (stay: TripItem) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([stay.title, stay.address, cityName(stay.at)].filter(Boolean).join(', '))}`

export const field = 'w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-[13px] outline-none focus:border-accent max-md:!text-[16px]'
export const small = 'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft'

/** The city panel's "My visit" tab: stays, photo albums, links and notes. */
export function VisitTab({ cityId }: { cityId: string }) {
  const dates = useVisitDates(cityId)
  if (SHARED_TOKEN) return null
  return (
    <>
      <Stays cityId={cityId} dates={dates} />
      <LinkList cityId={cityId} kind="album" />
      <LinkList cityId={cityId} kind="link" />
      <NoteBox at={cityId} tall placeholder={`Anything else to remember about ${cityName(cityId)}: a friend's number, places to try…`} />
    </>
  )
}

/** The dates a new stay starts with: the city's next visit in the plan (or its last). */
function useVisitDates(cityId: string): Pick<TripItem, 'from' | 'to'> {
  const stops = useTrip((s) => s.plan?.stops)
  const today = localToday()
  const visits = stops?.filter((s) => s.cityId === cityId) ?? []
  const visit = visits.find((s) => s.depart > today) ?? visits.at(-1)
  return visit ? { from: visit.arrive, to: visit.depart } : {}
}

/** The city's stays (those `shown`), each to open and change, and one to add (starting with `dates`); `ai`: with
 *  Update with AI (not on Today). */
function Stays({ cityId, shown, dates, title = 'Where I stay', ai = true }: { cityId: string; shown?: (s: TripItem) => boolean; dates: Pick<TripItem, 'from' | 'to'>; title?: string; ai?: boolean }) {
  const all = useItemsAt(cityId, 'stay')
  const stays = (shown ? all.filter(shown) : [...all]).sort(byDate)
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <Section
      title={title}
      action={ai && <AiHelp topic="stay" place={cityName(cityId)} />}
      aside={editing === null && <button onClick={() => setEditing(newItemId('stay'))} className={small}><Plus size={12} /> Add a stay</button>}
    >
      {stays.length === 0 && editing === null && (
        <p className="text-[12px] text-muted">The hotel, hostel or flat: its address, booking and dates, kept on this device too, for when there's no connection.</p>
      )}
      <ul className="flex flex-col gap-2">
        {stays.map((s) => (
          <li key={s.id}>{editing === s.id ? <StayEditor id={s.id} cityId={cityId} dates={dates} onDone={() => setEditing(null)} /> : <StayCard stay={s} onEdit={() => setEditing(s.id)} />}</li>
        ))}
        {editing !== null && !stays.some((s) => s.id === editing) && (
          <li><StayEditor id={editing} cityId={cityId} dates={dates} onDone={() => setEditing(null)} autoFocus /></li>
        )}
      </ul>
    </Section>
  )
}

function StayCard({ stay, onEdit }: { stay: TripItem; onEdit: () => void }) {
  const nights = stay.from && stay.to ? Math.round((Date.parse(stay.to) - Date.parse(stay.from)) / 86_400_000) : null
  return (
    <div className="rounded-lg border border-line px-3 py-2 text-[13px]">
      <div className="flex items-start gap-2">
        <BedDouble size={15} className="mt-0.5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{stay.title || 'A stay'}</div>
          {(stay.from || stay.to) && (
            <div className="text-[12px] text-muted">
              {stay.from ? dayDate(stay.from) : '…'} → {stay.to ? dayDate(stay.to) : '…'}
              {nights !== null && nights > 0 && ` · ${nights} night${nights === 1 ? '' : 's'}`}
            </div>
          )}
        </div>
        <button onClick={onEdit} className={small} aria-label="Change this stay"><Pencil size={12} /> Edit</button>
      </div>
      <div className="mt-1.5 flex flex-col gap-1 pl-[23px] text-[12px]">
        {stay.address && (
          <a href={mapUrl(stay)} {...external} className="flex items-start gap-1 text-accent hover:underline">
            <MapPin size={12} className="mt-0.5 shrink-0" /><span>{stay.address}</span>
          </a>
        )}
        {stay.ref && <div><span className="text-muted">Booking ref </span><span className="font-mono select-all">{stay.ref}</span></div>}
        {stay.price && <div><span className="text-muted">Price </span>{stay.price}</div>}
        {stay.url && <a href={stay.url} {...external} className="flex items-center gap-1 text-accent hover:underline">{host(stay.url)}<ExternalLink size={11} /></a>}
        {stay.text && <p className="whitespace-pre-wrap">{stay.text}</p>}
      </div>
    </div>
  )
}

/** A stay as it's written: saved as it's typed; one left with nothing in it is removed on Done. */
function StayEditor({ id, cityId, dates, onDone, autoFocus }: { id: string; cityId: string; dates: Pick<TripItem, 'from' | 'to'>; onDone: () => void; autoFocus?: boolean }) {
  const stay = useAllItems()[id] as TripItem | undefined
  const { put, remove } = useItems.getState()
  // (A new stay starts with the visit's dates.)
  const value = (k: keyof TripItem) => ((stay && !stay.deleted ? stay[k] : k === 'from' || k === 'to' ? dates[k] : '') ?? '') as string
  const save = (patch: Partial<TripItem>) => put({ ...(stay ? {} : { kind: 'stay', at: cityId, ...dates }), id, ...patch })
  const done = () => {
    if (stay && isEmptyItem(stay)) remove(id)
    onDone()
  }
  const input = (k: 'title' | 'address' | 'ref' | 'price', label: string, placeholder: string, more?: string) => (
    <label className={`flex flex-col gap-0.5 ${more ?? ''}`}>
      <span className="text-[11px] text-muted">{label}</span>
      <input value={value(k)} onChange={(e) => save({ [k]: e.target.value })} maxLength={ITEM_LIMITS.shortChars} placeholder={placeholder} className={field} autoFocus={autoFocus && k === 'title'} />
    </label>
  )
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-canvas p-2.5">
      {input('title', 'Name', 'Hostel, hotel, flat…')}
      {input('address', 'Address', 'Street, number')}
      <div className="grid grid-cols-2 gap-2">
        {(['from', 'to'] as const).map((k) => (
          <label key={k} className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted">{k === 'from' ? 'Check-in' : 'Check-out'}</span>
            <input type="date" value={value(k)} onChange={(e) => save({ [k]: e.target.value })} className={field} />
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {input('ref', 'Booking ref', 'ABC123')}
        {input('price', 'Price', '€84, paid')}
      </div>
      <UrlInput value={value('url')} onChange={(url) => save({ url })} label="Booking link" />
      <label className="flex flex-col gap-0.5">
        <span className="text-[11px] text-muted">Note</span>
        <textarea value={value('text')} onChange={(e) => save({ text: e.target.value })} maxLength={ITEM_LIMITS.textChars} rows={2} placeholder="Door code, wifi, check-in from 14:00…" className={`${field} resize-y`} />
      </label>
      <EditorButtons onDone={done} onRemove={stay && !stay.deleted ? () => { remove(id); onDone() } : undefined} what="stay" />
    </div>
  )
}

/** A link field: kept as typed while typing, saved once it's a web address (https:// added when missing). */
export function UrlInput({ value, onChange, label, autoFocus }: { value: string; onChange: (url: string) => void; label: string; autoFocus?: boolean }) {
  const [typed, setTyped] = useState(value)
  const bad = typed.trim() !== '' && !webUrl(typed)
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted">{label}</span>
      <input
        type="url" inputMode="url" value={typed} autoFocus={autoFocus} placeholder="https://…" maxLength={ITEM_LIMITS.urlChars}
        onChange={(e) => {
          setTyped(e.target.value)
          const url = webUrl(e.target.value)
          if (url || !e.target.value.trim()) onChange(url)
        }}
        className={`${field} ${bad ? '!border-danger' : ''}`}
      />
    </label>
  )
}

export function EditorButtons({ onDone, onRemove, what }: { onDone: () => void; onRemove?: () => void; what: string }) {
  return (
    <div className="flex items-center justify-between">
      {onRemove ? <button onClick={onRemove} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-danger hover:bg-danger/10"><Trash2 size={12} /> Remove this {what}</button> : <span />}
      <button onClick={onDone} className={small}><Check size={12} /> Done</button>
    </div>
  )
}

const LIST = {
  album: { title: 'Photos', add: 'Add an album', icon: Camera, empty: 'A Google Photos (or any) album\'s share link, to open from here, the itinerary and the journal.', placeholder: 'Album name (optional)' },
  link: { title: 'Links', add: 'Add a link', icon: Link2, empty: 'Tours, tickets, restaurants, a saved Maps list, posts and videos (Instagram, Threads, Facebook, X, TikTok, YouTube) to see here…', placeholder: 'What it is' },
} as const

/** The city's photo albums or links: each opens in a new tab, to change by its pencil. */
function LinkList({ cityId, kind }: { cityId: string; kind: 'album' | 'link' }) {
  const items = useItemsAt(cityId, kind)
  const [editing, setEditing] = useState<string | null>(null)
  const { title, add, icon: Icon, empty } = LIST[kind]
  return (
    <Section
      title={title}
      aside={editing === null && <button onClick={() => setEditing(newItemId(kind))} className={small}><Plus size={12} /> {add}</button>}
    >
      {items.length === 0 && editing === null && <p className="text-[12px] text-muted">{empty}</p>}
      <ul className="flex flex-col gap-1">
        {items.map((i) => (
          <li key={i.id}>
            {editing === i.id ? <LinkEditor id={i.id} cityId={cityId} kind={kind} onDone={() => setEditing(null)} /> : (
              <>
                <div className="flex items-center gap-2 text-[13px]">
                  <Icon size={14} className="shrink-0 text-muted" />
                  {i.url
                    ? <a href={i.url} {...external} className="flex min-w-0 flex-1 items-center gap-1 text-accent hover:underline"><span className="truncate">{i.title || linkName(i.url)}</span><ExternalLink size={11} className="shrink-0" /></a>
                    : <span className="min-w-0 flex-1 truncate">{i.title}</span>}
                  <button onClick={() => setEditing(i.id)} className={small} aria-label={`Change ${i.title || 'this link'}`}><Pencil size={12} /></button>
                </div>
                {kind === 'link' && i.url && <PostPreview url={i.url} />}
              </>
            )}
          </li>
        ))}
        {editing !== null && !items.some((i) => i.id === editing) && (
          <li><LinkEditor id={editing} cityId={cityId} kind={kind} onDone={() => setEditing(null)} autoFocus /></li>
        )}
      </ul>
    </Section>
  )
}

function LinkEditor({ id, cityId, kind, onDone, autoFocus }: { id: string; cityId: string; kind: 'album' | 'link'; onDone: () => void; autoFocus?: boolean }) {
  const item = useAllItems()[id] as TripItem | undefined
  const { put, remove } = useItems.getState()
  const live = item && !item.deleted ? item : undefined
  const save = (patch: Partial<TripItem>) => put({ ...(item ? {} : { kind, at: cityId }), id, ...patch })
  const done = () => {
    if (item && isEmptyItem(item)) remove(id)
    onDone()
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-canvas p-2.5">
      <UrlInput value={live?.url ?? ''} onChange={(url) => save({ url })} label="Link" autoFocus={autoFocus} />
      <label className="flex flex-col gap-0.5">
        <span className="text-[11px] text-muted">Title</span>
        <input value={live?.title ?? ''} onChange={(e) => save({ title: e.target.value })} maxLength={ITEM_LIMITS.shortChars} placeholder={LIST[kind].placeholder} className={field} />
      </label>
      <EditorButtons onDone={done} onRemove={live ? () => { remove(id); onDone() } : undefined} what={kind === 'album' ? 'album' : 'link'} />
    </div>
  )
}

/** Today's card: where tonight is spent (the stop's stays for tonight), or a way to add it (with the stop's dates). */
export function TonightStay({ stop, today }: { stop: ScheduledStop; today: string }) {
  if (SHARED_TOKEN) return null
  return <Stays cityId={stop.cityId} shown={(s) => stayOn(s, today)} dates={{ from: stop.arrive, to: stop.depart }} title="Tonight's stay" ai={false} />
}

/** A stop's marks in the itinerary: its stay (the name on hover) and its photo albums (each opens). */
export function VisitMarks({ stop }: { stop: ScheduledStop }) {
  const items = useAllItems()
  if (SHARED_TOKEN) return null
  const stays = stayNames(items, stop)
  const albums = albumsAt(items, stop.cityId)
  return (
    <>
      {stays && <span title={stays} aria-label={`Staying at ${stays}`} className="shrink-0 text-muted"><BedDouble size={12} /></span>}
      {albums.map((a) => (
        <a key={a.id} href={a.url} {...external} onClick={(e) => e.stopPropagation()} title={a.title ? `Photos: ${a.title}` : 'Photos'} aria-label="Open the photos" className="shrink-0 text-muted hover:text-ink">
          <Camera size={12} />
        </a>
      ))}
    </>
  )
}

const stayNames = (items: Items, stop: ScheduledStop) =>
  Object.values(items).filter((i) => i.kind === 'stay' && i.at === stop.cityId && !isEmptyItem(i) && stayCovers(i, stop)).map((i) => i.title || 'A stay').join(', ')
const albumsAt = (items: Items, cityId: string) => Object.values(items).filter((i) => i.kind === 'album' && i.at === cityId && !i.deleted && i.url)

/** A city's photo albums as links ("Photos ↗"), e.g. in the journal. */
export function AlbumLinks({ cityId }: { cityId: string }) {
  const albums = useItemsAt(cityId, 'album').filter((a) => a.url)
  if (!albums.length || SHARED_TOKEN) return null
  return (
    <>
      {albums.map((a) => (
        <a key={a.id} href={a.url} {...external} className="ml-2 inline-flex items-center gap-0.5 text-[11px] font-normal text-accent hover:underline">
          <Camera size={11} />{a.title || 'Photos'}<ExternalLink size={10} />
        </a>
      ))}
    </>
  )
}
