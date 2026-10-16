// Undo, Redo and the version history's clock: at the right of the plan bar (PlanBar.tsx), under the left panel's
// tabs. And what each undo or redo did, in a notice for a few seconds (UndoNotice).
import { History, Redo2, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useChat } from '../agent/chat'
import { REDO_KEYS, UNDO_KEYS, useHistory } from '../store/history'
import { useSaved } from '../store/saved'
import { SHARED_TOKEN } from '../store/shareLink'
import { useTrip } from '../store/trip'
import { useVersionHistory } from '../store/versions'

/** Lines of changes in the notice before "and N more". */
const LINES_SHOWN = 3
/** How long the notice stays. */
const NOTICE_MS = 4000

/** Undo and redo of the trip's edits (store/history.ts), not while the assistant is changing it; and the saved trip's
 *  version history (VersionHistory.tsx), signed in. None of them on a read-only trip (it doesn't change, not even back,
 *  store/tripCore.ts; the lock beside them is all there is) or a shared one. `phone`: buttons big enough for a finger. */
export function UndoRedo({ phone = false }: { phone?: boolean }) {
  const { past, future, undo, redo } = useHistory()
  const saved = useSaved((s) => !!s.activeId)
  const busy = useChat((s) => s.busy)
  const readOnly = useTrip((s) => s.readOnly)
  if (SHARED_TOKEN || readOnly) return null
  const btn = `flex items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent ${phone ? 'h-9 w-9' : 'h-7 w-7'}`
  const size = phone ? 18 : 16
  return (
    <div className="flex shrink-0 items-center" role="group" aria-label="Undo and history">
      <button className={btn} onClick={undo} disabled={busy || !past.length} title={`Undo (${UNDO_KEYS})`} aria-label="Undo"><Undo2 size={size} /></button>
      <button className={btn} onClick={redo} disabled={busy || !future.length} title={`Redo (${REDO_KEYS})`} aria-label="Redo"><Redo2 size={size} /></button>
      {saved && (
        <button className={btn} onClick={() => useVersionHistory.setState({ open: true })} title="Version history" aria-label="Version history"><History size={size} /></button>
      )}
    </div>
  )
}

/** What the latest undo or redo did (*Undone: Kraków: 3 → 5 nights*), for a few seconds at the top of the map (on a
 *  phone, of the screen); a new one takes its place. */
export function UndoNotice({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  const notice = useHistory((s) => s.notice)
  const [gone, setGone] = useState<number | null>(null)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setGone(notice.id), NOTICE_MS)
    return () => clearTimeout(t)
  }, [notice])
  const shown = notice && gone !== notice.id ? notice : null
  return (
    <div className={`pointer-events-none flex justify-center ${className}`} style={style} aria-live="polite">
      {shown && (
        <div key={shown.id} className="max-w-sm rounded-lg bg-ink px-3.5 py-2 text-[13px] text-panel shadow-lg">
          <p className="font-semibold">{shown.redo ? 'Redone' : 'Undone'}{shown.changes.length === 1 && <span className="font-normal">: {shown.changes[0]}</span>}</p>
          {shown.changes.length > 1 && (
            <ul className="mt-0.5 list-disc pl-4 text-[12px] opacity-85">
              {shown.changes.slice(0, LINES_SHOWN).map((c, i) => <li key={i}>{c}</li>)}
              {shown.changes.length > LINES_SHOWN && <li className="list-none">and {shown.changes.length - LINES_SHOWN} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
