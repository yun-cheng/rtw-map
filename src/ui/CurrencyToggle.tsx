import { useTrip } from '../store/trip'

/**
 * "USD | RSD": whether the city panel's daily cost and prices show the display currency or the city's own. One
 * setting, kept when switching cities, like Feels like | Real.
 */
export function CurrencyToggle({ local }: { local: string }) {
  const display = useTrip((s) => s.currency)
  const on = useTrip((s) => s.costsLocal)
  const setOn = useTrip((s) => s.setCostsLocal)
  return (
    <span className="flex rounded-md border border-line p-px text-[11px]" role="group" aria-label="Currency">
      {([false, true] as const).map((l) => (
        <button
          key={String(l)}
          onClick={() => setOn(l)}
          aria-pressed={on === l}
          title={l ? `Prices in the local currency (${local})` : `Prices in your currency (${display})`}
          className={`rounded px-1.5 ${on === l ? 'bg-ink text-panel' : 'text-muted hover:text-ink'}`}
        >
          {l ? local : display}
        </button>
      ))}
    </span>
  )
}
