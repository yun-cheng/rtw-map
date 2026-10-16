import { ChevronRight, LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { renderGoogleButton, times, useAccount } from '../agent/account'
import { useTheme } from '../ui/theme'
import { AccountLimits } from './AccountLimits'
import { AiApps } from './AiApps'

/** Top-right account control: "Sign in" when signed out; the user's picture with a menu (name, sign out) when signed in. */
export function AccountMenu() {
  const { loaded, clientId, user, load } = useAccount()
  const [open, setOpen] = useState(false)
  const [limits, setLimits] = useState(false)
  const [apps, setApps] = useState(false)
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
      {apps && <AiApps onClose={() => setApps(false)} />}
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
        <div role="menu" className="absolute top-full right-0 z-30 mt-1 w-64 overflow-hidden rounded-lg border border-line bg-panel text-[13px] shadow-lg">
          <AccountDetails menu onLimits={() => { setOpen(false); setLimits(true) }} onApps={() => { setOpen(false); setApps(true) }} onSignOut={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

/**
 * The signed-in account: picture and name, and its assistant allowance if it's more than the usual one (today's use
 * is in the Assistant), then AI apps, Assistant limits (admins) and
 * Sign out as full-width rows. In the top bar's account menu (`menu`) and, as it is, in a phone's settings panel
 * (`top`: the padding above it, none under the card's own heading). `onApps` and `onLimits` open their dialogs;
 * `onSignOut` runs before signing out (e.g. to close the menu).
 */
export function AccountDetails({ menu, top = 'pt-3', onApps, onLimits, onSignOut }: {
  menu?: boolean; top?: string; onApps: () => void; onLimits: () => void; onSignOut?: () => void
}) {
  const { user, admin, usage, signOut } = useAccount()
  if (!user) return null
  const multiple = usage?.multiple
  const role = menu ? 'menuitem' : undefined
  return (
    <div className="text-[13px]">
      <div className={`px-4 ${top}`}>
        <div className="flex items-center gap-3">
          {user.picture
            ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full" />
            : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-[15px] font-semibold text-on-accent">{user.name.slice(0, 1)}</span>}
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold">{user.name}</p>
            <p className="text-[12px] text-muted">Signed in with Google</p>
            {multiple !== undefined && multiple > 1 && <p className="text-[12px] text-accent">{times(multiple)} AI usage</p>}
          </div>
        </div>
      </div>
      <div className="mt-3 border-t border-line">
        <button role={role} onClick={onApps} className="flex w-full items-center justify-between border-b border-line px-4 py-2.5 text-left font-medium hover:bg-canvas">
          AI apps
          <ChevronRight size={16} className="text-muted" />
        </button>
        {admin && (
          <button role={role} onClick={onLimits} className="flex w-full items-center justify-between border-b border-line px-4 py-2.5 text-left font-medium hover:bg-canvas">
            Assistant limits
            <ChevronRight size={16} className="text-muted" />
          </button>
        )}
        <button
          role={role}
          onClick={() => {
            onSignOut?.()
            void signOut()
          }}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left font-medium text-danger hover:bg-canvas"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  )
}
