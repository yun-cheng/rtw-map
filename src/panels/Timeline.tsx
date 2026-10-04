import { dataset as ds } from '../data/dataset'
import { addDays, daysBetween, monthOf } from '../planner'
import { useTrip } from '../store/trip'
import { MONTHS, ramp } from '../ui/format'

export function Timeline() {
  const { plan, input, selected, select } = useTrip()
  if (!plan?.stops.length) return null
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
      <div className="relative mt-1 h-1.5" title="Weather comfort during each stay (green = pleasant)">
        {plan.stops.map((s) => {
          const m = ds.climate[s.cityId]?.[monthOf(addDays(s.arrive, Math.floor(s.nights / 2))) - 1]
          return (
            <div key={s.cityId} className="absolute top-0 h-1.5 rounded-full border-r-2 border-panel" style={{ left: pct(daysBetween(start, s.arrive)), width: pct(s.nights), background: m ? ramp(m.comfort) : '#e7e5e4' }} />
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-4 text-[11px] text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-schengen" />Schengen</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-outside" />Outside Schengen</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded-full bg-gradient-to-r from-red-600 via-yellow-500 to-green-600" />Weather comfort</span>
      </div>
    </div>
  )
}
