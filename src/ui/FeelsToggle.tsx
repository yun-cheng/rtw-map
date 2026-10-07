import { useTrip } from '../store/trip'

/**
 * "Feels like | Real": whether temperatures show how they feel (heat with humidity, cold with wind) or as measured.
 * One setting, shown wherever temperatures are (map legend, city weather, timeline), so they always agree.
 */
export function FeelsToggle() {
  const feels = useTrip((s) => s.tempFeels)
  const setFeels = useTrip((s) => s.setTempFeels)
  return (
    <span className="flex rounded-md border border-line p-px text-[11px]" role="group" aria-label="Temperatures">
      {([true, false] as const).map((f) => (
        <button
          key={String(f)}
          onClick={() => setFeels(f)}
          aria-pressed={feels === f}
          title={f ? 'How hot or cold it feels: heat with humidity, cold with wind' : 'Measured air temperature'}
          className={`rounded px-1.5 ${feels === f ? 'bg-ink text-panel' : 'text-muted hover:text-ink'}`}
        >
          {f ? 'Feels like' : 'Real'}
        </button>
      ))}
    </span>
  )
}
