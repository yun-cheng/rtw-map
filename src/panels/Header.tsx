import { useRef } from 'react'
import { exportTrip, useTrip } from '../store/trip'
import { dataset as ds } from '../data/dataset'
import { shortDate } from '../ui/format'
import { Button } from '../ui/kit'
import { useMoney } from '../ui/useMoney'

export function Header() {
  const { plan, input, importTrip, setCurrency } = useTrip()
  const { currency, fmt } = useMoney()
  const file = useRef<HTMLInputElement>(null)

  const onImport = async (f: File | undefined) => {
    if (!f) return
    try {
      const data = JSON.parse(await f.text())
      if (data?.app !== 'rtw-map' || !data.input || !Array.isArray(data.stops)) throw new Error('Not an rtw-map trip file')
      importTrip(data)
    } catch (e) {
      alert(`Could not import: ${(e as Error).message}`)
    }
  }

  const s = plan?.schengen
  const sOver = s && s.applies && s.maxInWindow > s.limit

  return (
    <header className="flex h-12 items-center gap-4 border-b border-line bg-panel px-4">
      <div className="flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap">
        <img src="/favicon.svg" alt="" className="h-5 w-5" />
        rtw-map
      </div>
      {plan && (
        <div className="flex min-w-0 items-center gap-4 overflow-hidden text-[13px] whitespace-nowrap">
          <span>{shortDate(input.startDate)} – {shortDate(input.endDate)} · <b>{plan.totalNights}</b> nights · <b>{plan.stops.length}</b> stops</span>
          <span title="Estimated total for your budget style, including transport between cities">
            <b>{fmt(plan.cost.min)}–{fmt(plan.cost.max)}</b> <span className="text-muted">(~{fmt(plan.cost.perDay)}/day)</span>
          </span>
          {s?.applies && (s.days > 0 || input.schengenDaysBefore > 0) && (
            <span className="flex items-center gap-2" title="Most Schengen days in any 180-day window during the trip">
              <span className="text-muted">Schengen</span>
              <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-line">
                <span className={`absolute inset-y-0 left-0 rounded-full ${sOver ? 'bg-danger' : 'bg-schengen'}`} style={{ width: `${Math.min(100, (s.maxInWindow / s.limit) * 100)}%` }} />
              </span>
              <b className={sOver ? 'text-danger' : ''}>{s.maxInWindow}/{s.limit}</b>
            </span>
          )}
        </div>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          title={`Show prices in this currency. ${ds.meta.fx.source}, ${ds.meta.fx.updatedAt}`}
          className="rounded-md border border-line bg-panel px-1.5 py-1 text-[13px] font-medium"
          aria-label="Display currency"
        >
          {ds.fx.display.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button variant="ghost" onClick={() => file.current?.click()}>Import</Button>
        <Button variant="ghost" onClick={exportTrip} disabled={!plan}>Export</Button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = '' }} />
      </div>
    </header>
  )
}
