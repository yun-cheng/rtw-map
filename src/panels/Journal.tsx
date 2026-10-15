// The trip's journal (PLAN.md §14.4, store/journal.ts): a day's highlight, its story (Markdown, styled as it's typed),
// how it was (a face) and tags, written from Today or any day so far in My trip's Journal tab (MyTrip.tsx). Saved on
// this device as it's typed, and sent to the account when there's a connection; also on a read-only trip (the journal
// isn't the plan); on a shared trip's page, only the days made public, read-only.
import { BookOpen, Check, ChevronLeft, ChevronRight, Pencil, Plus, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { addDays, localToday, tripDay, type ScheduledStop } from '../planner'
import { isEmptyEntry, useDayEntry, useJournal, useJournalEntries } from '../store/journal'
import { SHARED_TOKEN } from '../store/shareLink'
import { PublicMark, PublicToggle } from '../ui/PublicToggle'
import { cleanTag, cleanTags, JOURNAL_LIMITS } from '../store/journalCore'
import { useSaved } from '../store/saved'
import { useTrip } from '../store/trip'
import { cityName, dayDate, flag, shortDate } from '../ui/format'
import { Section, Sections } from '../ui/kit'
import { AlbumLinks } from './Visit'
import { useOnline } from '../ui/useOnline'
import { useRightPanel } from '../ui/rightPanel'
import { dataset as ds } from '../data/dataset'
import { plainLines, toggleTask } from './noteText'

const MarkdownEditor = lazy(() => import('./MarkdownEditor'))
const NoteMarkdown = lazy(() => import('./NoteMarkdown'))

/** The stop where the night of `date` is spent, if any (none on a night on the way, or before the first stop). */
export const nightStop = (stops: ScheduledStop[], date: string) => stops.find((s) => s.arrive <= date && date < s.depart) ?? null

/** Opens the journal, My trip's Journal tab (closing a city's or journey's panel open in its place), at a stop's days
 *  (`focus`: its first day). */
export function useOpenJournal() {
  const setView = useJournal((s) => s.setView)
  return (focus?: string) => {
    setView({ focus })
    useTrip.getState().select(null)
    useRightPanel.getState().show('daily')
  }
}

/** How a day was, from 1 (awful) to 5 (great). */
const MOODS = [
  { face: '😣', label: 'Awful' }, { face: '🙁', label: 'Bad' }, { face: '😐', label: 'Okay' }, { face: '🙂', label: 'Good' }, { face: '😄', label: 'Great' },
] as const

/** A day's entry, as it's written: its highlight, its story, how it was (again to clear) and tags; and its
 *  Private/Public switch, unless it's by the editor's Done (`switchOutside`). */
export function DayEditor({ date, autoFocus, switchOutside }: { date: string; autoFocus?: boolean; switchOutside?: boolean }) {
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
      <Tags tags={entry?.tags ?? []} onChange={(tags) => save({ tags: tags.length ? tags : undefined })} />
      <div className="flex items-center justify-between gap-2">
        <Mood value={entry?.rating} onChange={(rating) => save({ rating: rating === entry?.rating ? undefined : rating })} />
        <span className="flex min-w-0 items-center gap-1">
          <SaveState date={date} />
          {!switchOutside && <DayVisibility date={date} />}
        </span>
      </div>
    </div>
  )
}

/** A day's Private/Public switch, once something is written. */
function DayVisibility({ date }: { date: string }) {
  const entry = useJournal((s) => s.books[s.key]?.entries[date])
  const write = useJournal((s) => s.write)
  if (isEmptyEntry(entry)) return null
  return <PublicToggle on={!!entry?.public} onChange={(on) => write(date, { public: on || undefined })} />
}

/** How the day was, a face of five to pick (or, `small`, the one picked). */
function Mood({ value, onChange, small }: { value?: number; onChange?: (n: 1 | 2 | 3 | 4 | 5) => void; small?: boolean }) {
  if (!onChange) {
    const mood = value ? MOODS[value - 1] : null
    return mood && <span title={mood.label} aria-label={`The day was ${mood.label.toLowerCase()}`} className={small ? 'text-[13px] leading-none' : 'text-[18px]'}>{mood.face}</span>
  }
  return (
    <span className="flex items-center gap-0.5" role="radiogroup" aria-label="How was the day">
      {MOODS.map((m, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4 | 5
        const on = value === n
        return (
          <button
            key={n} role="radio" aria-checked={on} aria-label={m.label} title={m.label} onClick={() => onChange(n)}
            className={`rounded-full px-1 py-0.5 text-[18px] leading-none transition ${on ? 'bg-accent-soft' : value ? 'opacity-40 grayscale hover:opacity-100 hover:grayscale-0' : 'opacity-70 hover:opacity-100'}`}
          >
            {m.face}
          </button>
        )
      })}
    </span>
  )
}

/** A day's tags: each removable, one added on Enter or a comma (from those on other days, as it's typed). */
function Tags({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const all = useJournalTags()
  const add = (text: string) => {
    setDraft('')
    // (A tag used before, as it was written there.)
    const tag = cleanTag(text)
    const known = all.find((t) => t.toLowerCase() === tag.toLowerCase())
    if (tag) onChange(cleanTags([...tags, known ?? tag]))
  }
  const full = tags.length >= JOURNAL_LIMITS.tags
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-1 focus-within:border-accent">
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-0.5 rounded-full bg-accent-soft py-0.5 pr-0.5 pl-2 text-[12px] text-accent">
          {t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove the tag ${t}`} className="rounded-full p-0.5 hover:bg-panel"><X size={11} /></button>
        </span>
      ))}
      {!full && (
        <input
          value={draft} list="journal-tags" maxLength={JOURNAL_LIMITS.tagChars + 1} aria-label="Add a tag"
          placeholder={tags.length ? 'Add a tag' : 'Tags: hike, food, friends…'}
          onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); add(draft) }
            if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1))
          }}
          onBlur={() => draft.trim() && add(draft)}
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-[12px] outline-none max-md:!text-[16px]"
        />
      )}
      <datalist id="journal-tags">{all.filter((t) => !tags.includes(t)).map((t) => <option key={t} value={t} />)}</datalist>
    </div>
  )
}

/** The tags on the journal's days, the most used first. */
function useJournalTags(): string[] {
  const entries = useJournalEntries()
  const count = new Map<string, number>()
  for (const e of Object.values(entries)) for (const t of e.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1)
  return [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)! || a.localeCompare(b))
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

/** The journal, My trip's Journal tab: the days of the trip so far that are written (or those with a tag), newest first,
 *  under the stop where their night was, each opening on a page of its own; and one to add (today first). */
export function JournalView() {
  const { plan, input, select } = useTrip()
  const entries = useJournalEntries()
  const { view, setView } = useJournal()
  // The day open on its page.
  const [day, setDay] = useState<string | null>(null)
  // The day being added, written at the top until it's done.
  const [adding, setAdding] = useState<string | null>(null)
  // The tag the days are shown by (picked on a day).
  const [tag, setTag] = useState<string | null>(null)
  const today = localToday()
  // (Brought to a stop's days, from the list.)
  const [focus, setFocus] = useState(view.focus)
  if (view.focus !== focus) {
    setFocus(view.focus)
    if (view.focus) setDay(null)
  }

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
  const tagged = (d: string) => !tag || !!entries[d]?.tags?.some((t) => t.toLowerCase() === tag.toLowerCase())
  const days = all.filter((d) => !isEmptyEntry(entries[d]) && d !== adding && tagged(d))
  // Consecutive days at the same stop, together.
  const groups: { stop: ScheduledStop | null; days: string[] }[] = []
  for (const d of days) {
    const stop = nightStop(plan.stops, d)
    const g = groups.at(-1)
    if (g && g.stop === stop) g.days.push(d)
    else groups.push({ stop, days: [d] })
  }
  const written = all.filter((d) => !isEmptyEntry(entries[d])).length
  if (day) {
    // (Newer and older: of the days in the list, or the day itself if it's no longer there, cleared.)
    const list = days.includes(day) ? days : [day]
    return <DayPage key={day} date={day} days={list} onGo={setDay} onBack={() => setDay(null)} onTag={(t) => { setTag(t); setDay(null) }} />
  }

  // (Cards, as My trip's other tabs: the count and Add on top, then each stop's days.)
  return (
    <Sections>
      <Section
        title={tag
          ? <span className="flex items-center gap-1.5">
              <span className="flex items-center gap-0.5 rounded-full bg-accent-soft py-0.5 pr-0.5 pl-2 text-[12px] font-normal text-accent">
                {tag}<button onClick={() => setTag(null)} aria-label="Show every day" className="rounded-full p-0.5 hover:bg-panel"><X size={11} /></button>
              </span>
              {days.length} day{days.length === 1 ? '' : 's'}
            </span>
          : written ? `${written} of ${all.length} day${all.length === 1 ? '' : 's'} written` : 'No days written yet'}
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
          <DayEditor key={adding} date={adding} autoFocus switchOutside />
          <span className="flex items-center gap-1 self-end">
            <DayVisibility date={adding} />
            <button onClick={() => setAdding(null)} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft"><Check size={12} /> Done</button>
          </span>
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
                <DayRow key={d} date={d} day={tripDay(input.startDate, d)} onOpen={() => setDay(d)} onTag={setTag} />
              ))}
            </ol>
          </Section>
        </div>
      ))}
    </Sections>
  )
}

function DayRow({ date, day, onOpen, onTag }: { date: string; day: number; onOpen: () => void; onTag: (tag: string) => void }) {
  const e = useDayEntry(date)
  // Its highlight (or first line) and, under it, the rest as plain text, line by line, cut with "…" after two.
  const lines = e ? plainLines(e.text) : []
  const lead = e?.highlight.trim() || lines[0] || ''
  const more = (e?.highlight.trim() ? lines : lines.slice(1)).join('\n')
  return (
    // (The day and its tags one card: a click on it opens the day, on a tag shows the days with it.)
    <li onClick={onOpen} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-canvas">
      <span className="w-16 shrink-0 pt-px text-[11px] leading-tight text-muted">{dayDate(date)}<br />Day {day}</span>
      <span className="min-w-0 flex-1">
        {e ? (
          <>
            <button className="flex w-full items-center gap-1.5 text-left text-[13px] font-medium"><span className="truncate">{lead || '—'}</span></button>
            {more && <span className="line-clamp-2 text-[12px] whitespace-pre-line text-muted">{more}</span>}
            {!!e.tags?.length && (
              <span className="mt-1 flex flex-wrap gap-1">
                {e.tags.map((t) => (
                  <button key={t} onClick={(ev) => { ev.stopPropagation(); onTag(t) }} className="rounded-full bg-accent-soft px-1.5 text-[11px] text-accent hover:underline">{t}</button>
                ))}
              </span>
            )}
          </>
        ) : <button className="text-[13px] text-muted">Not written</button>}
      </span>
      {/* (How it was, then whether it's public, at the right edge: as by Edit on the day's page.) */}
      {(e?.rating || (e?.public && !SHARED_TOKEN)) && <span className="flex items-center gap-1.5 pt-0.5">{e.rating && <Mood value={e.rating} small />}<PublicMark on={e.public} /></span>}
    </li>
  )
}

/** A day on a page of its own: all of it as it reads (a to-do can be ticked there), with Edit to change it (not on a
 *  shared trip's page), and the way back to the list and to the newer and older days in it (`days`, newest first). */
function DayPage({ date, days, onGo, onBack, onTag }: { date: string; days: string[]; onGo: (date: string) => void; onBack: () => void; onTag: (tag: string) => void }) {
  const { plan, input, select } = useTrip()
  const e = useDayEntry(date)
  const write = useJournal((s) => s.write)
  const [editing, setEditing] = useState(false)
  const i = days.indexOf(date)
  const newer = days[i - 1]
  const older = days[i + 1]
  const stop = nightStop(plan?.stops ?? [], date)
  const mood = e?.rating && MOODS[e.rating - 1]
  const link = 'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft'
  const step = 'flex size-7 items-center justify-center rounded-md text-muted hover:bg-panel hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <Sections>
      <div className="flex items-center justify-between">
        {/* (A way back, plain: not a tag's or an action's colour.) */}
        <button onClick={onBack} className="-ml-1 flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[12px] text-muted hover:text-ink"><ChevronLeft size={14} /> All days</button>
        <span className="flex items-center gap-0.5">
          <button onClick={() => newer && onGo(newer)} disabled={!newer} aria-label="Newer day" title="Newer day" className={step}><ChevronLeft size={16} /></button>
          <button onClick={() => older && onGo(older)} disabled={!older} aria-label="Older day" title="Older day" className={step}><ChevronRight size={16} /></button>
        </span>
      </div>
      <Section
        title={<span className="font-normal text-muted">{dayDate(date)} · Day {tripDay(input.startDate, date)}</span>}
        // (Public or not by Edit, its switch by Done: where every day has it, in the list too.)
        aside={!SHARED_TOKEN && (editing
          ? <span className="flex items-center gap-1"><DayVisibility date={date} /><button onClick={() => setEditing(false)} className={link}><Check size={12} /> Done</button></span>
          : <span className="flex items-center gap-1"><PublicMark on={e?.public} /><button onClick={() => setEditing(true)} className={link}><Pencil size={12} /> Edit</button></span>)}
      >
        {editing ? <DayEditor date={date} autoFocus={!e} switchOutside /> : (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {stop && (
                  <button onClick={() => select({ type: 'city', id: stop.cityId })} className="text-[12px] text-muted hover:text-ink hover:underline">
                    {flag(ds.cities[stop.cityId].iso2)} {cityName(stop.cityId)}
                  </button>
                )}
                {e?.highlight.trim() && <h2 className="text-[21px] leading-snug font-bold">{e.highlight}</h2>}
              </div>
              {mood && <span title={mood.label} aria-label={`The day was ${mood.label.toLowerCase()}`} className="text-[26px] leading-none">{mood.face}</span>}
            </div>
            {e?.text.trim()
              ? (
                <Suspense fallback={<p className="text-[13px] whitespace-pre-wrap">{e.text}</p>}>
                  <NoteMarkdown text={e.text} onToggle={(n) => !SHARED_TOKEN && write(date, { text: toggleTask(e.text, n) })} />
                </Suspense>
              )
              : !e?.highlight.trim() && <p className="text-[13px] text-muted">Nothing written for this day.</p>}
            {!!e?.tags?.length && (
              <div className="flex flex-wrap gap-1">
                {e.tags.map((t) => <button key={t} onClick={() => onTag(t)} className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] text-accent hover:underline">{t}</button>)}
              </div>
            )}
            {stop && <AlbumLinks cityId={stop.cityId} />}
          </div>
        )}
      </Section>
    </Sections>
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
