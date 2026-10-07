import { Bar, CartesianGrid, Cell, ComposedChart, Legend, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { airBand, type AirMonth } from '../planner'
import { MONTHS, levelColor } from '../ui/format'
import { dashedLegend, LEGEND_STYLE, legendContent, monthsLegend, HOVER_CURSOR, hoverProps, monthTick } from './chartParts'

type Point = { m: string; month: number; pm25: number; a: AirMonth }

/**
 * 12 monthly PM2.5 bars coloured by band, with the WHO 24-hour guideline as a dashed line; the months shown
 * highlighted. Hovering (or tapping) a month reports it (`onHover`) for the details under the chart.
 */
export function AirChart({ data, highlight, who, monthsLabel, onHover }: { data: AirMonth[]; highlight: Set<number>; who: number; monthsLabel: string; onHover?: (month: number | null) => void }) {
  const points: Point[] = data.map((a, i) => ({ m: MONTHS[i], month: i + 1, pm25: a.pm25, a }))
  // Gridlines every 20 µg/m³, up to the worst month (at least 40, so clean places don't look alarming).
  const top = Math.ceil(Math.max(40, ...points.map((p) => p.pm25 * 1.1)) / 20) * 20
  const ticks = Array.from({ length: top / 20 + 1 }, (_, i) => i * 20)

  return (
    <div className="h-[140px] w-full" role="img" aria-label="Monthly air pollution (PM2.5)">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: -18 }} {...hoverProps(onHover)}>
          {[...highlight].map((m) => (
            <ReferenceArea key={m} x1={MONTHS[m - 1]} x2={MONTHS[m - 1]} fill="var(--color-accent-soft)" fillOpacity={1} />
          ))}
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="m" interval={0} height={18} tickLine={false} axisLine={false} tick={monthTick(highlight)} />
          <YAxis domain={[0, top]} ticks={ticks} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 9, fill: 'var(--color-muted)' }} />
          <Bar dataKey="pm25" legendType="none" radius={[2, 2, 0, 0]} barSize={14} isAnimationActive={false}>
            {points.map((p) => (
              <Cell key={p.month} fill={levelColor(airBand(p.pm25).level)} stroke={highlight.has(p.month) ? 'var(--color-accent)' : 'none'} strokeWidth={1.5} />
            ))}
          </Bar>
          <ReferenceLine y={who} stroke="var(--color-ink)" strokeDasharray="3 3" />
          <Legend
            verticalAlign="bottom" wrapperStyle={LEGEND_STYLE}
            content={legendContent({ extras: [dashedLegend(`WHO daily guideline (${who} µg/m³)`, 'var(--color-ink)'), monthsLegend(monthsLabel)] })}
          />
          <Tooltip cursor={HOVER_CURSOR} content={() => null} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
