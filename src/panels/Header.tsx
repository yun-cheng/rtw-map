import { useTrip } from '../store/trip'
import { dataset as ds } from '../data/dataset'
import { shortDate } from '../ui/format'
import { useMoney } from '../ui/useMoney'
import { AccountMenu } from './AccountMenu'
import { ThemeMenu } from './ThemeMenu'
import { TripSwitcher } from './TripSwitcher'

export function Header() {
  const { plan, input, setCurrency, tempUnit, setTempUnit } = useTrip()
  const { currency, fmt } = useMoney()

  return (
    <header className="flex h-12 items-center gap-4 border-b border-line bg-panel px-4">
      <div className="flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap">
        <img src="/favicon.svg" alt="" className="h-5 w-5" />
        rtw-map
      </div>
      <TripSwitcher />
      {plan && (
        <div className="flex min-w-0 items-center gap-4 overflow-hidden text-[13px] whitespace-nowrap">
          <span>{shortDate(input.startDate)} – {shortDate(input.endDate)} · <b>{plan.totalNights}</b> nights · <b>{plan.stops.length}</b> stops</span>
          <span title="Estimated total for your budget style, including transport between cities">
            <b>{fmt(plan.cost.min)}–{fmt(plan.cost.max)}</b> <span className="text-muted">(~{fmt(plan.cost.perDay)}/day)</span>
          </span>
        </div>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          title="Show prices in this currency"
          className="rounded-md border border-line bg-panel px-1.5 py-1 text-[13px] font-medium"
          aria-label="Display currency"
        >
          {ds.fx.display.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex rounded-md border border-line p-0.5 text-[12px] font-medium" role="group" aria-label="Temperature unit" title="Show temperatures in Celsius or Fahrenheit">
          {(['C', 'F'] as const).map((u) => (
            <button
              key={u}
              onClick={() => setTempUnit(u)}
              aria-pressed={tempUnit === u}
              className={`rounded px-1.5 py-0.5 ${tempUnit === u ? 'bg-ink text-panel' : 'text-muted hover:text-ink'}`}
            >
              °{u}
            </button>
          ))}
        </div>
        <ThemeMenu />
        <div className="ml-1.5"><AccountMenu /></div>
      </div>
    </header>
  )
}
