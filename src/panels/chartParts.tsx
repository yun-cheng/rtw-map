// Pieces shared by the city panel's monthly charts (weather, sunshine, air), drawn with Recharts.
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

/** Chart props that report the month under the pointer (1–12; null when it leaves), so its details show under the
 *  chart instead of in a box over it. */
export const hoverProps = (onHover?: (month: number | null) => void) => (onHover ? {
  onMouseMove: (s: MouseHandlerDataParam) => onHover(s.isTooltipActive && s.activeTooltipIndex != null ? Number(s.activeTooltipIndex) + 1 : null),
  onMouseLeave: () => onHover(null),
} : {})

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
