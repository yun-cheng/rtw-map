import { useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis, type XAxisTickContentProps } from 'recharts'
import { tempRange, tempScale } from '../ui/format'
import { useTemp } from '../ui/useTemp'
import { ChartTip, HOVER_CURSOR, LEGEND_STYLE, legendContent, monthsLegend, useChartTip } from './chartParts'
import { sky, type ForecastDay } from './Forecast'

// The colours of the monthly weather chart.
const HIGH = '#ea580c'
const LOW = '#0284c7'
const RAIN = '#93c5fd'
/** Rain on the right axis, up to this many mm a day at least (a wetter day stretches it). */
const RAIN_MIN_MAX = 10

const SERIES_ORDER = ['high', 'low', 'rain']

/**
 * The days ahead, like the monthly weather chart: rain bars (mm) under high/low lines, each day's sky and weekday under
 * it, the days of the stay highlighted. Hovering (or tapping) a day shows its details in a tooltip above the chart, so
 * it doesn't cover the lines; clicking a series in the legend hides it. `asFelt`: the lines (and the tooltip) show how hot or cold it feels.
 */
export function ForecastChart({ days, asFelt, highlight }: { days: ForecastDay[]; asFelt: boolean; highlight: Set<string> }) {
  const { unit } = useTemp()
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const toggle = (key: string) => setHidden((h) => {
    const next = new Set(h)
    if (!next.delete(key)) next.add(key)
    return next
  })
  const toUnit = (c: number) => Math.round((unit === 'F' ? (c * 9) / 5 + 32 : c) * 10) / 10
  const points = days.map((d) => ({
    date: d.date, rain: d.rainMm,
    high: toUnit(asFelt ? d.feelsHigh! : d.high), low: toUnit(asFelt ? d.feelsLow! : d.low),
  }))
  const { lo, hi, step, labelStep } = tempScale(Math.min(...points.map((p) => p.low)), Math.max(...points.map((p) => p.high)), unit)
  const ticks: number[] = []
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(t)
  const rainMax = Math.max(RAIN_MIN_MAX, ...points.map((p) => p.rain)) * 1.6

  // Each day's sky over its weekday ("Today" for the first) and date ("10/11"), in the accent colour on the days of the stay.
  function DayTick({ x, y, payload }: XAxisTickContentProps) {
    const day = days[payload.index]
    const on = highlight.has(day.date)
    const weekday = payload.index === 0 ? 'Today' : new Date(`${day.date}T12:00`).toLocaleDateString('en', { weekday: 'short' })
    return (
      <g>
        <text x={x} y={Number(y) + 12} textAnchor="middle" fontSize={12}>{sky(day.code)[0]}</text>
        <text x={x} y={Number(y) + 26} textAnchor="middle" fontSize={9} fontWeight={on ? 700 : 400} style={{ fill: on ? 'var(--color-accent)' : 'var(--color-muted)' }}>
          <tspan x={x}>{weekday}</tspan>
          <tspan x={x} dy={11}>{Number(day.date.slice(5, 7))}/{Number(day.date.slice(8, 10))}</tspan>
        </text>
      </g>
    )
  }

  const { box, chartProps, tip } = useChartTip()
  const d = tip && days[tip.index]

  return (
    <div ref={box} className="h-[210px] w-full" role="img" aria-label="Weather forecast">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: -18 }} {...chartProps}>
          {days.filter((d) => highlight.has(d.date)).map((d) => (
            <ReferenceArea key={d.date} yAxisId="t" x1={d.date} x2={d.date} fill="var(--color-accent-soft)" fillOpacity={1} ifOverflow="extendDomain" />
          ))}
          <CartesianGrid vertical={false} yAxisId="t" stroke="var(--color-line)" />
          <XAxis dataKey="date" interval={0} height={43} tickLine={false} axisLine={false} tick={DayTick} />
          <YAxis
            yAxisId="t" domain={[lo, hi]} ticks={ticks} allowDataOverflow tickLine={false} axisLine={false} width={44}
            tick={{ fontSize: 9, fill: 'var(--color-muted)' }}
            tickFormatter={(t: number) => (t % labelStep === 0 ? `${t}°` : '')}
          />
          <YAxis yAxisId="rain" orientation="right" domain={[0, rainMax]} hide />
          <Bar yAxisId="rain" dataKey="rain" name="Rain mm" hide={hidden.has('rain')} fill={RAIN} radius={[2, 2, 0, 0]} barSize={10} isAnimationActive={false} />
          <Line yAxisId="t" dataKey="high" name={`High °${unit}`} hide={hidden.has('high')} stroke={HIGH} strokeWidth={2} dot={{ r: 2.5, fill: HIGH, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
          <Line yAxisId="t" dataKey="low" name={`Low °${unit}`} hide={hidden.has('low')} stroke={LOW} strokeWidth={2} dot={{ r: 2.5, fill: LOW, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
          <Legend
            verticalAlign="bottom" wrapperStyle={LEGEND_STYLE} itemSorter={(e) => SERIES_ORDER.indexOf(String(e.dataKey))}
            content={legendContent({ onToggle: toggle, extras: days.some((d) => highlight.has(d.date)) ? [monthsLegend('Your stay')] : [] })}
          />
          <Tooltip cursor={HOVER_CURSOR} content={() => null} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {/* The day is on the axis below, so no date. */}
      <ChartTip at={tip}>
        {d && (
          <>
            <div>{sky(d.code).join(' ')}</div>
            <div>{asFelt ? 'Feels like ' : ''}{tempRange(asFelt ? d.feelsLow! : d.low, asFelt ? d.feelsHigh! : d.high, unit)}</div>
            <div className="text-muted">{d.rainMm >= 0.1 ? `${Math.round(d.rainMm * 10) / 10} mm rain` : 'No rain'}{d.rainChance != null && `, ${d.rainChance}% chance`}{d.humidity != null && `, ${Math.round(d.humidity)}% humidity`}</div>
          </>
        )}
      </ChartTip>
    </div>
  )
}
