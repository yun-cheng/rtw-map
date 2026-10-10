// The city panel's tabs, their icons and the sections each one shows (or its sub-tabs); shared with the plan's checks
// (Checks.tsx), which open the tab a check is about.
import { CircleDollarSign, CloudSun, Coffee, HeartPulse, Languages, LayoutGrid, ShieldCheck, Stamp, TramFront, type LucideIcon } from 'lucide-react'
import type { CityTab } from '../store/trip'

export type SectionKey =
  | 'around' | 'gettingThere' | 'weather' | 'air' | 'day' | 'stay' | 'food' | 'money' | 'language' | 'phone' | 'services' | 'people' | 'phrases'
  | 'vaccines' | 'health' | 'medical' | 'safety' | 'visa'

/** A sub-tab of a city panel tab, and the sections it shows. */
export type Part = { key: string; label: string; sections: SectionKey[] }

/** Tabs of the city panel, their icons and the sections each one shows (or its sub-tabs), most useful first. */
export const TABS: { key: CityTab; label: string; icon: LucideIcon; sections: SectionKey[]; parts?: Part[] }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid, sections: [] },
  { key: 'transport', label: 'Transport', icon: TramFront, sections: ['around', 'gettingThere'] },
  { key: 'weather', label: 'Weather', icon: CloudSun, sections: ['weather', 'air'] },
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
