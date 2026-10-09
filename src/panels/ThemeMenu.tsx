import { useEffect, useRef, useState } from 'react'
import { useTrip } from '../store/trip'
import { useTheme, type ThemeChoice } from '../ui/theme'

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Same as device' },
]

const Sun = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)
const Moon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
)

/** Header button for the light/dark theme: shows the current one, with a menu to pick light, dark or the device setting,
 *  and whether the map's labels give local names. */
export function ThemeMenu() {
  const { choice, theme, setChoice } = useTheme()
  const { localNames, setLocalNames } = useTrip()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Theme and map labels"
        title="Light or dark theme, map labels"
        className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-line text-muted hover:bg-canvas hover:text-ink"
      >
        {theme === 'dark' ? <Moon /> : <Sun />}
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-30 mt-1 w-52 rounded-lg border border-line bg-panel py-1.5 text-[13px] shadow-lg">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              role="menuitemradio"
              aria-checked={choice === o.value}
              onClick={() => {
                setChoice(o.value)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-canvas"
            >
              <span className="w-3 shrink-0 text-accent">{choice === o.value ? '✓' : ''}</span>
              {o.label}
            </button>
          ))}
          <div className="my-1.5 border-t border-line" />
          <button
            role="menuitemcheckbox"
            aria-checked={localNames}
            onClick={() => setLocalNames(!localNames)}
            title="Map labels also in the local script, like Αθήνα under Athens"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-canvas"
          >
            <span className="w-3 shrink-0 text-accent">{localNames ? '✓' : ''}</span>
            Local names on the map
          </button>
        </div>
      )}
    </div>
  )
}
