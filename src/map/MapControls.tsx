import type { SchengenSummary } from '../planner'
import { NEARBY_KINDS, useTrip, type MapLayer } from '../store/trip'
import { MODE_COLOR, MONTHS, STOP_COLOR, WEATHER_STYLE, tempBand, type TempUnit } from '../ui/format'
import { FeelsToggle } from '../ui/FeelsToggle'
import { NEARBY_LABELS, airLegend, costScale, mobileLegend, nearbyLegend, type LegendItem } from './scales'

const LAYERS: { value: MapLayer; label: string }[] = [
  { value: 'none', label: 'Route' },
  { value: 'climate', label: 'Weather' },
  { value: 'air', label: 'Air' },
  { value: 'cost', label: 'Cost' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'nearby', label: 'Nearby' },
  { value: 'schengen', label: 'Schengen' },
]

const LEGENDS: Partial<Record<MapLayer, LegendItem[]>> = {
  air: airLegend(),
  mobile: mobileLegend(),
  nearby: nearbyLegend(),
  schengen: [{ color: '#2563eb', label: 'Schengen area' }, { color: '#d97706', label: 'Outside Schengen' }],
}

/** Weather legend: the temperature classes as ranges, the same for highs and lows (rain is the ring, see RainRing). */
const temperatureLegend = (unit: TempUnit): LegendItem[] =>
  (['cold', 'cool', 'pleasant', 'warm', 'hot'] as const).map((k) => ({ color: WEATHER_STYLE[k].color, label: tempBand(k, unit) }))

/** Travel modes in the Route view's legend; minibuses share the bus colour. */
const MODES = [
  { modes: ['train'], label: 'Train' },
  { modes: ['bus', 'minibus'], label: 'Bus' },
  { modes: ['ferry'], label: 'Ferry' },
  { modes: ['flight'], label: 'Flight' },
]

export function MapControls() {
  const { layer, setLayer, layerMonth, setLayerMonth, nearbyKind, setNearbyKind, weatherBy, setWeatherBy, plan, tempUnit, input, currency } = useTrip()
  const legend = layer === 'climate' ? temperatureLegend(tempUnit) : layer === 'cost' ? costScale(input.budget, currency).legend : LEGENDS[layer]
  // What the numbers in the legend measure.
  const lead = {
    climate: { text: 'High', title: 'Average daily high in the month; the number on each stop' },
    air: { text: 'PM2.5 µg/m³', title: "Monthly average of fine particles (PM2.5), the number on each stop. The WHO's guideline is 5 over a year and 15 on any one day." },
    nearby: { text: 'Within 1.5 km', title: `Roughly how many ${NEARBY_LABELS[nearbyKind].toLowerCase()} within 1.5 km of the centre, from map data and business listings; both miss places, so treat it as a rough guide` },
    mobile: { text: 'Mobile Mbps', title: 'Typical download speed of mobile internet on phones in the city; the number on each stop' },
    cost: { text: `Per day (${input.budget})`, title: 'Typical daily spending on your budget: a bed, food and local transport. Each colour holds about a fifth of all cities.' },
  }[layer as string]
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
      {layer === 'nearby' && (
        <div className="pointer-events-auto flex rounded-lg border border-line bg-panel p-0.5 shadow-sm">
          {NEARBY_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setNearbyKind(k)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium ${nearbyKind === k ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'}`}
            >
              {NEARBY_LABELS[k]}
            </button>
          ))}
        </div>
      )}
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
        <div className="pointer-events-auto flex max-w-[34rem] flex-wrap gap-x-3 gap-y-1 rounded-lg border border-line bg-panel/95 px-2.5 py-1.5 text-[11px] shadow-sm">
          {layer === 'climate' && <FeelsToggle />}
          {layer === 'climate' ? (
            // Days or nights: the colours, legend and numbers follow.
            <span className="flex rounded-md border border-line p-px" role="group" aria-label="Colour by">
              {(['high', 'low'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setWeatherBy(b)}
                  title={b === 'high' ? 'Average daily high: how the days feel' : 'Average daily low: how the nights feel'}
                  className={`rounded px-1.5 text-[11px] ${weatherBy === b ? 'bg-ink text-panel' : 'text-muted hover:text-ink'}`}
                >
                  {b === 'high' ? 'High' : 'Low'}
                </button>
              ))}
            </span>
          ) : lead && <span className="text-muted" title={lead.title}>{lead.text}</span>}
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5" title={l.title}>
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
      <span className="flex items-center gap-1.5 border-l border-line pl-3" title="The number in each stop is the trip day you arrive; longer stays get bigger circles">
        <svg viewBox="0 0 22 14" className="h-3.5 w-[22px]" aria-hidden>
          <circle cx="4" cy="7" r="3" fill={STOP_COLOR} />
          <circle cx="15" cy="7" r="6" fill={STOP_COLOR} />
        </svg>
        Bigger = longer stay
      </span>
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
