// "From files" in My trip (panels/PhotoFill.tsx): the photos or PDFs picked (a booking, a ticket, a receipt) and what
// to ask about them, handed to the Assistant (AssistantPanel.tsx), which attaches and sends them as the user's message;
// or, if it can't send now (busy, offline, out of today's allowance), leaves them in its box to send.
import { create } from 'zustand'

export type PhotoAsk = { text: string; files: File[]; at: number }

export const usePhotoAsk = create<{ ask: PhotoAsk | null; set: (ask: PhotoAsk | null) => void }>()((set) => ({
  ask: null,
  set: (ask) => set({ ask }),
}))

/** How long a request waits for the Assistant to take it (e.g. while signing in), before it's dropped. */
export const PHOTO_ASK_MS = 120_000
