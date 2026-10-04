import type { ClimateMonth } from '../planner'
import { MONTHS } from '../ui/format'

/** 12-month chart: rain-day bars plus high/low temperature lines; stay months highlighted. */
export function ClimateChart({ data, highlight }: { data: ClimateMonth[]; highlight: Set<number> }) {
  const W = 360
  const H = 150
  const pad = { l: 26, r: 22, t: 10, b: 20 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const tMin = Math.min(0, ...data.map((d) => d.tLow)) - 2
  const tMax = Math.max(30, ...data.map((d) => d.tHigh)) + 2
  const x = (i: number) => pad.l + (i + 0.5) * (iw / 12)
  const yT = (t: number) => pad.t + ih - ((t - tMin) / (tMax - tMin)) * ih
  const yR = (r: number) => pad.t + ih - (r / 25) * ih
  const line = (k: 'tHigh' | 'tLow') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${yT(d[k])}`).join('')
  const ticks = [0, 10, 20, 30].filter((t) => t >= tMin && t <= tMax)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Monthly climate">
      {data.map((_, i) => highlight.has(i + 1) && (
        <rect key={`h${i}`} x={x(i) - iw / 24} y={pad.t} width={iw / 12} height={ih} fill="#ccfbf1" />
      ))}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={yT(t)} y2={yT(t)} stroke="#e7e5e4" strokeWidth={1} />
          <text x={pad.l - 4} y={yT(t) + 3} textAnchor="end" fontSize={9} fill="#78716c">{t}°</text>
        </g>
      ))}
      {data.map((d, i) => (
        <rect key={`r${i}`} x={x(i) - 5} y={yR(d.rainDays)} width={10} height={pad.t + ih - yR(d.rainDays)} fill="#93c5fd" rx={2}>
          <title>{`${MONTHS[i]}: ${d.rainDays} rain days, ${d.rainMm} mm`}</title>
        </rect>
      ))}
      <path d={line('tHigh')} fill="none" stroke="#ea580c" strokeWidth={2} />
      <path d={line('tLow')} fill="none" stroke="#0284c7" strokeWidth={2} />
      {data.map((d, i) => (
        <g key={`p${i}`}>
          <circle cx={x(i)} cy={yT(d.tHigh)} r={2.5} fill="#ea580c"><title>{`${MONTHS[i]} high ${d.tHigh}°C`}</title></circle>
          <circle cx={x(i)} cy={yT(d.tLow)} r={2.5} fill="#0284c7"><title>{`${MONTHS[i]} low ${d.tLow}°C`}</title></circle>
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize={9} fill={highlight.has(i + 1) ? '#0f766e' : '#78716c'} fontWeight={highlight.has(i + 1) ? 700 : 400}>{MONTHS[i][0]}</text>
        </g>
      ))}
      <text x={W - pad.r + 4} y={yR(20) + 3} fontSize={9} fill="#60a5fa">20d</text>
    </svg>
  )
}
