import { AIRPORT_MIN } from '../planner'
import { useTrip } from '../store/trip'
import { MODE_ICON, cityName, duration, shortDate } from '../ui/format'
import { Badge, Section } from '../ui/kit'
import { useMoney } from '../ui/useMoney'

export function LegDrawer({ index }: { index: number }) {
  const { plan, select } = useTrip()
  const { fmt } = useMoney()
  const leg = plan?.legs[index]
  if (!plan || !leg) return null
  const from = plan.stops[index]
  const date = from.depart

  return (
    <div className="pb-8">
      <div className="sticky top-0 z-10 border-b border-line bg-panel px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold">{cityName(leg.from)} → {cityName(leg.to)}</h2>
            <p className="text-[13px] text-muted">Leg {index + 1} · leaves {shortDate(date)}{leg.overnight && ' · overnight'}</p>
          </div>
          <button onClick={() => select(null)} className="h-7 w-7 rounded text-muted hover:bg-canvas hover:text-ink" aria-label="Close">✕</button>
        </div>
        {leg.reachable ? (
          <>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            <b>{duration(leg.durationMin)}</b>
            <span>· {fmt(leg.priceMin)}–{fmt(leg.priceMax)}</span>
            {leg.estimated && <Badge tone="warn">partly estimated</Badge>}
          </div>
          {leg.hops.some((h) => h.mode === 'flight') && (
            <p className="mt-1 text-[12px] text-muted">Door to door: includes about {AIRPORT_MIN / 60} hours at the airport per flight.</p>
          )}
          </>
        ) : (
          <p className="mt-2 text-[13px] text-danger">No known route between these cities. Add a stop in between or reorder the trip.</p>
        )}
      </div>

      {leg.reachable && (
        <Section title={leg.hops.length > 1 ? `${leg.hops.length} segments` : 'Option'}>
          <ol className="flex flex-col gap-2">
            {leg.hops.map((h, i) => (
              <li key={i} className="rounded-lg border border-line p-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[18px]">{MODE_ICON[h.mode] ?? '•'}</span>
                  <div className="flex-1">
                    <div className="font-medium">{cityName(h.from)} → {cityName(h.to)}</div>
                    <div className="text-[12px] text-muted capitalize">
                      {h.mode} · {duration(h.durationMin)} · {fmt(h.priceMin)}–{fmt(h.priceMax)}{h.frequency && ` · ${h.frequency}`}
                    </div>
                  </div>
                  {h.overnight && <Badge>night option</Badge>}
                  {h.estimated && <Badge tone="warn">estimate</Badge>}
                </div>
                {h.note && <p className="mt-1.5 text-[12px]">{h.note}</p>}
                {h.estimated && <p className="mt-1.5 text-[12px] text-muted">No timetable data yet: time estimated from road distance by bus. Check local bus stations or Rome2Rio.</p>}
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  )
}
