// Update plan: the assistant updates the plan for what changed since it was made (planChanges: the setup, the user's
// own edits to the stops, nights that no longer add up to the dates), keeping the rest and the user's edits. Nothing
// re-fits the plan by itself, so this is how an edit by hand gets the rest of the plan to follow. Review changes (in
// the Trip tab's footer and pinned to the bottom of the Itinerary tab) lists them, with Update plan, which, with
// "Make a new plan" ticked ("Plan the rest of the trip again" on a trip under way), replans instead: the assistant plans the trip again from scratch (from tomorrow on a
// trip under way), replacing the plan's stops. Replanning alone (no changes) is the Trip tab's button.
import { useAccount } from '../agent/account'
import { useChat } from '../agent/chat'
import { CHANGE_GROUPS, planChangeList } from '../agent/tools'
import { isTravelling, localToday } from '../planner'
import { MAX_PLANS, tripPlans, useTrip } from '../store/trip'
import { ask, type Answer } from '../ui/dialog'
import { Button } from '../ui/kit'

/** What changed since the plan, and the actions that send the assistant to work (and show its tab): update the plan
 *  for them, or plan the trip again (`copy`: in a copy of the plan, which keeps this one), and what replanning
 *  replaces (`replanning`: the question before it). */
export function usePlanUpdate() {
  const s = useTrip()
  const { input, stops, plan, setPanel, addPlan } = s
  const changes = planChangeList({ input, stops, plan })
  const travelling = stops.length > 0 && isTravelling(input, localToday())
  const update = () => {
    const later = travelling ? ' The trip is under way: change only what comes after today.' : ''
    void useChat.getState().send(`Update my plan for what changed since it was made: ${changes.map((c) => c.text).join('; ')}. Keep the rest of the plan and my own edits.${later}`, [], { think: true, plan: 'update' })
    setPanel('assistant')
  }
  // Plans are made with the assistant, so only signed in: a clean plan each time (chat.ts `plan`), made with its usual
  // tools (so the app's rules still hold), thinking harder, since fitting several wishes into a trip takes planning.
  // On a trip under way, only what comes after today is planned again.
  const replan = (copy = false) => {
    if (copy) addPlan()
    const wishes = input.wishes?.trim()
    const what = travelling ? 'Replan my trip from tomorrow on (keep the days so far as they were)' : 'Plan my trip from scratch'
    void useChat.getState().send(`${what}, to my setup, preferences and interests${wishes ? `, and these wishes: ${wishes}` : '.'}`, [], { think: true, plan: 'new' })
    setPanel('assistant')
  }
  const plans = tripPlans(s)
  const name = plans.find((p) => p.id === s.activePlanId)?.name ?? 'This plan'
  const stopsText = `${stops.length} stop${stops.length === 1 ? '' : 's'}`
  const replanning = {
    from: travelling ? 'tomorrow' : 'scratch',
    label: travelling ? 'Plan the rest of the trip again' : 'Make a new plan',
    note: 'The current plan stays in the version history.',
    message: `${travelling ? `It keeps the days so far and replaces the rest of ${name}.` : `It replaces ${name}'s ${stopsText}.`} You can go back to them in the version history.`,
    // (A copy of the plan, replanned instead, while there's room for another plan.)
    answers: [...(plans.length < MAX_PLANS ? [{ label: 'Replan a copy', value: 'copy' }] : []), { label: 'Replan', value: 'replan', danger: true }] as Answer[],
  }
  /** Replanning, asked first when it replaces stops. */
  const askReplan = async () => {
    if (!stops.length) return replan()
    const answer = await ask({ title: `Replan ${name} from ${replanning.from}?`, message: replanning.message, answers: replanning.answers })
    if (answer) replan(answer === 'copy')
  }
  return { changes, update, replan, replanning, askReplan }
}

/** "Review changes · 3": what changed since the plan, in a dialog in groups (dates, places, stops, preferences, plans),
 *  with Update plan, which replans with "Make a new plan" ticked (`canUpdate`; else why not). */
export function ReviewChanges({ canUpdate, why, className = '' }: { canUpdate: boolean; why?: string; className?: string }) {
  const { changes, update, replan, replanning } = usePlanUpdate()
  const review = async () => {
    const answer = await ask({
      title: 'Changed since this plan',
      // (Why not, when it can't.)
      message: canUpdate ? undefined : why,
      // (Starting over keeps the setup's changes, not the edits to the stops.)
      lists: CHANGE_GROUPS.map((heading) => ({ heading, items: changes.filter((c) => c.group === heading).map((c) => c.text), dropped: heading === 'Stops' })).filter((l) => l.items.length),
      answers: canUpdate ? [{ label: '✨ Update plan', value: 'update' }] : [],
      cancel: 'Close',
      ...(canUpdate && { toggle: { label: replanning.label, note: replanning.note, toggled: ':replan' } }),
    })
    if (answer === 'update') update()
    else if (answer === 'update:replan') replan()
  }
  return (
    <Button variant="primary" className={`py-2 text-[14px] ${className}`} onClick={() => void review()} title={changes.map((c) => c.text).join('\n')}>
      Review changes · {changes.length}
    </Button>
  )
}

/** Pinned to the bottom of the Itinerary tab (like the Trip tab's plan buttons), after edits by hand or setup
 *  changes: Review changes, with Update plan. */
export function UpdatePlanBar() {
  const { changes } = usePlanUpdate()
  const busy = useChat((s) => s.busy)
  const user = useAccount((s) => s.user)
  if (!changes.length || busy) return null
  return (
    <div className="sticky bottom-0 mt-auto border-t border-line bg-panel p-3">
      <ReviewChanges canUpdate={!!user} why="Sign in to update the plan with AI." className="w-full" />
    </div>
  )
}
