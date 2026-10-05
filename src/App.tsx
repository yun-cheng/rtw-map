import { useEffect } from 'react'
import { MapControls } from './map/MapControls'
import { MapView } from './map/MapView'
import { AssistantPanel } from './panels/AssistantPanel'
import { CityDrawer } from './panels/CityDrawer'
import { Header } from './panels/Header'
import { Itinerary } from './panels/Itinerary'
import { LegDrawer } from './panels/LegDrawer'
import { SetupPanel } from './panels/SetupPanel'
import { Timeline } from './panels/Timeline'
import { useTrip } from './store/trip'

export default function App() {
  const { panel, setPanel, plan, selected, select } = useTrip()
  const tab = plan || panel === 'assistant' ? panel : 'setup'

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
        <aside className="flex w-[380px] shrink-0 flex-col border-r border-line bg-panel">
          <nav className="flex border-b border-line px-2">
            {(['setup', 'itinerary', 'assistant'] as const).map((t) => (
              <button
                key={t}
                disabled={t === 'itinerary' && !plan}
                onClick={() => setPanel(t)}
                className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium capitalize disabled:opacity-40 ${tab === t ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}
              >
                {t}
              </button>
            ))}
          </nav>
          {tab === 'assistant' ? (
            <div className="min-h-0 flex-1"><AssistantPanel /></div>
          ) : (
            <div key={tab} className="min-h-0 flex-1 overflow-y-auto">{tab === 'setup' ? <SetupPanel /> : <Itinerary />}</div>
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
            <div className="absolute top-0 right-0 bottom-0 z-20 w-[420px] overflow-y-auto border-l border-line bg-panel shadow-xl">
              {selected.type === 'city' ? <CityDrawer key={selected.id} cityId={selected.id} /> : <LegDrawer index={selected.index} />}
            </div>
          )}
        </main>
      </div>
      <Timeline />
    </div>
  )
}
