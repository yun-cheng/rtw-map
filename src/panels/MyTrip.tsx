// My trip, the right panel (ui/rightPanel.ts): everything the user keeps for the trip in one place, in tabs: every
// stop's stays, every journey's tickets, the receipts of what they spent, and the journal day by day. Each is the
// same as in the city's and journey's panels, Today and the Itinerary, gathered.
import { ChevronsRight, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { MY_TRIP_ICONS, MY_TRIP_LABELS, MY_TRIP_TABS, useRightPanel } from '../ui/rightPanel'
import { JournalView } from './Journal'
import { Receipts } from './Receipts'
import { AllTickets } from './Tickets'
import { AllStays } from './Visit'

/** The panel's tabs and the open one: beside the map, or in a bottom sheet on a phone (`peek`: its tab bar is the
 *  sheet's header). `onHide` folds it away (closes the sheet). `over`: a city's or journey's panel open in its place, under its tabs
 *  (a tab closes it: `onLeave`); the open tab stays mounted under it, so nothing being written is lost. */
export function MyTripPanel({ peek, onHide, over, onLeave }: { peek?: boolean; onHide?: () => void; over?: ReactNode; onLeave?: () => void }) {
  const { tab, setTab } = useRightPanel()
  return (
    <>
      <nav data-sheet-peek={peek || undefined} className="flex shrink-0 items-center border-b border-line bg-panel px-2" role="tablist" aria-label="My trip">
        {MY_TRIP_TABS.map((t) => {
          const Icon = MY_TRIP_ICONS[t]
          return (
            <button
              key={t} role="tab" aria-selected={!over && tab === t} onClick={() => { if (over) onLeave?.(); setTab(t) }}
              className={`-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-[13px] font-medium whitespace-nowrap max-md:px-1 max-md:py-2.5 ${!over && tab === t ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              <Icon size={peek ? 18 : 16} />
              {MY_TRIP_LABELS[t]}
            </button>
          )
        })}
        {onHide && (
          <button onClick={onHide} title={peek ? undefined : 'Hide this panel (more room for the map)'} aria-label={peek ? 'Close My trip' : 'Hide My trip'} className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink">
            {peek ? <X size={18} /> : <ChevronsRight size={16} />}
          </button>
        )}
      </nav>
      {over && <div className="min-h-0 flex-1 overflow-y-auto bg-canvas">{over}</div>}
      <div key={tab} className={`min-h-0 flex-1 overflow-y-auto bg-canvas ${over ? 'hidden' : ''}`}>
        {tab === 'stays' ? <AllStays /> : tab === 'tickets' ? <AllTickets /> : tab === 'receipts' ? <Receipts /> : <JournalView />}
      </div>
    </>
  )
}
