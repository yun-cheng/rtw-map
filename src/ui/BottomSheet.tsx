import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

/** How far a bottom sheet is pulled up: just its header, half the map, or all of it. */
export type Snap = 'peek' | 'half' | 'full'

const UP: Record<Snap, Snap> = { peek: 'half', half: 'full', full: 'half' }

/** Whether a touch on `el` in `sheet` is at the top of what it scrolls (or on nothing that scrolls), so pulling it
 *  down can move the sheet: not on a field or something that takes the touch itself (a chart). */
function atTop(el: Element | null, sheet: Element) {
  for (; el && el !== sheet; el = el.parentElement) {
    if (el.matches('input, textarea, select, [contenteditable="true"]')) return false
    const style = getComputedStyle(el)
    if (style.touchAction === 'none') return false
    if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(style.overflowY)) return el.scrollTop <= 0
  }
  return true
}

/**
 * A panel over the bottom of the map on a phone, like Google Maps' place card. Drag it by the grip or by the
 * element marked `data-sheet-peek` (its header, which is also what shows when it's pulled down) to one of three
 * heights; tap the grip to step it up. Pulled down from inside, once that's scrolled to its top, it moves as by its
 * header. Choosing a tab (`role="tab"`) while only the header shows opens it to half (its tabs swipe sideways in
 * SwipeTabs). With `onClose`, pulling it below its header closes it. `hidden`: out of sight but kept (with its state). What doesn't fit is clipped, not scrollable, so bringing something inside into view
 * (scrollIntoView, focus) can't push its header out of sight.
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

  // A drag: where it started, the sheet's height then and now, and the latest position and speed (px/ms, up is
  // positive).
  type Drag = { y0: number; h0: number; h: number; y: number; t: number; v: number }
  const startDrag = (y: number, t: number): Drag => ({ y0: y, h0: heights[snap], h: heights[snap], y, t, v: 0 })
  const follow = (d: Drag, y: number, t: number) => {
    if (t > d.t) d.v = (d.y - y) / (t - d.t)
    d.y = y
    d.t = t
    d.h = Math.max(0, Math.min(room, d.h0 - (y - d.y0)))
    setDragHeight(d.h)
  }
  const release = (d: Drag, t: number) => {
    // The click that may follow this release isn't one (see onClickCapture).
    dragged.current = true
    setTimeout(() => (dragged.current = false))
    setDragHeight(null)
    // Where it's heading: a quick flick carries on past the nearest height (not after holding still).
    const aim = d.h + (t - d.t < 100 ? d.v * 150 : 0)
    if (onClose && aim < heights.peek * 0.6) return onClose()
    onSnap((Object.keys(heights) as Snap[]).reduce((a, b) => (Math.abs(heights[b] - aim) < Math.abs(heights[a] - aim) ? b : a)))
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !(e.target as Element).closest('[data-sheet-grip], [data-sheet-peek]')) return
    dragged.current = false
    const x0 = e.clientX
    const d = startDrag(e.clientY, e.timeStamp)
    let on = false
    // Followed on the window, so a quick flick that leaves the sheet still moves it.
    const move = (e: PointerEvent) => {
      if (!on) {
        const dy = e.clientY - d.y0
        if (Math.abs(dy) < 6 && Math.abs(e.clientX - x0) < 6) return
        // Sideways: leave it to the tab bar's scrolling.
        if (Math.abs(e.clientX - x0) > Math.abs(dy)) return stop()
        on = true
      }
      follow(d, e.clientY, e.timeStamp)
    }
    const up = (e: PointerEvent) => {
      stop()
      if (on) release(d, e.timeStamp)
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

  // Pulled down from inside, scrolled to its top: the whole sheet, as by its header. (On touch events, not pointer
  // ones: the browser takes a touch that may scroll for itself, and only a touchmove can keep it.)
  const live = useRef({ startDrag, follow, release })
  useEffect(() => void (live.current = { startDrag, follow, release }))
  useEffect(() => {
    const el = sheet.current
    if (!el) return
    let pull: { x: number; y: number; d: Drag | null } | null = null
    const start = (e: TouchEvent) => {
      const at = e.touches[0]
      const from = e.target as Element
      pull = e.touches.length === 1 && !from.closest('[data-sheet-grip], [data-sheet-peek]') && atTop(from, el) ? { x: at.clientX, y: at.clientY, d: null } : null
    }
    const move = (e: TouchEvent) => {
      if (!pull) return
      const at = e.touches[0]
      if (!pull.d) {
        const dx = at.clientX - pull.x
        const dy = at.clientY - pull.y
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return
        // Up or sideways: the content's own scrolling, or its tabs'.
        if (dy <= 0 || Math.abs(dx) > dy) return void (pull = null)
        dragged.current = false
        pull.d = live.current.startDrag(pull.y, e.timeStamp)
      }
      e.preventDefault()
      live.current.follow(pull.d, at.clientY, e.timeStamp)
    }
    const end = (e: TouchEvent) => {
      if (pull?.d) live.current.release(pull.d, e.timeStamp)
      pull = null
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [])

  const height = !opened ? 0 : dragHeight ?? heights[snap]
  // Tell the controls over the map (MapControls) how much of it the sheet covers, so they sit above it. A sheet that
  // comes up over another (My trip's over the left panel's) puts the other's height back when it goes.
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
      className={`absolute inset-x-0 bottom-0 flex flex-col overflow-clip rounded-t-2xl border-t border-line shadow-[0_-2px_12px_rgba(0,0,0,0.15)] ${dragHeight !== null ? 'select-none' : 'transition-[height] duration-300 ease-out'} ${className}`}
      style={{ height, display: hidden ? 'none' : undefined }}
    >
      <div ref={grip} data-sheet-grip onClick={() => onSnap(UP[snap])} className="flex shrink-0 cursor-grab touch-none justify-center bg-panel pt-1.5 pb-1">
        <span className="h-1 w-9 rounded-full bg-line" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
