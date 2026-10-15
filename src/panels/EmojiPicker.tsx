// The emoji picker for a day of the journal (Journal.tsx): emoji-picker-element, with search, categories, skin tones
// and those used lately, in the app's colours (index.css). Its emoji come from the app's own files, so it works
// offline, and are kept in the browser's database once read. Loaded when it's first opened.
import Picker from 'emoji-picker-element/picker'
import type { EmojiClickEvent } from 'emoji-picker-element/shared'
import dataSource from 'emoji-picker-element-data/en/emojibase/data.json?url'
import { useEffect, useEffectEvent, useRef } from 'react'
import { useTheme } from '../ui/theme'

/** `onPick`: an emoji was picked (as text). */
export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const picker = useRef<Picker | null>(null)
  const theme = useTheme((s) => s.theme)
  const picked = useEffectEvent((e: EmojiClickEvent) => e.detail.unicode && onPick(e.detail.unicode))

  useEffect(() => {
    const p = new Picker({ dataSource })
    p.addEventListener('emoji-click', picked)
    box.current?.append(p)
    picker.current = p
    return () => {
      p.removeEventListener('emoji-click', picked)
      p.remove()
    }
  }, [])

  // (Its own light and dark, as the app's.)
  useEffect(() => {
    picker.current?.classList.toggle('dark', theme === 'dark')
    picker.current?.classList.toggle('light', theme === 'light')
  }, [theme])

  return <div ref={box} className="emoji-box" />
}
