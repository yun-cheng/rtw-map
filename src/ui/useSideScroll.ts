import { useEffect, useRef, useState } from 'react'

/**
 * For a bar that scrolls sideways: the mouse wheel scrolls it sideways too, and the edge fades where more is
 * hidden, so it's clear there's more to see. `deps`: when the element may appear later (it attaches then).
 */
export function useSideScroll<T extends HTMLElement = HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 })
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    const resize = new ResizeObserver(update)
    resize.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      el.removeEventListener('wheel', onWheel)
      resize.disconnect()
    }
  }, deps)
  const fade = `linear-gradient(to right, ${edges.left ? 'transparent, #000 24px' : '#000'}, ${edges.right ? '#000 calc(100% - 24px), transparent' : '#000'})`
  return { ref, mask: { maskImage: fade, WebkitMaskImage: fade } }
}
