// The user's own notes on a city or a journey (a note among the trip's items, store/items.ts): for the trip, whichever
// plan is shown, also on a read-only trip, and private (never in a shared trip).
import { Check, Pencil, StickyNote } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { noteId, useItem, useItems, useNote } from '../store/items'
import { ITEM_LIMITS } from '../store/itemsCore'
import { SHARED_TOKEN } from '../store/shareLink'
import { AiMark } from '../ui/AiMark'
import { PublicMark, PublicToggle } from '../ui/PublicToggle'
import { Section } from '../ui/kit'
import { toggleTask } from './noteText'
import { PlainNote } from './PlainNote'

const NoteMarkdown = lazy(() => import('./NoteMarkdown'))
const MarkdownEditor = lazy(() => import('./MarkdownEditor'))

/**
 * "My notes" for a city (`at` its id; `tall` in its own tab) or a journey (`at` its `legKey(from, to)`), kept as
 * Markdown: shown formatted (tasks can be ticked there), and written styled as it's typed or from a toolbar
 * (MarkdownEditor.tsx; an empty note is always being written).
 */
export function NoteBox({ at, placeholder, tall, title = SHARED_TOKEN ? 'Notes' : 'My notes' }: { at: string; placeholder: string; tall?: boolean; title?: string }) {
  const note = useNote(at)
  const item = useItem(noteId(at))
  const put = useItems((s) => s.put)
  const remove = useItems((s) => s.remove)
  const setNote = (text: string) => (text.trim() ? put({ id: noteId(at), kind: 'note', at, text }) : remove(noteId(at)))
  const [editing, setEditing] = useState(false)
  // Someone else's shared trip: the note only if its owner made it public, read-only.
  if (SHARED_TOKEN) {
    if (!note.trim()) return null
    return (
      <Section title={title}>
        <Suspense fallback={<PlainNote text={note} />}>
          <NoteMarkdown text={note} onToggle={() => {}} />
        </Suspense>
      </Section>
    )
  }
  const writing = editing || !note.trim()
  const button = 'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft'
  return (
    <Section
      title={title}
      action={<><AiMark on={item?.ai} /><PublicMark on={item?.public} /></>}
      aside={
        <span className="flex items-center gap-2 text-[11px] text-muted">
          {note.trim() && editing && <PublicToggle on={!!item?.public} onChange={(on) => put({ id: noteId(at), public: on || undefined })} />}
          {note.trim() && (editing
            ? <button onClick={() => setEditing(false)} className={button}><Check size={12} /> Done</button>
            : <button onClick={() => setEditing(true)} className={button}><Pencil size={12} /> Edit</button>)}
        </span>
      }
    >
      {writing ? (
        <Suspense fallback={<div className={`${tall ? 'min-h-[221px]' : 'min-h-[97px]'} rounded-md border border-line bg-panel`} />}>
          <MarkdownEditor
            value={note} max={ITEM_LIMITS.textChars} placeholder={placeholder} label="My notes" autoFocus={editing} tall={tall}
            onChange={(text) => {
              // (A note started from empty stays in writing until Done.)
              setEditing(true)
              setNote(text)
            }}
          />
        </Suspense>
      ) : (
        // A double click (or Edit) to change it.
        <div onDoubleClick={() => setEditing(true)} title="Double-click to edit">
          <Suspense fallback={<PlainNote text={note} />}>
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
