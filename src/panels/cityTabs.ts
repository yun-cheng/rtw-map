// The city panel's tabs, their icons and the sections each one shows (or its sub-tabs); shared with the plan's checks
// (Checks.tsx), which open the tab a check is about, and with the map and timeline, whose cities open on their view's.
import { BedDouble, CalendarDays, CircleDollarSign, CloudSun, Coffee, HeartPulse, Languages, LayoutGrid, ShieldCheck, Stamp, TramFront, type LucideIcon } from 'lucide-react'
import type { CostKind } from '../planner'
import { useTrip, type CityTab, type MapLayer, type NearbyKind } from '../store/trip'

export type SectionKey =
  | 'around' | 'gettingThere' | 'weather' | 'air' | 'holidays' | 'day' | 'stay' | 'food' | 'money' | 'language' | 'phone' | 'services' | 'people' | 'phrases'
  | 'vaccines' | 'health' | 'medical' | 'safety' | 'visa'

/** A sub-tab of a city panel tab, and the sections it shows. */
export type Part = { key: string; label: string; sections: SectionKey[] }

/** Tabs of the city panel, their icons and the sections each one shows (or its sub-tabs), most useful first. */
export const TABS: { key: CityTab; label: string; icon: LucideIcon; sections: SectionKey[]; parts?: Part[] }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid, sections: [] },
  // What the user keeps for the city (Visit.tsx: stays, photos, links, notes), not the app's data.
  { key: 'notes', label: 'My visit', icon: BedDouble, sections: [] },
  { key: 'transport', label: 'Transport', icon: TramFront, sections: ['around', 'gettingThere'] },
  { key: 'weather', label: 'Weather', icon: CloudSun, sections: ['weather', 'air'] },
  { key: 'holidays', label: 'Holidays', icon: CalendarDays, sections: ['holidays'] },
  {
    key: 'costs', label: 'Costs', icon: CircleDollarSign, sections: [],
    parts: [
      { key: 'daily', label: 'Daily cost', sections: ['day'] },
      { key: 'prices', label: 'Prices', sections: ['stay', 'food'] },
      { key: 'paying', label: 'Paying & cash', sections: ['money'] },
    ],
  },
  { key: 'daily', label: 'Daily life', icon: Coffee, sections: ['language', 'phone', 'services', 'people'] },
  { key: 'phrases', label: 'Phrases', icon: Languages, sections: ['phrases'] },
  { key: 'health', label: 'Health', icon: HeartPulse, sections: ['vaccines', 'health', 'medical'] },
  { key: 'safety', label: 'Safety', icon: ShieldCheck, sections: ['safety'] },
  { key: 'entry', label: 'Entry', icon: Stamp, sections: ['visa'] },
]

/** The tab (and sub-tab) that shows a section. */
export function tabOf(section: SectionKey): [CityTab, string?] {
  for (const t of TABS) {
    if (t.sections.includes(section)) return [t.key]
    const part = t.parts?.find((p) => p.sections.includes(section))
    if (part) return [t.key, part.key]
  }
  return ['overview']
}

/** The section a map view shows of a city (none for the Route view): a city clicked on that view opens on its tab. */
function viewSection(layer: MapLayer, costKind: CostKind, nearbyKind: NearbyKind): SectionKey | null {
  switch (layer) {
    case 'climate': return 'weather'
    case 'air': return 'air'
    case 'mobile': return 'phone'
    case 'schengen': case 'visa': return 'visa'
    case 'nearby': return nearbyKind === 'pharmacy' || nearbyKind === 'clinic' ? 'medical' : 'services'
    case 'cost':
      if (costKind === 'day') return 'day'
      if (costKind === 'dorm' || costKind === 'private') return 'stay'
      if (costKind === 'transport' || costKind === 'taxi' || costKind === 'car' || costKind === 'scooter') return 'around'
      return 'food'
    default: return null
  }
}

/** The tab (and sub-tab) a city clicked on the map or timeline opens on in this map view; null keeps the one open. */
export function viewTab(s: { layer: MapLayer; costKind: CostKind; nearbyKind: NearbyKind }): [CityTab, string?] | null {
  const section = viewSection(s.layer, s.costKind, s.nearbyKind)
  return section && tabOf(section)
}

/** Opens a city clicked on the map or timeline, on the tab that shows what the map view does (viewTab). */
export function openFromMap(cityId: string) {
  const s = useTrip.getState()
  const tab = viewTab(s)
  if (tab) s.setCityTab(...tab)
  s.select({ type: 'city', id: cityId })
}
