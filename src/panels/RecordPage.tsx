// A record of My trip on a page of its own (a day of the journal, a stay, a ticket, a receipt): opened from its tab's
// list, read until Edit, and changed there.
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { SHARED_TOKEN } from '../store/shareLink'
import { PublicMark } from '../ui/PublicToggle'
import { Section, Sections } from '../ui/kit'

/** The way back to the list (`back`: "All days"), and to the records before (`prev`) and after (`next`) it there
 *  (none for a new one: no `onGo`); brought into view when it opens (`at`: the record shown). */
export function RecordNav({ back, onBack, prev, next, onGo, prevLabel, nextLabel, at }: {
  back: string; onBack: () => void; prev?: string; next?: string; onGo?: (id: string) => void; prevLabel?: string; nextLabel?: string; at: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  // (Braces: in newer browsers it returns a promise, and an effect must return nothing but a clean-up.)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [at])
  const step = 'flex size-7 items-center justify-center rounded-md text-muted hover:bg-panel hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <div ref={ref} className="flex scroll-mt-3 items-center justify-between">
      {/* (A way back, plain: not a tag's or an action's colour.) */}
      <button onClick={onBack} className="-ml-1 flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[12px] text-muted hover:text-ink"><ChevronLeft size={14} /> {back}</button>
      {onGo && <span className="flex items-center gap-0.5">
        <button onClick={() => prev && onGo(prev)} disabled={!prev} aria-label={prevLabel} title={prevLabel} className={step}><ChevronLeft size={16} /></button>
        <button onClick={() => next && onGo(next)} disabled={!next} aria-label={nextLabel} title={nextLabel} className={step}><ChevronRight size={16} /></button>
      </span>}
    </div>
  )
}

/** A record's card: `title` (where or when), whether it's public and Edit (not on a shared trip's page); while
 *  `editing`, its editor instead of all of it (the editor has its Done and Public switch). */
export function RecordCard({ title, isPublic, editing, onEdit, children }: { title: ReactNode; isPublic?: boolean; editing: boolean; onEdit: () => void; children: ReactNode }) {
  const link = 'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft'
  return (
    <Section
      title={<span className="font-normal text-muted">{title}</span>}
      aside={!editing && !SHARED_TOKEN && <span className="flex items-center gap-1"><PublicMark on={isPublic} /><button onClick={onEdit} className={link}><Pencil size={12} /> Edit</button></span>}
    >
      {children}
    </Section>
  )
}

/** A new record on a page of its own, as it's written (`title`: "New stay"; its Done in its editor, or `aside`), and
 *  the way back to the list. */
export function NewRecord({ back, onBack, title, aside, children }: { back: string; onBack: () => void; title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <Sections>
      <RecordNav back={back} onBack={onBack} at="new" />
      <Section title={<span className="font-normal text-muted">{title}</span>} aside={aside}>{children}</Section>
    </Sections>
  )
}

/** A record's name on its page, large; its ✨ by it. */
export function RecordTitle({ children, mark }: { children: ReactNode; mark?: ReactNode }) {
  return <h2 className="flex items-center gap-1.5 text-[19px] leading-snug font-bold">{children}{mark}</h2>
}

/** A record in its tab's list: one card to open it (its name a button, for the keyboard), whether it's public at the
 *  right edge. */
export function RecordRow({ icon, title, mark, sub, aside, isPublic, onOpen }: {
  icon?: ReactNode; title: ReactNode; mark?: ReactNode; sub?: ReactNode; aside?: ReactNode; isPublic?: boolean; onOpen: () => void
}) {
  return (
    <li onClick={onOpen} className="-mx-2 flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-canvas">
      {icon && <span className="mt-0.5 shrink-0 text-muted">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5"><button className="truncate text-left font-medium">{title}</button>{mark}</span>
        {sub && <span className="block text-[12px] text-muted">{sub}</span>}
      </span>
      {(aside || isPublic) && <span className="flex shrink-0 items-center gap-1.5 pt-0.5">{aside}<PublicMark on={isPublic} /></span>}
    </li>
  )
}
