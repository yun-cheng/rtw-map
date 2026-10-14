// The trip's chats with the assistant (worker/chats.ts), in a panel from the left over the whole app (as Settings is,
// from the right), opened by Chats at the top of the assistant tab: the open chat, then the past ones, the latest first. A click opens one, the open one
// set aside in its place (store/saved.ts); a chat set aside keeps no Undo.
import { SquarePen, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useChat } from '../agent/chat'
import { listChats, switchChat } from '../store/saved'
import { CHAT_LIMITS, chatSummary, type ChatSummary } from '../../worker/chats'

/** "14:05" today, "14 Oct" this year, else "14 Oct 2025". */
function when(ms: number) {
  const d = new Date(ms)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }) })
}

const count = (n: number) => `${n} message${n === 1 ? '' : 's'}`

/** `open`: shown (it slides in); `onClose`: hides it (also on Escape, a click beside it, or once a chat is opened). */
export function ChatList({ open, onClose }: { open: boolean; onClose: () => void }) {
  const messages = useChat((s) => s.messages)
  const busy = useChat((s) => s.busy)
  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The chat being opened ('new': a new one). */
  const [opening, setOpening] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    let gone = false
    listChats().then((c) => !gone && setChats(c), (e: Error) => !gone && setError(e.message))
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      gone = true
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const close = () => {
    setError(null)
    onClose()
  }
  const go = async (id: string | null) => {
    setOpening(id ?? 'new')
    setError(null)
    const out = await switchChat(id)
    setOpening(null)
    if (typeof out === 'string') return setError(out)
    setChats(out)
    onClose()
  }
  const current = messages.length ? chatSummary({ messages }, '', 0) : null
  const locked = busy || opening !== null

  // (In the page itself: inside the phone's sheet, which moves, it would be held to the sheet.)
  return createPortal(
    <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open} inert={!open}>
      <div onClick={close} className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} />
      <div
        role="dialog"
        aria-label="Chats"
        className={`absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-canvas shadow-xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-4 font-semibold">
          Chats
          <button onClick={close} aria-label="Close chats" className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 text-[13px]">
          {current && (
            <button onClick={() => void go(null)} disabled={locked} className="mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 font-medium text-accent hover:bg-accent-soft disabled:opacity-50">
              <SquarePen size={15} />
              {opening === 'new' ? 'Starting a new chat…' : 'New chat'}
            </button>
          )}
          <ul className="flex flex-col gap-0.5">
            <li className="rounded-md bg-accent-soft px-2.5 py-2" aria-current="true">
              <p className="line-clamp-2">{current ? current.title || 'Untitled chat' : 'New chat'}</p>
              <p className="text-[11px] text-muted">Open now{current && ` · ${count(current.messages)}`}</p>
            </li>
            {chats?.map((c) => (
              <li key={c.id}>
                <button onClick={() => void go(c.id)} disabled={locked} className="w-full rounded-md px-2.5 py-2 text-left hover:bg-panel disabled:opacity-50">
                  <p className="line-clamp-2">{c.title || 'Untitled chat'}</p>
                  <p className="text-[11px] text-muted">{opening === c.id ? 'Opening…' : `${when(c.updated)} · ${count(c.messages)}`}</p>
                </button>
              </li>
            ))}
          </ul>
          {chats === null && !error && <p className="px-2.5 py-2 text-[12px] text-muted">Loading…</p>}
          {chats?.length === 0 && <p className="px-2.5 py-2 text-[12px] text-muted">No other chats yet. New chat keeps this one here.</p>}
          {busy && <p className="px-2.5 py-2 text-[12px] text-muted">The assistant is answering: wait for it, or stop it, to open another chat.</p>}
          {error && <p className="px-2.5 py-2 text-[12px] text-danger">{error}</p>}
        </div>
        <p className="border-t border-line bg-panel px-4 py-2 text-[11px] text-muted">The last {CHAT_LIMITS.kept} chats are kept with this trip.</p>
      </div>
    </div>,
    document.body,
  )
}
