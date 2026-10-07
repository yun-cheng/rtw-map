import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { dataset as ds } from '../data/dataset'
import { addDays, daysBetween, monthOf } from '../planner'
import { useTrip } from '../store/trip'
import { cityMetrics, stopTip, tipText, type TipContent } from '../map/cityMetric'
import { MONTHS, STOP_COLOR } from '../ui/format'
import { HoverTip, type Tip } from '../ui/HoverTip'
import { useSideScroll } from '../ui/useSideScroll'

/** A bar's hover box: the map's, without the city name (it's on the bar); "Day 3 · 4 nights" in the Route view. */
const barTip = (t: TipContent): TipContent => ({ lines: t.lines ?? (t.sub ? [t.sub] : []) })

/** At least this many pixels per day, so long trips scroll sideways instead of squeezing stops into slivers. */
const PX_PER_DAY = 12

export function Timeline() {
  const { plan, input, selected, select, layer, layerMonth, nearbyKind, weatherBy, currency, tempUnit, tempFeels } = useTrip()
  // Each stop in the map's colour for the current view, with the map's hover text.
  const metric = useMemo(
    () => cityMetrics({ plan, input, layer, layerMonth, nearbyKind, weatherBy, currency, tempUnit, tempFeels }),
    [plan, input, layer, layerMonth, nearbyKind, weatherBy, currency, tempUnit, tempFeels],
  )
  // The map-style hover box for the bar under the pointer.
  const [tip, setTip] = useState<Tip | null>(null)
  const showTip = (content: TipContent) => (e: MouseEvent<HTMLElement>) => setTip({ content, rect: e.currentTarget.getBoundingClientRect() })
  const hideTip = () => setTip(null)
  const hasStops = !!plan?.stops.length
  const scroller = useSideScroll<HTMLDivElement>([hasStops])
  const selectedId = selected?.type === 'city' ? selected.id : null
  // Bring the selected stop into view (from the map or the itinerary).
  useEffect(() => {
    if (selectedId) scroller.ref.current?.querySelector(`[data-city="${selectedId}"]`)?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [selectedId, scroller.ref])
  if (!plan || !hasStops) return null
  const start = input.startDate
  const total = Math.max(1, daysBetween(start, input.endDate))
  const pct = (d: number) => `${(d / total) * 100}%`

  // Month boundaries inside the trip
  const months: { offset: number; label: string }[] = []
  for (let d = 0; d <= total; d++) {
    const iso = addDays(start, d)
    if (d === 0 || iso.endsWith('-01')) months.push({ offset: d, label: `${MONTHS[monthOf(iso) - 1]}${d === 0 || iso.slice(5, 7) === '01' ? ` ${iso.slice(0, 4)}` : ''}` })
  }

  return (
    <div className="border-t border-line bg-panel px-4 pt-2 pb-3">
      {/* Months and stops scroll sideways together when the trip doesn't fit (scrollbar, or the mouse wheel). */}
      <div ref={scroller.ref} className="thin-scrollbar -mt-1 overflow-x-auto pt-1 pb-1.5" onScroll={hideTip}>
        <div style={{ minWidth: total * PX_PER_DAY }}>
          <div className="relative h-4 text-[11px] text-muted">
            {months.map((m) => (
              <span key={m.offset} className="absolute top-0 border-l border-line pl-1" style={{ left: pct(m.offset) }}>{m.label}</span>
            ))}
          </div>
          <div className="relative mt-1 h-9">
            {plan.stops.map((s, i) => {
              const from = daysBetween(start, s.arrive)
              const city = ds.cities[s.cityId]
              const m = metric(s.cityId)
              const isSel = selected?.type === 'city' && selected.id === s.cityId
              const overnight = plan.legs[i]?.overnight
              return (
                <div key={s.cityId}>
                  <button
                    data-city={s.cityId}
                    onClick={() => select({ type: 'city', id: s.cityId })}
                    aria-label={tipText(stopTip(input.startDate, s, m))}
                    onMouseEnter={showTip(barTip(stopTip(input.startDate, s, m)))}
                    onMouseLeave={hideTip}
                    className={`absolute top-0 h-9 overflow-hidden rounded-sm border-r-2 border-panel px-1 text-left text-[11px] leading-9 font-medium whitespace-nowrap text-white ${isSel ? 'ring-2 ring-ink ring-offset-1' : ''}`}
                    style={{ left: pct(from), width: pct(s.nights), background: m.color ?? STOP_COLOR, textShadow: '0 0 3px rgb(0 0 0 / 0.45)' }}
                  >
                    {city.name}
                  </button>
                  {overnight && (
                    <div onMouseEnter={showTip({ title: 'Overnight travel' })} onMouseLeave={hideTip} className="absolute top-0 h-9 bg-[repeating-linear-gradient(45deg,#d6d3d1_0_3px,#f5f5f4_3px_6px)]" style={{ left: pct(from + s.nights), width: pct(1) }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <HoverTip tip={tip} />
    </div>
  )
}
