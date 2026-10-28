import { Check, ChevronDown, Columns2, CopyPlus, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dataset as ds } from '../data/dataset'
import { evaluatePlan, type Plan } from '../planner'
import { MAX_PLANS, tripPlans, useTripState, type TripPlan } from '../store/trip'
import { cityName, duration } from '../ui/format'
import { confirm } from '../ui/dialog'
import { usePhone } from '../ui/usePhone'
import { useMoney } from '../ui/useMoney'
import { SHARED_TOKEN } from '../store/shareLink'
import { ReadOnlyToggle } from './ReadOnly'
import { UndoRedo } from './UndoRedo'

/**
 * The trip's plans (versions of the itinerary, each with its own setup and preferences) in a menu: switch between
 * them, add a copy of the current one to try something, compare them side by side, rename or delete the current one.
 * Then Undo, Redo and the version history (UndoRedo.tsx), and the switch that makes the whole trip read-only (then the
 * plans can still be switched and compared, not added, renamed or deleted, and the switch is all there is at the right).
 */
export function PlanBar() {
  const s = useTripState('activePlanId', 'switchPlan', 'addPlan', 'deletePlan', 'readOnly', 'plans', 'input', 'stops')
  const { activePlanId, switchPlan, addPlan, deletePlan, readOnly } = s
  const plans = tripPlans(s)
  const plan = plans.find((p) => p.id === activePlanId)!
  const [comparing, setComparing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const phone = usePhone()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setMenu(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])
  // A menu item: closes the menu, then does its thing.
  const item = (label: ReactNode, run: () => void, { danger = false, disabled = false, title }: { danger?: boolean; disabled?: boolean; title?: string } = {}) => (
    <button
      role="menuitem" disabled={disabled} title={title}
      onClick={() => {
        setMenu(false)
        run()
      }}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-canvas disabled:opacity-40 disabled:hover:bg-transparent max-md:py-2.5 ${danger ? 'text-danger' : ''}`}
    >
      {label}
    </button>
  )

  return (
    <div className="relative flex items-center gap-1 border-b border-line px-2 py-1">
      <div ref={box} className="relative min-w-0">
        <button
          onClick={() => setMenu(!menu)}
          aria-haspopup="menu"
          aria-expanded={menu}
          className="flex max-w-full min-w-0 items-center gap-1 rounded-full border border-accent bg-accent-soft py-0.5 pr-1.5 pl-2.5 text-[12px] font-medium text-accent max-md:py-1"
        >
          <span className="truncate">{plan.name}</span>
          <ChevronDown size={14} className="shrink-0" />
        </button>
        {menu && (
          <div role="menu" className="absolute top-full left-0 z-40 mt-1 w-60 rounded-lg border border-line bg-panel py-1.5 text-[13px] shadow-lg">
            {plans.map((p) => (
              <button
                key={p.id}
                role="menuitemradio"
                aria-checked={p.id === activePlanId}
                onClick={() => {
                  setMenu(false)
                  switchPlan(p.id)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-canvas max-md:py-2.5"
              >
                <span className="w-3.5 shrink-0 text-accent">{p.id === activePlanId && <Check size={14} />}</span>
                <span className="truncate">{p.name}</span>
              </button>
            ))}
            <div className="my-1.5 border-t border-line" />
            {!readOnly && item(<><CopyPlus size={14} className="shrink-0 text-muted" />New plan, a copy of this one</>, () => addPlan(), {
              disabled: plans.length >= MAX_PLANS,
              title: plans.length >= MAX_PLANS ? `A trip can have up to ${MAX_PLANS} plans` : 'To try something without losing this one',
            })}
            {plans.length > 1 && item(<><Columns2 size={14} className="shrink-0 text-muted" />Compare plans</>, () => setComparing(true))}
            {!readOnly && item(<><Pencil size={14} className="shrink-0 text-muted" />Rename this plan</>, () => setRenaming(true))}
            {!readOnly && plans.length > 1 && item(<><Trash2 size={14} className="shrink-0" />Delete this plan</>, async () => {
              if (await confirm(`Delete ${plan.name}?`, { message: "This can't be undone.", ok: 'Delete' })) deletePlan(plan.id)
            }, { danger: true })}
          </div>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <UndoRedo phone={phone} />
        {!SHARED_TOKEN && <ReadOnlyToggle />}
      </div>
      {renaming && !readOnly && <RenamePlan plan={plan} onClose={() => setRenaming(false)} />}
      {comparing && plans.length > 1 && <Compare plans={plans} onClose={() => setComparing(false)} />}
    </div>
  )
}

/** Rename the active plan. */
function RenamePlan({ plan, onClose }: { plan: TripPlan; onClose: () => void }) {
  const { renamePlan } = useTripState('renamePlan')
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
    </div>
  )
}

/** The plans side by side: size, cost, travel and problems, and which cities each has that the active one doesn't. */
function Compare({ plans, onClose }: { plans: TripPlan[]; onClose: () => void }) {
  const { activePlanId, switchPlan, tempFeels, seenPrices } = useTripState('activePlanId', 'switchPlan', 'tempFeels', 'seenPrices')
  const { fmt } = useMoney()
  const evaluated = useMemo(
    () => plans.map((p) => {
      let plan: Plan | null = null
      try {
        plan = p.stops.length ? evaluatePlan(ds, p.input, p.stops, { feels: tempFeels, prices: seenPrices }) : null
      } catch {
        // Refers to data that no longer exists.
      }
      return { ...p, plan }
    }),
    [plans, tempFeels, seenPrices],
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
