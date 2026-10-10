// The plan's checks (planner evaluate: visas, Schengen, weather, the budget and travel-day preferences…): the whole
// list above the itinerary, a mark on each stop and journey with something to look at, and a stop's own checks in its
// city panel, in the card they're about, so it's plain where the plan doesn't fit the preferences (the assistant gets
// them with each stop too).
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { PlanWarning, WarningKind } from '../planner'
import { useTrip, type CityTab } from '../store/trip'
import { cityName, warningTitle } from '../ui/format'
import { Badge } from '../ui/kit'
import { tabOf, type SectionKey } from './cityTabs'

const ORDER = { error: 0, warn: 1, info: 2 }
const bySeverity = (warnings: PlanWarning[]) => [...warnings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
const TONE = { error: 'text-danger', warn: 'text-warn', info: 'text-info' }
const SYMBOL = { error: '●', warn: '▲', info: 'ℹ' }

/** The city panel section a stop's check is about: shown there, and on the Overview's line for it; clicking the
 *  check opens its tab. */
const CHECK_SECTION: Partial<Record<WarningKind, SectionKey | ((w: PlanWarning) => SectionKey)>> = {
  // (The bed's limit shows in the daily cost too, beside the bed.)
  budget: 'day',
  weather: 'weather', health: 'air',
  travel: 'gettingThere', unreachable: 'gettingThere', border: 'gettingThere',
  money: 'money', language: 'language',
}
export function checkSection(w: PlanWarning): SectionKey | null {
  const at = CHECK_SECTION[w.kind]
  return at ? (typeof at === 'function' ? at(w) : at) : null
}
export function checkTab(w: PlanWarning): [CityTab, string?] | null {
  const section = checkSection(w)
  return section && tabOf(section)
}

/** A check's title as shown: in the user's units and currency. */
function useTitle() {
  const unit = useTrip((s) => s.tempUnit)
  const currency = useTrip((s) => s.currency)
  return (w: PlanWarning) => warningTitle(w, unit, currency)
}

/** The checks to look at for a stop: those about it, and about the journey there (problems and warnings, not notes). */
export const stopWarnings = (warnings: PlanWarning[], cityId: string) =>
  bySeverity(warnings.filter((w) => w.cityId === cityId && w.leg === undefined && w.severity !== 'info'))
export const legWarnings = (warnings: PlanWarning[], leg: number) =>
  bySeverity(warnings.filter((w) => w.leg === leg && w.severity !== 'info'))

/** A stop's or journey's mark in the itinerary: the worst of its checks, all of them on hover. */
export function CheckMark({ warnings }: { warnings: PlanWarning[] }) {
  const title = useTitle()
  if (!warnings.length) return null
  const worst = warnings[0].severity
  return (
    <span className={`shrink-0 text-[11px] ${TONE[worst]}`} title={warnings.map(title).join('\n')} aria-label={`${warnings.length} check${warnings.length > 1 ? 's' : ''} to look at`}>
      {SYMBOL[worst]}
    </span>
  )
}

function CheckItem({ w }: { w: PlanWarning }) {
  const select = useTrip((s) => s.select)
  const setCityTab = useTrip((s) => s.setCityTab)
  const title = useTitle()
  // A journey's check opens the journey; a stop's opens its city at the tab it's about.
  const open = () => {
    if (!w.cityId) return
    if (w.leg !== undefined) return select({ type: 'leg', index: w.leg })
    const at = checkTab(w)
    if (at) setCityTab(...at)
    select({ type: 'city', id: w.cityId })
  }
  return (
    <li className="flex gap-2 border-b border-line px-3 py-1.5 text-[12px] last:border-0">
      <span className={TONE[w.severity]}>{SYMBOL[w.severity]}</span>
      <div className="min-w-0 flex-1">
        <button className="text-left font-medium hover:underline disabled:no-underline" disabled={!w.cityId} onClick={open}>
          {title(w)}
        </button>
        {w.detail && <div className="text-muted">{w.detail}</div>}
        {w.url && <a href={w.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">Official source ↗</a>}
      </div>
    </li>
  )
}

/** All the plan's checks, problems first, folding away. */
export function Checks({ warnings }: { warnings: PlanWarning[] }) {
  const [open, setOpen] = useState(true)
  if (!warnings.length) return null
  const counts = { error: 0, warn: 0, info: 0 }
  warnings.forEach((w) => counts[w.severity]++)
  return (
    <div className="mx-4 mb-2 rounded-lg border border-line">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold">
        <span className="flex-1">Checks</span>
        {counts.error > 0 && <Badge tone="error">{counts.error} problem{counts.error > 1 ? 's' : ''}</Badge>}
        {counts.warn > 0 && <Badge tone="warn">{counts.warn} warning{counts.warn > 1 ? 's' : ''}</Badge>}
        {counts.info > 0 && <Badge>{counts.info} note{counts.info > 1 ? 's' : ''}</Badge>}
        <span className="text-muted">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="max-h-64 overflow-y-auto border-t border-line">
          {bySeverity(warnings).map((w, i) => <CheckItem key={i} w={w} />)}
        </ul>
      )}
    </div>
  )
}

/** A stop's checks inside the card they're about (city panel): the title without the city's name, and the detail. */
export function CheckNotes({ warnings, cityId }: { warnings: PlanWarning[]; cityId: string }) {
  const title = useTitle()
  if (!warnings.length) return null
  const name = cityName(cityId)
  const short = (t: string) => {
    const rest = t.startsWith(`${name}: `) ? t.slice(name.length + 2) : t
    return rest[0].toUpperCase() + rest.slice(1)
  }
  return (
    <ul className="mb-2 flex flex-col gap-1">
      {warnings.map((w, i) => {
        const Icon = w.severity === 'error' ? CircleAlert : TriangleAlert
        return (
          <li key={i} className="flex gap-1.5 text-[12px]">
            {/* Only the icon is coloured; the text stays quiet. */}
            <Icon size={12} className={`mt-[2px] shrink-0 ${TONE[w.severity]}`} aria-label={w.severity === 'error' ? 'Problem' : 'Warning'} />
            <span>
              <span className="font-medium">{short(title(w))}</span>
              {w.detail && <span className="text-muted"> {w.detail}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
