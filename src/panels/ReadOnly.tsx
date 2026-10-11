// Read-only trips: a lock so neither the user nor the assistant changes the trip by accident (e.g. once it's under
// way). The store ignores every change while it's on (tripCore.ts) and the assistant's tools are refused; here, the
// switch, and what hides or disables the app's own controls.
import { Lock, LockOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { useChat } from '../agent/chat'
import { useTrip } from '../store/trip'

/** True while the trip is read-only. */
const useReadOnly = () => useTrip((s) => s.readOnly)

/** Controls that change the trip: disabled while it's read-only (a fieldset, so every input and button in it). */
export function Editable({ children }: { children: ReactNode }) {
  const readOnly = useReadOnly()
  return <fieldset disabled={readOnly} className="contents">{children}</fieldset>
}

/** The switch, at the end of the plan bar: "Read-only" while on, a lock to turn it on otherwise. Not while the
 *  assistant is working (its changes would be cut off halfway). */
export function ReadOnlyToggle() {
  const readOnly = useReadOnly()
  const busy = useChat((s) => s.busy)
  const toggle = () => {
    const { setReadOnly, setPicking } = useTrip.getState()
    setReadOnly(!readOnly)
    if (!readOnly) setPicking(null)
  }
  return (
    <button
      onClick={toggle} disabled={busy} aria-pressed={readOnly}
      title={readOnly
        ? 'Read-only: nothing in this trip changes, by you or the assistant. Click to edit it again.'
        : 'Make the trip read-only, so nothing changes by accident (you or the assistant)'}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium disabled:opacity-40 ${readOnly ? 'bg-ink text-panel' : 'text-muted hover:text-ink'}`}
    >
      {readOnly ? <Lock size={12} /> : <LockOpen size={12} />}
      {readOnly ? 'Read-only' : <span className="sr-only">Make read-only</span>}
    </button>
  )
}
