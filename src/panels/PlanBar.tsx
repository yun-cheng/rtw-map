import { useEffect, useMemo, useRef, useState } from 'react'
import { dataset as ds } from '../data/dataset'
import { evaluatePlan, type Plan } from '../planner'
import { MAX_PLANS, tripPlans, useTrip, type TripPlan } from '../store/trip'
import { cityName, duration } from '../ui/format'
import { useMoney } from '../ui/useMoney'

/**
 * The trip's plans (versions of the itinerary, each with its own setup and preferences): switch between them, add a
 * copy of the current one to try something, rename or delete one, and compare them side by side.
 */
export function PlanBar() {
  const s = useTrip()
  const { activePlanId, switchPlan, addPlan } = s
  const plans = tripPlans(s)
  const [comparing, setComparing] = useState(false)
  const [menu, setMenu] = useState(false)

  return (
    <div className="relative border-b border-line px-2 py-1.5">
      <div className="flex items-center gap-1 overflow-x-auto">
        {plans.map((p) => {
          const on = p.id === activePlanId
          return (
            <button
              key={p.id}
              onClick={() => (on ? setMenu(!menu) : switchPlan(p.id))}
              title={on ? 'The plan you are editing: click to rename or delete it' : `Switch to ${p.name}`}
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}
            >
              {p.name}{on && <span className="ml-1 text-[10px]">▾</span>}
            </button>
          )
        })}
        <button
          onClick={() => addPlan()}
          disabled={plans.length >= MAX_PLANS}
          title={plans.length >= MAX_PLANS ? `A trip can have up to ${MAX_PLANS} plans` : 'New plan: a copy of this one, to try something without losing it'}
          className="shrink-0 rounded-full border border-dashed border-line px-2 py-0.5 text-[12px] text-muted hover:text-ink disabled:opacity-40"
        >
          + Plan
        </button>
        {plans.length > 1 && (
          <button onClick={() => setComparing(!comparing)} className={`ml-auto shrink-0 px-1 text-[12px] ${comparing ? 'text-accent' : 'text-muted hover:text-ink'}`}>
            Compare
          </button>
        )}
      </div>
      {menu && <PlanMenu plan={plans.find((p) => p.id === activePlanId)!} canDelete={plans.length > 1} onClose={() => setMenu(false)} />}
      {comparing && plans.length > 1 && <Compare plans={plans} onClose={() => setComparing(false)} />}
    </div>
  )
}

/** Rename or delete the active plan. */
function PlanMenu({ plan, canDelete, onClose }: { plan: TripPlan; canDelete: boolean; onClose: () => void }) {
  const { renamePlan, deletePlan } = useTrip()
  const [name, setName] = useState(plan.name)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && onClose()
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])
  const save = () => {
    renamePlan(plan.id, name)
    onClose()
  }
  return (
    <div ref={box} className="absolute top-full left-2 z-30 mt-1 w-64 rounded-lg border border-line bg-panel p-2.5 shadow-lg">
      <label className="text-[11px] font-semibold tracking-wider text-muted uppercase">Plan name</label>
      <div className="mt-1 flex gap-1.5">
        <input
          autoFocus value={name} maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => (e.key === 'Enter' ? save() : e.key === 'Escape' && onClose())}
          className="min-w-0 flex-1 rounded-md border border-line bg-panel px-2 py-1 text-[13px] outline-none focus:border-accent"
        />
        <button onClick={save} className="rounded-md bg-accent px-2 text-[12px] font-medium text-on-accent">Save</button>
      </div>
      <button
        disabled={!canDelete}
        onClick={() => {
          if (confirm(`Delete ${plan.name}? This can't be undone.`)) deletePlan(plan.id)
          onClose()
        }}
        title={canDelete ? undefined : 'A trip needs at least one plan'}
        className="mt-2 text-[12px] text-danger hover:underline disabled:text-muted disabled:no-underline"
      >
        Delete this plan
      </button>
    </div>
  )
}

/** The plans side by side: size, cost, travel and problems, and which cities each has that the active one doesn't. */
function Compare({ plans, onClose }: { plans: TripPlan[]; onClose: () => void }) {
  const { activePlanId, switchPlan } = useTrip()
  const { fmt } = useMoney()
  const evaluated = useMemo(
    () => plans.map((p) => {
      let plan: Plan | null = null
      try {
        plan = p.stops.length ? evaluatePlan(ds, p.input, p.stops) : null
      } catch {
        // Refers to data that no longer exists.
      }
      return { ...p, plan }
    }),
    [plans],
  )
  const active = evaluated.find((p) => p.id === activePlanId)!
  const activeCities = new Set(active.stops.map((s) => s.cityId))

  const rows: { label: string; value: (p: (typeof evaluated)[number]) => string; title?: string }[] = [
    { label: 'Dates', value: (p) => `${p.input.startDate.slice(5)} → ${p.input.endDate.slice(5)}` },
    { label: 'Stops', value: (p) => String(p.stops.length) },
    { label: 'Countries', value: (p) => String(new Set(p.stops.map((s) => ds.cities[s.cityId]?.iso2)).size) },
    { label: 'Cost', value: (p) => (p.plan ? `${fmt(p.plan.cost.min)}–${fmt(p.plan.cost.max)}` : '–'), title: 'Stays and travel, roughly' },
    { label: 'Per day', value: (p) => (p.plan ? fmt(p.plan.cost.perDay) : '–') },
    { label: 'Travel time', value: (p) => (p.plan ? duration(p.plan.legs.reduce((t, l) => t + l.durationMin, 0)) : '–'), title: 'All journeys between stops added up' },
    { label: 'Schengen days', value: (p) => (p.plan?.schengen.applies ? `${p.plan.schengen.maxInWindow} of ${p.plan.schengen.limit}` : '–'), title: 'Most days in any 180-day window' },
    { label: 'Problems', value: (p) => (p.plan ? String(p.plan.warnings.filter((w) => w.severity === 'error').length) : '–'), title: 'Checks that need attention (red)' },
    {
      label: 'Not in active plan',
      value: (p) => (p.id === activePlanId ? '' : p.stops.filter((s) => !activeCities.has(s.cityId)).map((s) => cityName(s.cityId)).join(', ') || 'none'),
    },
    {
      label: 'Missing from it',
      value: (p) => {
        if (p.id === activePlanId) return ''
        const mine = new Set(p.stops.map((s) => s.cityId))
        return active.stops.filter((s) => !mine.has(s.cityId)).map((s) => cityName(s.cityId)).join(', ') || 'none'
      },
    },
  ]

  return (
    <div className="absolute top-full right-0 left-0 z-30 mt-px max-h-[70vh] overflow-auto border-b border-line bg-panel p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">Compare plans</h3>
        <button onClick={onClose} className="h-6 w-6 rounded text-muted hover:bg-canvas hover:text-ink" aria-label="Close">✕</button>
      </div>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th />
            {evaluated.map((p) => (
              <th key={p.id} className="px-1.5 pb-1 text-left align-bottom">
                <button
                  onClick={() => switchPlan(p.id)}
                  className={`font-semibold ${p.id === activePlanId ? 'text-accent' : 'hover:text-accent'}`}
                  title={p.id === activePlanId ? 'The active plan' : `Switch to ${p.name}`}
                >
                  {p.name}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line align-top">
              <td className="py-1 pr-2 whitespace-nowrap text-muted" title={r.title}>{r.label}</td>
              {evaluated.map((p) => <td key={p.id} className="px-1.5 py-1">{r.value(p)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
