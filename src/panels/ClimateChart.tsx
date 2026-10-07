import { useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ClimateMonth } from '../planner'
import { MONTHS, tempScale } from '../ui/format'
import { useTrip } from '../store/trip'
import { useTemp } from '../ui/useTemp'
import { LEGEND_STYLE, legendContent, monthsLegend, HOVER_CURSOR, hoverProps, monthTick } from './chartParts'

const HIGH = '#ea580c'
const LOW = '#0284c7'
const RAIN = '#93c5fd'
/** Rain days on the right axis, up to this many (most places have fewer). */
const RAIN_MAX = 25

type Point = { m: string; month: number; high: number; low: number; rain: number; c: ClimateMonth }

/** Legend order: high, low, then rain. */
const SERIES_ORDER = ['high', 'low', 'rain']

/**
 * 12-month chart: rain-day bars plus high/low temperature lines, the months shown highlighted (`monthsLabel` names
 * them in the legend); the lines show how hot or cold it feels, or the real temperatures (the shared setting).
 * Hovering (or tapping) a month reports it (`onHover`) for the details under the chart; clicking a series in the
 * legend hides it. The temperature axis fits the city's year.
 */
export function ClimateChart({ data, highlight, monthsLabel, onHover }: { data: ClimateMonth[]; highlight: Set<number>; monthsLabel: string; onHover?: (month: number | null) => void }) {
  const feels = useTrip((s) => s.tempFeels)
  const { unit } = useTemp()
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const toggle = (key: string) => setHidden((h) => {
    const next = new Set(h)
    if (!next.delete(key)) next.add(key)
    return next
  })
  const toUnit = (c: number) => Math.round((unit === 'F' ? (c * 9) / 5 + 32 : c) * 10) / 10
  const hasFeels = data.every((c) => c.feelsHigh !== undefined && c.feelsLow !== undefined)
  const showFeels = feels && hasFeels
  const points: Point[] = data.map((c, i) => ({
    m: MONTHS[i], month: i + 1, rain: c.rainDays, c,
    high: toUnit(showFeels ? c.feelsHigh! : c.tHigh), low: toUnit(showFeels ? c.feelsLow! : c.tLow),
  }))
  const { lo, hi, step, labelStep } = tempScale(Math.min(...points.map((p) => p.low)), Math.max(...points.map((p) => p.high)), unit)
  const ticks: number[] = []
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(t)

  return (
    <div>
      <div className="h-[180px] w-full" role="img" aria-label="Monthly climate">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: -18 }} {...hoverProps(onHover)}>
            {[...highlight].map((m) => (
              <ReferenceArea key={m} yAxisId="t" x1={MONTHS[m - 1]} x2={MONTHS[m - 1]} fill="var(--color-accent-soft)" fillOpacity={1} ifOverflow="extendDomain" />
            ))}
            <CartesianGrid vertical={false} yAxisId="t" stroke="var(--color-line)" />
            <XAxis dataKey="m" interval={0} height={18} tickLine={false} axisLine={false} tick={monthTick(highlight)} />
            <YAxis
              yAxisId="t" domain={[lo, hi]} ticks={ticks} allowDataOverflow tickLine={false} axisLine={false} width={44}
              tick={{ fontSize: 9, fill: 'var(--color-muted)' }}
              tickFormatter={(t: number) => (t % labelStep === 0 ? `${t}°` : '')}
            />
            <YAxis yAxisId="rain" orientation="right" domain={[0, RAIN_MAX]} hide />
            <Bar yAxisId="rain" dataKey="rain" name="Rain days" hide={hidden.has('rain')} fill={RAIN} radius={[2, 2, 0, 0]} barSize={10} isAnimationActive={false} />
            <Line yAxisId="t" dataKey="high" name={`High °${unit}`} hide={hidden.has('high')} stroke={HIGH} strokeWidth={2} dot={{ r: 2.5, fill: HIGH, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Line yAxisId="t" dataKey="low" name={`Low °${unit}`} hide={hidden.has('low')} stroke={LOW} strokeWidth={2} dot={{ r: 2.5, fill: LOW, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Legend verticalAlign="bottom" wrapperStyle={LEGEND_STYLE} itemSorter={(e) => SERIES_ORDER.indexOf(String(e.dataKey))} content={legendContent({ onToggle: toggle, extras: [monthsLegend(monthsLabel)] })} />
            <Tooltip cursor={HOVER_CURSOR} content={() => null} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

