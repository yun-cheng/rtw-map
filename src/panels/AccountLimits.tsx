import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/kit'

type Row = { email: string; usd: string }

/**
 * For admins: accounts (by email) that get a different daily assistant limit than the default. Saved on the server
 * and used from the next message on; a listed account must have signed in since emails were added to sessions.
 */
export function AccountLimits({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [defaultUsd, setDefaultUsd] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const show = (data: { defaultUsd: number; limits: { email: string; usd: number }[] }) => {
    setDefaultUsd(data.defaultUsd)
    setRows(data.limits.map((l) => ({ email: l.email, usd: String(l.usd) })))
  }

  useEffect(() => {
    fetch('/api/admin/limits')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? 'Could not load the list')
        show(data)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const update = (i: number, patch: Partial<Row>) => {
    setSaved(false)
    setRows((r) => r && r.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  }

  const save = async () => {
    if (!rows) return
    setSaving(true)
    setError(null)
    try {
      const limits = rows.filter((r) => r.email.trim()).map((r) => ({ email: r.email, usd: Number(r.usd) }))
      const res = await fetch('/api/admin/limits', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limits }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Could not save')
      show(data)
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Assistant limits" className="w-full max-w-md rounded-lg border border-line bg-panel p-4 text-[13px] shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-semibold">Assistant limits</h2>
          <button onClick={onClose} className="h-6 w-6 rounded text-muted hover:bg-canvas hover:text-ink" aria-label="Close">✕</button>
        </div>
        <p className="mb-3 text-[12px] text-muted">
          Accounts listed here get their own daily limit{defaultUsd !== null && <> instead of ${defaultUsd.toFixed(2)}</>}. $0 turns the assistant off for
          that account. Changes apply from the next message; someone who signed in before this list existed needs to sign in again.
        </p>
        {rows === null && !error && <p className="text-muted">Loading…</p>}
        {rows && (
          <>
            <div className="flex flex-col gap-1.5">
              {rows.length === 0 && <p className="text-muted">No accounts listed: everyone has the default.</p>}
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="email" value={r.email} placeholder="name@example.com" aria-label="Email"
                    onChange={(e) => update(i, { email: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-line bg-panel px-2 py-1 outline-none focus:border-accent"
                  />
                  <span className="text-muted">$</span>
                  <input
                    type="number" min={0} max={50} step={0.5} value={r.usd} aria-label="Dollars per day"
                    onChange={(e) => update(i, { usd: e.target.value })}
                    className="w-16 rounded-md border border-line bg-panel px-2 py-1 text-right outline-none focus:border-accent"
                  />
                  <span className="text-[12px] text-muted">/day</span>
                  <button
                    onClick={() => { setSaved(false); setRows(rows.filter((_, j) => j !== i)) }}
                    className="h-6 w-6 rounded text-muted hover:bg-canvas hover:text-danger" aria-label={`Remove ${r.email || 'row'}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => { setSaved(false); setRows([...rows, { email: '', usd: String(defaultUsd ?? 1) }]) }}
              className="mt-2 text-[12px] text-accent hover:underline"
            >
              + Add account
            </button>
          </>
        )}
        {error && <p className="mt-2 rounded-md bg-danger-soft px-2 py-1.5 text-[12px] text-danger">{error}</p>}
        <div className="mt-3 flex items-center justify-end gap-2">
          {saved && <span className="text-[12px] text-muted">Saved</span>}
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" disabled={!rows || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
