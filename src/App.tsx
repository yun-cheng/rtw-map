import { Building2, ChevronsLeft, ChevronsRight, ListOrdered, Map as MapIcon, Route, Settings, Sparkles, Wallet, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import { MapControls } from './map/MapControls'
import { BOTH_PANELS_MIN_WIDTH, DRAWER_WIDTH, SIDEBAR_WIDTH } from './ui/layout'
import { MapView } from './map/MapView'
import { AssistantPanel } from './panels/AssistantPanel'
import { CityDrawer } from './panels/CityDrawer'
import { Header } from './panels/Header'
import { Itinerary } from './panels/Itinerary'
import { LegDrawer } from './panels/LegDrawer'
import { MyTripPanel } from './panels/MyTrip'
import { PlanBar } from './panels/PlanBar'
import { SettingsPanel } from './panels/SettingsPanel'
import { UndoNotice } from './panels/UndoRedo'
import { VersionHistory } from './panels/VersionHistory'
import { SetupPanel } from './panels/SetupPanel'
import { SharedGone } from './panels/SharedTrip'
import { Timeline } from './panels/Timeline'
import { OutsideNotice } from './panels/OutsideNotice'
import { Notices, UpdateNotice } from './panels/UpdateNotice'
import { useUndoKeys } from './store/history'
import { SHARED_TOKEN } from './store/shareLink'
import { planMark, useTrip, type Selection } from './store/trip'
import { BottomSheet, type Snap } from './ui/BottomSheet'
import { DialogHost } from './ui/DialogHost'
import { HoverTip, type Tip } from './ui/HoverTip'
import { OfflinePill } from './ui/OfflinePill'
import { SwipeTabs } from './ui/SwipeTabs'
import { MY_TRIP_ICONS, MY_TRIP_LABELS, MY_TRIP_NAME, useHasRightPanel, useMyTripTabs, useRightPanel, useRightPanelBeside } from './ui/rightPanel'
import { usePhone } from './ui/usePhone'

const TAB_LABELS = { setup: 'Trip', itinerary: 'Itinerary', city: 'City', assistant: 'Assistant' }
/** The tabs' icons, on the tab bar and on the folded panel's strip. */
const TAB_ICONS: Record<keyof typeof TAB_LABELS, LucideIcon> = { setup: MapIcon, itinerary: ListOrdered, city: Building2, assistant: Sparkles }
type Tab = keyof typeof TAB_LABELS
/** The left panel's tabs: a shared trip's page has only its itinerary and the city's or journey's (the trip's setup and
 *  assistant are its owner's). */
const TABS: readonly Tab[] = SHARED_TOKEN ? ['itinerary', 'city'] : ['setup', 'itinerary', 'city', 'assistant']
/** A tab's name and icon: the City tab is the Journey tab while a journey is open. */
const tabLabel = (t: Tab, selected: Selection) => (t === 'city' && selected?.type === 'leg' ? 'Journey' : TAB_LABELS[t])
const tabIcon = (t: Tab, selected: Selection) => (t === 'city' && selected?.type === 'leg' ? Route : TAB_ICONS[t])
/** Whether a tab can't be opened: the Itinerary before there's a plan, the City tab with no city or journey open. */
const tabOff = (t: Tab, plan: unknown, selected: Selection) => (t === 'itinerary' && !plan) || (t === 'city' && !selected)

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
 * shows at a time: My trip open (`rightOpen`) folds the left one away (it comes back when that closes), and opening
 * the left one closes My trip (`closeRight`).
 */
function useSidebar(rightOpen: boolean, closeRight: () => void) {
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
  const auto = rightOpen && narrow
  return {
    hidden: collapsed || auto,
    open: () => {
      setAndRemember(false)
      if (auto) closeRight()
    },
    close: () => setAndRemember(true),
  }
}

/** The open city's or journey's panel. */
function Place() {
  const selected = useTrip((s) => s.selected)
  return selected?.type === 'city' ? <CityDrawer key={selected.id} cityId={selected.id} /> : selected ? <LegDrawer index={selected.index} /> : null
}

/** A left panel tab's content. */
const TabBody = ({ tab }: { tab: Tab }) =>
  tab === 'assistant' ? <AssistantPanel /> : tab === 'setup' ? <SetupPanel /> : tab === 'city' ? <Place /> : <Itinerary />

/** The left panel's tabs and the open one: beside the map, or in a bottom sheet on a phone (`peek`: its tab bar is
 *  the sheet's header). `onHide` folds it away. */
function LeftPanel({ tab, peek, onHide }: { tab: Tab; peek?: boolean; onHide?: () => void }) {
  const { plan, selected, setPanel } = useTrip()
  // (A city's panel scrolls its own tabs on a phone, as the Assistant its chat.)
  const ownScroll = (t: Tab) => t === 'assistant' || (t === 'city' && peek && selected?.type === 'city')
  return (
    <>
      <nav data-sheet-peek={peek || undefined} className="flex shrink-0 items-center border-b border-line px-2 max-md:justify-between" role="tablist">
        {TABS.map((t) => {
          // Each with its icon and name, as wide as that (on a phone's sheet, spread across it, the first and last at its
          // edges).
          const Icon = tabIcon(t, selected)
          return (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              disabled={tabOff(t, plan, selected)}
              onClick={() => setPanel(t)}
              className={`-mb-px flex items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap disabled:opacity-40 max-md:px-2 max-md:py-2.5 ${tab === t ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              <Icon size={peek ? 18 : 16} />
              {tabLabel(t, selected)}
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
      {peek ? (
        // (A phone's sheet: swiped between the tabs that can be opened.)
        <SwipeTabs tabs={TABS.filter((t) => !tabOff(t, plan, selected))} tab={tab} onTab={setPanel}>
          {(t) => <div className={`h-full ${ownScroll(t) ? '' : 'overflow-y-auto'} ${t === 'city' ? 'bg-canvas' : ''}`}><TabBody tab={t} /></div>}
        </SwipeTabs>
      ) : (
        <div key={tab} className={`min-h-0 flex-1 ${ownScroll(tab) ? '' : 'overflow-y-auto'} ${tab === 'city' ? 'bg-canvas' : ''}`}><TabBody tab={tab} /></div>
      )}
    </>
  )
}

export default function App() {
  const { panel, panelBefore, setPanel, plan, selected, select, plans, activePlanId, switchPlan } = useTrip()
  // (The City tab only with a city or journey open; the Trip tab before there's a plan.)
  const on = panel === 'city' && !selected ? panelBefore : panel
  const tab: Tab = on === 'city' ? 'city' : SHARED_TOKEN ? 'itinerary' : !plan && on !== 'assistant' ? 'setup' : on
  // My trip, the right panel: beside the map on a computer, a sheet on a phone.
  const hasRight = useHasRightPanel()
  const myTripTabs = useMyTripTabs()
  const right = useRightPanel()
  const rightBeside = useRightPanelBeside()
  const rightSheet = useRightPanel((s) => s.sheet)
  const setRightSheet = right.setSheet
  // (Its sheet opens full, however it's opened: the button, or a link to one of its tabs; half on Today, open as the
  // app starts on a trip under way, the phone's first screen then.)
  const [rightSnap, setRightSnap] = useState<Snap>(rightSheet ? 'half' : 'full')
  const [rightWasOpen, setRightWasOpen] = useState(rightSheet)
  if (rightSheet !== rightWasOpen) {
    setRightWasOpen(rightSheet)
    if (rightSheet) setRightSnap('full')
  }
  const sidebar = useSidebar(rightBeside, right.hide)
  const phone = usePhone()
  const picking = useTrip((s) => s.picking)
  // The trip's setup is showing: the map shows its countries instead of its route (MapView).
  const editing = tab === 'setup' && (phone ? !(hasRight && rightSheet) : !sidebar.hidden)
  // How far the left panel's sheet is pulled up on a phone: open on a new trip, else just its tabs.
  const [leftSnap, setLeftSnap] = useState<Snap>(plan ? 'peek' : 'half')
  // A city or journey picked (on the map, or in a list): the left panel in sight, on its tab (on a phone, its sheet in
  // My trip's place, at least half open).
  useEffect(() => {
    if (!selected) return
    if (phone) {
      setRightSheet(false)
      setLeftSnap((s) => (s === 'peek' ? 'half' : s))
    } else sidebar.open()
  }, [selected]) // (only when one is picked)
  // "Ask AI" in a city or journey panel, and "Make changes" in a stop's: the left panel in sight, on the Assistant or
  // the Itinerary (on a phone, the Assistant's sheet all the way up).
  const besideRequest = useTrip((s) => s.besideRequest)
  useEffect(() => {
    if (!besideRequest) return
    const ask = useTrip.getState().panel === 'assistant'
    if (phone) setLeftSnap(ask ? 'full' : 'half')
    else sidebar.open()
    // Once it has slid in: ready to type, or the stop in view (Itinerary marks the open city's).
    const id = setTimeout(() => {
      if (ask) document.querySelector<HTMLElement>('[data-assistant-input]')?.focus()
      else document.querySelector('[data-selected-stop]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 350)
    return () => clearTimeout(id)
  }, [besideRequest]) // (only on a new request)
  // On a phone the top bar's contents are in a settings panel, opened from a gear over the map.
  const [settings, setSettings] = useState(false)
  // The strip's labels: shown at once beside each button.
  const [tip, setTip] = useState<Tip | null>(null)
  const tipFor = (title: string, side: Tip['side'] = 'right') => ({
    onMouseEnter: (e: MouseEvent<HTMLElement>) => setTip({ content: { lines: [title] }, rect: e.currentTarget.getBoundingClientRect(), side }),
    onMouseLeave: () => setTip(null),
  })

  useUndoKeys()
  // Esc closes the city/leg panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  return (
    <div className="flex h-full flex-col">
      <SharedGone />
      <DialogHost />
      <Notices>
        <UpdateNotice />
        <OutsideNotice />
      </Notices>
      {!phone && <Header onSettings={() => setSettings(true)} />}
      {/* (From the gear over the map on a phone, in the top bar on a computer.) */}
      <SettingsPanel open={settings} onClose={() => setSettings(false)} />
      <VersionHistory />
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
            {TABS.map((t) => {
              const Icon = tabIcon(t, selected)
              return (
                <button
                  key={t}
                  disabled={tabOff(t, plan, selected)}
                  onClick={() => { setTip(null); setPanel(t); sidebar.open() }}
                  aria-label={tabLabel(t, selected)} aria-current={tab === t ? 'page' : undefined} {...tipFor(tabLabel(t, selected))}
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
            // (Centred in the map, clear of its buttons at the right.)
            <div className="pointer-events-none absolute right-12 bottom-6 left-12 flex justify-center">
              <div className="rounded-lg border border-line bg-panel/95 px-4 py-2 text-[13px] shadow-sm">
                Add regions or countries on the left and press <b>Plan with AI</b>. Click any city on the map for details.
              </div>
            </div>
          )}
          {phone ? (
            <>
              {/* (Under the settings button and My trip's, clear of the map's legend; on a computer, in the top bar.) */}
              <OfflinePill className={`absolute right-2 z-10 h-8 shadow-sm ${hasRight ? 'top-24' : 'top-13'}`} />
              <button
                onClick={() => setSettings(true)}
                aria-label="Settings"
                className="absolute top-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-muted shadow-sm hover:text-ink"
              >
                <Settings size={18} />
              </button>
              {hasRight && (
                <button
                  onClick={() => setRightSheet(!rightSheet)}
                  aria-label={`${MY_TRIP_NAME}: stays, tickets, receipts and journal`}
                  className="absolute top-13 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-muted shadow-sm hover:text-ink"
                >
                  <Wallet size={18} />
                </button>
              )}
              <UndoNotice className="absolute top-2 right-12 left-2 z-40" />
              {/* On a phone the left panel is a sheet over the bottom of the map, out of the way while My trip's is open. */}
              <BottomSheet snap={leftSnap} onSnap={setLeftSnap} label={tabLabel(tab, selected)} hidden={hasRight && rightSheet} className="z-10 bg-panel">
                <LeftPanel tab={tab} peek />
              </BottomSheet>
              {hasRight && rightSheet && (
                <BottomSheet snap={rightSnap} onSnap={setRightSnap} onClose={() => setRightSheet(false)} label={MY_TRIP_NAME} className="z-20 bg-panel">
                  <MyTripPanel peek onHide={() => setRightSheet(false)} />
                </BottomSheet>
              )}
            </>
          ) : (
            <UndoNotice className="absolute top-3 right-3 left-3 z-30" />
          )}
        </main>
        {!phone && hasRight && (rightBeside ? (
          <aside className="flex shrink-0 flex-col border-l border-line bg-panel" style={{ width: DRAWER_WIDTH }}>
            <MyTripPanel onHide={right.hide} />
          </aside>
        ) : (
          // Folded: a strip to open it again, on any tab.
          <div className="flex w-10 shrink-0 flex-col items-center gap-1 border-l border-line bg-panel pt-1.5">
            <button
              onClick={() => { setTip(null); right.show() }} aria-label={`Show ${MY_TRIP_NAME}`} {...tipFor(`Show ${MY_TRIP_NAME}`, 'top')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink"
            >
              <ChevronsLeft size={16} />
            </button>
            <div className="my-0.5 h-px w-6 bg-line" />
            {myTripTabs.map((t) => {
              const Icon = MY_TRIP_ICONS[t]
              return (
                <button
                  key={t} onClick={() => { setTip(null); right.show(t) }} aria-label={`${MY_TRIP_NAME}: ${MY_TRIP_LABELS[t]}`} {...tipFor(MY_TRIP_LABELS[t], 'top')}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink"
                >
                  <Icon size={16} />
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {!phone && <Timeline />}
      {/* (The folded panels' labels.) */}
      <HoverTip tip={tip} />
    </div>
  )
}
