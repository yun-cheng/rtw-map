import { useEffect } from 'react'
import { dataset as ds } from '../data/dataset'
import { addDays, daysBetween, monthOf } from '../planner'
import { useTrip } from '../store/trip'
import { MONTHS, WEATHER_STYLE, shownTemps, tempBand, weatherKind, type WeatherKind } from '../ui/format'
import { FeelsToggle } from '../ui/FeelsToggle'
import { useSideScroll } from '../ui/useSideScroll'

/** At least this many pixels per day, so long trips scroll sideways instead of squeezing stops into slivers. */
const PX_PER_DAY = 12

export function Timeline() {
  const { plan, input, selected, select, tempUnit: unit, tempFeels } = useTrip()
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
      {/* Months, stops and weather scroll sideways together when the trip doesn't fit (scrollbar, or the mouse wheel). */}
      <div ref={scroller.ref} className="thin-scrollbar -mt-1 overflow-x-auto pt-1 pb-1.5">
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
              const schengen = ds.countries[city.iso2]?.schengen
              const isSel = selected?.type === 'city' && selected.id === s.cityId
              const overnight = plan.legs[i]?.overnight
              return (
                <div key={s.cityId}>
                  <button
                    data-city={s.cityId}
                    onClick={() => select({ type: 'city', id: s.cityId })}
                    title={`${i + 1}. ${city.name}: ${s.nights} nights`}
                    className={`absolute top-0 h-9 overflow-hidden rounded-sm border-r-2 border-panel px-1 text-left text-[11px] leading-9 font-medium whitespace-nowrap text-white ${isSel ? 'ring-2 ring-ink ring-offset-1' : ''}`}
                    style={{ left: pct(from), width: pct(s.nights), background: schengen ? 'var(--color-schengen)' : 'var(--color-outside)' }}
                  >
                    {city.name}
                  </button>
                  {overnight && (
                    <div title="Overnight travel" className="absolute top-0 h-9 bg-[repeating-linear-gradient(45deg,#d6d3d1_0_3px,#f5f5f4_3px_6px)]" style={{ left: pct(from + s.nights), width: pct(1) }} />
                  )}
                </div>
              )
            })}
          </div>
          <div className="relative mt-1 h-1.5" title="Weather during each stay">
            {plan.stops.map((s) => {
              const m = ds.climate[s.cityId]?.[monthOf(addDays(s.arrive, Math.floor(s.nights / 2))) - 1]
              return (
                <div key={s.cityId} className="absolute top-0 h-1.5 rounded-full border-r-2 border-panel" style={{ left: pct(daysBetween(start, s.arrive)), width: pct(s.nights), background: m ? WEATHER_STYLE[weatherKind({ tHigh: shownTemps(m, tempFeels).high, rainDays: m.rainDays })].color : 'var(--color-line)' }} />
              )
            })}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-schengen" />Schengen</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-outside" />Outside Schengen</span>
        <span className="flex items-center gap-2">
          Weather:
          <FeelsToggle />
          {(Object.keys(WEATHER_STYLE) as WeatherKind[]).map((k) => (
            <span key={k} className="flex items-center gap-1" title={k === 'wet' ? 'Mild but rainy: 14 or more rain days in the month' : tempFeels ? 'Average daily high, as it feels' : 'Average daily high'}>
              <span className="inline-block h-2 w-3 rounded-full" style={{ background: WEATHER_STYLE[k].color }} />
              {k === 'wet' ? 'Wet' : tempBand(k, unit)}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}
