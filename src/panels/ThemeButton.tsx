import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemeChoice } from '../ui/theme'

/** Each one's icon, in the order a click steps through them. */
const CHOICES: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'Same as device', Icon: Monitor },
]

/** Header button for the theme: shows the one chosen (light, dark or the device's), and a click switches to the next. */
export function ThemeButton() {
  const { choice, setChoice } = useTheme()
  const at = Math.max(0, CHOICES.findIndex((c) => c.value === choice))
  const { label, Icon } = CHOICES[at]
  return (
    <button
      onClick={() => setChoice(CHOICES[(at + 1) % CHOICES.length].value)}
      aria-label={`Theme: ${label}`}
      className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-line text-muted hover:bg-canvas hover:text-ink"
    >
      <Icon size={16} />
    </button>
  )
}
