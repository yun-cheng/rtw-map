import { Minus, Plus, RotateCcw } from 'lucide-react'
import { Fragment } from 'react'
import { dataset as ds } from '../data/dataset'
import { MEAL_HINTS, cityPrices, costProfile, dayChoices, dayCost, prefsDay, taxiEstimate, type DayChoices, type GroceryKey, type PriceKey } from '../planner'
import { useTrip } from '../store/trip'
import { Badge, Named, Section, Segmented } from '../ui/kit'
import { useMoney } from '../ui/useMoney'
import { AiHelp } from './AiHelp'
import { PriceEdit } from './PriceEdit'
import { Editable } from './ReadOnly'

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

/** What a row's amount is the price of, at the choice made, and how many of it (coffees, rides); none for a skipped meal. */
function rowPrice(key: keyof DayChoices, v: Value): [Exclude<PriceKey, GroceryKey | 'day'>, number] | null {
  switch (key) {
    case 'bed': return [v === 'dorm' ? 'dormBed' : 'privateRoom', 1]
    case 'breakfast':
    case 'lunch':
    case 'dinner':
      return v === 'diy' ? [key === 'breakfast' ? 'diyBreakfast' : 'diyMeal', 1] : v === 'local' ? ['mealLocal', 1] : v === 'restaurant' ? ['mealDinner', 1] : null
    case 'coffees': return ['coffee', Number(v)]
    case 'beers': return ['beerBar', Number(v)]
    case 'taxis': return ['taxiRide', Number(v)]
  }
}

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
  const { input, setInput, plan, seenPrices } = useTrip()
  const { fmt } = useMoney()
  const choices = dayChoices(input, cityId)
  const day = dayCost(ds, cityId, choices, seenPrices)
  // The prices, the user's where they saw one, and ours (for the resets).
  const prices = cityPrices(ds, cityId, seenPrices)
  const ours = cityPrices(ds, cityId)
  if (!day || !prices || !ours) return null
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
      <Named
        label="Public transport" hint="A day of getting around by bus, tram or metro: a day pass, or the single tickets you'd use."
        aside={<span className="font-medium"><PriceEdit cityId={cityId} what="localTransportDay" eur={transitEur} ours={ours.localTransportDay} label="Public transport, a day" precise /></span>}
      />
    </div>
  )

  // Keeps only what differs from the preferences, so a later change of preferences still reaches this city.
  const save = (next: DayChoices | null) => {
    const { [cityId]: _old, ...others } = input.cityCosts ?? {}
    const diff = next ? Object.fromEntries(Object.entries(next).filter(([k, v]) => base[k as keyof DayChoices] !== v)) : {}
    setInput({ cityCosts: Object.keys(diff).length ? { ...others, [cityId]: diff } : others })
  }

  return (
    <Section title="Daily cost" action={<AiHelp topic="dailyCost" place={ds.cities[cityId].name} />} aside={costProfile(ds, ds.cities[cityId].iso2)?.estimated ? <Badge tone="warn">estimated from price level</Badge> : undefined}>
      {/* (The choices are the trip's, locked while it's read-only; the prices seen are My visit's, never locked.) */}
      <div className="mb-1 flex justify-end text-[12px]">
        {changed ? (
          <Editable>
            <button onClick={() => save(null)} className="flex items-center gap-1 font-medium text-accent hover:underline">
              <RotateCcw size={12} /> Reset all to preferences
            </button>
          </Editable>
        ) : <span className="text-muted">Using your preferences</span>}
      </div>
      {DAY_FIELDS.map((f) => {
        if (f.key === 'taxis' && !taxi) return transit
        const value = choices[f.key]
        const set = (v: Value) => save({ ...choices, [f.key]: v })
        const eur = day.items.find((i) => i.key === ITEM[f.key])!.eur
        const invalid = f.key === 'bed' && over(eur, maxPerNight)
        const [what, count] = rowPrice(f.key, value) ?? [null, 0]
        return (
          <Fragment key={f.key}>
            {f.key === 'taxis' && transit}
            <div className="py-1.5" title={f.key === 'bed' ? overBy(eur, maxPerNight) : undefined}>
              {/* An item changed for this city has a reset back to the preference. */}
              <Named
                label={f.key === 'bed' ? <>{f.label} <Budget eur={maxPerNight} over={invalid} /></> : f.label}
                hint={f.hint?.(value)}
                after={value !== base[f.key] && (
                  <Editable>
                    <button onClick={() => set(base[f.key])} title="Reset to your preference" aria-label={`Reset ${f.label.toLowerCase()} to your preference`} className="ml-1 text-accent hover:opacity-70">
                      <RotateCcw size={12} />
                    </button>
                  </Editable>
                )}
                aside={
                  <span className="flex items-center gap-3">
                    {/* No price for none of a counted item (0 coffees); "–" for a skipped meal. */}
                    {(eur || f.max === undefined) && (
                      <span className="font-medium tabular-nums">
                        {what && count && prices[what] != null
                          ? <PriceEdit cityId={cityId} what={what} eur={prices[what]!} ours={ours[what] ?? prices[what]!} count={count} label={f.label} precise className={invalid ? OVER : ''} />
                          : <span className={invalid ? OVER : undefined}>{eur ? fmt(eur, true) : '–'}</span>}
                      </span>
                    )}
                    {f.max !== undefined && <Editable><Counter value={Number(value)} max={f.max} label={f.label} onChange={(n) => set(n as Value)} /></Editable>}
                  </span>
                }
              >
                {f.options && <div className="mt-0.5"><Editable><DaySwitch field={f} value={value} onChange={set} /></Editable></div>}
              </Named>
            </div>
          </Fragment>
        )
      })}
      <div className="mt-1.5 border-t border-line pt-1.5">
        <div className="flex items-baseline justify-between py-0.5 text-[13px]" title={overBy(day.total, dailyBudget)}>
          <span className="font-semibold">Per day <Budget eur={dailyBudget} over={dayOver} /></span>
          <span className="font-semibold">
            <PriceEdit cityId={cityId} what="day" eur={day.total} ours={day.sum} label="Per day" className={dayOver ? OVER : ''} />
          </span>
        </div>
      </div>
      {stop && (
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-muted">{stop.nights} night{stop.nights === 1 ? '' : 's'} here</span>
          <span className="font-medium">
            <PriceEdit cityId={cityId} what="day" eur={day.total} ours={day.sum} count={stop.nights} per="a day" label={`${stop.nights} nights here`} />
          </span>
        </div>
      )}
      <p className="mt-1.5 text-[12px] text-muted">
        {day.own
          ? <>Per day is what a day here really costs you, used for this city; the items add up to {fmt(day.sum)}.</>
          : 'Click a price to put in the one you saw or paid; it\'s then used for this city.'}
      </p>
    </Section>
  )
}
