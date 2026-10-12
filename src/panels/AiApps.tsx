import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/kit'

type App = { id: string; client: string; redirect: string; scope: string; created: number; used: number }

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Other apps' AI assistants (Claude, ChatGPT, Codex, Gemini CLI) connected to the trips through the MCP server
 * (worker/mcp.ts): its address to add in them, and the apps allowed so far, each to disconnect.
 */
export function AiApps({ onClose }: { onClose: () => void }) {
  const [apps, setApps] = useState<App[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const url = `${location.origin}/mcp`

  const load = () =>
    fetch('/api/connections')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? 'Could not load the apps')
        setApps(data.apps)
      })
      .catch((e: Error) => setError(e.message))

  useEffect(() => void load(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(text)
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500)
    })
  }

  const disconnect = async (app: App) => {
    setError(null)
    const res = await fetch(`/api/connections/${app.id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) return setError('Could not disconnect it: try again.')
    setApps((list) => list && list.filter((a) => a.id !== app.id))
  }

  const commands = [
    ['Claude Code', `claude mcp add --transport http rtw-map ${url}`],
    ['Codex', `codex mcp add rtw-map --url ${url}`],
    ['Gemini CLI', `gemini mcp add --transport http rtw-map ${url}`],
  ]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-12" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="AI apps" className="w-full max-w-md rounded-lg border border-line bg-panel p-4 text-[13px] shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-semibold">AI apps</h2>
          <button onClick={onClose} className="h-6 w-6 rounded text-muted hover:bg-canvas hover:text-ink" aria-label="Close">✕</button>
        </div>
        <p className="mb-3 text-[12px] text-muted">
          Connect the assistant you already use (Claude, ChatGPT, Codex, Gemini) and it can read your trips (plans, costs, the app's city data,
          your journal and My visit) and, if you let it, change them: its changes show here, each with Undo. You sign in here once for each app.
        </p>

        <p className="mb-1 font-medium">Server address</p>
        <div className="flex items-center gap-1.5">
          <input readOnly value={url} aria-label="Server address" onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1 font-mono text-[12px] outline-none max-md:!text-[16px]" />
          <Button onClick={() => copy(url)} aria-label="Copy the address">{copied === url ? <Check size={14} /> : <Copy size={14} />}</Button>
        </div>
        <p className="mt-1.5 text-[12px] text-muted">In Claude or ChatGPT, add it as a custom connector. In a terminal:</p>
        <div className="mt-1 flex flex-col gap-1">
          {commands.map(([name, command]) => (
            <div key={name} className="flex items-center gap-1.5">
              <span className="w-20 shrink-0 text-[12px] text-muted">{name}</span>
              <code className="min-w-0 flex-1 truncate rounded bg-canvas px-1.5 py-0.5 text-[11px]" title={command}>{command}</code>
              <button onClick={() => copy(command)} className="h-6 w-6 shrink-0 rounded text-muted hover:bg-canvas hover:text-ink" aria-label={`Copy the ${name} command`}>
                {copied === command ? <Check size={13} className="mx-auto" /> : <Copy size={13} className="mx-auto" />}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-4 mb-1 font-medium">Connected</p>
        {apps === null && !error && <p className="text-muted">Loading…</p>}
        {apps?.length === 0 && <p className="text-muted">No apps connected yet.</p>}
        {apps && apps.length > 0 && (
          <ul className="divide-y divide-line rounded-md border border-line">
            {apps.map((a) => (
              <li key={a.id} className="flex items-center gap-2 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.client}</p>
                  <p className="truncate text-[11px] text-muted">
                    {a.scope.split(' ').includes('trips:write') ? 'Reads and changes trips' : 'Reads trips'} · {a.redirect} · since {day(a.created)} · last used {day(a.used)}
                  </p>
                </div>
                <Button onClick={() => void disconnect(a)} className="text-danger">Disconnect</Button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-2 rounded-md bg-danger-soft px-2 py-1.5 text-[12px] text-danger">{error}</p>}
        <div className="mt-3 flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
