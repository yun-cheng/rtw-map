import { useEffect, useState } from 'react'
import { Check, ChevronRight, Search } from 'lucide-react'
import { dataset as ds } from '../data/dataset'
import { REGIONS, REGION_OF } from '../data/regions'
import { MAX_COUNTRY_DAYS, MAX_FLEX_DAYS, MAX_STOPS, citiesIn, daysBetween, withDates, type CountryMode, type TripCountry, type TripGroup } from '../planner'
import { useAccount } from '../agent/account'
import { useChat } from '../agent/chat'
import { useTrip } from '../store/trip'
import { PrefsCards } from './PrefsCards'
import { flag } from '../ui/format'
import { Button, Segmented, Stepper } from '../ui/kit'

const MODE_STYLE: Record<CountryMode, string> = {
  must: 'border-accent bg-accent-soft text-accent',
  optional: 'border-line bg-panel text-ink border-dashed',
  excluded: 'border-line bg-canvas text-muted line-through',
}
/** A click on a country: an optional one (as countries in a region start) becomes a must visit first. */
const NEXT_MODE: Record<CountryMode, CountryMode> = { optional: 'must', must: 'excluded', excluded: 'optional' }

const countryName = (iso2: string) => ds.countries[iso2]?.name ?? ds.world[iso2] ?? iso2
const hasCities = (iso2: string) => citiesIn(ds).has(iso2)

export function SetupPanel() {
  const { input, setInput, setPanel, generate, stops, plan, picking, setPicking, setHovered } = useTrip()
  // Nothing stays highlighted on the map once the tab closes.
  useEffect(() => () => setHovered([]), [setHovered])
  const user = useAccount((s) => s.user)
  const busy = useChat((s) => s.busy)
  const canPlan = input.groups.length > 0 && daysBetween(input.startDate, input.endDate) > 0
  // The planner makes the plan; the assistant then adjusts it with its usual tools (so the app's rules still hold),
  // thinking harder, since fitting several wishes into a trip takes planning.
  const planWithAi = () => {
    generate()
    setPanel('assistant')
    const wishes = input.wishes?.trim()
    void useChat.getState().send(wishes
      ? `Adjust the plan I just generated to my wishes: ${wishes}`
      : 'Check the plan I just generated against my preferences and interests, and improve it where it helps.', [], { think: true })
  }
  // The dates asked for (with flexible dates, the plan's own may differ within them).
  const asked = { start: input.flex?.start ?? input.startDate, end: input.flex?.end ?? input.endDate }
  const flex = { start: input.flex?.startDays ?? 0, end: input.flex?.endDays ?? 0 }
  const nights = daysBetween(asked.start, asked.end)
  const setFlex = (start: number, end: number) =>
    setInput(start || end ? { flex: { ...asked, startDays: start, endDays: end } } : { flex: undefined, startDate: asked.start, endDate: asked.end })

  const updateGroup = (id: string, fn: (g: TripGroup) => TripGroup) =>
    setInput({ groups: input.groups.map((g) => (g.id === id ? fn(g) : g)) })
  const moveGroup = (i: number, d: -1 | 1) => {
    const groups = [...input.groups]
    const [g] = groups.splice(i, 1)
    groups.splice(i + d, 0, g)
    setInput({ groups })
  }
  const ordered = input.keepGroupOrder
  // The regions' cards start folded, to a line of what's in them; opening one folds the others.
  const [unfolded, setUnfolded] = useState<string | null>(null)
  const fold = (id: string) => setUnfolded((was) => (was === id ? null : id))

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="px-1">
          <h2 className="text-[15px] font-semibold">Trip</h2>
          {plan && (
            <p className="mt-0.5 text-[12px] text-muted">
              <b className="text-ink">{slashDate(input.startDate)} – {slashDate(input.endDate)}</b> · <b className="text-ink">{plan.totalNights}</b> nights · <b className="text-ink">{plan.stops.length}</b> stops
            </p>
          )}
        </div>

        <Card>
          <Field label="Dates">
            {/* On a narrow phone the days either way go under their date. */}
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <input type="date" aria-label="Start date" value={asked.start} onChange={(e) => e.target.value && setInput(withDates(input, e.target.value, asked.end))} className={dateCls} />
                <FlexDays value={flex.start} label="start" onChange={(d) => setFlex(d, flex.end)} />
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <input type="date" aria-label="End date" value={asked.end} min={asked.start} onChange={(e) => e.target.value && setInput(withDates(input, asked.start, e.target.value))} className={dateCls} />
                <FlexDays value={flex.end} label="end" onChange={(d) => setFlex(flex.start, d)} />
              </div>
            </div>
            {nights <= 0 && <p className="mt-1 text-[12px] text-danger">End date must be after the start date</p>}
          </Field>
        </Card>

        <Card>
          <Field
            label="Where"
            aside={input.groups.length > 1 && (
              <label className="flex items-center gap-1.5 text-[12px] text-muted" title="Otherwise the planner picks the order with the shortest travel">
                <input type="checkbox" checked={ordered} onChange={(e) => setInput({ keepGroupOrder: e.target.checked })} />
                In this order
              </label>
            )}
          >
            <div className="flex flex-col gap-2">
              {input.groups.map((g, i) => {
                const open = unfolded === g.id
                return (
                  // Pointing at a region's card (or one of its countries) shades it on the map and brings the region into view.
                  <div
                    key={g.id} className="rounded-lg border border-line bg-panel p-2.5 hover:border-point"
                    onMouseEnter={() => setHovered(g.countries.map((c) => c.iso2))} onMouseLeave={() => setHovered([])}
                  >
                    <div className={`flex items-center gap-1 ${open ? 'mb-2' : ''}`}>
                      {ordered && <span className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-panel">{i + 1}</span>}
                      <button onClick={() => fold(g.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-1.5 text-left">
                        <ChevronRight size={14} className={`mt-0.5 shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
                        <span className="min-w-0">
                          <span className="block font-semibold">{g.name}</span>
                          {!open && <span className="block truncate text-[12px] text-muted">{groupSummary(g)}</span>}
                        </span>
                      </button>
                      {ordered && (
                        <>
                          <IconBtn disabled={i === 0} onClick={() => moveGroup(i, -1)} label="Move up">↑</IconBtn>
                          <IconBtn disabled={i === input.groups.length - 1} onClick={() => moveGroup(i, 1)} label="Move down">↓</IconBtn>
                        </>
                      )}
                      <IconBtn onClick={() => setInput({ groups: input.groups.filter((x) => x.id !== g.id) })} label="Remove">✕</IconBtn>
                    </div>
                    {/* Each country: click it to change whether it's a must visit, and the days to spend there. */}
                    {open && <div className="flex flex-col gap-1">
                      {g.countries.map((c) => {
                        const adv = ds.advisories[c.iso2]
                        const setCountry = (patch: Partial<TripCountry>) => updateGroup(g.id, (x) => ({ ...x, countries: x.countries.map((y) => (y.iso2 === c.iso2 ? { ...y, ...patch } : y)) }))
                        return (
                          <div key={c.iso2} className="flex items-center gap-2">
                            <button
                              onClick={() => setCountry({ mode: NEXT_MODE[c.mode] })}
                              onMouseEnter={() => setHovered([c.iso2], g.countries.map((y) => y.iso2))} onMouseLeave={() => setHovered(g.countries.map((y) => y.iso2))}
                              className={`min-w-0 truncate rounded-full border px-2 py-0.5 text-[12px] ${MODE_STYLE[c.mode]} hover:border-point hover:ring-1 hover:ring-point ${hasCities(c.iso2) ? '' : 'opacity-60'}`}
                              title={`${c.mode === 'must' ? 'Must visit' : c.mode === 'optional' ? 'Optional' : 'Excluded'}${adv?.excludedByDefault ? ' · do-not-travel advisory' : ''}${hasCities(c.iso2) ? '' : ' · no cities in the app yet'} (click to change)`}
                            >
                              {flag(c.iso2)} {countryName(c.iso2)}
                              {adv?.excludedByDefault && ' ⚠'}
                            </button>
                            {c.mode !== 'excluded' && (
                              <Range unit="days" className="ml-auto shrink-0 text-[12px]">
                                <AnyNumber value={c.minDays} max={MAX_COUNTRY_DAYS} small label={`Fewest days in ${countryName(c.iso2)}`} onChange={(minDays) => setCountry({ minDays })} />
                                <AnyNumber value={c.maxDays} min={c.minDays} max={MAX_COUNTRY_DAYS} small label={`Most days in ${countryName(c.iso2)}`} onChange={(maxDays) => setCountry({ maxDays })} />
                              </Range>
                            )}
                          </div>
                        )
                      })}
                    </div>}
                  </div>
                )
              })}
              {picking ? (
                <Picker />
              ) : (
                <Button onClick={() => setPicking(input.groups.length ? 'country' : 'region')} className="py-1.5">+ Add regions or countries</Button>
              )}
            </div>
          </Field>
        </Card>

        <Card className="flex flex-col gap-4">
          <Field label="Number of stops (optional)">
            <Range unit="stops" className="text-[13px]">
              <AnyNumber value={input.minStops} max={MAX_STOPS} label="Fewest stops" onChange={(minStops) => setInput({ minStops })} />
              <AnyNumber value={input.maxStops} min={input.minStops} max={MAX_STOPS} label="Most stops" onChange={(maxStops) => setInput({ maxStops })} />
            </Range>
          </Field>

          <Field label="Schengen days used before">
            <input type="number" min={0} max={90} value={input.schengenDaysBefore} onChange={(e) => setInput({ schengenDaysBefore: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })} className={numberCls} title="Days spent in the Schengen area in the 180 days before the trip" />
          </Field>

          <Field label="Anything else? (optional)">
            <textarea
              value={input.wishes ?? ''}
              onChange={(e) => setInput({ wishes: e.target.value })}
              rows={3}
              maxLength={1000}
              placeholder="Wishes for Plan with AI, e.g. a beach week in July, meeting a friend in Vienna 12–15 June, fewer capitals"
              className={`${inputCls} resize-y`}
            />
          </Field>
        </Card>

        <PrefsCards />
      </div>

      {/* Pinned to the bottom of the panel, so they're at hand however far it's scrolled. */}
      <div className="sticky bottom-0 border-t border-line bg-panel p-3">
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1 py-2 text-[14px]" disabled={!canPlan} onClick={generate} title={stops.length ? 'Make a new plan; replaces your current stops and edits' : undefined}>
            {stops.length ? 'Regenerate plan' : 'Generate plan'}
          </Button>
          <Button
            className="flex-1 py-2 text-[14px]"
            disabled={!canPlan || !user || busy}
            title={user ? `Generate the plan, then let the assistant adjust it to your wishes and preferences${stops.length ? '; replaces your current stops and edits' : ''}` : 'Sign in to use the assistant'}
            onClick={planWithAi}
          >
            ✨ Plan with AI
          </Button>
        </div>
      </div>
    </div>
  )
}

/** A card of the Trip tab, on its darker background. */
const Card = ({ className = '', children }: { className?: string; children: React.ReactNode }) => (
  <section className={`rounded-xl bg-panel px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${className}`}>{children}</section>
)

/** A folded region's line: how many of its countries are must visits, optional or left out. */
function groupSummary(g: TripGroup) {
  const count = (mode: CountryMode) => g.countries.filter((c) => c.mode === mode).length
  const parts = [[count('must'), 'must visit'], [count('optional'), 'optional'], [count('excluded'), 'left out']] as const
  return parts.filter(([n]) => n).map(([n, label]) => `${n} ${label}`).join(' · ') || 'No countries'
}

/** A date as the date inputs show it: 2027/05/08. */
const slashDate = (iso: string) => iso.replaceAll('-', '/')

const inputCls = 'w-full rounded-md border border-line bg-panel px-2 py-1.5 text-[13px] outline-none focus:border-accent'
/** A number field: the stops' range and the Schengen days, the same size. */
const numberCls = inputCls.replace('w-full', 'w-20')
/** A date input that shares its line with the days either way, or has it to itself when they don't fit beside it. */
const dateCls = inputCls.replace('w-full', 'min-w-0 flex-1 basis-36')

function Field({ label, aside, children }: { label: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  )
}

/** A fewest and a most, between a dash and before their unit: "[Any] – [Any] days". */
function Range({ unit, className = '', children: [from, to] }: { unit: string; className?: string; children: [React.ReactNode, React.ReactNode] }) {
  return <span className={`flex items-center gap-1 text-muted ${className}`}>{from}–{to}{unit}</span>
}

/** One end of a range: a number from 1 to `max`, or empty for any. */
function AnyNumber({ value, min, max, small, label, onChange }: { value?: number | null; min?: number | null; max: number; small?: boolean; label: string; onChange: (n: number | null) => void }) {
  return (
    <input
      type="number" min={min || 1} max={max} inputMode="numeric" placeholder="Any" aria-label={label} title={`${label} (empty for any)`}
      value={value ?? ''}
      onChange={(e) => {
        const n = Math.round(Number(e.target.value))
        onChange(e.target.value.trim() && n > 0 ? Math.min(max, n) : null)
      }}
      // The small size fits beside a country's name; the usual one matches the panel's other number fields.
      className={`${small ? 'w-11 px-1 py-0.5 text-center text-[12px]' : numberCls} rounded-md border border-line bg-panel text-ink outline-none [appearance:textfield] placeholder:text-muted focus:border-accent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
    />
  )
}

/** How many days earlier or later a date may be: 0 (exact) to MAX_FLEX_DAYS. */
function FlexDays({ value, label, onChange }: { value: number; label: string; onChange: (days: number) => void }) {
  return (
    <GiveOrTake unit="days">
      <Stepper value={value} min={0} max={MAX_FLEX_DAYS} label={`Days the trip may ${label} earlier or later`} onChange={onChange} />
    </GiveOrTake>
  )
}

/** A number's margin, between "±" and its unit: "± [− 3 +] days". */
function GiveOrTake({ unit, children }: { unit: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[13px] text-muted">
      ±{children}{unit}
    </div>
  )
}

/**
 * Adding to the trip: whole regions or single countries, ticked in the list or clicked on the map (both toggle at
 * once, so several can be picked in a row). Every country in the world is here; those the app has no cities in yet
 * say so.
 */
function Picker() {
  const { input, picking, setPicking, toggleRegion, toggleCountry, addAs, setAddAs, setHovered } = useTrip()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const inTrip = new Map(input.groups.flatMap((g) => g.countries.map((c) => [c.iso2, c.mode] as const)))
  const regions = REGIONS.filter((r) => !q || r.name.toLowerCase().includes(q) || r.countries.some((c) => countryName(c).toLowerCase().includes(q)))
  const countries = Object.keys(ds.world)
    .filter((iso2) => !q || countryName(iso2).toLowerCase().includes(q) || REGION_OF[iso2]?.toLowerCase().includes(q))
    .sort((a, b) => countryName(a).localeCompare(countryName(b)))
  return (
    <div className="rounded-lg border border-accent/50 bg-panel p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex-1">
          <Segmented value={picking ?? 'region'} onChange={setPicking} options={[{ value: 'region', label: 'Regions' }, { value: 'country', label: 'Countries' }]} />
        </div>
        <Button variant="primary" onClick={() => setPicking(null)}>Done</Button>
      </div>
      {picking === 'country' && (
        <div className="mb-2 flex items-center gap-2 text-[12px] text-muted">
          Add as
          <div className="flex-1">
            <Segmented value={addAs} onChange={setAddAs} options={[{ value: 'must', label: 'Must visit' }, { value: 'optional', label: 'Optional' }]} />
          </div>
        </div>
      )}
      <label className="mb-1.5 flex items-center gap-1.5 rounded-md border border-line px-2 focus-within:border-accent">
        <Search size={14} className="text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={picking === 'country' ? 'Search countries' : 'Search regions or countries'} className="w-full bg-transparent py-1.5 text-[13px] outline-none" />
      </label>
      <div className="-mx-1 max-h-72 overflow-y-auto" onMouseLeave={() => setHovered([])}>
        {picking === 'country'
          ? countries.map((iso2) => {
              const mode = inTrip.get(iso2)
              return (
                <PickRow
                  key={iso2} on={!!mode && mode !== 'excluded'} onClick={() => toggleCountry(iso2)} onHover={() => setHovered([iso2])}
                  label={`${flag(iso2)} ${countryName(iso2)}`}
                  sub={[REGION_OF[iso2], !hasCities(iso2) && 'no cities yet'].filter(Boolean).join(' · ')}
                />
              )
            })
          : regions.map((r) => {
              const covered = r.countries.filter(hasCities).length
              return (
                <PickRow
                  key={r.name} on={input.groups.some((g) => g.name === r.name)} onClick={() => toggleRegion(r.name)} onHover={() => setHovered(r.countries)}
                  label={r.name}
                  sub={`${r.countries.length} ${r.countries.length > 1 ? 'countries' : 'country'}${covered === r.countries.length ? '' : covered ? `, ${covered} with cities` : ' · no cities yet'}`}
                />
              )
            })}
      </div>
      <p className="mt-1.5 text-[11px] text-muted">Or click {picking === 'country' ? 'countries' : 'regions'} on the map. A country added as optional is one the planner may leave out; countries with no cities yet can be added, and the plan leaves them out until the app covers them.</p>
    </div>
  )
}

function PickRow({ on, label, sub, onClick, onHover }: { on: boolean; label: string; sub: string; onClick: () => void; onHover: () => void }) {
  return (
    <button role="checkbox" aria-checked={on} onClick={onClick} onMouseEnter={onHover} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-canvas">
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-accent bg-accent text-on-accent' : 'border-line'}`}>{on && <Check size={12} strokeWidth={3} />}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{label}</span>
        {sub && <span className="block truncate text-[11px] text-muted">{sub}</span>}
      </span>
    </button>
  )
}

function IconBtn({ label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} className="h-6 w-6 rounded text-[12px] text-muted hover:bg-canvas hover:text-ink disabled:opacity-30" {...props} />
}
