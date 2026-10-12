// The trip's journal (PLAN.md §14.4, store/journal.ts): a day's highlight, a few lines and a rating, written from Today
// or any day so far in the Itinerary's Journal. Saved on this device as it's typed, and sent to the account when there's
// a connection; also on a read-only trip (the journal isn't the plan), never in a shared one.
import { BookOpen, ChevronRight, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addDays, localToday, tripDay, type ScheduledStop } from '../planner'
import { isEmptyEntry, useDayEntry, useJournal, type Journal } from '../store/journal'
import { JOURNAL_LIMITS } from '../store/journalCore'
import { useSaved } from '../store/saved'
import { useTrip } from '../store/trip'
import { cityName, dayDate, flag, shortDate } from '../ui/format'
import { Section } from '../ui/kit'
import { AlbumLinks } from './Visit'
import { useOnline } from '../ui/useOnline'
import { dataset as ds } from '../data/dataset'

/** The stop where the night of `date` is spent, if any (none on a night on the way, or before the first stop). */
export const nightStop = (stops: ScheduledStop[], date: string) => stops.find((s) => s.arrive <= date && date < s.depart) ?? null

const firstLine = (text: string) => text.trim().split('\n')[0]
const NO_ENTRIES: Journal = {}

/** Opens the Itinerary's Journal, at a stop's days (`focus`: its first day). */
export function useOpenJournal() {
  const setView = useJournal((s) => s.setView)
  const setPanel = useTrip((s) => s.setPanel)
  return (focus?: string) => {
    setView({ journal: true, focus })
    setPanel('itinerary')
  }
}

/** A day's entry, as it's written: its highlight, a few lines and a rating (1–5, again to clear). */
export function DayEditor({ date, autoFocus }: { date: string; autoFocus?: boolean }) {
  const entry = useJournal((s) => s.books[s.key]?.entries[date])
  const write = useJournal((s) => s.write)
  const stops = useTrip((s) => s.plan?.stops)
  const save = (patch: Parameters<typeof write>[1]) => write(date, { cityId: nightStop(stops ?? [], date)?.cityId, ...patch })
  const text = entry?.text ?? ''
  // (16px on a phone: smaller, iOS zooms the page in to type.)
  const field = 'w-full rounded-md border border-line bg-panel px-2.5 py-1.5 outline-none focus:border-accent max-md:!text-[16px]'
  return (
    <div className="flex flex-col gap-2">
      <input
        value={entry?.highlight ?? ''} onChange={(e) => save({ highlight: e.target.value })} maxLength={JOURNAL_LIMITS.highlightChars}
        autoFocus={autoFocus} placeholder="The day's highlight" aria-label="The day's highlight" className={`${field} text-[13px] font-medium`}
      />
      <textarea
        value={text} onChange={(e) => save({ text: e.target.value })} maxLength={JOURNAL_LIMITS.textChars}
        rows={Math.min(14, Math.max(3, text.split('\n').length + 1))}
        placeholder="How was the day? Where you went, who you met, what you ate…" aria-label="The day" className={`${field} resize-y text-[13px]`}
      />
      <div className="flex items-center justify-between gap-2">
        <Stars value={entry?.rating} onChange={(rating) => save({ rating: rating === entry?.rating ? undefined : rating })} />
        <SaveState date={date} />
      </div>
    </div>
  )
}

function Stars({ value, onChange, small }: { value?: number; onChange?: (n: 1 | 2 | 3 | 4 | 5) => void; small?: boolean }) {
  const size = small ? 11 : 18
  return (
    <span className="flex items-center" role={onChange ? 'radiogroup' : undefined} aria-label={onChange ? 'How was the day' : `${value} of 5`}>
      {([1, 2, 3, 4, 5] as const).map((n) => {
        const star = <Star size={size} className={n <= (value ?? 0) ? 'fill-warn text-warn' : 'text-line'} />
        return onChange
          ? <button key={n} role="radio" aria-checked={value === n} aria-label={`${n} of 5`} onClick={() => onChange(n)} className="rounded p-0.5 hover:bg-canvas">{star}</button>
          : <span key={n} aria-hidden>{star}</span>
      })}
    </span>
  )
}

/** Where the day's entry is: saved to the account, being sent, kept on this device until there's a connection, or in
 *  this browser only (signed out). */
function SaveState({ date }: { date: string }) {
  const written = useJournal((s) => !!s.books[s.key]?.entries[date])
  const pending = useJournal((s) => !!s.books[s.key]?.pending.includes(date))
  const problem = useJournal((s) => s.problem)
  const signedIn = useSaved((s) => !!s.activeId)
  const online = useOnline()
  if (!written) return null
  const text = !signedIn ? 'Saved in this browser' : !pending ? 'Saved' : !online ? 'Offline · saved on this device' : problem ? `Saved on this device · ${problem}` : 'Saving…'
  return <span className="truncate text-[11px] text-muted" role="status">{text}</span>
}

/** Today's card: today's entry (or yesterday's, when that's not written yet), and the way to every day. */
export function TodayEntry({ today }: { today: string }) {
  const start = useTrip((s) => s.input.startDate)
  const yesterday = addDays(today, -1)
  const [date, setDate] = useState(today)
  const yesterdayWritten = !!useDayEntry(yesterday)
  const openJournal = useOpenJournal()
  const link = 'text-[12px] text-accent hover:underline'
  return (
    <Section
      title={date === today ? "Today's entry" : `Yesterday · ${dayDate(yesterday)}`}
      aside={<button onClick={() => openJournal()} className={`flex items-center ${link}`}>All days<ChevronRight size={14} /></button>}
    >
      <DayEditor key={date} date={date} />
      {yesterday >= start && (date !== today
        ? <button onClick={() => setDate(today)} className={`mt-2 ${link}`}>Back to today</button>
        : !yesterdayWritten && <button onClick={() => setDate(yesterday)} className={`mt-2 ${link}`}>Yesterday isn't written yet: write it</button>)}
    </Section>
  )
}

/** The Itinerary's Journal: every day of the trip so far, newest first, under the stop where its night was; a day
 *  opens to write it. */
export function JournalView() {
  const { plan, input } = useTrip()
  const entries = useJournal((s) => s.books[s.key]?.entries ?? NO_ENTRIES)
  const { view, setView } = useJournal()
  const [open, setOpen] = useState<string | null>(null)
  const today = localToday()

  // Brought to a stop's days (from its mark in the stops).
  useEffect(() => {
    if (!view.focus) return
    document.getElementById(`journal-${view.focus}`)?.scrollIntoView({ block: 'start' })
    setView({ journal: true })
  }, [view.focus, setView])

  if (!plan) return null
  if (!input.startDate || today < input.startDate) {
    return <p className="px-4 py-6 text-[13px] text-muted">The journal starts on the trip's first day, {dayDate(input.startDate)}: a few lines each day, kept on this device first, so a bad connection loses nothing.</p>
  }
  const last = today < input.endDate ? today : input.endDate
  const days: string[] = []
  for (let d = last; d >= input.startDate; d = addDays(d, -1)) days.push(d)
  // Consecutive days at the same stop, together.
  const groups: { stop: ScheduledStop | null; days: string[] }[] = []
  for (const d of days) {
    const stop = nightStop(plan.stops, d)
    const g = groups.at(-1)
    if (g && g.stop === stop) g.days.push(d)
    else groups.push({ stop, days: [d] })
  }
  const written = days.filter((d) => !isEmptyEntry(entries[d])).length

  return (
    <div className="px-2 pb-6">
      <p className="px-2 pb-2 text-[12px] text-muted">
        {written} of {days.length} day{days.length === 1 ? '' : 's'} written · only you see this
      </p>
      {groups.map((g) => (
        <section key={g.days[0]} id={g.stop ? `journal-${g.stop.arrive}` : undefined} className="mb-2 scroll-mt-2">
          <h3 className="px-2 py-1 text-[12px] font-semibold">
            {g.stop ? <>{flag(ds.cities[g.stop.cityId].iso2)} {cityName(g.stop.cityId)}</> : 'On the way'}
            <span className="font-normal text-muted"> · {shortDate(g.days.at(-1)!)}{g.days.length > 1 && ` – ${shortDate(g.days[0])}`}</span>
            {g.stop && <AlbumLinks cityId={g.stop.cityId} />}
          </h3>
          <ol>
            {g.days.map((d) => (
              <DayRow key={d} date={d} day={tripDay(input.startDate, d)} open={open === d} onToggle={() => setOpen(open === d ? null : d)} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

function DayRow({ date, day, open, onToggle }: { date: string; day: number; open: boolean; onToggle: () => void }) {
  const e = useDayEntry(date)
  const lead = e ? e.highlight.trim() || firstLine(e.text) : ''
  return (
    <li className={open ? 'rounded-lg bg-canvas' : ''}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-canvas">
        <span className="w-16 shrink-0 pt-px text-[11px] leading-tight text-muted">{dayDate(date)}<br />Day {day}</span>
        <span className="min-w-0 flex-1">
          {e ? (
            <>
              <span className="block truncate text-[13px] font-medium">{lead || '—'}</span>
              {e.highlight.trim() && e.text.trim() && <span className="block truncate text-[12px] text-muted">{firstLine(e.text)}</span>}
            </>
          ) : <span className="text-[13px] text-muted">Not written</span>}
        </span>
        {e?.rating && <span className="pt-1"><Stars value={e.rating} small /></span>}
      </button>
      {open && <div className="px-2 pt-1 pb-3"><DayEditor date={date} autoFocus={!e} /></div>}
    </li>
  )
}

/** A mark by a stop in the itinerary with days written there: how many; opens them in the Journal. */
export function JournalMark({ stop }: { stop: ScheduledStop }) {
  const count = useJournal((s) => {
    const entries = s.books[s.key]?.entries ?? NO_ENTRIES
    let n = 0
    for (let d = stop.arrive; d < stop.depart; d = addDays(d, 1)) if (!isEmptyEntry(entries[d])) n++
    return n
  })
  const openJournal = useOpenJournal()
  if (!count) return null
  return (
    <button
      onClick={(e) => { e.stopPropagation(); openJournal(stop.arrive) }}
      title={`${count} day${count === 1 ? '' : 's'} written here: open the journal`} aria-label="Open the journal here"
      className="flex shrink-0 items-center gap-0.5 rounded px-0.5 text-[11px] font-normal text-muted hover:text-ink"
    >
      <BookOpen size={12} />{count}
    </button>
  )
}
