// The left panel's sheet on a phone (App): open, or closed for the whole map by its ✕ or pulled down (the button under
// Settings opens it again). Not remembered: it's open when the app starts, unless the address says it was closed.
import { create } from 'zustand'

type LeftSheet = {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useLeftSheet = create<LeftSheet>()((set) => ({
  open: true,
  setOpen: (open) => set({ open }),
}))
