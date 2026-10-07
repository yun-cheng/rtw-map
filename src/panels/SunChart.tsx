import { Bar, CartesianGrid, Cell, ComposedChart, Legend, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ClimateMonth } from '../planner'
import { MONTHS } from '../ui/format'
import { LEGEND_STYLE, legendContent, monthsLegend, HOVER_CURSOR, hoverProps, monthTick } from './chartParts'

type Point = { m: string; month: number; sun: number }

/** Sunnier months in deeper yellow. */
const sunColor = (h: number) => (h >= 9 ? '#f59e0b' : h >= 6 ? '#fbbf24' : h >= 3 ? '#fcd34d' : '#fde68a')

/** Hours of sunshine a day, by month (bars); the months shown highlighted. Hovering (or tapping) a month reports it (`onHover`). */
export function SunChart({ data, highlight, monthsLabel, onHover }: { data: ClimateMonth[]; highlight: Set<number>; monthsLabel: string; onHover?: (month: number | null) => void }) {
  const points: Point[] = data.map((c, i) => ({ m: MONTHS[i], month: i + 1, sun: c.sunHours }))
  // Gridlines every 4 hours, up to the sunniest month (at least 12).
  const top = Math.ceil(Math.max(12, ...points.map((p) => p.sun)) / 4) * 4
  const ticks = Array.from({ length: top / 4 + 1 }, (_, i) => i * 4)

  return (
    <div className="h-[130px] w-full" role="img" aria-label="Hours of sunshine a day, by month">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: -18 }} {...hoverProps(onHover)}>
          {[...highlight].map((m) => (
            <ReferenceArea key={m} x1={MONTHS[m - 1]} x2={MONTHS[m - 1]} fill="var(--color-accent-soft)" fillOpacity={1} />
          ))}
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="m" interval={0} height={18} tickLine={false} axisLine={false} tick={monthTick(highlight)} />
          <YAxis domain={[0, top]} ticks={ticks} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 9, fill: 'var(--color-muted)' }} tickFormatter={(h: number) => `${h}h`} />
          <Bar dataKey="sun" legendType="none" radius={[2, 2, 0, 0]} barSize={14} isAnimationActive={false}>
            {points.map((p) => <Cell key={p.month} fill={sunColor(p.sun)} />)}
          </Bar>
          <Legend verticalAlign="bottom" wrapperStyle={LEGEND_STYLE} content={legendContent({ extras: [monthsLegend(monthsLabel)] })} />
          <Tooltip cursor={HOVER_CURSOR} content={() => null} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
