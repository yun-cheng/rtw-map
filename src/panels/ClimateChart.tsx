import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ClimateMonth } from '../planner'
import { MONTHS, tempScale, tempTicks } from '../ui/format'
import { useTrip } from '../store/trip'
import { useTemp } from '../ui/useTemp'
import { ChartTip, LEGEND_STYLE, TEMP_PADDING, legendContent, monthsLegend, tempLabels, HOVER_CURSOR, monthTick, useChartTip } from './chartParts'

const HIGH = '#ea580c'
const LOW = '#0284c7'
export const RAIN = '#60a5fa'
/** The rain chart's axis goes up to this many rain days a month at least (most places have fewer). */
const RAIN_MIN_MAX = 15

type Point = { m: string; month: number; high: number; low: number; c: ClimateMonth }

/** Legend order: high, then low. */
/**
 * 12-month chart: high/low temperature lines, each month's temperature by its dot, the months shown highlighted
 * (`monthsLabel` names them in the legend); the lines show how hot or cold it feels, or the real temperatures (the
 * shared setting). Rain is in a chart of its own (RainChart).
 * Hovering (or tapping) a month shows its details in a tooltip above the chart. The temperature axis fits the city's
 * year.
 */
export function ClimateChart({ data, highlight, monthsLabel }: { data: ClimateMonth[]; highlight: Set<number>; monthsLabel: string }) {
  const feels = useTrip((s) => s.tempFeels)
  const { unit } = useTemp()
  const toUnit = (c: number) => Math.round((unit === 'F' ? (c * 9) / 5 + 32 : c) * 10) / 10
  const hasFeels = data.every((c) => c.feelsHigh !== undefined && c.feelsLow !== undefined)
  const showFeels = feels && hasFeels
  const points: Point[] = data.map((c, i) => ({
    m: MONTHS[i], month: i + 1, c,
    high: toUnit(showFeels ? c.feelsHigh! : c.tHigh), low: toUnit(showFeels ? c.feelsLow! : c.tLow),
  }))
  // One scale for both, real and as felt, so switching between them moves the lines, not the axis.
  const lows = data.flatMap((c) => [c.tLow, ...(hasFeels ? [c.feelsLow!] : [])]).map(toUnit)
  const highs = data.flatMap((c) => [c.tHigh, ...(hasFeels ? [c.feelsHigh!] : [])]).map(toUnit)
  const scale = tempScale(Math.min(...lows), Math.max(...highs), unit)
  const { lo, hi } = scale
  const ticks = tempTicks(scale)
  const { box, chartProps, tip } = useChartTip()
  const at = tip && data[tip.index]

  return (
    <div>
      <div ref={box} className="h-[210px] w-full" role="img" aria-label="Monthly climate">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 10, bottom: 0, left: -18 }} {...chartProps}>
            {[...highlight].map((m) => (
              <ReferenceArea key={m} yAxisId="t" x1={MONTHS[m - 1]} x2={MONTHS[m - 1]} fill="var(--color-accent-soft)" fillOpacity={1} ifOverflow="extendDomain" />
            ))}
            {/* (Lines at the labelled degrees only: not also at the edges of the room left for the labels.) */}
            <CartesianGrid vertical={false} yAxisId="t" syncWithTicks stroke="var(--color-line)" />
            {/* (Columns, as with bars: so a month's highlight has its width, and the months line up with the rain chart's.) */}
            <XAxis dataKey="m" scale="band" interval={0} height={18} tickLine={false} axisLine={false} tick={monthTick(highlight)} />
            <YAxis
              yAxisId="t" domain={[lo, hi]} ticks={ticks} allowDataOverflow tickLine={false} axisLine={false} width={44} padding={TEMP_PADDING}
              tick={{ fontSize: 9, fill: 'var(--color-muted)' }}
              interval={0} tickFormatter={(t: number) => `${t}°`}
            />
            <Line yAxisId="t" dataKey="high" name={`High °${unit}`} legendType="none" stroke={HIGH} strokeWidth={2} dot={{ r: 2.5, fill: HIGH, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false}>{tempLabels('top', HIGH)}</Line>
            <Line yAxisId="t" dataKey="low" name={`Low °${unit}`} legendType="none" stroke={LOW} strokeWidth={2} dot={{ r: 2.5, fill: LOW, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false}>{tempLabels('bottom', LOW)}</Line>
            {/* (Only the months shown: the lines' colours and labels say which is which.) */}
            <Legend verticalAlign="bottom" wrapperStyle={LEGEND_STYLE} content={legendContent({ extras: [monthsLegend(monthsLabel)] })} />
            <Tooltip cursor={HOVER_CURSOR} content={() => null} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartTip at={tip}>
        {/* (The temperatures are by the dots.) */}
        {at && <div>{at.humidity}% humidity</div>}
      </ChartTip>
    </div>
  )
}


/** Rain days by month (bars), the months shown highlighted; hovering (or tapping) a month shows it in a tooltip. */
export function RainChart({ data, highlight, monthsLabel }: { data: ClimateMonth[]; highlight: Set<number>; monthsLabel: string }) {
  const points = data.map((c, i) => ({ m: MONTHS[i], month: i + 1, rain: c.rainDays }))
  // Gridlines every 5 days, up to the wettest month.
  const top = Math.ceil(Math.max(RAIN_MIN_MAX, ...points.map((p) => p.rain)) / 5) * 5
  const ticks = Array.from({ length: top / 5 + 1 }, (_, i) => i * 5)
  const { box, chartProps, tip } = useChartTip()
  const at = tip && data[tip.index]

  return (
    <div ref={box} className="h-[130px] w-full" role="img" aria-label="Rain days by month">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 10, bottom: 0, left: -18 }} {...chartProps}>
          {[...highlight].map((m) => (
            <ReferenceArea key={m} x1={MONTHS[m - 1]} x2={MONTHS[m - 1]} fill="var(--color-accent-soft)" fillOpacity={1} />
          ))}
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="m" interval={0} height={18} tickLine={false} axisLine={false} tick={monthTick(highlight)} />
          <YAxis domain={[0, top]} ticks={ticks} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 9, fill: 'var(--color-muted)' }} tickFormatter={(d: number) => `${d}d`} />
          <Bar dataKey="rain" legendType="none" fill={RAIN} radius={[2, 2, 0, 0]} barSize={14} isAnimationActive={false} />
          <Legend verticalAlign="bottom" wrapperStyle={LEGEND_STYLE} content={legendContent({ extras: [monthsLegend(monthsLabel)] })} />
          <Tooltip cursor={HOVER_CURSOR} content={() => null} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartTip at={tip}>
        {at && <div>{at.rainDays} rain day{at.rainDays === 1 ? '' : 's'} a month</div>}
      </ChartTip>
    </div>
  )
}
