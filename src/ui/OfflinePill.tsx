import { CloudOff } from 'lucide-react'
import { useOnline } from './useOnline'

/** "Offline", while the device has no connection (nothing otherwise): in the top bar on a computer, on the map on a phone. */
export function OfflinePill({ className = '' }: { className?: string }) {
  if (useOnline()) return null
  return (
    <span
      className={`flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[12px] text-muted ${className}`}
      title="No connection: the trip, the cities and the map you've seen work offline"
    >
      <CloudOff size={14} /> Offline
    </span>
  )
}
