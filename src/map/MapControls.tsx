import { useTrip, type MapLayer } from '../store/trip'
import { MONTHS } from '../ui/format'

const LAYERS: { value: MapLayer; label: string }[] = [
  { value: 'none', label: 'Route' },
  { value: 'climate', label: 'Weather' },
  { value: 'air', label: 'Air' },
  { value: 'cost', label: 'Cost' },
  { value: 'english', label: 'English' },
  { value: 'schengen', label: 'Schengen' },
  { value: 'advisory', label: 'Safety' },
]

const LEGENDS: Partial<Record<MapLayer, { color: string; label: string }[]>> = {
  climate: [{ color: '#16a34a', label: 'Pleasant' }, { color: '#eab308', label: 'OK' }, { color: '#dc2626', label: 'Too hot / cold / wet' }],
  air: [{ color: '#16a34a', label: 'Clean' }, { color: '#eab308', label: 'Moderate' }, { color: '#dc2626', label: 'Polluted' }],
  cost: [{ color: '#16a34a', label: 'Cheap' }, { color: '#eab308', label: 'Medium' }, { color: '#dc2626', label: 'Expensive' }],
  english: [{ color: '#16a34a', label: 'Easy' }, { color: '#eab308', label: 'Mixed' }, { color: '#dc2626', label: 'Hard' }],
  schengen: [{ color: '#2563eb', label: 'Schengen area' }, { color: '#d97706', label: 'Outside Schengen' }],
  advisory: [{ color: '#16a34a', label: 'Normal' }, { color: '#eab308', label: 'Increased caution' }, { color: '#f97316', label: 'Avoid parts' }, { color: '#dc2626', label: 'Do not travel' }],
}

export function MapControls() {
  const { layer, setLayer, layerMonth, setLayerMonth } = useTrip()
  const legend = LEGENDS[layer]
  return (
    <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-2">
      <div className="pointer-events-auto flex rounded-lg border border-line bg-panel p-0.5 shadow-sm">
        {LAYERS.map((l) => (
          <button
            key={l.value}
            onClick={() => setLayer(l.value)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${layer === l.value ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      {(layer === 'climate' || layer === 'air') && (
        <div className="pointer-events-auto flex rounded-lg border border-line bg-panel p-0.5 shadow-sm">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              onClick={() => setLayerMonth(i + 1)}
              className={`rounded-md px-1.5 py-1 text-[11px] font-medium ${layerMonth === i + 1 ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
      {legend && (
        <div className="pointer-events-auto flex gap-3 rounded-lg border border-line bg-panel/95 px-2.5 py-1.5 text-[11px] shadow-sm">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
