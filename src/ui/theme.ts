import { create } from 'zustand'

// Light or dark colours. "system" follows the device setting. The choice is kept in this browser
// (localStorage 'rtw-map-theme'); index.html applies it before the first paint so the page doesn't flash.

export type ThemeChoice = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const KEY = 'rtw-map-theme'
// Absent outside a browser (tests).
const media = typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)')

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

const resolve = (choice: ThemeChoice): Theme => (choice === 'system' ? (media?.matches ? 'dark' : 'light') : choice)

function apply(theme: Theme) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme
}

type ThemeState = {
  choice: ThemeChoice
  theme: Theme
  setChoice: (choice: ThemeChoice) => void
}

export const useTheme = create<ThemeState>((set) => ({
  choice: readChoice(),
  theme: resolve(readChoice()),
  setChoice: (choice) => {
    try {
      if (choice === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, choice)
    } catch { /* private window: the choice lasts until reload */ }
    const theme = resolve(choice)
    apply(theme)
    set({ choice, theme })
  },
}))

apply(useTheme.getState().theme)
media?.addEventListener('change', () => {
  const { choice } = useTheme.getState()
  if (choice !== 'system') return
  const theme = resolve(choice)
  apply(theme)
  useTheme.setState({ theme })
})
