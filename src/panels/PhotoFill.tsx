// "From files" in My trip's Tickets, Stays and Receipts: pick photos, screenshots or PDFs (bookings, tickets, receipts)
// and the Assistant opens with them attached and sent, asking it to save what's in them (agent/photoAsk.ts).
import { Sparkles } from 'lucide-react'
import { useRef } from 'react'
import { usePhotoAsk } from '../agent/photoAsk'
import { askAssistant } from '../ui/assistantPanel'

/** What's asked: what's in it, and what was paid for it too, linked (a booking with its price is both; a package of
 *  flights and a hotel is several bookings and one receipt). */
const ASK = {
  ticket: 'Save the tickets in this to My trip: one per flight, train, bus or ferry, on its journey (and a hotel in it as a stay). If it shows what I paid, log that as one receipt linked to all of them.',
  stay: 'Save the stays in this to My trip, each at its city (and flights in it as tickets). If it shows what I paid, log that as one receipt linked to all of them.',
  receipt: 'Log what I paid in this as receipts in My trip. If it\'s for bookings (tickets, a stay, or a package of both), save those too, linked to its receipt.',
} as const

/** `className`: styled as the buttons beside it. */
export function PhotoFill({ what, className = '' }: { what: keyof typeof ASK; className?: string }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button onClick={() => input.current?.click()} title="Send photos, screenshots or PDFs to the assistant to fill these in" className={`${className} shrink-0`}>
        <Sparkles size={12} /> From files
      </button>
      <input
        ref={input} type="file" accept="image/*,application/pdf" multiple hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (!files.length) return
          usePhotoAsk.getState().set({ text: ASK[what], files, at: Date.now() })
          askAssistant()
        }}
      />
    </>
  )
}
