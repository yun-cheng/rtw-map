import { X } from 'lucide-react'
import { dismissOutside, undoOutside, useOutside } from '../store/saved'
import { Button } from '../ui/kit'

/** The most lines of changes listed; the rest are counted. */
const MOST = 5

/** "Claude changed this trip": the changes other apps' AI assistants made to the open trip (worker/mcp.ts), picked up
 *  by the page (store/saved.ts), with Undo for all of them; or why edits made here weren't saved. */
export function OutsideNotice() {
  const { changes, undoing, error } = useOutside()
  if (!changes.length && !error) return null
  const apps = [...new Set(changes.map((c) => c.app))]
  const lines = changes.flatMap((c) => c.summary)
  return (
    <div role="status" className="pointer-events-auto w-full max-w-md rounded-lg border border-line bg-panel py-2 pr-1.5 pl-3 text-[13px] shadow-lg">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {changes.length > 0 && (
            <>
              <p className="font-medium">{apps.join(' and ')} changed this trip</p>
              <ul className="mt-0.5 list-disc pl-4 text-[12px] text-muted">
                {lines.slice(0, MOST).map((l, i) => <li key={i}>{l}</li>)}
                {lines.length > MOST && <li className="list-none">and {lines.length - MOST} more</li>}
              </ul>
            </>
          )}
          {error && <p className={`text-[12px] text-danger ${changes.length ? 'mt-1' : ''}`}>{error}</p>}
        </div>
        {changes.length > 0 && <Button onClick={() => void undoOutside()} disabled={undoing}>{undoing ? 'Undoing…' : 'Undo'}</Button>}
        <button onClick={dismissOutside} aria-label="Dismiss" title="Dismiss" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink">
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
