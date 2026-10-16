// My trip, the right panel (ui/rightPanel.ts), in tabs: Today while the trip is under way, then everything the user
// keeps for it in one place: every stop's stays, every journey's tickets, the receipts of what they spent, and the
// journal day by day (each the same as in the city's and journey's panels and the Itinerary, gathered).
import { ChevronsRight, X } from 'lucide-react'
import { MY_TRIP_ICONS, MY_TRIP_LABELS, MY_TRIP_NAME, useMyTripTabs, useRightPanel, type MyTripTab } from '../ui/rightPanel'
import { SwipeTabs } from '../ui/SwipeTabs'
import { JournalView } from './Journal'
import { Receipts } from './Receipts'
import { AllTickets } from './Tickets'
import { Today } from './Today'
import { AllStays } from './Visit'

/** A tab's content. */
const TabBody = ({ tab }: { tab: MyTripTab }) =>
  tab === 'today' ? <Today /> : tab === 'stays' ? <AllStays /> : tab === 'tickets' ? <AllTickets /> : tab === 'receipts' ? <Receipts /> : <JournalView />

/** The panel's tabs and the open one: beside the map, or in a bottom sheet on a phone (`peek`: its tab bar is the
 *  sheet's header). `onHide` folds it away (closes the sheet). */
export function MyTripPanel({ peek, onHide }: { peek?: boolean; onHide?: () => void }) {
  const tabs = useMyTripTabs()
  const picked = useRightPanel((s) => s.tab)
  const setTab = useRightPanel((s) => s.setTab)
  const tab = tabs.includes(picked) ? picked : tabs[0]
  // (Five don't fit a phone with their names, Today's too: then only the open one has its name.)
  const narrow = peek && tabs.length > 4
  return (
    <>
      <nav data-sheet-peek={peek || undefined} className="flex shrink-0 items-center border-b border-line bg-panel px-2" role="tablist" aria-label={MY_TRIP_NAME}>
        {tabs.map((t) => {
          const Icon = MY_TRIP_ICONS[t]
          return (
            <button
              key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} aria-label={MY_TRIP_LABELS[t]}
              className={`-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-[13px] font-medium whitespace-nowrap max-md:px-1 max-md:py-2.5 ${tab === t ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              <Icon size={peek ? 18 : 16} />
              {(!narrow || tab === t) && MY_TRIP_LABELS[t]}
            </button>
          )
        })}
        {onHide && (
          <button onClick={onHide} title={peek ? undefined : 'Hide this panel (more room for the map)'} aria-label={`${peek ? 'Close' : 'Hide'} ${MY_TRIP_NAME}`} className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink">
            {peek ? <X size={18} /> : <ChevronsRight size={16} />}
          </button>
        )}
      </nav>
      {peek ? (
        // (A phone's sheet: swiped between its tabs.)
        <SwipeTabs tabs={tabs} tab={tab} onTab={setTab}>
          {(t) => <div className="h-full overflow-y-auto bg-canvas"><TabBody tab={t} /></div>}
        </SwipeTabs>
      ) : (
        <div key={tab} className="min-h-0 flex-1 overflow-y-auto bg-canvas"><TabBody tab={tab} /></div>
      )}
    </>
  )
}
