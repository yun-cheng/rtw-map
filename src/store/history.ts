// Undo and redo for the trip on screen (the Itinerary tab's buttons, ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Y): each edit to the
// active plan's setup or stops is a step (by hand anywhere: the Itinerary or Trip tab, the map, a city's panel), and
// each of the assistant's replies is one step as a whole. Kept for the open plan while the page is open; opening
// another trip or plan starts afresh.
import { useEffect } from 'react'
import { create } from 'zustand'
import { useChat } from '../agent/chat'
import type { Stop, TripInput } from '../planner'
import { useSaved } from './saved'
import { useTrip } from './trip'

type Step = { input: TripInput; stops: Stop[] }
const MAX_STEPS = 100
/** Changes this close together are one step (a slider dragged, quick clicks on a nights button). */
const MERGE_MS = 600

type History = {
  past: Step[]
  future: Step[]
  undo: () => void
  redo: () => void
}

const now = (): Step => {
  const { input, stops } = useTrip.getState()
  return { input, stops }
}
/** True while undoing or redoing, so that isn't taken for an edit. */
let moving = false
let last = 0

const go = (from: 'past' | 'future') => {
  const h = useHistory.getState()
  const step = h[from].at(-1)
  if (!step || useChat.getState().busy) return
  const to = from === 'past' ? 'future' : 'past'
  useHistory.setState({ [from]: h[from].slice(0, -1), [to]: [...h[to], now()] } as Partial<History>)
  moving = true
  useTrip.getState().restore(step)
  moving = false
  last = 0
}

export const useHistory = create<History>()(() => ({
  past: [],
  future: [],
  undo: () => go('past'),
  redo: () => go('future'),
}))

const push = (step: Step) => {
  useHistory.setState((h) => ({ past: [...h.past, step].slice(-MAX_STEPS), future: [] }))
  last = Date.now()
}
const clear = () => {
  useHistory.setState({ past: [], future: [] })
  last = 0
}

useTrip.subscribe((s, prev) => {
  if (s.activePlanId !== prev.activePlanId) return clear()
  if (moving || useChat.getState().busy || (s.input === prev.input && s.stops === prev.stops)) return
  if (Date.now() - last > MERGE_MS) push({ input: prev.input, stops: prev.stops })
  else useHistory.setState({ future: [] })
})

// The assistant's reply: the trip from before it, as one step.
let beforeReply: Step | null = null
useChat.subscribe((s, prev) => {
  if (s.busy && !prev.busy) beforeReply = now()
  if (!s.busy && prev.busy && beforeReply) {
    const after = now()
    if (after.input !== beforeReply.input || after.stops !== beforeReply.stops) push(beforeReply)
    beforeReply = null
    last = 0
  }
})

useSaved.subscribe((s, prev) => {
  if (s.activeId !== prev.activeId) clear()
})

export const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const UNDO_KEYS = MAC ? '⌘Z' : 'Ctrl+Z'
export const REDO_KEYS = MAC ? '⇧⌘Z' : 'Ctrl+Y'

/** The keyboard shortcuts, anywhere on the page except while typing (where they undo the typing). */
export function useUndoKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(MAC ? e.metaKey : e.ctrlKey) || e.altKey) return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const redo = (e.code === 'KeyZ' && e.shiftKey) || (!MAC && e.code === 'KeyY')
      if (e.code !== 'KeyZ' && !redo) return
      e.preventDefault()
      if (redo) useHistory.getState().redo()
      else useHistory.getState().undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
