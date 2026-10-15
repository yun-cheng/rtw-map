// The trip's journal (PLAN.md §14.4, store/journal.ts): a day's highlight, its story (Markdown, styled as it's typed)
// and a rating, written from Today or any day so far in My trip's Daily (MyTrip.tsx). Saved on this device as it's
// typed, and sent to the account when there's a connection; also on a read-only trip (the journal isn't the plan); on
// a shared trip's page, only the days made public, read-only.
import { BookOpen, Check, ChevronRight, Plus, Star } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { addDays, localToday, tripDay, type ScheduledStop } from '../planner'
import { isEmptyEntry, useDayEntry, useJournal, useJournalEntries } from '../store/journal'
import { SHARED_TOKEN } from '../store/shareLink'
import { PublicMark, PublicToggle } from '../ui/PublicToggle'
import { JOURNAL_LIMITS } from '../store/journalCore'
import { useSaved } from '../store/saved'
import { useTrip } from '../store/trip'
import { cityName, dayDate, flag, shortDate } from '../ui/format'
import { Section, Sections } from '../ui/kit'
import { AlbumLinks } from './Visit'
import { useOnline } from '../ui/useOnline'
import { useRightPanel } from '../ui/rightPanel'
import { dataset as ds } from '../data/dataset'
import { plainLines } from './noteText'

const MarkdownEditor = lazy(() => import('./MarkdownEditor'))
const NoteMarkdown = lazy(() => import('./NoteMarkdown'))

/** The stop where the night of `date` is spent, if any (none on a night on the way, or before the first stop). */
export const nightStop = (stops: ScheduledStop[], date: string) => stops.find((s) => s.arrive <= date && date < s.depart) ?? null

/** Opens the journal, My trip's Daily (closing a city's or journey's panel open in its place), at a stop's days
 *  (`focus`: its first day). */
export function useOpenJournal() {
  const setView = useJournal((s) => s.setView)
  return (focus?: string) => {
    setView({ focus })
    useTrip.getState().select(null)
    useRightPanel.getState().show('daily')
  }
}

/** A day's entry, as it's written: its highlight, its story and a rating (1–5, again to clear). */
export function DayEditor({ date, autoFocus }: { date: string; autoFocus?: boolean }) {
  const entry = useJournal((s) => s.books[s.key]?.entries[date])
  const write = useJournal((s) => s.write)
  const stops = useTrip((s) => s.plan?.stops)
  const save = (patch: Parameters<typeof write>[1]) => write(date, { cityId: nightStop(stops ?? [], date)?.cityId, ...patch })
  return (
    <div className="flex flex-col gap-2">
      <input
        value={entry?.highlight ?? ''} onChange={(e) => save({ highlight: e.target.value })} maxLength={JOURNAL_LIMITS.highlightChars}
        autoFocus={autoFocus} placeholder="The day's highlight" aria-label="The day's highlight"
        // (16px on a phone: smaller, iOS zooms the page in to type.)
        className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-[13px] font-medium outline-none focus:border-accent max-md:!text-[16px]"
      />
      <Suspense fallback={<div className="min-h-[97px] rounded-md border border-line bg-panel" />}>
        <MarkdownEditor
          value={entry?.text ?? ''} onChange={(text) => save({ text })} max={JOURNAL_LIMITS.textChars}
          placeholder="How was the day? Where you went, who you met, what you ate…" label="The day"
        />
      </Suspense>
      <div className="flex items-center justify-between gap-2">
        <Stars value={entry?.rating} onChange={(rating) => save({ rating: rating === entry?.rating ? undefined : rating })} />
        <span className="flex min-w-0 items-center gap-1">
          <SaveState date={date} />
          {!isEmptyEntry(entry) && <PublicToggle on={!!entry?.public} onChange={(on) => save({ public: on || undefined })} />}
        </span>
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

/** The journal, My trip's Daily: the days of the trip so far that are written, newest first, under the stop where
 *  their night was, each opening to change it; and one to add (today first). */
export function JournalView() {
  const { plan, input, select } = useTrip()
  const entries = useJournalEntries()
  const { view, setView } = useJournal()
  const [open, setOpen] = useState<string | null>(null)
  // The day being added, written at the top until it's done.
  const [adding, setAdding] = useState<string | null>(null)
  const today = localToday()

  // Brought to a stop's days (from its mark in the stops).
  useEffect(() => {
    if (!view.focus) return
    document.getElementById(`journal-${view.focus}`)?.scrollIntoView({ block: 'start' })
    setView({})
  }, [view.focus, setView])

  if (!plan) return null
  if (!input.startDate || today < input.startDate) {
    return <Sections><Section title="No days yet"><p className="text-[12px] text-muted">The journal starts on the trip's first day, {dayDate(input.startDate)}.</p></Section></Sections>
  }
  const last = today < input.endDate ? today : input.endDate
  const all: string[] = []
  for (let d = last; d >= input.startDate; d = addDays(d, -1)) all.push(d)
  const days = all.filter((d) => !isEmptyEntry(entries[d]) && d !== adding)
  // Consecutive days at the same stop, together.
  const groups: { stop: ScheduledStop | null; days: string[] }[] = []
  for (const d of days) {
    const stop = nightStop(plan.stops, d)
    const g = groups.at(-1)
    if (g && g.stop === stop) g.days.push(d)
    else groups.push({ stop, days: [d] })
  }
  const written = all.filter((d) => !isEmptyEntry(entries[d])).length

  // (Cards, as My trip's other tabs: the count and Add on top, then each stop's days.)
  return (
    <Sections>
      <Section
        title={written ? `${written} of ${all.length} day${all.length === 1 ? '' : 's'} written` : 'No days written yet'}
        aside={adding === null && !SHARED_TOKEN && (
          <button onClick={() => setAdding(last)} className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft"><Plus size={12} /> Add</button>
        )}
      >
      {adding !== null && (
        <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-canvas p-2.5">
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted">Day</span>
            <input
              type="date" value={adding} min={input.startDate} max={last} onChange={(e) => e.target.value && setAdding(e.target.value)}
              className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-[13px] outline-none focus:border-accent max-md:!text-[16px]"
            />
          </label>
          <DayEditor key={adding} date={adding} autoFocus />
          <button onClick={() => setAdding(null)} className="flex items-center gap-1 self-end rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft"><Check size={12} /> Done</button>
        </div>
      )}
      </Section>
      {groups.map((g) => (
        // (Its id: brought into view from the stop's mark in the itinerary.)
        <div key={g.days[0]} id={g.stop ? `journal-${g.stop.arrive}` : undefined} className="scroll-mt-3">
          <Section
            title={<>
              {g.stop
                ? <button onClick={() => select({ type: 'city', id: g.stop!.cityId })} className="text-left hover:underline">{flag(ds.cities[g.stop.cityId].iso2)} {cityName(g.stop.cityId)}</button>
                : 'On the way'}
              <span className="font-normal text-muted"> · {shortDate(g.days.at(-1)!)}{g.days.length > 1 && ` – ${shortDate(g.days[0])}`}</span>
            </>}
            action={g.stop && <AlbumLinks cityId={g.stop.cityId} />}
          >
            <ol className="-mx-2">
              {g.days.map((d) => (
                <DayRow key={d} date={d} day={tripDay(input.startDate, d)} open={open === d} onToggle={() => setOpen(open === d ? null : d)} />
              ))}
            </ol>
          </Section>
        </div>
      ))}
    </Sections>
  )
}

function DayRow({ date, day, open, onToggle }: { date: string; day: number; open: boolean; onToggle: () => void }) {
  const e = useDayEntry(date)
  // Its highlight (or first line) and, under it, the rest as plain text, line by line, cut with "…" after three.
  const lines = e ? plainLines(e.text) : []
  const lead = e?.highlight.trim() || lines[0] || ''
  const more = (e?.highlight.trim() ? lines : lines.slice(1)).join('\n')
  return (
    <li className={open ? 'rounded-lg bg-canvas' : ''}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-canvas">
        <span className="w-16 shrink-0 pt-px text-[11px] leading-tight text-muted">{dayDate(date)}<br />Day {day}</span>
        <span className="min-w-0 flex-1">
          {e ? (
            <>
              <span className="flex items-center gap-1.5 text-[13px] font-medium"><span className="truncate">{lead || '—'}</span><PublicMark on={e.public} /></span>
              {more && <span className="line-clamp-3 text-[12px] whitespace-pre-line text-muted">{more}</span>}
            </>
          ) : <span className="text-[13px] text-muted">Not written</span>}
        </span>
        {e?.rating && <span className="pt-1"><Stars value={e.rating} small /></span>}
      </button>
      {/* (On a shared trip's page, the day as written.) */}
      {open && (
        <div className="px-2 pt-1 pb-3">
          {SHARED_TOKEN
            ? e?.text && <Suspense fallback={<p className="text-[13px] whitespace-pre-wrap">{e.text}</p>}><NoteMarkdown text={e.text} onToggle={() => {}} /></Suspense>
            : <DayEditor date={date} autoFocus={!e} />}
        </div>
      )}
    </li>
  )
}

/** A mark by a stop in the itinerary with days written there: how many; opens them in the Journal. */
export function JournalMark({ stop }: { stop: ScheduledStop }) {
  const entries = useJournalEntries()
  let count = 0
  for (let d = stop.arrive; d < stop.depart; d = addDays(d, 1)) if (!isEmptyEntry(entries[d])) count++
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
