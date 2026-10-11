// A shared trip's page (store/shareLink.ts): its name in place of the trip menu, and a note when the link is off.
import { useShared } from '../store/shared'

/** The shared trip's name, that it's read-only, and a way to plan one's own. */
export function SharedTitle() {
  const name = useShared((s) => s.name)
  return (
    <div className="flex min-w-0 shrink items-center gap-2 text-[13px]">
      <span className="truncate font-medium">{name ?? 'Shared trip'}</span>
      <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted">Shared · read-only</span>
      <a href="/" className="shrink-0 text-[12px] font-medium text-accent hover:underline">Plan your own trip</a>
    </div>
  )
}

/** Over the page when the link no longer works (sharing was turned off, or the trip deleted). */
export function SharedGone() {
  const status = useShared((s) => s.status)
  if (status !== 'gone') return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-w-sm rounded-xl bg-panel p-5 text-center shadow-lg">
        <h2 className="text-[15px] font-semibold">This trip isn't shared</h2>
        <p className="mt-1.5 text-[13px] text-muted">The link may be wrong, or its owner stopped sharing the trip.</p>
        <a href="/" className="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-on-accent">Plan your own trip</a>
      </div>
    </div>
  )
}
