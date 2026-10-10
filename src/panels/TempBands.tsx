import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { DEFAULT_TEMP_BREAKS, type TempBreaks } from '../planner'
import { TEMP_KINDS, WEATHER_STYLE, tempBand, tempValue, type TempUnit } from '../ui/format'

/** The scale the slider spans, in °C. */
const SCALE = { min: -5, max: 40 }
const NAMES = { cold: 'Cold', cool: 'Cool', pleasant: 'Pleasant', warm: 'Warm', hot: 'Hot' }

/**
 * The traveller's temperature bands: one track coloured cold → hot, with a handle at each breakpoint (where cool,
 * pleasant, warm and hot start). Dragged, or moved with the arrow keys, a degree at a time in the user's unit, each
 * between its neighbours; a press on the track moves the nearest handle there. Stored in °C.
 */
export function TempBands({ breaks, unit, onChange }: { breaks: TempBreaks; unit: TempUnit; onChange: (b: TempBreaks) => void }) {
  const lo = tempValue(SCALE.min, unit)
  const hi = tempValue(SCALE.max, unit)
  const shown = breaks.map((c) => tempValue(c, unit))
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100
  const track = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  /** Moves handle `i` to `v` (in the user's unit), between its neighbours. */
  const move = (i: number, v: number) => {
    const n = Math.round(Math.max(i ? shown[i - 1] + 1 : lo, Math.min(i < 3 ? shown[i + 1] - 1 : hi, v)))
    if (n === shown[i]) return
    const next = [...breaks] as TempBreaks
    next[i] = Math.round((unit === 'F' ? ((n - 32) * 5) / 9 : n) * 10) / 10
    onChange(next)
  }
  const valueAt = (x: number) => {
    const r = track.current!.getBoundingClientRect()
    return lo + ((x - r.left) / r.width) * (hi - lo)
  }
  const down = (e: PointerEvent) => {
    const v = valueAt(e.clientX)
    // The nearest handle; of two at the same distance, the one on the side pressed.
    const gap = (k: number) => Math.abs(shown[k] - v)
    const i = shown.reduce((best, s, k) => (gap(k) < gap(best) || (gap(k) === gap(best) && v > s) ? k : best), 0)
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(i)
    move(i, v)
  }
  const key = (i: number) => (e: KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1
    const by = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[e.key]
    if (by === undefined) return
    e.preventDefault()
    move(i, shown[i] + by)
  }
  const edges = [lo, ...shown, hi]
  const changed = breaks.join() !== DEFAULT_TEMP_BREAKS.join()

  return (
    <div>
      <div
        ref={track} onPointerDown={down} onPointerMove={(e) => dragging !== null && move(dragging, valueAt(e.clientX))}
        onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}
        className="relative mx-2 h-6 cursor-pointer touch-none select-none"
      >
        {/* The bands, each in its colour. */}
        {TEMP_KINDS.map((k, i) => (
          <div
            key={k} className="absolute top-2 h-2 first:rounded-l-full last:rounded-r-full"
            style={{ left: `${pct(edges[i])}%`, width: `${pct(edges[i + 1]) - pct(edges[i])}%`, background: WEATHER_STYLE[k].color }}
          />
        ))}
        {shown.map((v, i) => (
          <div
            key={i} role="slider" tabIndex={0} onKeyDown={key(i)}
            aria-label={`${NAMES[TEMP_KINDS[i + 1]]} from`} aria-valuemin={i ? shown[i - 1] + 1 : lo} aria-valuemax={i < 3 ? shown[i + 1] - 1 : hi}
            aria-valuenow={v} aria-valuetext={`${v}°${unit}`}
            className={`absolute top-1 size-4 -translate-x-1/2 rounded-full border-2 border-ink bg-panel shadow outline-none focus-visible:ring-2 focus-visible:ring-accent ${dragging === i ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ left: `${pct(v)}%` }}
          />
        ))}
      </div>
      {/* Each band as its range. */}
      <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px] text-muted">
        {TEMP_KINDS.map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full" style={{ background: WEATHER_STYLE[k].color }} />
            <span className="text-ink">{NAMES[k]}</span> {tempBand(k, unit, breaks)}
          </li>
        ))}
        {changed && (
          <li>
            <button onClick={() => onChange(DEFAULT_TEMP_BREAKS)} className="font-medium text-accent hover:underline">Reset to usual</button>
          </li>
        )}
      </ul>
    </div>
  )
}
