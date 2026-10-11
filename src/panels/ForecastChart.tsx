import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis, type XAxisTickContentProps } from 'recharts'
import { tempScale, tempTicks } from '../ui/format'
import { useTemp } from '../ui/useTemp'
import { ChartTip, HOVER_CURSOR, TEMP_PADDING, tempLabels, useChartTip } from './chartParts'
import { sky, type ForecastDay } from './Forecast'

// The colours of the monthly weather charts.
const HIGH = '#ea580c'
const LOW = '#0284c7'
const RAIN = '#60a5fa'
/** The rain chart's axis goes up to this many mm a day at least (a wetter day stretches it). */
const RAIN_MIN_MAX = 10

/**
 * The days ahead, like the monthly weather chart: high/low lines with each day's temperatures, each day's sky and
 * weekday under it, today highlighted (rain in a chart of its own, ForecastRain); no legend (the lines' colours and
 * labels say which is which). Hovering (or tapping) a day shows its details in a tooltip above the chart, so it
 * doesn't cover the lines. `asFelt`: the lines show how hot or cold it feels.
 */
export function ForecastChart({ days, asFelt }: { days: ForecastDay[]; asFelt: boolean }) {
  const { unit } = useTemp()
  const toUnit = (c: number) => Math.round((unit === 'F' ? (c * 9) / 5 + 32 : c) * 10) / 10
  const points = days.map((d) => ({
    date: d.date,
    high: toUnit(asFelt ? d.feelsHigh! : d.high), low: toUnit(asFelt ? d.feelsLow! : d.low),
  }))
  // One scale for both, real and as felt, so switching between them moves the lines, not the axis.
  const lows = days.flatMap((d) => [d.low, ...(d.feelsLow != null ? [d.feelsLow] : [])]).map(toUnit)
  const highs = days.flatMap((d) => [d.high, ...(d.feelsHigh != null ? [d.feelsHigh] : [])]).map(toUnit)
  const scale = tempScale(Math.min(...lows), Math.max(...highs), unit)
  const { lo, hi } = scale
  const ticks = tempTicks(scale)

  // Each day's sky over its weekday ("Today" for the first, in the accent colour) and date ("10/11").
  function DayTick({ x, y, payload }: XAxisTickContentProps) {
    const day = days[payload.index]
    const on = payload.index === 0
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
    <div ref={box} className="h-[222px] w-full" role="img" aria-label="Weather forecast">
      <ResponsiveContainer width="100%" height="100%">
        {/* (Room under the dates: no legend below.) */}
        <ComposedChart data={points} margin={{ top: 8, right: 14, bottom: 8, left: -18 }} {...chartProps}>
          {/* Today (the first day, by the city's own date). */}
          <ReferenceArea yAxisId="t" x1={days[0].date} x2={days[0].date} fill="var(--color-accent-soft)" fillOpacity={1} ifOverflow="extendDomain" />
          {/* (Lines at the labelled degrees only: not also at the edges of the room left for the labels.) */}
          <CartesianGrid vertical={false} yAxisId="t" syncWithTicks stroke="var(--color-line)" />
          {/* (Columns, as with bars: so a day's highlight has its width, and the days line up with the rain chart's.) */}
          <XAxis dataKey="date" scale="band" interval={0} height={43} tickLine={false} axisLine={false} tick={DayTick} />
          <YAxis
            yAxisId="t" domain={[lo, hi]} ticks={ticks} allowDataOverflow tickLine={false} axisLine={false} width={44} padding={TEMP_PADDING}
            tick={{ fontSize: 9, fill: 'var(--color-muted)' }}
            interval={0} tickFormatter={(t: number) => `${t}°`}
          />
          <Line yAxisId="t" dataKey="high" name={`High °${unit}`} legendType="none" stroke={HIGH} strokeWidth={2} dot={{ r: 2.5, fill: HIGH, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false}>{tempLabels('top', HIGH)}</Line>
          <Line yAxisId="t" dataKey="low" name={`Low °${unit}`} legendType="none" stroke={LOW} strokeWidth={2} dot={{ r: 2.5, fill: LOW, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false}>{tempLabels('bottom', LOW)}</Line>
          <Tooltip cursor={HOVER_CURSOR} content={() => null} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {/* The day is on the axis below, so no date. */}
      <ChartTip at={tip}>
        {d && (
          <>
            <div>{sky(d.code).join(' ')}</div>
            {d.humidity != null && <div className="text-muted">{Math.round(d.humidity)}% humidity</div>}
          </>
        )}
      </ChartTip>
    </div>
  )
}

/** The rain of the days ahead (mm, bars), under the forecast's temperatures: weekdays below, today highlighted; a day's
 *  rain and its chance in a tooltip. */
export function ForecastRain({ days }: { days: ForecastDay[] }) {
  const points = days.map((d) => ({ date: d.date, rain: d.rainMm }))
  // Gridlines every 5 mm, up to the wettest day.
  const top = Math.ceil(Math.max(RAIN_MIN_MAX, ...points.map((p) => p.rain)) / 5) * 5
  const ticks = Array.from({ length: top / 5 + 1 }, (_, i) => i * 5)
  function WeekdayTick({ x, y, payload }: XAxisTickContentProps) {
    const day = days[payload.index]
    const on = payload.index === 0
    return (
      <text x={x} y={Number(y) + 10} textAnchor="middle" fontSize={9} fontWeight={on ? 700 : 400} style={{ fill: on ? 'var(--color-accent)' : 'var(--color-muted)' }}>
        {payload.index === 0 ? 'Today' : new Date(`${day.date}T12:00`).toLocaleDateString('en', { weekday: 'short' })}
      </text>
    )
  }
  const { box, chartProps, tip } = useChartTip()
  const d = tip && days[tip.index]

  return (
    <div ref={box} className="h-[120px] w-full" role="img" aria-label="Rain forecast">
      <ResponsiveContainer width="100%" height="100%">
        {/* (Room under the weekdays: no legend below this one.) */}
        <ComposedChart data={points} margin={{ top: 8, right: 14, bottom: 4, left: -18 }} {...chartProps}>
          <ReferenceArea x1={days[0].date} x2={days[0].date} fill="var(--color-accent-soft)" fillOpacity={1} />
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="date" interval={0} height={18} tickLine={false} axisLine={false} tick={WeekdayTick} />
          <YAxis domain={[0, top]} ticks={ticks} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 9, fill: 'var(--color-muted)' }} tickFormatter={(mm: number) => String(mm)} />
          <Bar dataKey="rain" legendType="none" fill={RAIN} radius={[2, 2, 0, 0]} barSize={14} isAnimationActive={false} />
          <Tooltip cursor={HOVER_CURSOR} content={() => null} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartTip at={tip}>
        {d && <div>{d.rainMm >= 0.1 ? `${Math.round(d.rainMm * 10) / 10} mm rain` : 'No rain'}{d.rainChance != null && `, ${d.rainChance}% chance`}</div>}
      </ChartTip>
    </div>
  )
}
