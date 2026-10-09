import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAccount } from '../agent/account'
import { dataset as ds } from '../data/dataset'
import { useTrip } from '../store/trip'
import { shortDate } from '../ui/format'
import { Section, Sections, Segmented } from '../ui/kit'
import { useTheme, type ThemeChoice } from '../ui/theme'
import { useMoney } from '../ui/useMoney'
import { AccountLimits } from './AccountLimits'
import { AccountDetails, AccountMenu } from './AccountMenu'
import { TripSwitcher } from './TripSwitcher'

const THEMES: { value: ThemeChoice; label: string }[] = [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'Device' }]

/**
 * On a phone, the top bar's contents (trips, currency, temperature unit, theme, account) in a panel that slides in
 * from the right, opened from the gear over the map; the map gets the top bar's room.
 */
export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { plan, input, setCurrency, tempUnit, setTempUnit, localNames, setLocalNames } = useTrip()
  const { currency } = useMoney()
  const { choice, setChoice } = useTheme()
  const user = useAccount((s) => s.user)
  const [limits, setLimits] = useState(false)

  // Esc closes it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} />
      <div
        role="dialog"
        aria-label="Settings"
        className={`absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col bg-canvas shadow-xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-4 font-semibold">
          <img src="/favicon.svg" alt="" className="h-5 w-5" />
          rtw-map
          <button onClick={onClose} aria-label="Close settings" className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Sections>
            <Section title="Trip">
              <div className="flex flex-wrap items-center gap-2"><TripSwitcher /></div>
              {plan && <p className="mt-2 text-[13px] text-muted">{shortDate(input.startDate)} – {shortDate(input.endDate)} · {plan.totalNights} nights · {plan.stops.length} stops</p>}
            </Section>
            <Section title="Display">
              <div className="flex flex-col gap-3 text-[13px]">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-muted">Currency</span>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-md border border-line bg-panel px-2 py-1 font-medium">
                    {ds.fx.display.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">Temperature</span>
                  <div className="w-32"><Segmented value={tempUnit} onChange={setTempUnit} options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]} /></div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">Theme</span>
                  <div className="w-48"><Segmented value={choice} onChange={setChoice} options={THEMES} /></div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">Local names on the map</span>
                  <div className="w-32"><Segmented value={localNames ? 'show' : 'hide'} onChange={(v) => setLocalNames(v === 'show')} options={[{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide' }]} /></div>
                </div>
              </div>
            </Section>
            {user ? (
              // Signed in: the account shown as it is (not behind the avatar's menu, as in the top bar).
              <Section title="Account">
                <div className="-mx-4 -mb-3 overflow-hidden rounded-b-xl">
                  <AccountDetails top="pt-0" onLimits={() => setLimits(true)} onSignOut={onClose} />
                </div>
                {limits && <AccountLimits onClose={() => setLimits(false)} />}
              </Section>
            ) : (
              <Section title="Account" aside={<AccountMenu />}>
                <p className="text-[13px] text-muted">Sign in to save your trips to your account, keep several and use the assistant.</p>
              </Section>
            )}
          </Sections>
        </div>
      </div>
    </div>
  )
}
