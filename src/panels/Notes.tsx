// The user's own notes on a city or a journey (the trip's `notes`, store/tripCore.ts): for the trip, whichever plan is
// shown, also on a read-only trip, and private.
import { Check, Pencil, StickyNote } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { MAX_NOTE_CHARS, useTrip } from '../store/trip'
import { Section } from '../ui/kit'
import { toggleTask } from './noteText'

const NoteMarkdown = lazy(() => import('./NoteMarkdown'))

/**
 * "My notes" for a city (`kind` cities, its id; `tall` in its own tab) or a journey (`kind` legs, `legKey(from, to)`),
 * written in Markdown: shown formatted (tasks can be ticked there), and as text to write while editing (an empty
 * note is always being written).
 */
export function NoteBox({ kind, id, placeholder, tall }: { kind: 'cities' | 'legs'; id: string; placeholder: string; tall?: boolean }) {
  const note = useTrip((s) => s.notes[kind]?.[id] ?? '')
  const setNote = useTrip((s) => s.setNote)
  const [editing, setEditing] = useState(false)
  const writing = editing || !note.trim()
  const button = 'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft'
  return (
    <Section
      title="My notes"
      aside={
        <span className="flex items-center gap-2 text-[11px] text-muted">
          Only you see these
          {note.trim() && (editing
            ? <button onClick={() => setEditing(false)} className={button}><Check size={12} /> Done</button>
            : <button onClick={() => setEditing(true)} className={button}><Pencil size={12} /> Edit</button>)}
        </span>
      }
    >
      {writing ? (
        <>
          <textarea
            value={note}
            autoFocus={editing}
            onChange={(e) => {
              // (A note started from empty stays in writing until Done.)
              setEditing(true)
              setNote(kind, id, e.target.value)
            }}
            rows={Math.min(tall ? 24 : 10, Math.max(tall ? 10 : note ? 3 : 2, note.split('\n').length + 1))}
            maxLength={MAX_NOTE_CHARS}
            placeholder={placeholder}
            aria-label="My notes"
            className="w-full resize-y rounded-md border border-line bg-panel px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-accent"
          />
          <p className="mt-1 text-[11px] text-muted">
            Markdown: **bold**, *italic*, # heading, - list, - [ ] to-do, [link](https://…), | tables |
          </p>
        </>
      ) : (
        // A double click (or Edit) to change it.
        <div onDoubleClick={() => setEditing(true)} title="Double-click to edit">
          <Suspense fallback={<p className="text-[13px] whitespace-pre-wrap">{note}</p>}>
            <NoteMarkdown text={note} onToggle={(n) => setNote(kind, id, toggleTask(note, n))} />
          </Suspense>
        </div>
      )}
    </Section>
  )
}

/** A mark by a stop or journey in the itinerary that has a note; the note on hover. */
export function NoteMark({ note }: { note?: string }) {
  if (!note) return null
  return (
    <span title={note} aria-label="Has a note" className="shrink-0 text-muted">
      <StickyNote size={12} />
    </span>
  )
}
