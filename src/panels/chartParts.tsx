// Pieces shared by the city panel's charts (monthly weather, sunshine and air; the forecast), drawn with Recharts.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DefaultLegendContent, type DefaultLegendContentProps, type LegendPayload, type MouseHandlerDataParam, type XAxisTickContentProps } from 'recharts'

/** An x-axis label ("Jan"), bold and in the accent colour for the months shown. */
export function monthTick(highlight: Set<number>) {
  return function MonthTick({ x, y, payload }: XAxisTickContentProps) {
    const on = highlight.has(payload.index + 1)
    return (
      <text x={x} y={Number(y) + 10} textAnchor="middle" fontSize={9} fontWeight={on ? 700 : 400} style={{ fill: on ? 'var(--color-accent)' : 'var(--color-muted)' }}>
        {String(payload.value)}
      </text>
    )
  }
}

/** The point under the pointer: its index, and where it is on the page (its x; the chart's top), given where the
 *  chart is (`box`); null when there's none. */
export function tipAt(s: MouseHandlerDataParam, box: { left: number; top: number } | undefined) {
  const index = s.isTooltipActive && s.activeTooltipIndex != null ? Number(s.activeTooltipIndex) : -1
  return box && s.activeCoordinate && index >= 0 ? { index, x: box.left + s.activeCoordinate.x, y: box.top } : null
}

/**
 * The point under the pointer (hover, or a tap), for its tooltip above the chart (`ChartTip`), so the tooltip doesn't
 * cover what's drawn. Spread `chartProps` on the chart and put `box` on the element around it.
 */
export function useChartTip() {
  const box = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ index: number; x: number; y: number } | null>(null)
  const chartProps = {
    onMouseMove: (s: MouseHandlerDataParam) => setTip(tipAt(s, box.current?.getBoundingClientRect())),
    onMouseLeave: () => setTip(null),
  }
  // Scrolling the panel would leave it behind.
  useEffect(() => {
    if (!tip) return
    const hide = () => setTip(null)
    window.addEventListener('scroll', hide, true)
    return () => window.removeEventListener('scroll', hide, true)
  }, [tip])
  return { box, chartProps, tip }
}

/**
 * A chart's tooltip, above the chart at the point under the pointer (`at`, from useChartTip), its arrow pointing down
 * at it; drawn over the page like InfoTip, so the panel doesn't cut it off, and moved back inside the window when
 * needed, the arrow still on the point.
 */
export function ChartTip({ at, children }: { at: { x: number; y: number } | null; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)
  useLayoutEffect(() => {
    if (!at || !box.current) return
    // Where it would be unshifted, then by how much to move it in.
    const r = box.current.getBoundingClientRect()
    const [left, right] = [r.left - shift, r.right - shift]
    const edge = 8
    setShift(left < edge ? edge - left : right > window.innerWidth - edge ? window.innerWidth - edge - right : 0)
  }, [at?.x, at?.y])
  if (!at) return null
  return createPortal(
    <div
      ref={box}
      role="tooltip"
      style={{ left: at.x + shift, top: at.y - 6 }}
      className="pointer-events-none fixed z-50 w-max max-w-64 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] leading-snug shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
    >
      {children}
      <span style={{ left: `calc(50% - ${shift}px)` }} className="absolute top-full -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-line" />
    </div>,
    document.body,
  )
}

/** Shades the column under the pointer (Recharts' tooltip cursor), without a tooltip box. */
export const HOVER_CURSOR = { fill: 'var(--color-line)', fillOpacity: 0.35 }

/** Where the legend goes: the full width under the chart, lined up with the panel's text (Recharts would shift it
 *  by the chart's negative left margin). */
export const LEGEND_STYLE = { left: 0, width: '100%', paddingTop: 6, fontSize: 11 } as const

/** The highlighted-months item ("Map month", "Your stay"…) for the legend. */
export const monthsLegend = (label: string): LegendPayload => ({ value: label, type: 'square', color: 'var(--color-accent)' })

/** A dashed guideline item, e.g. the WHO limit. */
export const dashedLegend = (label: string, color: string): LegendPayload => ({ value: label, type: 'plainline', color, payload: { strokeDasharray: '3 3' } })

/**
 * Content for <Legend>: Recharts' own legend (its icons, each item in its series' colour) with the chart's series,
 * except ones with legendType="none", followed by `extras` (things that aren't series). With `onToggle`, clicking a
 * series hides or shows it; hidden ones are greyed out.
 */
export function legendContent({ extras = [], onToggle }: { extras?: LegendPayload[]; onToggle?: (dataKey: string) => void }) {
  return function ChartLegend(props: DefaultLegendContentProps) {
    const series = (props.payload ?? []).filter((e) => e.type !== 'none')
    return (
      <DefaultLegendContent
        {...props}
        align="left" iconSize={9} inactiveColor="var(--color-muted)"
        payload={[...series, ...extras]}
        onClick={onToggle ? (e: LegendPayload) => e.dataKey !== undefined && onToggle(String(e.dataKey)) : undefined}
      />
    )
  }
}
