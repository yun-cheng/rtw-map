import { useState } from 'react'
import { dataset as ds } from '../data/dataset'
import { makeGroup } from '../data/presets'
import { REGIONS } from '../data/regions'
import { MAX_FLEX_DAYS, citiesIn, daysBetween, withDates, type CountryMode, type TripGroup } from '../planner'
import { useAccount } from '../agent/account'
import { useChat } from '../agent/chat'
import { useTrip } from '../store/trip'
import { flag, shortDate } from '../ui/format'
import { Button } from '../ui/kit'

const MODE_STYLE: Record<CountryMode, string> = {
  must: 'border-accent bg-accent-soft text-accent',
  optional: 'border-line bg-panel text-ink border-dashed',
  excluded: 'border-line bg-canvas text-muted line-through',
}
const NEXT_MODE: Record<CountryMode, CountryMode> = { must: 'optional', optional: 'excluded', excluded: 'must' }
/** How many days either way a flexible date may move. */
const FLEX_DAYS = [0, 1, 2, 3, 5, 7, 10, MAX_FLEX_DAYS]

const countryName = (iso2: string) => ds.countries[iso2]?.name ?? ds.world[iso2] ?? iso2
const hasCities = (iso2: string) => citiesIn(ds).has(iso2)

export function SetupPanel() {
  const { input, setInput, setPanel, generate, loadTestCase, stops, plan } = useTrip()
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
  const planned = plan && input.flex && (input.startDate !== asked.start || input.endDate !== asked.end)
  const [adding, setAdding] = useState('')

  const updateGroup = (id: string, fn: (g: TripGroup) => TripGroup) =>
    setInput({ groups: input.groups.map((g) => (g.id === id ? fn(g) : g)) })
  const moveGroup = (i: number, d: -1 | 1) => {
    const groups = [...input.groups]
    const [g] = groups.splice(i, 1)
    groups.splice(i + d, 0, g)
    setInput({ groups })
  }
  const addGroup = (value: string) => {
    const region = REGIONS.find((r) => r.name === value)
    const group = region ? makeGroup(ds, region.name, region.countries) : makeGroup(ds, countryName(value), [value])
    setInput({ groups: [...input.groups, group] })
    setAdding('')
  }
  const used = new Set(input.groups.flatMap((g) => g.countries.map((c) => c.iso2)))
  const cityOptions = Object.values(ds.cities)
    .filter((c) => used.has(c.iso2))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Trip</h2>
        <Button variant="ghost" onClick={loadTestCase} title="Fill in the Balkans → Russia test trip">Load test case</Button>
      </div>

      <Field label="Dates">
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5">
          <input type="date" aria-label="Start date" value={asked.start} onChange={(e) => e.target.value && setInput(withDates(input, e.target.value, asked.end))} className={inputCls} />
          <FlexDays value={flex.start} label="start" onChange={(d) => setFlex(d, flex.end)} />
          <input type="date" aria-label="End date" value={asked.end} min={asked.start} onChange={(e) => e.target.value && setInput(withDates(input, asked.start, e.target.value))} className={inputCls} />
          <FlexDays value={flex.end} label="end" onChange={(d) => setFlex(flex.start, d)} />
        </div>
        <p className="mt-1 text-[12px] text-muted">
          {nights <= 0
            ? 'End date must be after the start date'
            : flex.start || flex.end
              ? `${nights} nights, or ${Math.max(1, nights - flex.start - flex.end)}–${nights + flex.start + flex.end}: the plan picks dates within these so the trip fits its stops`
              : `${nights + 1} days · ${nights} nights`}
        </p>
        {planned && (
          <p className="mt-0.5 text-[12px]">
            Planned: <b>{shortDate(input.startDate)} – {shortDate(input.endDate)}</b> · {daysBetween(input.startDate, input.endDate)} nights
          </p>
        )}
      </Field>

      <Field label="Where (in order)">
        <div className="flex flex-col gap-2">
          {input.groups.map((g, i) => {
            const empty = g.countries.filter((c) => c.mode !== 'excluded' && !hasCities(c.iso2))
            return (
              <div key={g.id} className="rounded-lg border border-line bg-panel p-2.5">
                <div className="mb-2 flex items-center gap-1">
                  <span className="mr-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-panel">{i + 1}</span>
                  <span className="flex-1 font-semibold">{g.name}</span>
                  <label className="mr-1 flex items-center gap-1 text-[12px] text-muted" title="Spend more time here">
                    <input type="checkbox" checked={g.longer} onChange={(e) => updateGroup(g.id, (x) => ({ ...x, longer: e.target.checked }))} />
                    Longer
                  </label>
                  <IconBtn disabled={i === 0} onClick={() => moveGroup(i, -1)} label="Move up">↑</IconBtn>
                  <IconBtn disabled={i === input.groups.length - 1} onClick={() => moveGroup(i, 1)} label="Move down">↓</IconBtn>
                  <IconBtn onClick={() => setInput({ groups: input.groups.filter((x) => x.id !== g.id) })} label="Remove">✕</IconBtn>
                </div>
                <div className="flex flex-wrap gap-1">
                  {g.countries.map((c) => {
                    const adv = ds.advisories[c.iso2]
                    return (
                      <button
                        key={c.iso2}
                        onClick={() => updateGroup(g.id, (x) => ({ ...x, countries: x.countries.map((y) => (y.iso2 === c.iso2 ? { ...y, mode: NEXT_MODE[y.mode] } : y)) }))}
                        className={`rounded-full border px-2 py-0.5 text-[12px] ${MODE_STYLE[c.mode]} ${hasCities(c.iso2) ? '' : 'opacity-60'}`}
                        title={`${c.mode === 'must' ? 'Must visit' : c.mode === 'optional' ? 'Optional' : 'Excluded'}${adv?.excludedByDefault ? ' · do-not-travel advisory' : ''}${hasCities(c.iso2) ? '' : ' · no cities in the app yet'} (click to change)`}
                      >
                        {flag(c.iso2)} {countryName(c.iso2)}
                        {adv?.excludedByDefault && ' ⚠'}
                      </button>
                    )
                  })}
                </div>
                {empty.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-muted">
                    No cities yet in {empty.length === g.countries.length && g.countries.length > 1 ? 'any of these' : empty.map((c) => countryName(c.iso2)).join(', ')}: the plan leaves {empty.length > 1 ? 'them' : 'it'} out for now.
                  </p>
                )}
              </div>
            )
          })}
          <select value={adding} onChange={(e) => e.target.value && addGroup(e.target.value)} className={inputCls}>
            <option value="">+ Add a region or country…</option>
            <optgroup label="Regions">
              {REGIONS.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
            </optgroup>
            <optgroup label="Countries">
              {Object.keys(ds.world).sort((a, b) => countryName(a).localeCompare(countryName(b))).map((iso2) => (
                <option key={iso2} value={iso2}>{countryName(iso2)}{hasCities(iso2) ? '' : ' (no cities yet)'}</option>
              ))}
            </optgroup>
          </select>
          <p className="text-[11px] text-muted">Click a country to cycle: must visit → optional → excluded. Countries in a region start optional (the planner picks the best ones, at least one per region); a country added on its own starts as must visit. Countries with a do-not-travel advisory start excluded.</p>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={input.keepGroupOrder} onChange={(e) => setInput({ keepGroupOrder: e.target.checked })} />
            Visit the regions in this order
          </label>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start city (optional)">
          <select value={input.startCityId ?? ''} onChange={(e) => setInput({ startCityId: e.target.value || null })} className={inputCls}>
            <option value="">Any</option>
            {cityOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="End city (optional)">
          <select value={input.endCityId ?? ''} onChange={(e) => setInput({ endCityId: e.target.value || null })} className={inputCls}>
            <option value="">Any</option>
            {cityOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Number of stops (optional)">
        <div className="flex items-center gap-2">
          <StopsInput value={input.minStops} placeholder="Any" label="Fewest stops" onChange={(minStops) => setInput({ minStops })} />
          <span className="text-muted">to</span>
          <StopsInput value={input.maxStops} placeholder="Any" label="Most stops" onChange={(maxStops) => setInput({ maxStops })} />
          {stops.length > 0 && <span className="text-[12px] text-muted">now {stops.length}</span>}
        </div>
      </Field>

      <Field label="Schengen days used before">
        <input type="number" min={0} max={90} value={input.schengenDaysBefore} onChange={(e) => setInput({ schengenDaysBefore: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })} className={`${inputCls} max-w-[8rem]`} title="Days spent in the Schengen area in the 180 days before the trip" />
      </Field>

      <p className="text-[12px] text-muted">
        Passport, pace, interests and what a day costs:{' '}
        <button onClick={() => setPanel('prefs')} className="text-accent hover:underline">Preferences</button>
      </p>

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

      <div className="flex gap-2">
        <Button variant="primary" className="flex-1 py-2 text-[14px]" disabled={!canPlan} onClick={generate}>
          {stops.length ? 'Regenerate plan' : 'Generate plan'}
        </Button>
        <Button
          className="flex-1 py-2 text-[14px]"
          disabled={!canPlan || !user || busy}
          title={user ? 'Generate the plan, then let the assistant adjust it to your wishes and preferences' : 'Sign in to use the assistant'}
          onClick={planWithAi}
        >
          ✨ Plan with AI
        </Button>
      </div>
      <p className="-mt-2 text-[11px] text-muted">
        {stops.length ? 'Both replace your current stops and edits. ' : ''}
        Plan with AI starts from the same plan, then the assistant adjusts it to your wishes{user ? '' : ' (sign in to use it)'}.
      </p>
    </div>
  )
}

const inputCls = 'w-full rounded-md border border-line bg-panel px-2 py-1.5 text-[13px] outline-none focus:border-accent'

/** An optional whole number of stops; empty means no limit. */
function StopsInput({ value, placeholder, label, onChange }: { value?: number | null; placeholder: string; label: string; onChange: (n: number | null) => void }) {
  return (
    <input
      type="number" min={1} max={200} inputMode="numeric" aria-label={label} placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => {
        const n = Math.round(Number(e.target.value))
        onChange(e.target.value.trim() && n > 0 ? Math.min(200, n) : null)
      }}
      className={`${inputCls} w-20`}
    />
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</div>
      {children}
    </div>
  )
}

/** How many days earlier or later a date may be: exact, or ± a few days. */
function FlexDays({ value, label, onChange }: { value: number; label: string; onChange: (days: number) => void }) {
  return (
    <select
      value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={`How flexible the ${label} date is`}
      title={`How many days earlier or later the trip may ${label}`}
      className="rounded-md border border-line bg-panel px-1.5 py-1.5 text-[13px] outline-none focus:border-accent"
    >
      {FLEX_DAYS.map((d) => <option key={d} value={d}>{d ? `± ${d} day${d > 1 ? 's' : ''}` : 'Exact'}</option>)}
    </select>
  )
}

function IconBtn({ label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} className="h-6 w-6 rounded text-[12px] text-muted hover:bg-canvas hover:text-ink disabled:opacity-30" {...props} />
}
