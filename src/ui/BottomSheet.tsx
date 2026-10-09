import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

/** How far a bottom sheet is pulled up: just its header, half the map, or all of it. */
export type Snap = 'peek' | 'half' | 'full'

const UP: Record<Snap, Snap> = { peek: 'half', half: 'full', full: 'half' }

/**
 * A panel over the bottom of the map on a phone, like Google Maps' place card. Drag it by the grip or by the
 * element marked `data-sheet-peek` (its header, which is also what shows when it's pulled down) to one of three
 * heights; tap the grip to step it up. Choosing a tab (`role="tab"`) while only the header shows opens it to half.
 * With `onClose`, pulling it below its header closes it. `hidden`: out of sight but kept (with its state).
 */
export function BottomSheet({ snap, onSnap, onClose, label, hidden, className = '', children }: {
  snap: Snap
  onSnap: (s: Snap) => void
  onClose?: () => void
  label: string
  hidden?: boolean
  className?: string
  children: ReactNode
}) {
  const sheet = useRef<HTMLDivElement>(null)
  const grip = useRef<HTMLDivElement>(null)
  // The height of the map under the sheet, and of the sheet's header.
  const [room, setRoom] = useState(0)
  const [peek, setPeek] = useState(120)
  useLayoutEffect(() => {
    const el = sheet.current
    const parent = el?.parentElement
    if (!el || !parent) return
    // (Not while hidden: it has no size then.)
    if (hidden) return
    const measure = () => {
      setRoom(parent.clientHeight)
      const head = el.querySelector<HTMLElement>('[data-sheet-peek]')
      setPeek((grip.current?.offsetHeight ?? 0) + (head?.offsetHeight ?? 100))
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(parent)
    const head = el.querySelector('[data-sheet-peek]')
    if (head) resize.observe(head)
    return () => resize.disconnect()
  }, [hidden])
  const heights: Record<Snap, number> = { peek: Math.min(peek, room * 0.5), half: Math.round(room * 0.5), full: room }

  // Slides up from the bottom when it opens: drawn at no height first (reading it makes the browser take that in),
  // then at its height.
  const [opened, setOpened] = useState(false)
  useLayoutEffect(() => {
    void sheet.current?.offsetHeight
    setOpened(true)
  }, [])

  // The sheet's height while it's being dragged, and whether the last press was a drag (not a click).
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragged = useRef(false)

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !(e.target as Element).closest('[data-sheet-grip], [data-sheet-peek]')) return
    dragged.current = false
    // Where the drag started, and the latest position and speed (px/ms, up is positive).
    const d = { x0: e.clientX, y0: e.clientY, h0: heights[snap], h: heights[snap], on: false, y: e.clientY, t: e.timeStamp, v: 0 }
    // Followed on the window, so a quick flick that leaves the sheet still moves it.
    const move = (e: PointerEvent) => {
      const dy = e.clientY - d.y0
      if (!d.on) {
        if (Math.abs(dy) < 6 && Math.abs(e.clientX - d.x0) < 6) return
        // Sideways: leave it to the tab bar's scrolling.
        if (Math.abs(e.clientX - d.x0) > Math.abs(dy)) return stop()
        d.on = true
      }
      const dt = e.timeStamp - d.t
      if (dt > 0) d.v = (d.y - e.clientY) / dt
      d.y = e.clientY
      d.t = e.timeStamp
      d.h = Math.max(0, Math.min(room, d.h0 - dy))
      setDragHeight(d.h)
    }
    const up = (e: PointerEvent) => {
      stop()
      if (!d.on) return
      // The click that may follow this release isn't one (see onClickCapture).
      dragged.current = true
      setTimeout(() => (dragged.current = false))
      setDragHeight(null)
      // Where it's heading: a quick flick carries on past the nearest height (not after holding still).
      const aim = d.h + (e.timeStamp - d.t < 100 ? d.v * 150 : 0)
      if (onClose && aim < heights.peek * 0.6) return onClose()
      onSnap((Object.keys(heights) as Snap[]).reduce((a, b) => (Math.abs(heights[b] - aim) < Math.abs(heights[a] - aim) ? b : a)))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const height = !opened ? 0 : dragHeight ?? heights[snap]
  // Tell the controls over the map (MapControls) how much of it the sheet covers, so they sit above it. A sheet that
  // comes up over another (Ask AI) puts the other's height back when it goes.
  useEffect(() => {
    const parent = sheet.current?.parentElement
    if (hidden || !parent) return
    const before = parent.style.getPropertyValue('--sheet-height')
    parent.style.setProperty('--sheet-height', `${height}px`)
    return () => void (before ? parent.style.setProperty('--sheet-height', before) : parent.style.removeProperty('--sheet-height'))
  }, [height, hidden])
  return (
    <div
      ref={sheet}
      role="dialog"
      aria-label={label}
      onPointerDown={onPointerDown}
      onClickCapture={(e) => {
        // A drag that ends over a button isn't a click on it.
        if (dragged.current) {
          dragged.current = false
          e.stopPropagation()
        } else if (snap === 'peek' && (e.target as Element).closest('[role="tab"]')) onSnap('half')
      }}
      className={`absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-2xl border-t border-line shadow-[0_-2px_12px_rgba(0,0,0,0.15)] ${dragHeight !== null ? 'select-none' : 'transition-[height] duration-300 ease-out'} ${className}`}
      style={{ height, display: hidden ? 'none' : undefined }}
    >
      <div ref={grip} data-sheet-grip onClick={() => onSnap(UP[snap])} className="flex shrink-0 cursor-grab touch-none justify-center bg-panel pt-1.5 pb-1">
        <span className="h-1 w-9 rounded-full bg-line" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
