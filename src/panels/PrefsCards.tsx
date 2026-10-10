import { useEffect, useState, type ReactNode } from 'react'
import { dataset as ds } from '../data/dataset'
import { INTERESTS } from '../data/presets'
import { prefsDay, type DayChoices, type Pace, type TravelPrefs } from '../planner'
import { useTrip } from '../store/trip'
import { money, tempBand } from '../ui/format'
import { Fold, Named, Segmented } from '../ui/kit'
import { Counter, DAY_FIELDS, DaySwitch } from './CostDay'
import { TempBands } from './TempBands'

/** The preference behind each of the day's choices (taxi rides are chosen per city, not here). */
const PREF_OF: Partial<Record<keyof DayChoices, keyof TravelPrefs>> = {
  bed: 'room', breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', coffees: 'coffees', beers: 'beers',
}

type Options<T> = { value: T; label: string }[]
const FOCUS: Options<TravelPrefs['focus']> = [{ value: 'balanced', label: 'Balanced' }, { value: 'countries', label: 'More countries' }, { value: 'highlights', label: 'Top highlights' }]
const EXPENSIVE: Options<TravelPrefs['expensive']> = [{ value: 'ignore', label: "Don't mind" }, { value: 'shorter', label: 'Shorter stays' }, { value: 'skip', label: 'Skip if optional' }]
const PACES: Options<Pace> = [{ value: 'chill', label: '🐢 Chill' }, { value: 'balanced', label: '⚖️ Balanced' }, { value: 'fast', label: '🐇 Fast' }]
const BETWEEN: Options<TravelPrefs['betweenCities']> = [{ value: 'cheapest', label: 'Cheapest' }, { value: 'balanced', label: 'Balanced' }, { value: 'fastest', label: 'Fastest' }]
const HOURS: Options<TravelPrefs['maxTravelHours']> = [{ value: 3, label: '3 h' }, { value: 5, label: '5 h' }, { value: 8, label: '8 h' }, { value: null, label: 'No limit' }]
const labelOf = <T,>(options: Options<T>, value: T) => options.find((o) => o.value === value)?.label ?? String(value)
/** A label in lower case for the middle of a summary, except an abbreviation ("DIY"). */
const lower = (label: string) => (/^[A-Z]{2,}$/.test(label) ? label : label.toLowerCase())
/** Words in a list: "cold", "cold or hot", "cold, hot or rainy". */
const listed = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} or ${words.at(-1)}` : words[0])

/**
 * How the user likes to travel, in the Trip tab: a folded card per topic, each saying in a line what's set. Saved
 * with the trip; a new trip starts from these.
 */
export function PrefsCards() {
  const { input, setInput, setPrefs, currency, tempUnit } = useTrip()
  const p = input.prefs
  const day = prefsDay(p)
  // A segmented control for one preference.
  const choose = <K extends keyof TravelPrefs>(key: K, options: Options<TravelPrefs[K]>) => (
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
  const home = p.homeCityId ? ds.cities[p.homeCityId]?.name : null
  const avoided = [p.avoidCold && 'cold', p.avoidHot && 'hot', p.avoidRain && 'rainy'].filter((x): x is string => !!x)

  const summary = {
    who: [`${ds.visa.passports.find((x) => x.code === input.passport)?.name ?? input.passport} passport`, home && `from ${home}`],
    goals: [labelOf(FOCUS, p.focus), `expensive places: ${labelOf(EXPENSIVE, p.expensive).toLowerCase()}`],
    cost: [
      p.dailyBudget != null ? `budget ${money(p.dailyBudget, currency)}` : 'no budget',
      ...DAY_FIELDS.filter((f) => PREF_OF[f.key]).map((f) => {
        const v = day[f.key]
        if (f.max !== undefined) return Number(v) > 0 && `${f.label.toLowerCase()} ×${v}`
        const label = f.options!().find((o) => o.value === v)?.label ?? String(v)
        return f.key === 'bed' ? label : `${f.label.toLowerCase()} ${lower(label)}`
      }),
      p.maxPerNight != null && `up to ${money(p.maxPerNight, currency)} a night`,
    ],
    around: [`${labelOf(PACES, input.pace).split(' ')[1]} pace`, `${lower(labelOf(BETWEEN, p.betweenCities))} between cities`, p.maxTravelHours ? `up to ${p.maxTravelHours} h a day` : 'no limit a day', p.overnight && 'overnight OK'],
    interests: [input.interests.join(', ') || 'None yet'],
    comfort: [`pleasant ${tempBand('pleasant', tempUnit, p.tempBreaks)}`, avoided.length > 0 && `no ${listed(avoided)} months`],
  }
  // One card open at a time: opening one folds the one that was open.
  const [open, setOpen] = useState<string | null>(null)
  const fold = (title: string) => ({ open: open === title, onToggle: () => setOpen(open === title ? null : title) })
  const line = (parts: unknown[]) => {
    const text = parts.filter(Boolean).join(' · ')
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  return (
    <>
      <div className="mt-2 px-1">
        <h2 className="text-[15px] font-semibold">Preferences</h2>
        <p className="mt-0.5 text-[12px] text-muted">How you like to travel. Saved with this trip; a new trip starts from these.</p>
      </div>

      <Fold title="Who" {...fold('Who')} summary={line(summary.who)}>
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
      </Fold>

      <Fold title="Trip goals" {...fold('Trip goals')} summary={line(summary.goals)}>
        <p className="mb-1 text-[12px] text-muted">How the planner picks places when it makes the plan.</p>
        <Label>What matters most</Label>
        {choose('focus', FOCUS)}
        <Label>Expensive places</Label>
        {choose('expensive', EXPENSIVE)}
      </Fold>

      <Fold title="Daily cost" {...fold('Daily cost')} summary={line(summary.cost)}>
        <Label>Daily budget per person (optional)</Label>
        <MoneyInput value={p.dailyBudget} currency={currency} onChange={(dailyBudget) => setPrefs({ dailyBudget })} />
        <p className="mt-3 text-[12px] text-muted">What a day costs in every city: what you'd pick for each. Change it for one city in that city's Costs tab.</p>
        {DAY_FIELDS.filter((f) => PREF_OF[f.key]).map((f) => {
          const set = (v: unknown) => setPrefs({ [PREF_OF[f.key]!]: v } as Partial<TravelPrefs>)
          return (
            <div key={f.key} className="mt-2.5">
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
      </Fold>

      <Fold title="Get around" {...fold('Get around')} summary={line(summary.around)}>
        <Label>Pace</Label>
        <Segmented<Pace> value={input.pace} onChange={(pace) => setInput({ pace })} options={PACES} />
        <Label>Between cities (fastest allows flights)</Label>
        {choose('betweenCities', BETWEEN)}
        <Label>Longest travel day</Label>
        {choose('maxTravelHours', HOURS)}
        <div className="mt-2">{toggle('overnight', 'Overnight buses and trains are OK')}</div>
      </Fold>

      <Fold title="Interests" {...fold('Interests')} summary={line(summary.interests)}>
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
      </Fold>

      <Fold title="Comfort" {...fold('Comfort')} summary={line(summary.comfort)}>
        <Label>What feels cold, cool, pleasant, warm or hot to you</Label>
        <TempBands breaks={p.tempBreaks} unit={tempUnit} onChange={(tempBreaks) => setPrefs({ tempBreaks })} />
        <p className="mt-2 text-[11px] text-muted">The map and each city's weather use these colours, and Checks warns about cold and hot stays.</p>
        <Label>The planner avoids places in months that are</Label>
        <div className="space-y-1">
          {toggle('avoidCold', 'Cold (highs in your cold band)')}
          {toggle('avoidHot', 'Hot (highs in your hot band)')}
          {toggle('avoidRain', 'Rainy (14 or more days with rain)')}
        </div>
      </Fold>
    </>
  )
}

/** Cities to pick a home from: every city the app knows, by name. */
const HOME_CITIES = Object.values(ds.cities).sort((a, b) => a.name.localeCompare(b.name))

const inputCls = 'w-full rounded-md border border-line bg-panel px-2 py-1.5 text-[13px] outline-none focus:border-accent'

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
