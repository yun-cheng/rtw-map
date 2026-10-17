// Whether something the user keeps shows on the trip's shared link (store/itemsCore.ts and journalCore.ts, `public`):
// the switch in its editor, and the mark on it when it does. Private unless switched.
import { Globe, Lock } from 'lucide-react'
import { SHARED_TOKEN } from '../store/shareLink'

/** What the link shows of a stay or ticket (never its booking reference, price, link, address or note), or of an
 *  expense (never its note). */
const SHOWN = {
  booking: ' (its name, dates and places; never the booking ref, price, link, address or note)',
  expense: ' (what, how much and when; never its note)',
}

/** `of`: a stay or ticket, or an expense, of which the link shows only some. */
export function PublicToggle({ on, onChange, of }: { on: boolean; onChange: (on: boolean) => void; of?: keyof typeof SHOWN }) {
  const shown = `Shown on the trip's shared link${of ? SHOWN[of] : ''}`
  return (
    <button
      role="switch" aria-checked={on} onClick={() => onChange(!on)} title={on ? `${shown}: click to make it private` : 'Private: click to show it on the trip\'s shared link'}
      className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] hover:bg-canvas ${on ? 'text-accent' : 'text-muted hover:text-ink'}`}
    >
      {on ? <Globe size={12} /> : <Lock size={12} />}{on ? 'Public' : 'Private'}
    </button>
  )
}

/** The mark on something shown on the shared link (not on the shared page itself, where everything is). */
export function PublicMark({ on }: { on?: boolean }) {
  if (!on || SHARED_TOKEN) return null
  return <span title="Shown on the trip's shared link" aria-label="Public" role="img" className="inline-flex shrink-0 text-muted"><Globe size={12} /></span>
}
