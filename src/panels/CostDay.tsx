import { Minus, Plus, RotateCcw } from 'lucide-react'
import { Fragment } from 'react'
import { dataset as ds } from '../data/dataset'
import { MEAL_HINTS, costProfile, dayChoices, dayCost, prefsDay, taxiEstimate, type DayChoices } from '../planner'
import { useTrip } from '../store/trip'
import { Badge, Named, Section, Segmented } from '../ui/kit'
import { useMoney } from '../ui/useMoney'

type Value = DayChoices[keyof DayChoices]
type Option<K extends keyof DayChoices> = { value: DayChoices[K]; label: string }
type DayField<K extends keyof DayChoices = keyof DayChoices> = {
  key: K
  label: string
  /** What the chosen option counts, if it needs saying. */
  hint?: (value: DayChoices[K]) => string | undefined
  /** A count from 0 up to this, picked with − and +, instead of a list of options. */
  max?: number
  options?: () => Option<K>[]
}

const field = <K extends keyof DayChoices>(f: DayField<K>) => f as unknown as DayField
const MEALS: Option<'lunch'>[] = [{ value: 'diy', label: 'DIY' }, { value: 'local', label: 'Local' }, { value: 'restaurant', label: 'Restaurant' }, { value: 'skip', label: 'Skip' }]

/** The day's choices, in order: shown in a city's Costs tab and, as the defaults for every city, in the Trip tab's preferences (PrefsCards). */
export const DAY_FIELDS: DayField[] = [
  field({ key: 'bed', label: 'Bed', options: () => [{ value: 'dorm', label: 'Dorm bed' }, { value: 'private', label: 'Private room' }] }),
  field({ key: 'breakfast', label: 'Breakfast', hint: (v) => MEAL_HINTS.breakfast[v], options: () => [{ value: 'diy', label: 'DIY' }, { value: 'local', label: 'Local' }, { value: 'skip', label: 'Skip' }] }),
  field({ key: 'lunch', label: 'Lunch', hint: (v) => MEAL_HINTS.lunchDinner[v], options: () => MEALS }),
  field({ key: 'dinner', label: 'Dinner', hint: (v) => MEAL_HINTS.lunchDinner[v], options: () => MEALS }),
  field({ key: 'coffees', label: 'Café coffees', max: 2 }),
  field({ key: 'beers', label: 'Beers in a bar', max: 2 }),
  // Shown in a city only where we know taxi prices; a day of public transport is always counted, just before it.
  field({ key: 'taxis', label: 'Taxi rides', hint: () => 'A ride of about 5 km at the usual meter price.', max: 3 }),
]

/** − and + around a count from 0 to `max`. */
export function Counter({ value, max, label, onChange }: { value: number; max: number; label: string; onChange: (v: number) => void }) {
  const step = 'flex size-6 items-center justify-center rounded-md bg-canvas text-ink transition-colors hover:bg-line disabled:opacity-30 disabled:hover:bg-canvas'
  return (
    <span className="flex items-center gap-2">
      <button onClick={() => onChange(value - 1)} disabled={value <= 0} aria-label={`Fewer ${label.toLowerCase()}`} className={step}><Minus size={12} /></button>
      <span className="w-3 text-center font-medium tabular-nums">{value}</span>
      <button onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`} className={step}><Plus size={12} /></button>
    </span>
  )
}

/** A switch for one of the day's choices. */
export function DaySwitch({ field: f, value, onChange }: { field: DayField; value: Value; onChange: (v: Value) => void }) {
  const options = f.options!()
  return (
    <Segmented
      value={String(value)}
      onChange={(v) => onChange(options.find((o) => String(o.value) === v)!.value)}
      options={options.map((o) => ({ value: String(o.value), label: o.label }))}
    />
  )
}

const ITEM: Record<keyof DayChoices, string> = { bed: 'bed', breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', coffees: 'coffee', beers: 'beer', taxis: 'taxi' }

/**
 * "Daily cost": one traveller's day in a city, item by item, from the preferences. Any item can be changed for this
 * city; the change is saved with the trip and counted in its total.
 */
/** A preference's limit beside the label of what it limits ("Per day (budget $28)"), whether or not it's over. */
function Budget({ eur, over }: { eur: number | null; over: boolean }) {
  const { fmt } = useMoney()
  if (eur == null) return null
  // Over it, the limit itself stands out (red and bold); the brackets stay quiet.
  return <span className="font-normal text-muted">(<span className={over ? 'font-semibold text-danger' : ''}>budget {fmt(eur)}</span>)</span>
}

/** Over a limit: the amount and the limit in red, as budgeting apps show overspending. */
const OVER = 'text-danger'

export function CostDay({ cityId }: { cityId: string }) {
  const { input, setInput, plan } = useTrip()
  const { fmt } = useMoney()
  const choices = dayChoices(input, cityId)
  const day = dayCost(ds, cityId, choices)
  if (!day) return null
  const base = prefsDay(input.prefs)
  const changed = !!input.cityCosts?.[cityId]
  const stop = plan?.stops.find((s) => s.cityId === cityId)
  const taxi = !!taxiEstimate(ds, cityId)
  // Against the preferences: the bed (most per night) and the day (daily budget); over it, the amount and the limit are
  // marked red.
  const { dailyBudget, maxPerNight } = input.prefs
  const over = (eur: number, limit: number | null) => limit != null && eur > limit
  const overBy = (eur: number, limit: number | null) => (over(eur, limit) ? `${fmt(eur - limit!, true)} over your budget` : undefined)
  const dayOver = over(day.total, dailyBudget)

  // A day of public transport is always counted, so it has no choice.
  const transitEur = day.items.find((i) => i.key === 'transport')!.eur
  const transit = (
    <div key="transit" className="py-1.5">
      <Named label="Public transport" hint="A day of getting around by bus, tram or metro: a day pass, or the single tickets you'd use." aside={<span className="font-medium tabular-nums">{fmt(transitEur, true)}</span>} />
    </div>
  )

  // Keeps only what differs from the preferences, so a later change of preferences still reaches this city.
  const save = (next: DayChoices | null) => {
    const { [cityId]: _old, ...others } = input.cityCosts ?? {}
    const diff = next ? Object.fromEntries(Object.entries(next).filter(([k, v]) => base[k as keyof DayChoices] !== v)) : {}
    setInput({ cityCosts: Object.keys(diff).length ? { ...others, [cityId]: diff } : others })
  }

  return (
    <Section title="Daily cost" aside={costProfile(ds, ds.cities[cityId].iso2)?.estimated ? <Badge tone="warn">estimated from price level</Badge> : undefined}>
      <div className="mb-1 flex justify-end text-[12px]">
        {changed ? (
          <button onClick={() => save(null)} className="flex items-center gap-1 font-medium text-accent hover:underline">
            <RotateCcw size={12} /> Reset all to preferences
          </button>
        ) : <span className="text-muted">Using your preferences</span>}
      </div>
      {DAY_FIELDS.map((f) => {
        if (f.key === 'taxis' && !taxi) return transit
        const value = choices[f.key]
        const set = (v: Value) => save({ ...choices, [f.key]: v })
        const eur = day.items.find((i) => i.key === ITEM[f.key])!.eur
        const invalid = f.key === 'bed' && over(eur, maxPerNight)
        return (
          <Fragment key={f.key}>
            {f.key === 'taxis' && transit}
            <div className="py-1.5" title={f.key === 'bed' ? overBy(eur, maxPerNight) : undefined}>
              {/* An item changed for this city has a reset back to the preference. */}
              <Named
                label={f.key === 'bed' ? <>{f.label} <Budget eur={maxPerNight} over={invalid} /></> : f.label}
                hint={f.hint?.(value)}
                after={value !== base[f.key] && (
                  <button onClick={() => set(base[f.key])} title="Reset to your preference" aria-label={`Reset ${f.label.toLowerCase()} to your preference`} className="ml-1 text-accent hover:opacity-70">
                    <RotateCcw size={12} />
                  </button>
                )}
                aside={
                  <span className="flex items-center gap-3">
                    {/* No price for none of a counted item (0 coffees); "–" for a skipped meal. */}
                    {(eur || f.max === undefined) && (
                      <span className="font-medium tabular-nums">
                        <span className={invalid ? OVER : undefined}>{eur ? fmt(eur, true) : '–'}</span>
                      </span>
                    )}
                    {f.max !== undefined && <Counter value={Number(value)} max={f.max} label={f.label} onChange={(n) => set(n as Value)} />}
                  </span>
                }
              >
                {f.options && <div className="mt-0.5"><DaySwitch field={f} value={value} onChange={set} /></div>}
              </Named>
            </div>
          </Fragment>
        )
      })}
      <div className="mt-1.5 border-t border-line pt-1.5">
        <div className="flex items-baseline justify-between py-0.5 text-[13px]" title={overBy(day.total, dailyBudget)}>
          <span className="font-semibold">Per day <Budget eur={dailyBudget} over={dayOver} /></span>
          <span className={`font-semibold tabular-nums ${dayOver ? OVER : ''}`}>{fmt(day.total)}</span>
        </div>
      </div>
      {stop && (
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-muted">{stop.nights} night{stop.nights === 1 ? '' : 's'} here</span>
          <span className="font-medium tabular-nums">{fmt(day.total * stop.nights)}</span>
        </div>
      )}
    </Section>
  )
}
