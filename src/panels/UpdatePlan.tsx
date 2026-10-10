// Update plan: the assistant updates the plan for what changed since it was made (planChanges: the setup, the user's
// own edits to the stops, nights that no longer add up to the dates), keeping the rest and the user's edits. Nothing
// re-fits the plan by itself, so this is how an edit by hand gets the rest of the plan to follow. In the Trip tab's
// footer and above the itinerary.
import { useAccount } from '../agent/account'
import { useChat } from '../agent/chat'
import { planChanges } from '../agent/tools'
import { useTrip } from '../store/trip'
import { Button } from '../ui/kit'

/** What changed since the plan, and the action that sends them to the assistant (and shows its tab). */
export function usePlanUpdate() {
  const { input, stops, plan, setPanel } = useTrip()
  const changes = planChanges({ input, stops, plan })
  const update = () => {
    void useChat.getState().send(`Update my plan for what changed since it was made: ${changes.join('; ')}. Keep the rest of the plan and my own edits.`, [], { think: true, plan: 'update' })
    setPanel('assistant')
  }
  return { changes, update }
}

/** "Changed since this plan: …", the first few (all of them on hover). */
export function ChangesLine({ changes }: { changes: string[] }) {
  return (
    <p className="text-[12px]" title={changes.join('\n')}>
      <span className="font-medium">Changed since this plan:</span>{' '}
      <span className="text-muted">{changes.slice(0, 4).join(' · ')}{changes.length > 4 && ` · +${changes.length - 4} more`}</span>
    </p>
  )
}

/** Pinned to the bottom of the Itinerary tab (like the Trip tab's plan buttons), after edits by hand or setup
 *  changes: what changed, and Update plan. */
export function UpdatePlanBar() {
  const { changes, update } = usePlanUpdate()
  const busy = useChat((s) => s.busy)
  const user = useAccount((s) => s.user)
  if (!changes.length || busy) return null
  return (
    <div className="sticky bottom-0 mt-auto border-t border-line bg-panel p-3">
      <ChangesLine changes={changes} />
      <Button
        variant="primary" className="mt-2 w-full py-2 text-[14px]" disabled={!user} onClick={update}
        title={user ? 'The assistant updates the plan for these changes, keeping the rest and your own edits' : 'Sign in to plan with AI'}
      >
        ✨ Update plan
      </Button>
    </div>
  )
}
