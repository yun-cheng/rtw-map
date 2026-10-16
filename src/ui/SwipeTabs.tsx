import type { EmblaCarouselType, EmblaOptionsType } from 'embla-carousel'
import useEmblaCarousel from 'embla-carousel-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Whether a drag from `el` is its own: on a field, something that scrolls sideways or takes the touch itself (a
 *  chart, a slider), up to `top`. */
function dragTaken(el: Element | null, top: Element) {
  for (; el && el !== top; el = el.parentElement) {
    if (el.matches('input, textarea, select, [contenteditable="true"]')) return true
    const style = getComputedStyle(el)
    if (style.touchAction === 'none') return true
    if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(style.overflowX)) return true
  }
  return false
}

/** Whether a press can drag the tabs: not from the screen's edges (where the browser goes back), nor on a field or
 *  something that takes it itself. */
const watchDrag = (api: EmblaCarouselType, e: MouseEvent | TouchEvent) => {
  const x = 'touches' in e ? e.touches[0]?.clientX : e.clientX
  return x > 24 && x < window.innerWidth - 24 && !dragTaken(e.target as Element, api.rootNode())
}

/**
 * A phone sheet's tabs side by side (Embla): dragged sideways, the open one follows the finger and the next or
 * previous comes in, and let go past the middle (or flicked) it moves on, picking that tab (`onTab`); a tab picked on
 * the tab bar slides in the same way (one beside it; one further jumps there). Only the open tab and the two beside it
 * are drawn, so a tab's content (a city's forecast, its charts) isn't made until it's near. Each tab is as tall as
 * the sheet's room for it, and scrolls up and down on its own (`children` gives it its scroller).
 */
export function SwipeTabs<K extends string>({ tabs, tab, onTab, children }: {
  tabs: K[]
  tab: K
  onTab: (tab: K) => void
  children: (tab: K) => ReactNode
}) {
  const at = Math.max(0, tabs.indexOf(tab))
  // (Set once: Embla starts again, at `startIndex`, when they change.)
  const [options] = useState<EmblaOptionsType>(() => ({ startIndex: at, duration: 22, watchDrag }))
  const [viewport, embla] = useEmblaCarousel(options)
  // (Through a ref, so the handler is added once.)
  const picked = useRef({ tabs, onTab })
  useEffect(() => void (picked.current = { tabs, onTab }))
  useEffect(() => {
    if (!embla) return
    const select = () => {
      const { tabs, onTab } = picked.current
      const t = tabs[embla.selectedScrollSnap()]
      if (t) onTab(t)
    }
    embla.on('select', select)
    return () => void embla.off('select', select)
  }, [embla])
  // A tab picked elsewhere: slid to (one beside), or jumped to.
  useEffect(() => {
    if (!embla || embla.selectedScrollSnap() === at) return
    embla.scrollTo(at, Math.abs(embla.selectedScrollSnap() - at) > 1)
  }, [embla, at])

  return (
    // (Clipped, not hidden: nothing inside, brought into view, can scroll it sideways.)
    <div ref={viewport} className="min-h-0 flex-1 overflow-clip">
      <div className="flex h-full touch-pan-y">
        {tabs.map((t, i) => (
          <div key={t} className="h-full min-w-0 shrink-0 grow-0 basis-full" inert={i !== at}>
            {Math.abs(i - at) <= 1 && children(t)}
          </div>
        ))}
      </div>
    </div>
  )
}
