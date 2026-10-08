import { useEffect, useState, type ReactNode } from 'react'
import { dataset as ds } from '../data/dataset'
import { INTERESTS } from '../data/presets'
import { prefsDay, type DayChoices, type Pace, type TravelPrefs } from '../planner'
import { useTrip } from '../store/trip'
import { tempValue, type TempUnit } from '../ui/format'
import { Named, Segmented } from '../ui/kit'
import { Counter, DAY_FIELDS, DaySwitch } from './CostDay'

/** The preference behind each of the day's choices (taxi rides are chosen per city, not here). */
const PREF_OF: Partial<Record<keyof DayChoices, keyof TravelPrefs>> = {
  bed: 'room', breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', coffees: 'coffees', beers: 'beers',
}

/** How the user likes to travel. Saved with the trip. */
export function PrefsPanel() {
  const { input, setInput, setPrefs, currency, tempUnit } = useTrip()
  const p = input.prefs
  const day = prefsDay(p)
  // A segmented control for one preference.
  const choose = <K extends keyof TravelPrefs>(key: K, options: { value: TravelPrefs[K]; label: string }[]) => (
    <Segmented
      value={String(p[key])}
      onChange={(v) => setPrefs({ [key]: options.find((o) => String(o.value) === v)!.value } as Partial<TravelPrefs>)}
      options={options.map((o) => ({ value: String(o.value), label: o.label }))}
    />
  )
  const toggle = (key: keyof TravelPrefs, label: string) => (
    <label className="flex items-center gap-2 text-[13px]">
      <input type="checkbox" checked={!!p[key]} onChange={(e) => setPrefs({ [key]: e.target.checked } as Partial<TravelPrefs>)} />
      {label}
    </label>
  )

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h2 className="text-[15px] font-semibold">Preferences</h2>
        <p className="mt-0.5 text-[12px] text-muted">How you like to travel. Saved with this trip; a new trip starts from these.</p>
      </div>

      <Group title="Who">
        <Label>Passport</Label>
        <select value={input.passport} onChange={(e) => setInput({ passport: e.target.value })} className={inputCls}>
          {ds.visa.passports.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
        </select>
        <Label>Home city (where the trip starts and ends; not a stop)</Label>
        <select value={p.homeCityId ?? ''} onChange={(e) => setPrefs({ homeCityId: e.target.value || null })} className={inputCls}>
          <option value="">None</option>
          {HOME_CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}, {ds.countries[c.iso2]?.name ?? c.iso2}</option>)}
        </select>
        {p.homeCityId && <div className="mt-1.5">{toggle('returnHome', 'Return home at the end')}</div>}
        <Label>Travellers</Label>
        {choose('travellers', [{ value: 1, label: 'Solo' }, { value: 2, label: 'Two, one room' }, { value: 4, label: '3–4' }])}
      </Group>

      <Group title="Trip goals">
        <p className="-mt-0.5 mb-1 text-[12px] text-muted">How the planner picks places when it makes the plan.</p>
        <Label>What matters most</Label>
        {choose('focus', [{ value: 'balanced', label: 'Balanced' }, { value: 'countries', label: 'More countries' }, { value: 'highlights', label: 'Top highlights' }])}
        <Label>Expensive places</Label>
        {choose('expensive', [{ value: 'ignore', label: "Don't mind" }, { value: 'shorter', label: 'Shorter stays' }, { value: 'skip', label: 'Skip if optional' }])}
      </Group>

      <Group title="A day in a city">
        <p className="-mt-0.5 mb-1 text-[12px] text-muted">What the daily cost counts in every city. Change it for one city in that city's Money tab.</p>
        {DAY_FIELDS.filter((f) => PREF_OF[f.key]).map((f) => {
          const set = (v: unknown) => setPrefs({ [PREF_OF[f.key]!]: v } as Partial<TravelPrefs>)
          return (
            <div key={f.key} className="mt-2.5 first-of-type:mt-0">
              <Named
                label={f.label}
                hint={f.hint?.(day[f.key])}
                labelClass="text-[12px] text-muted"
                aside={f.max !== undefined && <Counter value={Number(day[f.key])} max={f.max} label={f.label} onChange={set} />}
              >
                {f.options && <div className="mt-1"><DaySwitch field={f} value={day[f.key]} onChange={set} /></div>}
              </Named>
            </div>
          )
        })}
        <Label>Most you'd pay per night (optional)</Label>
        <MoneyInput value={p.maxPerNight} currency={currency} onChange={(maxPerNight) => setPrefs({ maxPerNight })} />
      </Group>

      <Group title="Get around">
        <Label>Pace</Label>
        <Segmented<Pace> value={input.pace} onChange={(pace) => setInput({ pace })} options={[{ value: 'chill', label: '🐢 Chill' }, { value: 'balanced', label: '⚖️ Balanced' }, { value: 'fast', label: '🐇 Fast' }]} />
        <Label>Between cities (fastest allows flights)</Label>
        {choose('betweenCities', [{ value: 'cheapest', label: 'Cheapest' }, { value: 'balanced', label: 'Balanced' }, { value: 'fastest', label: 'Fastest' }])}
        <Label>Longest travel day</Label>
        {choose('maxTravelHours', [{ value: 3, label: '3 h' }, { value: 5, label: '5 h' }, { value: 8, label: '8 h' }, { value: null, label: 'No limit' }])}
        <div className="mt-2">{toggle('overnight', 'Overnight buses and trains are OK')}</div>
      </Group>

      <Group title="Do">
        <Label>Interests</Label>
        <div className="flex flex-wrap gap-1">
          {INTERESTS.map((t) => {
            const on = input.interests.includes(t)
            return (
              <button key={t} onClick={() => setInput({ interests: on ? input.interests.filter((x) => x !== t) : [...input.interests, t] })}
                className={`rounded-full border px-2 py-0.5 text-[12px] capitalize ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}>
                {t}
              </button>
            )
          })}
        </div>
        <Label>Paid sights and tours</Label>
        {choose('sights', [{ value: 'few', label: 'A few' }, { value: 'daily', label: 'One a day' }, { value: 'lots', label: 'Lots + tours' }])}
      </Group>

      <Group title="Comfort">
        <Label>Comfortable daily highs</Label>
        <TempRange
          unit={tempUnit} min={p.minHighC} max={p.maxHeatC} lows={range(0, 26)} highs={range(20, 40)}
          onChange={(minHighC, maxHeatC) => setPrefs({ minHighC, maxHeatC })}
        />
        <Label>Comfortable nights (daily lows)</Label>
        <TempRange
          unit={tempUnit} min={p.minLowC} max={p.maxLowC} lows={range(-10, 16)} highs={range(14, 28)}
          onChange={(minLowC, maxLowC) => setPrefs({ minLowC, maxLowC })}
        />
        <p className="mt-1 text-[11px] text-muted">The planner favours places within these in the months you'd be there, and Checks flags the rest. Warm nights matter without air conditioning; cold ones when camping.</p>
        <div className="mt-2 flex flex-col gap-1.5">
          {toggle('avoidRain', 'Avoid rainy months')}
          {toggle('needInternet', 'I need fast internet (working on the road)')}
        </div>
      </Group>

      <Group title="Money">
        <Label>Daily budget per person (optional)</Label>
        <MoneyInput value={p.dailyBudget} currency={currency} onChange={(dailyBudget) => setPrefs({ dailyBudget })} />
      </Group>
    </div>
  )
}

/** Temperatures in °C from `a` to `b` in steps of 2. */
const range = (a: number, b: number) => Array.from({ length: (b - a) / 2 + 1 }, (_, i) => a + i * 2)

/** A comfortable range of temperatures (stored in °C, shown in the user's unit); either end can be left open. */
function TempRange({ unit, min, max, lows, highs, onChange }: {
  unit: TempUnit; min: number | null; max: number | null; lows: number[]; highs: number[]
  onChange: (min: number | null, max: number | null) => void
}) {
  const label = (c: number) => `${tempValue(c, unit)}°${unit}`
  const pick = (value: number | null, options: number[], open: string, set: (v: number | null) => void) => (
    <select value={value ?? ''} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} className={`${inputCls} w-auto`}>
      <option value="">{open}</option>
      {/* Keep a value set elsewhere (e.g. by the assistant) even if it isn't one of the steps. */}
      {[...new Set([...options, ...(value != null ? [value] : [])])].sort((a, b) => a - b).map((c) => <option key={c} value={c}>{label(c)}</option>)}
    </select>
  )
  return (
    <div className="flex items-center gap-2 text-[13px]">
      {pick(min, lows, 'Any', (v) => onChange(v, max != null && v != null && v > max ? v : max))}
      <span className="text-muted">to</span>
      {pick(max, highs, 'Any', (v) => onChange(min != null && v != null && v < min ? v : min, v))}
    </div>
  )
}

/** Cities to pick a home from: every city the app knows, by name. */
const HOME_CITIES = Object.values(ds.cities).sort((a, b) => a.name.localeCompare(b.name))

const inputCls = 'w-full rounded-md border border-line bg-panel px-2 py-1.5 text-[13px] outline-none focus:border-accent'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">{title}</h3>
      {children}
    </section>
  )
}

const Label = ({ children }: { children: ReactNode }) => <div className="mt-2.5 mb-1 text-[12px] text-muted first:mt-0">{children}</div>

/** An optional amount typed in the display currency and stored in EUR; empty means no limit. */
function MoneyInput({ value, currency, onChange }: { value: number | null; currency: string; onChange: (eur: number | null) => void }) {
  const rate = (currency === 'EUR' ? 1 : ds.fx.rates[currency]) || 1
  const shown = value == null ? '' : String(Math.round(value * rate))
  const [text, setText] = useState(shown)
  // Follow changes from outside (another currency, another trip).
  useEffect(() => setText(shown), [shown])
  return (
    <div className="flex items-center gap-2">
      <input
        type="number" min={0} inputMode="numeric" placeholder="No limit" value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number(text)
          onChange(text.trim() && n > 0 ? Math.round((n / rate) * 100) / 100 : null)
        }}
        className={`${inputCls} max-w-[10rem]`}
      />
      <span className="text-[13px] text-muted">{currency}</span>
    </div>
  )
}
