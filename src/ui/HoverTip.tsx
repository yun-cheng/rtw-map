import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TipContent } from '../map/cityMetric'
import { TipBody } from './tipBody'

/** What to show and where: the content, the element it points at, and on which side of it (default above). */
export type Tip = { content: TipContent; rect: DOMRect; side?: 'top' | 'right' }

const SHADOW = '0 1px 2px rgb(0 0 0 / 0.1), 0 2px 8px rgb(0 0 0 / 0.12)'
const BOX = 'max-w-[300px] rounded-lg bg-panel px-2.5 py-1.5 text-[12px] font-medium text-ink'

/**
 * A hover box that looks like the map's (MapLibre popup with the app's colours: panel background, 8px corners,
 * 12px text laid out by TipBody, a small pointer) and shows at once, unlike the browser's `title` tooltip. It sits
 * above the element, kept inside the window, with the pointer over the element's centre; or beside it (`side`).
 */
export function HoverTip({ tip }: { tip: Tip | null }) {
  const box = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useState<number | null>(null)
  const center = tip ? tip.rect.left + tip.rect.width / 2 : 0

  // Keep the box inside the window, measured once it's drawn.
  useLayoutEffect(() => {
    if (!tip || !box.current) return setLeft(null)
    const w = box.current.offsetWidth
    setLeft(Math.min(Math.max(8, center - w / 2), window.innerWidth - 8 - w))
  }, [tip, center])

  if (!tip) return null
  if (tip.side === 'right') {
    // Beside the element (e.g. the buttons of the folded left panel), the pointer at its middle.
    return createPortal(
      <div className="pointer-events-none fixed z-50 flex items-center" style={{ top: tip.rect.top + tip.rect.height / 2, left: tip.rect.right + 4, transform: 'translateY(-50%)' }} role="tooltip">
        <div className="h-0 w-0" style={{ borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderRight: '6px solid var(--color-panel)' }} />
        <div className={BOX} style={{ boxShadow: SHADOW }}><TipBody tip={tip.content} /></div>
      </div>,
      document.body,
    )
  }
  return createPortal(
    <div className="pointer-events-none fixed z-50" style={{ top: tip.rect.top - 10, left: 0, transform: 'translateY(-100%)' }} role="tooltip">
      <div
        ref={box}
        className={BOX}
        style={{ position: 'relative', left: left ?? center, visibility: left === null ? 'hidden' : 'visible', boxShadow: SHADOW }}
      >
        <TipBody tip={tip.content} />
      </div>
      {left !== null && (
        // The pointer, like the map popup's tip, under the box at the element's centre.
        <div className="absolute h-0 w-0" style={{ left: center - 6, bottom: -6, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid var(--color-panel)' }} />
      )}
    </div>,
    document.body,
  )
}
