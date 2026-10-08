import { ChevronsLeft, ChevronsRight, ListOrdered, Map as MapIcon, SlidersHorizontal, Sparkles, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import { MapControls } from './map/MapControls'
import { BOTH_PANELS_MIN_WIDTH, DRAWER_WIDTH, SIDEBAR_WIDTH } from './ui/layout'
import { MapView } from './map/MapView'
import { AssistantPanel } from './panels/AssistantPanel'
import { CityDrawer } from './panels/CityDrawer'
import { Header } from './panels/Header'
import { Itinerary } from './panels/Itinerary'
import { LegDrawer } from './panels/LegDrawer'
import { PlanBar } from './panels/PlanBar'
import { PrefsPanel } from './panels/PrefsPanel'
import { SetupPanel } from './panels/SetupPanel'
import { Timeline } from './panels/Timeline'
import { planMark, useTrip } from './store/trip'
import { HoverTip, type Tip } from './ui/HoverTip'

const TAB_LABELS = { setup: 'Trip', prefs: 'Preferences', itinerary: 'Itinerary', assistant: 'Assistant' }
/** The tabs' icons on the folded panel's strip. */
const TAB_ICONS: Record<keyof typeof TAB_LABELS, LucideIcon> = { setup: MapIcon, prefs: SlidersHorizontal, itinerary: ListOrdered, assistant: Sparkles }

/** Whether the user folded the left panel away, remembered in this browser. */
const COLLAPSED_KEY = 'rtw-map-sidebar-collapsed'
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The left panel can be folded into a thin strip (and opened again from it). On a narrow window only one side panel
 * shows at a time: opening a city or journey panel folds the left one away (it comes back when that closes), and
 * opening the left one closes the city or journey panel (`closeDrawer`).
 */
function useSidebar(drawerOpen: boolean, closeDrawer: () => void) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [narrow, setNarrow] = useState(() => window.innerWidth < BOTH_PANELS_MIN_WIDTH)
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < BOTH_PANELS_MIN_WIDTH)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const setAndRemember = (c: boolean) => {
    setCollapsed(c)
    try {
      localStorage.setItem(COLLAPSED_KEY, c ? '1' : '0')
    } catch {
      // Storage blocked: remembered until reload.
    }
  }
  const auto = drawerOpen && narrow
  return {
    hidden: collapsed || auto,
    open: () => {
      setAndRemember(false)
      if (auto) closeDrawer()
    },
    close: () => setAndRemember(true),
  }
}

export default function App() {
  const { panel, setPanel, plan, selected, select, plans, activePlanId, switchPlan } = useTrip()
  const tab = plan || panel === 'assistant' || panel === 'prefs' ? panel : 'setup'
  const sidebar = useSidebar(!!selected, () => select(null))
  // The strip's labels: shown at once beside each button.
  const [tip, setTip] = useState<Tip | null>(null)
  const tipFor = (title: string) => ({
    onMouseEnter: (e: MouseEvent<HTMLElement>) => setTip({ content: { lines: [title] }, rect: e.currentTarget.getBoundingClientRect(), side: 'right' }),
    onMouseLeave: () => setTip(null),
  })

  // Esc closes the city/leg panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        {sidebar.hidden && (
          // The folded panel: a strip to open it again, on any tab (the panel stays mounted, so nothing is lost).
          <div className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel pt-1.5">
            <button
              onClick={() => { setTip(null); sidebar.open() }} aria-label="Show the left panel" {...tipFor('Show the panel')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink"
            >
              <ChevronsRight size={16} />
            </button>
            <div className="my-0.5 h-px w-6 bg-line" />
            {(['setup', 'prefs', 'itinerary', 'assistant'] as const).map((t) => {
              const Icon = TAB_ICONS[t]
              return (
                <button
                  key={t}
                  disabled={t === 'itinerary' && !plan}
                  onClick={() => { setTip(null); setPanel(t); sidebar.open() }}
                  aria-label={TAB_LABELS[t]} aria-current={tab === t ? 'page' : undefined} {...tipFor(TAB_LABELS[t])}
                  className={`flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-40 ${tab === t ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-canvas hover:text-ink'}`}
                >
                  <Icon size={16} />
                </button>
              )
            })}
            {plans.length > 1 && (
              // The trip's plans: switch without opening the panel.
              <>
                <div className="my-0.5 h-px w-6 bg-line" />
                {plans.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => switchPlan(p.id)}
                    aria-label={p.name} aria-pressed={p.id === activePlanId} {...tipFor(p.id === activePlanId ? `${p.name} (open)` : `Switch to ${p.name}`)}
                    className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold ${p.id === activePlanId ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}
                  >
                    {planMark(p.name)}
                  </button>
                ))}
              </>
            )}
            <HoverTip tip={tip} />
          </div>
        )}
        <aside className={`${sidebar.hidden ? 'hidden' : 'flex'} shrink-0 flex-col border-r border-line bg-panel`} style={{ width: SIDEBAR_WIDTH }}>
          <nav className="flex items-center border-b border-line px-2">
            {(['setup', 'prefs', 'itinerary', 'assistant'] as const).map((t) => (
              <button
                key={t}
                disabled={t === 'itinerary' && !plan}
                onClick={() => setPanel(t)}
                className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium disabled:opacity-40 ${tab === t ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
            <button onClick={sidebar.close} title="Hide this panel (more room for the map)" aria-label="Hide the left panel" className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink">
              <ChevronsLeft size={16} />
            </button>
          </nav>
          <PlanBar />
          {tab === 'assistant' ? (
            <div className="min-h-0 flex-1"><AssistantPanel /></div>
          ) : (
            <div key={tab} className="min-h-0 flex-1 overflow-y-auto">{tab === 'setup' ? <SetupPanel /> : tab === 'prefs' ? <PrefsPanel /> : <Itinerary />}</div>
          )}
        </aside>
        <main className="relative min-w-0 flex-1">
          <MapView />
          <MapControls />
          {!plan && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
              <div className="rounded-lg border border-line bg-panel/95 px-4 py-2 text-[13px] shadow-sm">
                Add regions on the left and press <b>Generate plan</b>. Click any city on the map for details.
              </div>
            </div>
          )}
          {selected && (
            <div className="absolute top-0 right-0 bottom-0 z-20 overflow-y-auto border-l border-line bg-canvas shadow-xl" style={{ width: DRAWER_WIDTH }}>
              {selected.type === 'city' ? <CityDrawer key={selected.id} cityId={selected.id} /> : <LegDrawer index={selected.index} />}
            </div>
          )}
        </main>
      </div>
      <Timeline />
    </div>
  )
}
