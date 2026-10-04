import { useState } from 'react'
import { dataset as ds } from '../data/dataset'
import type { PlanWarning } from '../planner'
import { useTrip } from '../store/trip'
import { MODE_ICON, cityName, duration, flag, shortDate } from '../ui/format'
import { Badge, Button } from '../ui/kit'
import { useMoney } from '../ui/useMoney'

export function Itinerary() {
  const { plan, selected, select, setNights, toggleLock, removeStop, moveStop, rebalance, reoptimize } = useTrip()
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const { fmt } = useMoney()
  if (!plan) return null

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-2">
        <h2 className="flex-1 text-[15px] font-semibold">Itinerary <span className="font-normal text-muted">· {plan.stops.length} stops</span></h2>
        <Button onClick={rebalance} title="Re-assign nights to unlocked stops so they fill your dates">Rebalance</Button>
        <Button onClick={reoptimize} title="Re-order stops for the shortest route">Re-order</Button>
      </div>

      <Warnings warnings={plan.warnings} />

      <ol className="px-2 pb-6">
        {plan.stops.map((s, i) => {
          const city = ds.cities[s.cityId]
          const leg = plan.legs[i]
          const isSel = selected?.type === 'city' && selected.id === s.cityId
          return (
            <li key={s.cityId}>
              <div
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => { e.preventDefault(); setOver(i) }}
                onDragLeave={() => setOver(null)}
                onDrop={() => { if (drag !== null && drag !== i) moveStop(drag, i); setDrag(null); setOver(null) }}
                onDragEnd={() => { setDrag(null); setOver(null) }}
                onClick={() => select({ type: 'city', id: s.cityId })}
                className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ${isSel ? 'bg-accent-soft' : 'hover:bg-canvas'} ${over === i && drag !== i ? 'ring-2 ring-accent' : ''} ${drag === i ? 'opacity-40' : ''}`}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ background: ds.countries[city.iso2]?.schengen ? 'var(--color-schengen)' : 'var(--color-outside)' }}
                  title={ds.countries[city.iso2]?.schengen ? 'Schengen area' : 'Outside Schengen'}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{flag(city.iso2)} {city.name}</div>
                  <div className="text-[11px] text-muted">{shortDate(s.arrive)} – {shortDate(s.depart)}</div>
                </div>
                <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <StepBtn onClick={() => setNights(i, s.nights - 1)} disabled={s.nights <= 1} label="One night less">−</StepBtn>
                  <span className="w-7 text-center text-[13px] font-semibold tabular-nums" title="Nights">{s.nights}</span>
                  <StepBtn onClick={() => setNights(i, s.nights + 1)} label="One night more">+</StepBtn>
                  <button onClick={() => toggleLock(i)} title={s.locked ? 'Locked: Rebalance keeps these nights' : 'Lock nights'} className={`ml-0.5 h-6 w-6 rounded text-[12px] ${s.locked ? 'text-ink' : 'text-muted opacity-0 group-hover:opacity-100'} hover:bg-panel`}>
                    {s.locked ? '🔒' : '🔓'}
                  </button>
                  <button onClick={() => removeStop(i)} title="Remove stop" className="h-6 w-6 rounded text-[12px] text-muted opacity-0 group-hover:opacity-100 hover:bg-panel hover:text-danger">✕</button>
                </div>
              </div>
              {leg && (
                <button
                  onClick={() => select({ type: 'leg', index: i })}
                  className={`ml-[19px] flex w-[calc(100%-19px)] items-center gap-2 border-l-2 py-1 pl-4 text-left text-[12px] ${selected?.type === 'leg' && selected.index === i ? 'border-ink text-ink' : 'border-line text-muted hover:text-ink'} ${!leg.reachable ? 'text-danger' : ''}`}
                >
                  {leg.reachable ? (
                    <>
                      <span>{leg.hops.map((h) => MODE_ICON[h.mode] ?? '•').join(' ')}</span>
                      <span>{duration(leg.durationMin)}</span>
                      <span>· {fmt(leg.priceMin)}–{fmt(leg.priceMax)}</span>
                      {leg.hops.length > 1 && <span className="truncate">· via {leg.hops.slice(0, -1).map((h) => cityName(h.to)).join(', ')}</span>}
                      {leg.overnight && <Badge>night</Badge>}
                      {leg.estimated && <span title="Estimated from road distance">≈</span>}
                    </>
                  ) : (
                    <span>No known route</span>
                  )}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function StepBtn({ label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} className="h-6 w-6 rounded border border-line bg-panel text-[13px] leading-none hover:bg-canvas disabled:opacity-30" {...props} />
}

const ORDER = { error: 0, warn: 1, info: 2 }
function Warnings({ warnings }: { warnings: PlanWarning[] }) {
  const [open, setOpen] = useState(true)
  const select = useTrip((s) => s.select)
  if (!warnings.length) return null
  const sorted = [...warnings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
  const counts = { error: 0, warn: 0, info: 0 }
  warnings.forEach((w) => counts[w.severity]++)
  return (
    <div className="mx-4 mb-2 rounded-lg border border-line">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold">
        <span className="flex-1">Checks</span>
        {counts.error > 0 && <Badge tone="error">{counts.error} problem{counts.error > 1 ? 's' : ''}</Badge>}
        {counts.warn > 0 && <Badge tone="warn">{counts.warn} warning{counts.warn > 1 ? 's' : ''}</Badge>}
        {counts.info > 0 && <Badge>{counts.info} note{counts.info > 1 ? 's' : ''}</Badge>}
        <span className="text-muted">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="max-h-64 overflow-y-auto border-t border-line">
          {sorted.map((w, i) => (
            <li key={i} className="flex gap-2 border-b border-line px-3 py-1.5 text-[12px] last:border-0">
              <span className={w.severity === 'error' ? 'text-danger' : w.severity === 'warn' ? 'text-warn' : 'text-info'}>
                {w.severity === 'error' ? '●' : w.severity === 'warn' ? '▲' : 'ℹ'}
              </span>
              <div className="min-w-0 flex-1">
                <button className="text-left font-medium hover:underline disabled:no-underline" disabled={!w.cityId} onClick={() => w.cityId && select({ type: 'city', id: w.cityId })}>
                  {w.title}
                </button>
                {w.detail && <div className="text-muted">{w.detail}</div>}
                {w.url && <a href={w.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">Official source ↗</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
