import { useEffect, useRef, useState } from 'react'
import { allowanceNote, renderGoogleButton, useAccount } from '../agent/account'
import { useTheme } from '../ui/theme'
import { AccountLimits } from './AccountLimits'

/** Top-right account control: "Sign in" when signed out; the user's picture with a menu (name, usage, sign out) when signed in. */
export function AccountMenu() {
  const { loaded, clientId, user, admin, usage, load, signOut } = useAccount()
  const [open, setOpen] = useState(false)
  const [limits, setLimits] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLDivElement>(null)
  const theme = useTheme((s) => s.theme)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  useEffect(() => {
    if (!user && clientId && button.current) renderGoogleButton(button.current, clientId, true).catch(() => {})
  }, [user, clientId, theme])

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
  // Distinct keys: Google draws its button into this box outside React, so the box must be replaced (not reused
  // for the menu) after signing in, or the button stays next to the menu.
  if (!user) return <div key="sign-in" ref={button} className="h-8 overflow-hidden" />

  return (
    <div key="menu" ref={box} className="relative">
      {limits && <AccountLimits onClose={() => setLimits(false)} />}
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        title="Account"
        className="flex rounded-full border border-line p-0.5 hover:bg-canvas"
      >
        {user.picture
          ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-full" />
          : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[12px] text-on-accent">{user.name.slice(0, 1)}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-30 mt-1 w-60 rounded-lg border border-line bg-panel p-3 text-[13px] shadow-lg">
          <p className="truncate font-medium">{user.name}</p>
          <p className="text-[12px] text-muted">Signed in with Google</p>
          {usage && (
            <p className="mt-2 text-[12px]">
              Assistant: <b>{usage.remaining}%</b> of today's use left
              {allowanceNote(usage) && <span className="block text-muted">{allowanceNote(usage)}</span>}
            </p>
          )}
          {admin && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false)
                setLimits(true)
              }}
              className="mt-3 w-full rounded-md border border-line px-2 py-1.5 text-left font-medium hover:bg-canvas"
            >
              Assistant limits…
            </button>
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
