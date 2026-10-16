import { useState } from 'react'
import { dataset as ds } from '../data/dataset'
import { isTravelling, localToday, stopTime, tripDay, type Leg } from '../planner'
import { SHARED_TOKEN } from '../store/shareLink'
import { legKey, useTrip } from '../store/trip'
import { confirm } from '../ui/dialog'
import { MODE_ICON, STOP_COLOR, cityName, dateRange, duration, flag, shortDate } from '../ui/format'
import { Badge, Named } from '../ui/kit'
import { useMoney } from '../ui/useMoney'
import { CheckMark, Checks, legWarnings, stopWarnings } from './Checks'
import { JournalMark } from './Journal'
import { NoteMark } from './Notes'
import { TicketMark } from './Tickets'
import { VisitMarks } from './Visit'
import { TripStatus, TripSummary } from './Travel'
import { UpdatePlanBar } from './UpdatePlan'

export function Itinerary() {
  const { plan, input, selected, select, setNights, toggleLock, removeStop, moveStop, readOnly } = useTrip()
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const { fmt } = useMoney()
  // (A shared trip may have no plan yet: its page has only this tab.)
  if (!plan) return SHARED_TOKEN ? <p className="px-4 py-6 text-[13px] text-muted">This trip has no itinerary yet.</p> : null
  // On a trip under way, the stops already left are faded and today's is marked.
  const today = localToday()
  const travelling = isTravelling(input, today)
  // From the trip's first day on, each stop's days written (the journal; on a shared trip, its public days).
  const started = !!input.startDate && today >= input.startDate

  return (
    <div className="flex min-h-full flex-col">
      {/* (No title: the tab names it.) */}
      <div className="flex items-start gap-1 px-4 pt-3 pb-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <TripStatus />
          <TripSummary />
        </div>
      </div>
      {/* The trip's rough total: each stop's daily cost for its nights, and travel between cities (and from home). */}
      <div className="px-4 pb-2">
        <Named
          label="Estimated cost"
          hint={SHARED_TOKEN
            ? "Each stop's daily cost for its nights, plus travel between cities and from home. A range, since prices vary."
            : "Each stop's daily cost (your choices in the Trip tab's preferences, or changed for a city in its Costs tab) for its nights, plus travel between cities and from home. A range, since prices vary."}
          aside={<span><b className="tabular-nums">{fmt(plan.cost.min)}–{fmt(plan.cost.max)}</b> <span className="text-muted">· ~{fmt(plan.cost.perDay)}/day</span></span>}
        />
      </div>

      <Checks warnings={plan.warnings} />

      <ol className="px-2 pb-6">
        {plan.home.out && <HomeRow leg={plan.home.out} label={`From ${cityName(plan.home.out.from)}`} when={`to arrive ${shortDate(input.startDate)}`} />}
        {plan.stops.map((s, i) => {
          const city = ds.cities[s.cityId]
          const leg = plan.legs[i]
          const isSel = selected?.type === 'city' && selected.id === s.cityId
          const day = tripDay(input.startDate, s.arrive)
          const time = travelling ? stopTime(s, today) : 'ahead'
          // Lock and remove show on pointing at the stop, and always on the open city's (a phone can't point: Edit stop
          // in its panel opens it here).
          const hidden = isSel ? '' : 'opacity-0 group-hover:opacity-100'
          return (
            <li key={s.cityId}>
              <div
                data-selected-stop={isSel || undefined}
                draggable={!readOnly}
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => { e.preventDefault(); setOver(i) }}
                onDragLeave={() => setOver(null)}
                onDrop={() => { if (drag !== null && drag !== i) moveStop(drag, i); setDrag(null); setOver(null) }}
                onDragEnd={() => { setDrag(null); setOver(null) }}
                onClick={() => select({ type: 'city', id: s.cityId })}
                className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ${isSel ? 'bg-accent-soft' : 'hover:bg-canvas'} ${over === i && drag !== i ? 'ring-2 ring-accent' : ''} ${drag === i ? 'opacity-40' : ''}`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-semibold text-white tabular-nums ${day >= 100 ? 'text-[9.5px]' : 'text-[11px]'}`}
                  // Grey once left, as on the map.
                  style={{ background: time === 'done' ? 'var(--color-done)' : STOP_COLOR }}
                  title={`Arrive on day ${day} of the trip`}
                >
                  {day}
                </span>
                <div className={`min-w-0 flex-1 ${time === 'done' ? 'opacity-55' : ''}`} title={time === 'done' ? 'Done: you were here' : undefined}>
                  <div className="flex items-center gap-1.5 font-medium">{time === 'now' && <Badge tone="ok">Now</Badge>}<span className="truncate">{flag(city.iso2)} {city.name}</span><CheckMark warnings={stopWarnings(plan.warnings, s.cityId)} /><NoteMark at={s.cityId} /><VisitMarks stop={s} />{time !== 'ahead' && started && <JournalMark stop={s} />}</div>
                  <div className="text-[11px] text-muted">{dateRange(s.arrive, s.depart)}</div>
                </div>
                {readOnly ? (
                  <span className="pr-1 text-[13px] font-semibold tabular-nums" title="Nights">{s.nights}</span>
                ) : <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <StepBtn onClick={() => setNights(i, s.nights - 1)} disabled={s.nights <= 1} label="One night less">−</StepBtn>
                  <span className="w-7 text-center text-[13px] font-semibold tabular-nums" title="Nights">{s.nights}</span>
                  <StepBtn onClick={() => setNights(i, s.nights + 1)} label="One night more">+</StepBtn>
                  <button onClick={() => toggleLock(i)} title={s.locked ? 'Locked: these nights stay when the plan changes' : 'Lock nights'} className={`ml-0.5 h-6 w-6 rounded text-[12px] ${s.locked ? 'text-ink' : `text-muted ${hidden}`} hover:bg-panel`}>
                    {s.locked ? '🔒' : '🔓'}
                  </button>
                  <button onClick={async () => { if (await confirmRemove(city.name, s.nights)) removeStop(i) }} title="Remove stop" className={`h-6 w-6 rounded text-[12px] text-muted ${hidden} hover:bg-panel hover:text-danger`}>✕</button>
                </div>}
              </div>
              {leg && (
                <button
                  onClick={() => select({ type: 'leg', index: i })}
                  className={`ml-[19px] flex w-[calc(100%-19px)] items-center gap-2 border-l-2 py-1 pl-4 text-left text-[12px] ${selected?.type === 'leg' && selected.index === i ? 'border-ink text-ink' : 'border-line text-muted hover:text-ink'} ${!leg.reachable ? 'text-danger' : ''}`}
                >
                  {leg.reachable ? (
                    <>
                      <CheckMark warnings={legWarnings(plan.warnings, i)} />
                      <span>{leg.hops.map((h) => MODE_ICON[h.mode] ?? '•').join(' ')}</span>
                      <span>{duration(leg.durationMin)}</span>
                      <span>· {fmt(leg.priceMin)}–{fmt(leg.priceMax)}</span>
                      {leg.hops.length > 1 && <span className="truncate">· via {leg.hops.slice(0, -1).map((h) => cityName(h.to)).join(', ')}</span>}
                      {leg.overnight && <Badge>night</Badge>}
                      {leg.estimated && <span title="Estimated from road distance">≈</span>}
                      <TicketMark at={legKey(leg.from, leg.to)} />
                      <NoteMark at={legKey(leg.from, leg.to)} />
                    </>
                  ) : (
                    <span>No known route</span>
                  )}
                </button>
              )}
            </li>
          )
        })}
        {plan.home.back && <HomeRow leg={plan.home.back} label={`Back to ${cityName(plan.home.back.to)}`} when={`leaving ${shortDate(input.endDate)}`} />}
      </ol>
      {!readOnly && <UpdatePlanBar />}
    </div>
  )
}

/** Asks before a stop is taken out by hand. */
export const confirmRemove = (name: string, nights: number) =>
  confirm(`Remove ${name} (${nights} night${nights > 1 ? 's' : ''}) from the trip?`, { ok: 'Remove' })

/** Getting from home to the first stop, or from the last stop back home (set in the Trip tab's preferences; not a stop). */
function HomeRow({ leg, label, when }: { leg: Leg; label: string; when: string }) {
  const { fmt } = useMoney()
  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-muted">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[14px]" aria-hidden>🏠</span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">{label} <span className="font-normal text-muted">· {when}</span></div>
        <div title={leg.estimated ? 'Estimated: long flights are not in the timetable data' : undefined}>
          {leg.hops.map((h) => MODE_ICON[h.mode] ?? '•').join(' ')} {leg.estimated && '≈'}{duration(leg.durationMin)} · {fmt(leg.priceMin)}–{fmt(leg.priceMax)}
          {leg.hops.some((h) => h.note) && <> · {leg.hops.find((h) => h.note)!.note!.toLowerCase()}</>}
        </div>
      </div>
    </li>
  )
}

function StepBtn({ label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} className="h-6 w-6 rounded border border-line bg-panel text-[13px] leading-none hover:bg-canvas disabled:opacity-30" {...props} />
}
