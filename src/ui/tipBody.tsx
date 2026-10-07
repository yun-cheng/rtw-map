// The layout inside a hover box, the same on the map (MapLibre popup) and in the app (HoverTip): a bold title, a grey
// subtitle, the main detail, then smaller grey details.
import type { TipContent } from '../map/cityMetric'

const CLASS = { title: 'font-semibold', sub: 'text-[11px] text-muted', main: 'mt-1', more: 'text-[11px] text-muted' }

export function TipBody({ tip }: { tip: TipContent }) {
  return (
    <div className="leading-snug">
      {tip.title && <div className={CLASS.title}>{tip.title}</div>}
      {tip.sub && <div className={CLASS.sub}>{tip.sub}</div>}
      {tip.lines?.map((l, i) => <div key={i} className={i === 0 ? (tip.title || tip.sub ? CLASS.main : '') : CLASS.more}>{l}</div>)}
    </div>
  )
}

/** The same as a DOM element, for the map's popup (MapLibre takes DOM, not React). */
export function tipElement(tip: TipContent): HTMLElement {
  const root = document.createElement('div')
  root.className = 'leading-snug'
  const add = (text: string, className: string) => {
    const el = document.createElement('div')
    el.className = className
    el.textContent = text
    root.append(el)
  }
  if (tip.title) add(tip.title, CLASS.title)
  if (tip.sub) add(tip.sub, CLASS.sub)
  tip.lines?.forEach((l, i) => add(l, i === 0 ? (tip.title || tip.sub ? CLASS.main : '') : CLASS.more))
  return root
}
