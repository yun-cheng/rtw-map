import { airBand, type AirMonth } from '../planner'
import { MONTHS, levelColor } from '../ui/format'

/** 12 monthly PM2.5 bars coloured by band, with the WHO 24-hour guideline as a dashed line; stay months highlighted. */
export function AirChart({ data, highlight, who }: { data: AirMonth[]; highlight: Set<number>; who: number }) {
  const W = 360
  const H = 110
  const pad = { l: 26, r: 8, t: 8, b: 18 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const max = Math.max(40, ...data.map((d) => d.pm25)) * 1.1
  const x = (i: number) => pad.l + (i + 0.5) * (iw / 12)
  const y = (v: number) => pad.t + ih - (v / max) * ih

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Monthly air pollution (PM2.5)">
      {data.map((_, i) => highlight.has(i + 1) && (
        <rect key={`h${i}`} x={x(i) - iw / 24} y={pad.t} width={iw / 12} height={ih} style={{ fill: 'var(--color-accent-soft)' }} opacity={0.5} />
      ))}
      {[0, 20, 40].filter((t) => t < max).map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} style={{ stroke: 'var(--color-line)' }} />
          <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" fontSize={9} style={{ fill: 'var(--color-muted)' }}>{t}</text>
        </g>
      ))}
      {data.map((d, i) => (
        <rect key={i} x={x(i) - 7} y={y(d.pm25)} width={14} height={pad.t + ih - y(d.pm25)} rx={2} fill={levelColor(airBand(d.pm25).level)}
          style={{ stroke: highlight.has(i + 1) ? 'var(--color-accent)' : 'none' }} strokeWidth={1.5}>
          <title>{`${MONTHS[i]}: PM2.5 ${d.pm25} µg/m³, ~${d.daysOverWho} days above WHO guideline`}</title>
        </rect>
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={y(who)} y2={y(who)} style={{ stroke: 'var(--color-ink)' }} strokeDasharray="3 3" strokeWidth={1} />
      {data.map((_, i) => (
        <text key={`m${i}`} x={x(i)} y={H - 5} textAnchor="middle" fontSize={9} style={{ fill: highlight.has(i + 1) ? 'var(--color-accent)' : 'var(--color-muted)' }} fontWeight={highlight.has(i + 1) ? 700 : 400}>{MONTHS[i][0]}</text>
      ))}
    </svg>
  )
}
