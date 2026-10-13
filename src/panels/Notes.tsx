// The user's own notes on a city or a journey (a note among the trip's items, store/items.ts): for the trip, whichever
// plan is shown, also on a read-only trip, and private (never in a shared trip).
import { Check, Pencil, StickyNote } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { noteId, useItems, useNote } from '../store/items'
import { ITEM_LIMITS } from '../store/itemsCore'
import { SHARED_TOKEN } from '../store/shareLink'
import { cityName } from '../ui/format'
import { Section } from '../ui/kit'
import { AiHelp } from './AiHelp'
import { toggleTask } from './noteText'

const NoteMarkdown = lazy(() => import('./NoteMarkdown'))

/**
 * "My notes" for a city (`at` its id; `tall` in its own tab) or a journey (`at` its `legKey(from, to)`), written in
 * Markdown: shown formatted (tasks can be ticked there), and as text to write while editing (an empty note is always
 * being written).
 */
export function NoteBox({ at, placeholder, tall, title = 'My notes' }: { at: string; placeholder: string; tall?: boolean; title?: string }) {
  const note = useNote(at)
  const put = useItems((s) => s.put)
  const remove = useItems((s) => s.remove)
  const setNote = (text: string) => (text.trim() ? put({ id: noteId(at), kind: 'note', at, text }) : remove(noteId(at)))
  const [editing, setEditing] = useState(false)
  // Someone else's shared trip: its notes are the owner's own, and aren't in it.
  if (SHARED_TOKEN) return null
  const writing = editing || !note.trim()
  const button = 'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft'
  return (
    <Section
      title={title}
      action={at.includes('>')
        ? <AiHelp topic="journeyNote" place={`from ${at.split('>').map(cityName).join(' to ')}`} />
        : <AiHelp topic="note" place={cityName(at)} />}
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
              setNote(e.target.value)
            }}
            rows={Math.min(tall ? 24 : 10, Math.max(tall ? 10 : note ? 3 : 2, note.split('\n').length + 1))}
            maxLength={ITEM_LIMITS.textChars}
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
            <NoteMarkdown text={note} onToggle={(n) => setNote(toggleTask(note, n))} />
          </Suspense>
        </div>
      )}
    </Section>
  )
}

/** A mark by a stop or journey in the itinerary that has a note; the note on hover. */
export function NoteMark({ at }: { at: string }) {
  const note = useNote(at)
  if (!note.trim()) return null
  return (
    <span title={note} aria-label="Has a note" className="shrink-0 text-muted">
      <StickyNote size={12} />
    </span>
  )
}
