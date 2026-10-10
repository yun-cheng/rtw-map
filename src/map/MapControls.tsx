import { useEffect, useState, type ReactNode } from 'react'
import { type CostKind, type SchengenSummary, type TempBreaks } from '../planner'
import { NEARBY_KINDS, useTrip, type MapLayer } from '../store/trip'
import { MODE_COLOR, MONTHS, STOP_COLOR, TEMP_KINDS, WEATHER_STYLE, tempBand, type TempUnit } from '../ui/format'
import { FeelsToggle } from '../ui/FeelsToggle'
import { DRAWER_WIDTH } from '../ui/layout'
import { usePhone } from '../ui/usePhone'
import { useSideScroll } from '../ui/useSideScroll'
import { COST_GROUPS, COST_LABELS, NEARBY_LABELS, airLegend, costScale, mobileLegend, nearbyLegend, type LegendItem } from './scales'

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

/** Weather legend: the temperature classes as ranges, by the traveller's breakpoints, the same for highs and lows (rain
 *  is the ring, see RainRing). */
const temperatureLegend = (unit: TempUnit, breaks: TempBreaks): LegendItem[] =>
  TEMP_KINDS.map((k) => ({ color: WEATHER_STYLE[k].color, label: tempBand(k, unit, breaks) }))

/** Travel modes in the Route view's legend; minibuses share the bus colour. */
const MODES = [
  { modes: ['train'], label: 'Train' },
  { modes: ['bus', 'minibus'], label: 'Bus' },
  { modes: ['ferry'], label: 'Ferry' },
  { modes: ['flight'], label: 'Flight' },
]

const FIFTH = 'Each colour holds about a fifth of all cities.'
/** What the Cost view's legend numbers are, for each kind of cost (the legend's hover text). */
const COST_ABOUT: Record<CostKind, string> = {
  day: `A day on your choices (the Trip tab's preferences, or changed for a city in its Costs tab): bed, meals, drinks and getting around. ${FIFTH}`,
  dorm: `A bed in a hostel dorm for one night. ${FIFTH}`,
  private: `A private room (guesthouse or budget hotel) for one night. ${FIFTH}`,
  meal: `A main dish and a soft drink at a simple place where locals eat (street stall, canteen, noodle shop). ${FIFTH}`,
  restaurant: `A main course and a drink at a sit-down restaurant locals pick for a nice evening out. ${FIFTH}`,
  coffee: `A cappuccino, or the usual coffee, at an ordinary café. ${FIFTH}`,
  beer: `Half a litre of local beer at an ordinary bar or pub. ${FIFTH}`,
  groceries: `A day of DIY meals from the supermarket (the same across a country). ${FIFTH}`,
  transport: `A day of getting around the city by public transport (the same across a country). ${FIFTH}`,
  taxi: `A ride of about 5 km at the usual meter or app price (the same across a country). ${FIFTH}`,
  car: `A small car from a rental company for one day (the same across a country). Grey where renting a car isn't usual. ${FIFTH}`,
  scooter: `A scooter or small motorbike for one day (the same across a country). Grey where renting one isn't usual. ${FIFTH}`,
}

/** `editing`: the trip's setup is open, and the map shows its countries (see MapView) instead of a map view. */
export function MapControls({ editing = false }: { editing?: boolean }) {
  const { picking, layer, setLayer, layerMonth, setLayerMonth, nearbyKind, setNearbyKind, costKind, setCostKind, weatherBy, setWeatherBy, plan, tempUnit, input, currency, selected, tempFeels, setTempFeels, routeBy, setRouteBy } = useTrip()
  const phone = usePhone()
  // The kind last picked in each cost group, so going back to a group returns to it.
  const [groupKind, setGroupKind] = useState<Record<string, CostKind>>({})
  const costGroup = COST_GROUPS.find((g) => g.kinds.includes(costKind))!
  const legend = layer === 'climate' ? temperatureLegend(tempUnit, input.prefs.tempBreaks) : layer === 'cost' ? costScale(costKind, input, currency).legend : LEGENDS[layer]
  // What the numbers in the legend measure, shown on hover: the view's name is already on its button or dropdown.
  const about = {
    air: "Monthly average of fine particles (PM2.5) in µg/m³, the number on each stop. The WHO's guideline is 5 over a year and 15 on any one day.",
    nearby: `Roughly how many ${NEARBY_LABELS[nearbyKind].toLowerCase()} within 1.5 km of the centre, from map data and business listings; both miss places, so treat it as a rough guide`,
    mobile: 'Typical download speed of mobile internet on phones in the city, in Mbps; the number on each stop',
    cost: COST_ABOUT[costKind],
  }[layer as string]
  // The legend: what the route's lines or the view's colours mean.
  const legends = (
    <>
      {layer === 'none' && plan && <RouteLegend modes={new Set(plan.legs.flatMap((l) => l.hops.map((h) => h.mode)))} phone={phone} />}
      {legend && (
        <div className={LEGEND_BOX} title={about}>
          {layer === 'climate' && !phone && <FeelsToggle />}
          {layer === 'climate' && !phone && (
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
          )}
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
    </>
  )
  if (editing) {
    return (
      <div className={`pointer-events-none absolute flex flex-col items-start ${phone ? 'top-2 right-12 left-2' : 'top-3 left-3'}`} style={phone ? undefined : { right: selected ? DRAWER_WIDTH + 12 : 12 }}>
        <div className={LEGEND_BOX}>
          {(['must', 'optional', 'excluded'] as const).map((m) => (
            <span key={m} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PICK_SWATCH[m] }} />
              {m === 'must' ? 'Must visit' : m === 'optional' ? 'Optional' : 'Excluded'}
            </span>
          ))}
          {picking && <span className="text-muted">Click {picking === 'region' ? 'a region' : 'a country'} to add or remove it</span>}
        </div>
      </div>
    )
  }
  if (phone) {
    return (
      // On a phone, the legend at the top of the map in one row that scrolls sideways, and at its bottom, just above
      // its sheet (`--sheet-height`, see BottomSheet) and clear of the map's ⓘ credits, one row of dropdowns instead of
      // rows of buttons and switches: the view, then its month or kind, and the legend's switches.
      <>
        {/* (Clear of the settings gear at the top right, see App.) */}
        <div className="pointer-events-none absolute top-2 right-12 left-2 flex flex-col items-start">{legends}</div>
        <div className="pointer-events-none absolute right-10 left-2 flex transition-[bottom] duration-300 ease-out" style={{ bottom: 'calc(var(--sheet-height, 0px) + 8px)' }}>
          <div className="no-scrollbar pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto">
            <Pick label="Map view" value={layer} onChange={(v) => setLayer(v as MapLayer)}>
              {LAYERS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </Pick>
            {(layer === 'climate' || layer === 'air') && (
              <Pick label="Month" value={String(layerMonth)} onChange={(v) => setLayerMonth(Number(v))}>
                <option value="0">Trip dates</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </Pick>
            )}
            {layer === 'nearby' && (
              <Pick label="Places" value={nearbyKind} onChange={(v) => setNearbyKind(v as typeof nearbyKind)}>
                {NEARBY_KINDS.map((k) => <option key={k} value={k}>{NEARBY_LABELS[k]}</option>)}
              </Pick>
            )}
            {layer === 'cost' && (
              <Pick label="Cost" value={costKind} onChange={(v) => setCostKind(v as CostKind)}>
                {COST_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.kinds.map((k) => <option key={k} value={k}>{COST_LABELS[k].label}</option>)}
                  </optgroup>
                ))}
              </Pick>
            )}
            {layer === 'climate' && (
              <>
                <Pick label="Temperatures" value={tempFeels ? 'feels' : 'real'} onChange={(v) => setTempFeels(v === 'feels')}>
                  <option value="feels">Feels like</option>
                  <option value="real">Real</option>
                </Pick>
                <Pick label="Colour by" value={weatherBy} onChange={(v) => setWeatherBy(v as typeof weatherBy)}>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                </Pick>
              </>
            )}
            {layer === 'none' && plan && (
              <Pick label="Number in each stop" value={routeBy} onChange={(v) => setRouteBy(v as typeof routeBy)}>
                <option value="day">Day</option>
                <option value="nights">Nights</option>
              </Pick>
            )}
          </div>
        </div>
      </>
    )
  }
  return (
    // With a city or journey panel open (DRAWER_WIDTH on the right), the controls stop at its edge (their rows scroll sideways).
    <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-2" style={{ right: selected ? DRAWER_WIDTH + 12 : 12 }}>
      <SwitchRow picked={layer} width={selected}>
        {LAYERS.map((l) => (
          <button
            key={l.value}
            onClick={() => setLayer(l.value)}
            aria-pressed={layer === l.value}
            className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium whitespace-nowrap ${layer === l.value ? 'bg-ink text-panel' : 'text-muted hover:text-ink'}`}
          >
            {l.label}
          </button>
        ))}
      </SwitchRow>
      {layer === 'nearby' && (
        <SwitchRow picked={nearbyKind} width={selected}>
          {NEARBY_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setNearbyKind(k)}
              aria-pressed={nearbyKind === k}
              className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap ${nearbyKind === k ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'}`}
            >
              {NEARBY_LABELS[k]}
            </button>
          ))}
        </SwitchRow>
      )}
      {layer === 'cost' && (
        <>
        <SwitchRow picked={costGroup.label} width={selected}>
          {COST_GROUPS.map((g) => (
            <button
              key={g.label}
              onClick={() => setCostKind(g === costGroup ? costKind : groupKind[g.label] ?? g.kinds[0])}
              aria-pressed={g === costGroup}
              className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap ${g === costGroup ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'}`}
            >
              {g.label}
            </button>
          ))}
        </SwitchRow>
        {costGroup.kinds.length > 1 && (
          <SwitchRow picked={costKind} width={selected} gap>
            {costGroup.kinds.map((k) => (
              <button
                key={k}
                onClick={() => { setCostKind(k); setGroupKind({ ...groupKind, [costGroup.label]: k }) }}
                aria-pressed={costKind === k}
                className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap ${costKind === k ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'}`}
              >
                {COST_LABELS[k].label}
              </button>
            ))}
          </SwitchRow>
        )}
        </>
      )}
      {(layer === 'climate' || layer === 'air') && (
        <SwitchRow picked={layerMonth} width={selected}>
          <button
            onClick={() => setLayerMonth(0)}
            aria-pressed={layerMonth === 0}
            title="Each stop in the month you're there; other cities in the month you're at the nearest stop"
            className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap ${layerMonth === 0 ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'}`}
          >
            Trip dates
          </button>
          {MONTHS.map((m, i) => (
            <button
              key={m}
              onClick={() => setLayerMonth(i + 1)}
              aria-pressed={layerMonth === i + 1}
              className={`shrink-0 rounded-md px-1.5 py-1 text-[11px] font-medium ${layerMonth === i + 1 ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'}`}
            >
              {m}
            </button>
          ))}
        </SwitchRow>
      )}
      {legends}
    </div>
  )
}

/**
 * A row of switch buttons over the map: one line that scrolls sideways when it doesn't fit, keeping the pressed
 * button (`aria-pressed`) in sight when `picked` changes (e.g. December, opened from a link) or when the room for
 * it does (`width`: anything that changes it, like a city panel opening).
 */
function SwitchRow({ picked, width, gap, children }: { picked: unknown; width?: unknown; gap?: boolean; children: ReactNode }) {
  const row = useSideScroll<HTMLDivElement>()
  useEffect(() => {
    const bar = row.ref.current
    const on = bar?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!bar || !on) return
    const b = bar.getBoundingClientRect()
    const r = on.getBoundingClientRect()
    if (r.left < b.left) bar.scrollLeft -= b.left - r.left + 16
    else if (r.right > b.right) bar.scrollLeft += r.right - b.right + 16
  }, [picked, width, row.ref])
  return (
    <div className="pointer-events-auto max-w-full rounded-lg border border-line bg-panel p-0.5 shadow-sm">
      <div ref={row.ref} style={row.mask} className={`no-scrollbar flex overflow-x-auto ${gap ? 'gap-0.5' : ''}`}>{children}</div>
    </div>
  )
}

/** The trip's countries on the map while editing it (MapView's PICK_COLOR, opaque). */
const PICK_SWATCH = { must: 'rgb(20,184,166)', optional: 'rgba(15,118,110,0.45)', excluded: 'rgba(120,113,108,0.55)' }

/** The legend's box: wraps beside the map; one row that scrolls sideways on a phone. */
const LEGEND_BOX =
  'no-scrollbar pointer-events-auto flex max-w-[min(34rem,100%)] flex-wrap gap-x-3 gap-y-1 rounded-lg border border-line bg-panel/95 px-2.5 py-1.5 text-[11px] shadow-sm max-md:max-w-full max-md:flex-nowrap max-md:overflow-x-auto max-md:whitespace-nowrap max-md:*:shrink-0'

/** A phone's dropdown over the map, styled like the map's other controls. */
function Pick({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line bg-panel px-2 py-1.5 text-[13px] font-medium text-ink shadow-sm"
    >
      {children}
    </select>
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
function RouteLegend({ modes, phone }: { modes: Set<string>; phone: boolean }) {
  const used = MODES.filter((m) => m.modes.some((x) => modes.has(x)))
  const routeBy = useTrip((s) => s.routeBy)
  const setRouteBy = useTrip((s) => s.setRouteBy)
  return (
    <div className={LEGEND_BOX}>
      {/* What the number in each stop is, styled like the Weather view's High | Low (a dropdown on a phone). */}
      {!phone && <span className="flex rounded-md border border-line p-px" role="group" aria-label="Number in each stop">
        {(['day', 'nights'] as const).map((b) => (
          <button
            key={b}
            onClick={() => setRouteBy(b)}
            aria-pressed={routeBy === b}
            title={b === 'day' ? 'The trip day you arrive' : 'Nights you stay'}
            className={`rounded px-1.5 text-[11px] ${routeBy === b ? 'bg-ink text-panel' : 'text-muted hover:text-ink'}`}
          >
            {b === 'day' ? 'Day' : 'Nights'}
          </button>
        ))}
      </span>}
      {used.map((m) => (
        <span key={m.label} className="flex items-center gap-1.5"><Line color={MODE_COLOR[m.modes[0]]} />{m.label}</span>
      ))}
      <span className="flex items-center gap-1.5 border-l border-line pl-3" title="Times and prices from timetable data"><Line color="var(--color-muted)" />Timetable</span>
      <span className="flex items-center gap-1.5" title="No timetable data yet: a bus is assumed, with time and price estimated from the road distance"><Line color="var(--color-muted)" dashed />Estimated</span>
      <span className="flex items-center gap-1.5 border-l border-line pl-3" title="Longer stays get bigger circles">
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
