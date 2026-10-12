import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { applyUpdate, useUpdate } from '../pwa'
import { Button } from '../ui/kit'

/** "A new version is ready": shown over the top of the app (in Notices) once a new version has downloaded
 *  (src/pwa.ts); Reload switches to it. Dismissed, it's used the next time the app opens. */
export function UpdateNotice() {
  const waiting = useUpdate((s) => s.waiting)
  if (!waiting) return null
  return (
    <div role="status" className="pointer-events-auto flex items-center gap-3 rounded-lg border border-line bg-panel py-1.5 pr-1.5 pl-3 text-[13px] shadow-lg">
      <span>A new version of the app is ready.</span>
      <Button variant="primary" onClick={applyUpdate}>Reload</Button>
      <button onClick={() => useUpdate.setState({ waiting: null })} aria-label="Later" title="Later" className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink">
        <X size={15} />
      </button>
    </div>
  )
}

/** The notices over the top of the app, one under the other. */
export function Notices({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex flex-col items-center gap-2 px-4">{children}</div>
}
