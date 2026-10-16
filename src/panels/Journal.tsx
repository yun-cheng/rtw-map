// The trip's journal (PLAN.md §14.4, store/journal.ts): entries for the days (one or more a day), each a highlight, its
// story (Markdown, styled as it's typed), its emoji and tags, written from Today or for any day so far in My trip's
// Journal tab (MyTrip.tsx). Saved on
// this device as it's typed, and sent to the account when there's a connection; also on a read-only trip (the journal
// isn't the plan); on a shared trip's page, only the days made public, read-only.
import { BookOpen, Check, Pencil, Plus, SmilePlus, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { addDays, daysBetween, localToday, tripDay, type ScheduledStop } from '../planner'
import { isEmptyEntry, useDayEntry, useJournal, useJournalEntries } from '../store/journal'
import { SHARED_TOKEN } from '../store/shareLink'
import { PublicMark, PublicToggle } from '../ui/PublicToggle'
import { cleanEmojis, cleanTag, cleanTags, dayEmojis, dayKeys, entryDate, JOURNAL_LIMITS, newEntryKey, writtenKeys } from '../store/journalCore'
import { useSaved } from '../store/saved'
import { useTrip } from '../store/trip'
import { cityName, dateRange, dayDate, dayMonth, flag, weekday } from '../ui/format'
import { Section, Sections } from '../ui/kit'
import { AlbumLinks } from './Visit'
import { useOnline } from '../ui/useOnline'
import { addRecord, openRecord, useRightPanel } from '../ui/rightPanel'
import { dataset as ds } from '../data/dataset'
import { plainLines, toggleTask } from './noteText'
import { NewRecord, RecordNav } from './RecordPage'
import { PlainNote } from './PlainNote'

const loadEditor = () => import('./MarkdownEditor')
const MarkdownEditor = lazy(loadEditor)
const loadMarkdown = () => import('./NoteMarkdown')
const NoteMarkdown = lazy(loadMarkdown)
const EmojiPicker = lazy(() => import('./EmojiPicker'))
/** Edit, Done and Add. */
const doneLink = 'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft'

/** The stop where the night of `date` is spent, if any (none on a night on the way, or before the first stop). */
export const nightStop = (stops: ScheduledStop[], date: string) => stops.find((s) => s.arrive <= date && date < s.depart) ?? null

/** Opens the journal, My trip's Journal tab, on its list of days, at a stop's (`focus`: its first day). */
export function useOpenJournal() {
  const setView = useJournal((s) => s.setView)
  return (focus?: string) => {
    setView({ focus })
    useRightPanel.getState().setRecord('daily', null, true)
  }
}

/** An entry (`id`, its key), as it's written: its highlight, its story, tags and emoji; and its
 *  Private/Public switch, unless it's by the editor's Done (`switchOutside`). */
function DayEditor({ id, autoFocus, switchOutside }: { id: string; autoFocus?: boolean; switchOutside?: boolean }) {
  const entry = useJournal((s) => s.books[s.key]?.entries[id])
  const write = useJournal((s) => s.write)
  const stops = useTrip((s) => s.plan?.stops)
  const save = (patch: Parameters<typeof write>[1]) => write(id, { cityId: nightStop(stops ?? [], entryDate(id))?.cityId, ...patch })
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
      {/* (Its emoji, as a face of how it was for a day written before; the picker opens under them.) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Emojis emojis={dayEmojis(entry)} onChange={(emojis) => save({ emojis: emojis.length ? emojis : undefined, rating: undefined })} />
        <span className="flex min-w-0 items-center gap-1">
          <SaveState id={id} />
          {!switchOutside && <DayVisibility id={id} />}
        </span>
      </div>
    </div>
  )
}

/** An entry's Private/Public switch, once something is written. */
function DayVisibility({ id }: { id: string }) {
  const entry = useJournal((s) => s.books[s.key]?.entries[id])
  const write = useJournal((s) => s.write)
  if (isEmptyEntry(entry)) return null
  return <PublicToggle on={!!entry?.public} onChange={(on) => write(id, { public: on || undefined })} />
}

/** A day's emoji: each removed with a click, more added from the picker (to the limit). */
function Emojis({ emojis, onChange }: { emojis: string[]; onChange: (emojis: string[]) => void }) {
  const [picking, setPicking] = useState(false)
  const full = emojis.length >= JOURNAL_LIMITS.emojis
  return (
    <>
      <span className="flex min-w-0 flex-wrap items-center gap-0.5" role="group" aria-label="The day's emoji">
        {emojis.map((e) => (
          <button key={e} onClick={() => onChange(emojis.filter((x) => x !== e))} title="Click to remove" aria-label={`Remove ${e}`} className="rounded-md px-0.5 text-[20px] leading-none hover:bg-canvas">{e}</button>
        ))}
        {!full && (
          <button
            onClick={() => setPicking(!picking)} aria-expanded={picking} title="Add an emoji" aria-label="Add an emoji"
            className={`flex size-7 items-center justify-center rounded-md ${picking ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-canvas hover:text-ink'}`}
          >
            <SmilePlus size={17} />
          </button>
        )}
      </span>
      {picking && !full && (
        <Suspense fallback={<div className="h-[300px] rounded-lg border border-line" />}>
          <div className="basis-full">
            <EmojiPicker onPick={(e) => onChange(cleanEmojis([...emojis, e]))} />
          </div>
        </Suspense>
      )}
    </>
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

/** Where an entry is: saved to the account, being sent, kept on this device until there's a connection, or in
 *  this browser only (signed out). */
function SaveState({ id }: { id: string }) {
  const written = useJournal((s) => !!s.books[s.key]?.entries[id])
  const pending = useJournal((s) => !!s.books[s.key]?.pending.includes(id))
  const problem = useJournal((s) => s.problem)
  const signedIn = useSaved((s) => !!s.activeId)
  const online = useOnline()
  if (!written) return null
  const text = !signedIn ? 'Saved in this browser' : !pending ? 'Saved' : !online ? 'Offline · saved on this device' : problem ? `Saved on this device · ${problem}` : 'Saving…'
  return <span className="truncate text-[11px] text-muted" role="status">{text}</span>
}

/** Today's card: today's entries as in the journal's list, each opening there, and Add, writing one there (as
 *  Today's stays and tickets). */
export function TodayEntry({ today }: { today: string }) {
  const start = useTrip((s) => s.input.startDate)
  const entries = useJournalEntries()
  // (The latest first, as in the journal.)
  const keys = dayKeys(entries, today).reverse()
  return (
    <Section
      title="Journal"
      aside={!SHARED_TOKEN && <button onClick={() => addRecord('daily', newEntryKey(entries, today))} className={`${doneLink} shrink-0`}><Plus size={12} /> Add</button>}
    >
      {keys.length
        ? <ol className="-mx-2">{keys.map((k, i) => <DayRow key={k} id={k} day={tripDay(start, today)} first={i === 0} onOpen={() => openRecord('daily', k)} onTag={() => openRecord('daily', k)} />)}</ol>
        : <p className="text-[12px] text-muted">Nothing written today yet.</p>}
    </Section>
  )
}

/** The journal, My trip's Journal tab: the entries for the trip's days so far (or those with a tag), newest first,
 *  under the stop where their night was, each opening on a page of its own; and one to add (today first). */
export function JournalView() {
  const { plan, input, select } = useTrip()
  const entries = useJournalEntries()
  const { view, setView } = useJournal()
  const write = useJournal((s) => s.write)
  // The entry open on its page, by its key (from Today too).
  const day = useRightPanel((s) => s.records.daily) ?? null
  const setRecord = useRightPanel((s) => s.setRecord)
  const setDay = (k: string | null) => setRecord('daily', k)
  // The entry being added (from Today too), written on a page of its own until it's done.
  const adding = useRightPanel((s) => s.adding.daily) ?? null
  const setAdding = (k: string | null) => useRightPanel.getState().setAdding('daily', k)
  // The tag the days are shown by (picked on a day).
  const [tag, setTag] = useState<string | null>(null)
  const today = localToday()
  // (A day's page shows it formatted: ready by the time one's opened.)
  useEffect(() => void loadMarkdown(), [])
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
  const tagged = (k: string) => !tag || !!entries[k]?.tags?.some((t) => t.toLowerCase() === tag.toLowerCase())
  const inTrip = writtenKeys(entries).filter((k) => entryDate(k) >= input.startDate && entryDate(k) <= last)
  const keys = inTrip.filter(tagged)
  // Consecutive days at the same stop, together.
  const groups: { stop: ScheduledStop | null; keys: string[] }[] = []
  for (const k of keys) {
    const stop = nightStop(plan.stops, entryDate(k))
    const g = groups.at(-1)
    if (g && g.stop === stop) g.keys.push(k)
    else groups.push({ stop, keys: [k] })
  }
  const all = daysBetween(input.startDate, last) + 1
  const written = new Set(inTrip.map(entryDate)).size
  const shownDays = new Set(keys.map(entryDate)).size
  if (adding !== null) {
    // (Done: its page, once something is written for it.)
    const done = () => {
      // (Its page first, then not new: the new one's page replaced by its own, Back not going to the new one's.)
      if (!isEmptyEntry(entries[adding])) setDay(adding)
      setAdding(null)
    }
    // Another day: what's written so far goes with it (cleared where it was), under a key of that day's.
    const moveTo = (date: string) => {
      const to = newEntryKey(entries, date)
      const e = entries[adding]
      if (!isEmptyEntry(e)) {
        write(to, { highlight: e!.highlight, text: e!.text, tags: e!.tags, emojis: e!.emojis, rating: e!.rating, public: e!.public, cityId: nightStop(plan.stops, date)?.cityId })
        write(adding, { highlight: '', text: '', tags: undefined, emojis: undefined, rating: undefined, public: undefined })
      }
      setAdding(to)
    }
    return (
      <NewRecord
        back="All days" onBack={() => setAdding(null)} title="New entry"
        aside={<span className="flex items-center gap-1"><DayVisibility id={adding} /><button onClick={done} className={doneLink}><Check size={12} /> Done</button></span>}
      >
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted">Day</span>
            <input
              type="date" value={entryDate(adding)} min={input.startDate} max={last} onChange={(e) => e.target.value && e.target.value !== entryDate(adding) && moveTo(e.target.value)}
              className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-[13px] outline-none focus:border-accent max-md:!text-[16px]"
            />
          </label>
          <DayEditor key={adding} id={adding} autoFocus switchOutside />
        </div>
      </NewRecord>
    )
  }
  if (day) {
    // (Newer and older: of the entries in the list, or the entry itself if it's no longer there, cleared.)
    const list = keys.includes(day) ? keys : [day]
    return <DayPage key={day} id={day} keys={list} onGo={setDay} onBack={() => setDay(null)} onTag={(t) => { setTag(t); setDay(null) }} />
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
              {shownDays} day{shownDays === 1 ? '' : 's'}
            </span>
          : written ? `${written} of ${all} day${all === 1 ? '' : 's'} written` : 'No days written yet'}
        aside={!SHARED_TOKEN && <button onClick={() => setAdding(newEntryKey(entries, last))} className={`${doneLink} shrink-0`}><Plus size={12} /> Add</button>}
      >{null}</Section>
      {groups.map((g) => (
        // (Its id: brought into view from the stop's mark in the itinerary.)
        <div key={g.keys[0]} id={g.stop ? `journal-${g.stop.arrive}` : undefined} className="scroll-mt-3">
          <Section
            title={<>
              {g.stop
                ? <button onClick={() => select({ type: 'city', id: g.stop!.cityId })} className="text-left hover:underline">{flag(ds.cities[g.stop.cityId].iso2)} {cityName(g.stop.cityId)}</button>
                : 'On the way'}
              <span className="font-normal text-muted"> · {dateRange(entryDate(g.keys.at(-1)!), entryDate(g.keys[0]))}</span>
            </>}
            action={g.stop && <AlbumLinks cityId={g.stop.cityId} />}
          >
            <ol className="-mx-2">
              {g.keys.map((k, i) => (
                // (A day's date by its first row only.)
                <DayRow key={k} id={k} day={tripDay(input.startDate, entryDate(k))} first={i === 0 || entryDate(g.keys[i - 1]) !== entryDate(k)} onOpen={() => setDay(k)} onTag={setTag} />
              ))}
            </ol>
          </Section>
        </div>
      ))}
    </Sections>
  )
}

/** An entry in a list: its day (by the day's `first` only), its highlight and the start of its story, tags and emoji. */
function DayRow({ id, day, first, onOpen, onTag }: { id: string; day: number; first: boolean; onOpen: () => void; onTag: (tag: string) => void }) {
  const e = useDayEntry(id)
  const date = entryDate(id)
  // Its highlight (or first line) and, under it, the rest as plain text, line by line, cut with "…" after two.
  const lines = e ? plainLines(e.text) : []
  const lead = e?.highlight.trim() || lines[0] || ''
  const more = (e?.highlight.trim() ? lines : lines.slice(1)).join('\n')
  const emojis = dayEmojis(e)
  return (
    // (The day and its tags one card: a click on it opens the day, on a tag shows the days with it.)
    <li onClick={onOpen} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-canvas">
      <span className="w-[4.75rem] shrink-0 pt-px text-[11px] leading-tight whitespace-nowrap text-muted">{first && <>{weekday(date)} {dayMonth(date)}<br />{date.slice(0, 4)} · Day {day}</>}</span>
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
      {/* (Its emoji, then whether it's public, at the right edge: as by Edit on the day's page.) */}
      {(!!emojis.length || (e?.public && !SHARED_TOKEN)) && (
        <span className="flex items-center gap-1.5 pt-0.5">
          {!!emojis.length && <span aria-label={`The day's emoji: ${emojis.join(' ')}`} className="text-[13px] leading-none whitespace-nowrap">{emojis.slice(0, 3).join('')}{emojis.length > 3 && <span className="text-[11px] text-muted"> +{emojis.length - 3}</span>}</span>}
          <PublicMark on={e?.public} />
        </span>
      )}
    </li>
  )
}

/** An entry on a page of its own: all of it as it reads (a to-do can be ticked there), with Edit to change it (not on
 *  a shared trip's page), and the way back to the list and to the newer and older entries in it (`keys`, newest first). */
function DayPage({ id, keys, onGo, onBack, onTag }: { id: string; keys: string[]; onGo: (id: string) => void; onBack: () => void; onTag: (tag: string) => void }) {
  const { plan, input, select } = useTrip()
  const e = useDayEntry(id)
  const date = entryDate(id)
  const write = useJournal((s) => s.write)
  // (Written at once when there's nothing yet: opened from Today.)
  const [editing, setEditing] = useState(() => !SHARED_TOKEN && isEmptyEntry(e))
  // (Its editor, ready by the time Edit is pressed.)
  useEffect(() => void (!SHARED_TOKEN && loadEditor()), [])
  const i = keys.indexOf(id)
  const newer = keys[i - 1]
  const older = keys[i + 1]
  const stop = nightStop(plan?.stops ?? [], date)
  const emojis = dayEmojis(e)
  return (
    <Sections>
      <RecordNav back="All days" onBack={onBack} prev={newer} next={older} onGo={onGo} prevLabel="Newer entry" nextLabel="Older entry" at={id} />
      <Section
        title={<span className="font-normal text-muted">{dayDate(date)} · Day {tripDay(input.startDate, date)}</span>}
        // (Public or not by Edit, its switch by Done: where every day has it, in the list too.)
        aside={!SHARED_TOKEN && (editing
          ? <span className="flex items-center gap-1"><DayVisibility id={id} /><button onClick={() => setEditing(false)} className={doneLink}><Check size={12} /> Done</button></span>
          : <span className="flex items-center gap-1"><PublicMark on={e?.public} /><button onClick={() => setEditing(true)} className={doneLink}><Pencil size={12} /> Edit</button></span>)}
      >
        {editing ? <DayEditor id={id} autoFocus={!e} switchOutside /> : (
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
              {!!emojis.length && <span aria-label={`The day's emoji: ${emojis.join(' ')}`} className="max-w-[45%] text-right text-[24px] leading-tight">{emojis.join('')}</span>}
            </div>
            {e?.text.trim()
              ? (
                <Suspense fallback={<PlainNote text={e.text} />}>
                  <NoteMarkdown text={e.text} onToggle={(n) => !SHARED_TOKEN && write(id, { text: toggleTask(e.text, n) })} />
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
  for (let d = stop.arrive; d < stop.depart; d = addDays(d, 1)) if (dayKeys(entries, d).length) count++
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
