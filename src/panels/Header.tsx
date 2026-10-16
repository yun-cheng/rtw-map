import { Settings, Sparkles } from 'lucide-react'
import { useTrip } from '../store/trip'
import { dateRange } from '../ui/format'
import { OfflinePill } from '../ui/OfflinePill'
import { useAssistantPanel } from '../ui/assistantPanel'
import { AccountMenu } from './AccountMenu'
import { ThemeButton } from './ThemeButton'
import { SHARED_TOKEN } from '../store/shareLink'
import { SharedTitle } from './SharedTrip'
import { TripSwitcher } from './TripSwitcher'

/** The top bar on a computer: the trip, its dates, the Assistant (its panel opened
 *  and closed), the theme (currency and °C/°F are in the settings), the account, and the gear for all the settings
 *  (`onSettings`: the settings panel, as on a phone, with the offline map); "Offline" with no connection. */
export function Header({ onSettings }: { onSettings: () => void }) {
  const { plan, input } = useTrip()
  const ai = useAssistantPanel()

  return (
    <header className="flex h-12 items-center gap-4 border-b border-line bg-panel px-4">
      <div className="flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap">
        <img src="/favicon.svg" alt="" className="h-5 w-5" />
        rtw-map
      </div>
      {SHARED_TOKEN ? <SharedTitle /> : <TripSwitcher />}
      {plan && (
        <div className="flex min-w-0 items-center gap-4 overflow-hidden text-[13px] whitespace-nowrap">
          <span>{dateRange(input.startDate, input.endDate)} · <b>{plan.totalNights}</b> nights · <b>{plan.stops.length}</b> stops</span>
        </div>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <OfflinePill className="mr-1.5 h-7" />
        {!SHARED_TOKEN && (
          <button
            onClick={() => (ai.open ? ai.hide() : ai.show())}
            aria-pressed={ai.open}
            title={ai.open ? 'Close the Assistant' : 'Open the Assistant'}
            className={`mr-1.5 flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium ${ai.open ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}
          >
            <Sparkles size={15} />
            Assistant
          </button>
        )}
        <ThemeButton />
        <button onClick={onSettings} aria-label="Settings" title="Settings" className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink">
          <Settings size={17} />
        </button>
        {!SHARED_TOKEN && <div className="ml-1.5"><AccountMenu /></div>}
      </div>
    </header>
  )
}
