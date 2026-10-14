// The Today tab, while the trip is under way (PLAN.md §14.3): where you are, the day's or next journey, the weather
// today and tomorrow, tonight's stay, today's journal entry, this stop's checks, the days left and the assistant. The app opens on it then (store/url.ts).
import { ChevronRight, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { dataset as ds } from '../data/dataset'
import { addDays, daysBetween, isTravelling, localToday, SCHENGEN_LIMIT, schengenApplies, schengenUsed, travelDay, type Leg } from '../planner'
import { useNote } from '../store/items'
import { legKey, useTrip } from '../store/trip'
import { MODE_ICON, cityName, dayDate, duration, flag } from '../ui/format'
import { Button, Named, Section, Sections } from '../ui/kit'
import { useMoney } from '../ui/useMoney'
import { useTemp } from '../ui/useTemp'
import { CheckNotes, legWarnings, stopWarnings } from './Checks'
import { tabOf, type SectionKey } from './cityTabs'
import { fetchForecast, savedNote, sky, type CityForecast } from './Forecast'
import { JourneyLinks } from './JourneyLinks'
import { TodayEntry } from './Journal'
import { NoteBox } from './Notes'
import { TonightStay } from './Visit'

/** "today", "tomorrow" or "in 3 days". */
function fromToday(today: string, iso: string) {
  const n = daysBetween(today, iso)
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`
}

/** The journey Today leads with: the one arriving today on a travel day, else the next one (home at the end). */
type Journey = { leg: Leg; date: string; index?: number; home?: boolean }

export function Today() {
  const { plan, input, select, askAssistant } = useTrip()
  const today = localToday()
  if (!plan || !isTravelling(input, today)) return null
  const { day, of, at } = travelDay(input, plan.stops, today)
  // Tonight's stop; none before the first, or after a stop left when the next isn't begun (the stops can end before
  // the trip's last day: the Checks say so).
  const stop = at !== null && plan.stops[at].depart > today ? plan.stops[at] : null
  const left = at !== null && !stop ? plan.stops[at] : null
  const arriving = !!stop && stop.arrive === today
  const next = at === null ? plan.stops[0] : plan.stops[at + 1]

  let journey: Journey | null = null
  if (at === null || (at === 0 && arriving)) journey = plan.home.out && { leg: plan.home.out, date: input.startDate, home: true }
  else if (arriving) journey = { leg: plan.legs[at - 1], date: today, index: at - 1 }
  else if (next) journey = { leg: plan.legs[at], date: stop ? stop.depart : next.arrive, index: at }
  else if (plan.home.back) journey = { leg: plan.home.back, date: input.endDate, home: true }

  // Tomorrow night's city: where the weather of tomorrow is wanted.
  const tomorrow = addDays(today, 1)
  const tomorrowStop = plan.stops.find((s) => s.arrive <= tomorrow && tomorrow < s.depart)

  return (
    <div className="min-h-full bg-canvas">
      <div className="border-b border-line bg-panel px-4 pt-3 pb-3">
        <div className="text-[12px] text-muted">Day {day} of {of} · {dayDate(today)}</div>
        {stop ? (
          <>
            <button onClick={() => select({ type: 'city', id: stop.cityId })} className="mt-0.5 text-left text-[20px] font-semibold hover:underline">
              {flag(ds.cities[stop.cityId].iso2)} {cityName(stop.cityId)}
            </button>
            <p className="text-[13px]">
              {arriving
                ? <>Arriving today · {stop.nights} night{stop.nights > 1 ? 's' : ''}</>
                : <>Night {daysBetween(stop.arrive, today) + 1} of {stop.nights}</>}
              <span className="text-muted">
                {' · '}
                {next ? `leaving ${daysBetween(today, stop.depart) <= 1 ? fromToday(today, stop.depart) : dayDate(stop.depart)} for ${cityName(next.cityId)}` : `the last stop · the trip ends ${dayDate(input.endDate)}`}
              </span>
            </p>
          </>
        ) : left ? (
          <>
            <p className="mt-0.5 text-[20px] font-semibold">No stop planned tonight</p>
            <p className="text-[13px] text-muted">
              Left {cityName(left.cityId)} {dayDate(left.depart)} · {next ? `next: ${cityName(next.cityId)}, ${dayDate(next.arrive)}` : `the trip ends ${dayDate(input.endDate)}`}
            </p>
          </>
        ) : (
          <p className="mt-0.5 text-[20px] font-semibold">On the way to {cityName(plan.stops[0].cityId)}</p>
        )}
        {/* The trip so far. */}
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuemin={1} aria-valuemax={of} aria-valuenow={day} aria-label="Days of the trip">
          <div className="h-full rounded-full bg-accent" style={{ width: `${(day / of) * 100}%` }} />
        </div>
      </div>

      <Sections>
        {journey && <JourneyCard journey={journey} today={today} />}
        {/* The journey's own note (the ticket, the bus time…), when written: from the journey panel. */}
        {journey && <JourneyNote key={legKey(journey.leg.from, journey.leg.to)} at={legKey(journey.leg.from, journey.leg.to)} />}
        {stop && <TonightStay stop={stop} today={today} />}
        {stop && (
          <Section title="Weather" aside={<OpenTab cityId={stop.cityId} section="weather" label="Next 10 days" />}>
            <div className="grid grid-cols-2 gap-3">
              <DayWeather cityId={stop.cityId} date={today} label="Today" />
              {tomorrowStop && (
                <DayWeather cityId={tomorrowStop.cityId} date={tomorrow} label={tomorrowStop.cityId === stop.cityId ? 'Tomorrow' : `Tomorrow in ${cityName(tomorrowStop.cityId)}`} />
              )}
            </div>
          </Section>
        )}
        <TodayEntry today={today} />
        {stop && stopWarnings(plan.warnings, stop.cityId).length > 0 && (
          <Section title={`Checks for ${cityName(stop.cityId)}`}>
            <CheckNotes warnings={stopWarnings(plan.warnings, stop.cityId)} cityId={stop.cityId} />
          </Section>
        )}
        <DaysLeft today={today} />
        <Section>
          <div className="flex items-center gap-3">
            <p className="flex-1 text-[12px] text-muted">
              The assistant knows where you are today, and changes only what's ahead: "rain tomorrow, swap the next two stops?"
            </p>
            <Button variant="primary" onClick={askAssistant}><Sparkles size={14} /> Ask AI</Button>
          </div>
        </Section>
      </Sections>
    </div>
  )
}

/** A journey's note, when written. */
function JourneyNote({ at }: { at: string }) {
  if (!useNote(at).trim()) return null
  return <NoteBox at={at} title="Journey notes" placeholder="Your ticket, the bus time, where it leaves from…" />
}

/** The journey: when, how, how long and for how much, the timetable's tips and its checks; on its day or the day
 *  before, the arrival city's essentials. */
function JourneyCard({ journey: { leg, date, index, home }, today }: { journey: Journey; today: string }) {
  const { plan, select } = useTrip()
  const { fmt } = useMoney()
  const soon = daysBetween(today, date) <= 1
  const when = fromToday(today, date)
  const tips = leg.hops.filter((h) => h.note)
  const checks = index === undefined || !plan ? [] : legWarnings(plan.warnings, index)
  return (
    <Section
      title={date === today && index !== undefined ? "Today's journey" : home && plan?.home.back === leg ? 'Going home' : 'Next journey'}
      aside={<span className={`text-[12px] ${soon ? 'font-semibold text-accent' : 'text-muted'}`}>{when[0].toUpperCase() + when.slice(1)} · {dayDate(date)}</span>}
    >
      <div className="text-[14px] font-medium">{cityName(leg.from)} → {cityName(leg.to)}</div>
      {leg.reachable ? (
        <div className="text-[12px] text-muted">
          {leg.hops.map((h) => MODE_ICON[h.mode] ?? '•').join(' ')} {leg.estimated && '≈'}{duration(leg.durationMin)} · {fmt(leg.priceMin)}–{fmt(leg.priceMax)}
          {leg.overnight && ' · overnight'}
        </div>
      ) : (
        <p className="text-[12px] text-danger">No known route: add a stop in between, or check Google Maps.</p>
      )}
      {leg.hops.length > 1 && (
        <ol className="mt-1.5 flex flex-col gap-0.5 text-[12px]">
          {leg.hops.map((h, i) => (
            <li key={i}>{MODE_ICON[h.mode] ?? '•'} {cityName(h.from)} → {cityName(h.to)} <span className="text-muted">· {duration(h.durationMin)}{h.frequency && ` · ${h.frequency}`}</span></li>
          ))}
        </ol>
      )}
      {leg.hops.length === 1 && leg.hops[0].frequency && <div className="text-[12px] text-muted capitalize">{leg.hops[0].frequency}</div>}
      {tips.map((h, i) => <p key={i} className="mt-1.5 text-[12px]">{h.note}</p>)}
      {checks.length > 0 && <div className="mt-2"><CheckNotes warnings={checks} cityId={leg.to} /></div>}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
        {index !== undefined && <button onClick={() => select({ type: 'leg', index })} className="text-accent hover:underline">Details and notes</button>}
        <JourneyLinks leg={leg} date={date} />
      </div>
      {soon && !(home && plan?.home.back === leg) && (
        <div className="mt-3 border-t border-line pt-2">
          <div className="mb-1 text-[12px] text-muted">Arriving in {cityName(leg.to)}</div>
          <div className="flex flex-wrap gap-1.5">
            <OpenTab cityId={leg.to} section="around" label="Getting around" chip />
            <OpenTab cityId={leg.to} section="money" label="Paying & cash" chip />
            <OpenTab cityId={leg.to} section="phone" label="Phone & SIM" chip />
          </div>
        </div>
      )}
    </Section>
  )
}

/** Opens a city's panel at the tab with `section`. */
function OpenTab({ cityId, section, label, chip }: { cityId: string; section: SectionKey; label: string; chip?: boolean }) {
  const { select, setCityTab } = useTrip()
  const open = () => {
    setCityTab(...tabOf(section))
    select({ type: 'city', id: cityId })
  }
  return chip ? (
    <button onClick={open} className="rounded-full border border-line px-2.5 py-1 text-[12px] hover:bg-canvas">{label}</button>
  ) : (
    <button onClick={open} className="flex items-center text-[12px] text-accent hover:underline">{label}<ChevronRight size={14} /></button>
  )
}

/** A day's forecast in a city: the sky, the high and low (as felt, when that's the setting) and the chance of rain. */
function DayWeather({ cityId, date, label }: { cityId: string; date: string; label: string }) {
  const [forecast, setForecast] = useState<CityForecast | null | 'failed'>(null)
  const feels = useTrip((s) => s.tempFeels)
  const { t } = useTemp()
  useEffect(() => {
    let live = true
    setForecast(null)
    fetchForecast(cityId).then((f) => live && setForecast(f), () => live && setForecast('failed'))
    return () => { live = false }
  }, [cityId])
  // (By the city's own dates: Open-Meteo's days are in its time zone.)
  const d = forecast && forecast !== 'failed' ? forecast.days.find((x) => x.date === date) : null
  const [icon, words] = d ? sky(d.code) : ['', '']
  const asFelt = feels && d?.feelsHigh != null && d.feelsLow != null
  return (
    <div className="min-w-0">
      <div className="truncate text-[12px] text-muted">{label}</div>
      {forecast === null && <div className="mt-1 h-12 animate-pulse rounded-md bg-canvas" aria-label="Loading the forecast" />}
      {forecast !== null && !d && <p className="mt-1 text-[12px] text-muted">{forecast === 'failed' ? "Couldn't load the forecast." : 'No forecast for this day.'}</p>}
      {d && (
        <div className="mt-0.5 flex items-center gap-2" title={words}>
          <span className="text-[26px] leading-none" aria-hidden>{icon}</span>
          <div className="min-w-0 text-[12px]">
            <div className="text-[14px] font-semibold tabular-nums">
              {t(asFelt ? d.feelsHigh! : d.high)} <span className="font-normal text-muted">{t(asFelt ? d.feelsLow! : d.low)}</span>
            </div>
            <div className="truncate text-muted">{words}{d.rainChance != null && ` · ${d.rainChance}% rain`}</div>
          </div>
        </div>
      )}
      {d && forecast !== 'failed' && forecast?.savedOn && <p className="mt-0.5 text-[11px] text-muted">{savedNote(forecast.savedOn)}</p>}
    </div>
  )
}

/** The nights left here and in the trip, and the Schengen days used by today (when the rule applies and the trip goes
 *  there). */
function DaysLeft({ today }: { today: string }) {
  const { plan, input } = useTrip()
  if (!plan) return null
  const stop = plan.stops.find((s) => s.arrive <= today && today < s.depart)
  const here = stop ? daysBetween(today, stop.depart) : 0
  const left = daysBetween(today, input.endDate)
  const schengen = schengenApplies(ds, input.passport) ? schengenUsed(ds, plan.stops, input.schengenDaysBefore, today) : null
  const full = schengen && schengen.used / SCHENGEN_LIMIT
  return (
    <Section title="Days left">
      <div className="flex flex-col gap-1.5">
        {stop && <Named label={`In ${cityName(stop.cityId)}`} aside={<b>{here} night{here === 1 ? '' : 's'}</b>} />}
        <Named label="In the trip" aside={<b>{left} night{left === 1 ? '' : 's'}</b>} />
        {schengen?.visits && (
          <Named
            label="Schengen days used" hint={`Days in the Schengen area in the last 180, today included (and those before the trip, set in the Trip tab). At most ${SCHENGEN_LIMIT}.`}
            aside={<b className={full! > 0.85 ? 'text-warn' : ''}>{schengen.used} of {SCHENGEN_LIMIT}</b>}
          >
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
              <div className={`h-full rounded-full ${full! > 0.85 ? 'bg-warn' : 'bg-schengen'}`} style={{ width: `${Math.min(1, full!) * 100}%` }} />
            </div>
          </Named>
        )}
      </div>
    </Section>
  )
}
