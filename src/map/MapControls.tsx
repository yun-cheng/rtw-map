import type { SchengenSummary } from '../planner'
import { useTrip, type MapLayer } from '../store/trip'
import { MODE_COLOR, MONTHS, WEATHER_STYLE, tempBand, type TempUnit } from '../ui/format'

const LAYERS: { value: MapLayer; label: string }[] = [
  { value: 'none', label: 'Route' },
  { value: 'climate', label: 'Weather' },
  { value: 'air', label: 'Air' },
  { value: 'cost', label: 'Cost' },
  { value: 'cards', label: 'Cards' },
  { value: 'english', label: 'English' },
  { value: 'schengen', label: 'Schengen' },
  { value: 'advisory', label: 'Safety' },
]

const LEGENDS: Partial<Record<MapLayer, { color: string; label: string }[]>> = {
  air: [{ color: '#16a34a', label: 'Clean' }, { color: '#eab308', label: 'Moderate' }, { color: '#dc2626', label: 'Polluted' }],
  cost: [{ color: '#16a34a', label: 'Cheap' }, { color: '#eab308', label: 'Medium' }, { color: '#dc2626', label: 'Expensive' }],
  cards: [{ color: '#16a34a', label: 'Cards everywhere' }, { color: '#eab308', label: 'Mixed' }, { color: '#dc2626', label: 'Cash only' }],
  english: [{ color: '#16a34a', label: 'Easy' }, { color: '#eab308', label: 'Mixed' }, { color: '#dc2626', label: 'Hard' }],
  schengen: [{ color: '#2563eb', label: 'Schengen area' }, { color: '#d97706', label: 'Outside Schengen' }],
  advisory: [{ color: '#16a34a', label: 'Normal' }, { color: '#eab308', label: 'Increased caution' }, { color: '#f97316', label: 'Avoid parts' }, { color: '#dc2626', label: 'Do not travel' }],
}

/** Weather legend: the temperature classes as ranges of the average daily high (rain is the ring, see RainRing). */
const temperatureLegend = (unit: TempUnit) =>
  (['cold', 'cool', 'pleasant', 'warm', 'hot'] as const).map((k) => ({ color: WEATHER_STYLE[k].color, label: tempBand(k, unit) }))

/** Travel modes in the Route view's legend; minibuses share the bus colour. */
const MODES = [
  { modes: ['train'], label: 'Train' },
  { modes: ['bus', 'minibus'], label: 'Bus' },
  { modes: ['ferry'], label: 'Ferry' },
  { modes: ['flight'], label: 'Flight' },
]

export function MapControls() {
  const { layer, setLayer, layerMonth, setLayerMonth, plan, tempUnit } = useTrip()
  const legend = layer === 'climate' ? temperatureLegend(tempUnit) : LEGENDS[layer]
  return (
    <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-2">
      <div className="pointer-events-auto flex rounded-lg border border-line bg-panel p-0.5 shadow-sm">
        {LAYERS.map((l) => (
          <button
            key={l.value}
            onClick={() => setLayer(l.value)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${layer === l.value ? 'bg-ink text-panel' : 'text-muted hover:text-ink'}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      {(layer === 'climate' || layer === 'air') && (
        <div className="pointer-events-auto flex rounded-lg border border-line bg-panel p-0.5 shadow-sm">
          <button
            onClick={() => setLayerMonth(0)}
            title="Each stop in the month you're there; other cities in the month you're at the nearest stop"
            className={`rounded-md px-2 py-1 text-[11px] font-medium ${layerMonth === 0 ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'}`}
          >
            Trip dates
          </button>
          {MONTHS.map((m, i) => (
            <button
              key={m}
              onClick={() => setLayerMonth(i + 1)}
              className={`rounded-md px-1.5 py-1 text-[11px] font-medium ${layerMonth === i + 1 ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'}`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
      {layer === 'none' && plan && <RouteLegend modes={new Set(plan.legs.flatMap((l) => l.hops.map((h) => h.mode)))} />}
      {legend && (
        <div className="pointer-events-auto flex gap-3 rounded-lg border border-line bg-panel/95 px-2.5 py-1.5 text-[11px] shadow-sm">
          {layer === 'climate' && <span className="text-muted" title="Average daily high in the month">High</span>}
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
          {layer === 'climate' && <RainRing />}
          {layer === 'schengen' && plan && <SchengenDays s={plan.schengen} />}
        </div>
      )}
    </div>
  )
}

/** Legend for the weather layer's rain ring: a sample ring a third blue, the rest white as on the map. */
function RainRing() {
  const r = 5
  const c = 2 * Math.PI * r
  return (
    <span className="flex items-center gap-1.5 border-l border-line pl-3" title="The ring around each stop: blue for the share of days with rain that month, white for dry days">
      <svg viewBox="0 0 14 14" className="h-4 w-4 -rotate-90" aria-hidden>
        <circle cx="7" cy="7" r={r + 1.25} fill="none" strokeWidth="0.5" style={{ stroke: 'var(--color-line)' }} />
        <circle cx="7" cy="7" r={r - 1.25} fill={WEATHER_STYLE.pleasant.color} />
        <circle cx="7" cy="7" r={r} fill="none" strokeWidth="1.75" stroke="#ffffff" />
        <circle cx="7" cy="7" r={r} fill="none" strokeWidth="1.75" strokeDasharray={`${c / 3} ${c}`} style={{ stroke: 'var(--color-schengen)' }} />
      </svg>
      Ring: rainy days
    </span>
  )
}

/** A short sample of a route line. */
const Line = ({ color, dashed }: { color: string; dashed?: boolean }) => (
  <svg viewBox="0 0 18 4" className="h-1 w-[18px]" aria-hidden>
    <line x1="1" y1="2" x2="17" y2="2" stroke={color} strokeWidth="3" strokeLinecap={dashed ? 'butt' : 'round'} strokeDasharray={dashed ? '4 3' : undefined} />
  </svg>
)

/** Legend for the Route view: how each journey is travelled and which times are estimates. */
function RouteLegend({ modes }: { modes: Set<string> }) {
  const used = MODES.filter((m) => m.modes.some((x) => modes.has(x)))
  return (
    <div className="pointer-events-auto flex max-w-[34rem] flex-wrap gap-x-3 gap-y-1 rounded-lg border border-line bg-panel/95 px-2.5 py-1.5 text-[11px] shadow-sm">
      {used.map((m) => (
        <span key={m.label} className="flex items-center gap-1.5"><Line color={MODE_COLOR[m.modes[0]]} />{m.label}</span>
      ))}
      <span className="flex items-center gap-1.5 border-l border-line pl-3" title="Times and prices from timetable data"><Line color="var(--color-muted)" />Timetable</span>
      <span className="flex items-center gap-1.5" title="No timetable data yet: a bus is assumed, with time and price estimated from the road distance"><Line color="var(--color-muted)" dashed />Estimated</span>
    </div>
  )
}

/** The Schengen view's day count: most days inside the area in any 180-day window, against the 90-day limit. */
function SchengenDays({ s }: { s: SchengenSummary }) {
  if (!s.applies) return <span className="border-l border-line pl-3 text-muted">No 90/180-day limit for your passport</span>
  const over = s.maxInWindow > s.limit
  return (
    <span className="flex items-center gap-2 border-l border-line pl-3" title="Most days inside the Schengen area in any 180-day window during the trip (counting days before it, if set)">
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-line">
        <span className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-danger' : 'bg-schengen'}`} style={{ width: `${Math.min(100, (s.maxInWindow / s.limit) * 100)}%` }} />
      </span>
      <span className={over ? 'font-semibold text-danger' : ''}>{s.maxInWindow} of {s.limit} days</span>
    </span>
  )
}
