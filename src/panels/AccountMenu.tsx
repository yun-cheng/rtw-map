import { useEffect, useRef, useState } from 'react'
import { renderGoogleButton, useAccount } from '../agent/account'

/** Top-right account control: "Sign in" when signed out; picture and name with a menu (usage, sign out) when signed in. */
export function AccountMenu() {
  const { loaded, clientId, user, usage, load, signOut } = useAccount()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  useEffect(() => {
    if (!user && clientId && button.current) renderGoogleButton(button.current, clientId, true).catch(() => {})
  }, [user, clientId])

  // Close the menu on a click outside it or Esc.
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

  if (!loaded || !clientId) return null
  if (!user) return <div ref={button} className="h-8 overflow-hidden" />

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pr-2.5 pl-0.5 text-[13px] font-medium hover:bg-canvas"
      >
        {user.picture
          ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-full" />
          : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[12px] text-white">{user.name.slice(0, 1)}</span>}
        <span className="max-w-[10rem] truncate">{user.name.split(' ')[0]}</span>
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-30 mt-1 w-60 rounded-lg border border-line bg-panel p-3 text-[13px] shadow-lg">
          <p className="truncate font-medium">{user.name}</p>
          <p className="text-[12px] text-muted">Signed in with Google</p>
          {usage && (
            <p className="mt-2 text-[12px]">
              Assistant: <b>{usage.remaining}</b> of {usage.limit} messages left today
            </p>
          )}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              void signOut()
            }}
            className="mt-3 w-full rounded-md border border-line px-2 py-1.5 text-left font-medium hover:bg-canvas"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
