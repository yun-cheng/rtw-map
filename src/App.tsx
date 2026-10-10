import { ChevronsLeft, ChevronsRight, ListOrdered, Map as MapIcon, Settings, Sparkles, type LucideIcon } from 'lucide-react'
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
import { SettingsPanel } from './panels/SettingsPanel'
import { SetupPanel } from './panels/SetupPanel'
import { Timeline } from './panels/Timeline'
import { planMark, useTrip } from './store/trip'
import { BottomSheet, type Snap } from './ui/BottomSheet'
import { HoverTip, type Tip } from './ui/HoverTip'
import { usePhone } from './ui/usePhone'

const TAB_LABELS = { setup: 'Trip', itinerary: 'Itinerary', assistant: 'Assistant' }
/** The tabs' icons, on the tab bar and on the folded panel's strip. */
const TAB_ICONS: Record<keyof typeof TAB_LABELS, LucideIcon> = { setup: MapIcon, itinerary: ListOrdered, assistant: Sparkles }

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
 * opening the left one closes the city or journey panel (`closeDrawer`). `showBeside` opens it next to the open city or
 * journey panel even then ("Ask AI": the map gets narrow until that panel closes).
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
  const [beside, setBeside] = useState(false)
  useEffect(() => {
    if (!drawerOpen) setBeside(false)
  }, [drawerOpen])
  const auto = drawerOpen && narrow && !beside
  return {
    hidden: collapsed || auto,
    showBeside: () => {
      setAndRemember(false)
      setBeside(true)
    },
    open: () => {
      setAndRemember(false)
      if (auto) closeDrawer()
    },
    close: () => setAndRemember(true),
  }
}

/** The left panel's tabs and the open one: beside the map, or in a bottom sheet on a phone (`peek`: its tab bar is
 *  the sheet's header). `onHide` folds it away. */
function LeftPanel({ tab, peek, onHide }: { tab: keyof typeof TAB_LABELS; peek?: boolean; onHide?: () => void }) {
  const { plan, setPanel } = useTrip()
  return (
    <>
      <nav data-sheet-peek={peek || undefined} className="flex shrink-0 items-center border-b border-line px-2" role="tablist">
        {(['setup', 'itinerary', 'assistant'] as const).map((t) => {
          // Each with its icon and name.
          const Icon = TAB_ICONS[t]
          return (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              disabled={t === 'itinerary' && !plan}
              onClick={() => setPanel(t)}
              className={`-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap disabled:opacity-40 max-md:px-1 max-md:py-2.5 ${tab === t ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              <Icon size={peek ? 18 : 16} />
              {TAB_LABELS[t]}
            </button>
          )
        })}
        {onHide && (
          <button onClick={onHide} title="Hide this panel (more room for the map)" aria-label="Hide the left panel" className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink">
            <ChevronsLeft size={16} />
          </button>
        )}
      </nav>
      <PlanBar />
      {tab === 'assistant' ? (
        <div className="min-h-0 flex-1"><AssistantPanel /></div>
      ) : (
        <div key={tab} className="min-h-0 flex-1 overflow-y-auto">{tab === 'setup' ? <SetupPanel /> : <Itinerary />}</div>
      )}
    </>
  )
}

export default function App() {
  const { panel, setPanel, plan, selected, select, plans, activePlanId, switchPlan } = useTrip()
  const tab = plan || panel === 'assistant' ? panel : 'setup'
  const sidebar = useSidebar(!!selected, () => select(null))
  const phone = usePhone()
  const picking = useTrip((s) => s.picking)
  // The trip's setup is showing: the map shows its countries instead of its route (MapView).
  const editing = tab === 'setup' && (phone ? !selected : !sidebar.hidden)
  // How far the phone's sheets are pulled up: the left panel's starts open on a new trip; a city's opens to half.
  const [leftSnap, setLeftSnap] = useState<Snap>(plan ? 'peek' : 'half')
  const [drawerSnap, setDrawerSnap] = useState<Snap>('half')
  // "Ask AI" in a city or journey panel: on a phone the left panel's sheet comes up over it, on the Assistant (it goes
  // back to where it was when closed, or when another city is picked); elsewhere the left panel opens beside it.
  const askRequest = useTrip((s) => s.askRequest)
  const [asking, setAsking] = useState(false)
  const [snapBefore, setSnapBefore] = useState<Snap>('peek')
  useEffect(() => {
    if (!askRequest) return
    if (phone) {
      setAsking(true)
      setSnapBefore(leftSnap)
      setLeftSnap('full')
    } else sidebar.showBeside()
    // Ready to type once it has slid in.
    const id = setTimeout(() => document.querySelector<HTMLElement>('[data-assistant-input]')?.focus(), 350)
    return () => clearTimeout(id)
  }, [askRequest]) // (only on a new request)
  const stopAsking = () => {
    setAsking(false)
    setLeftSnap(snapBefore)
  }
  useEffect(() => setAsking(false), [selected])
  // On a phone the top bar's contents are in a settings panel, opened from a gear over the map.
  const [settings, setSettings] = useState(false)
  const open = !!selected
  useEffect(() => {
    if (open) setDrawerSnap('half')
  }, [open])
  const drawer = selected && (selected.type === 'city' ? <CityDrawer key={selected.id} cityId={selected.id} /> : <LegDrawer index={selected.index} />)
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
      {!phone && <Header />}
      <div className="flex min-h-0 flex-1">
        {!phone && sidebar.hidden && (
          // The folded panel: a strip to open it again, on any tab (the panel stays mounted, so nothing is lost).
          <div className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel pt-1.5">
            <button
              onClick={() => { setTip(null); sidebar.open() }} aria-label="Show the left panel" {...tipFor('Show the panel')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink"
            >
              <ChevronsRight size={16} />
            </button>
            <div className="my-0.5 h-px w-6 bg-line" />
            {(['setup', 'itinerary', 'assistant'] as const).map((t) => {
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
        {!phone && (
          <aside className={`${sidebar.hidden ? 'hidden' : 'flex'} shrink-0 flex-col border-r border-line bg-panel`} style={{ width: SIDEBAR_WIDTH }}>
            <LeftPanel tab={tab} onHide={sidebar.close} />
          </aside>
        )}
        <main className="relative min-w-0 flex-1">
          <MapView editing={editing} />
          <MapControls editing={editing} />
          {!plan && !phone && !picking && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
              <div className="rounded-lg border border-line bg-panel/95 px-4 py-2 text-[13px] shadow-sm">
                Add regions or countries on the left and press <b>Plan with AI</b>. Click any city on the map for details.
              </div>
            </div>
          )}
          {phone ? (
            <>
              <button
                onClick={() => setSettings(true)}
                aria-label="Settings"
                className="absolute top-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-muted shadow-sm hover:text-ink"
              >
                <Settings size={18} />
              </button>
              <SettingsPanel open={settings} onClose={() => setSettings(false)} />
              {/* On a phone the left panel is a sheet over the bottom of the map, out of the way while a city's is open. */}
              <BottomSheet
                snap={leftSnap} onSnap={setLeftSnap} onClose={asking ? stopAsking : undefined} label={TAB_LABELS[tab]}
                hidden={!!selected && !asking} className={`bg-panel ${asking ? 'z-30' : 'z-10'}`}
              >
                <LeftPanel tab={tab} peek />
              </BottomSheet>
              {selected && (
                <BottomSheet snap={drawerSnap} onSnap={setDrawerSnap} onClose={() => select(null)} label={selected.type === 'city' ? 'City' : 'Journey'} className="z-20 bg-canvas">
                  <div className="min-h-0 flex-1 overflow-y-auto">{drawer}</div>
                </BottomSheet>
              )}
            </>
          ) : selected && (
            <div className="absolute top-0 right-0 bottom-0 z-20 overflow-y-auto border-l border-line bg-canvas shadow-xl" style={{ width: DRAWER_WIDTH }}>
              {drawer}
            </div>
          )}
        </main>
      </div>
      {!phone && <Timeline />}
    </div>
  )
}
