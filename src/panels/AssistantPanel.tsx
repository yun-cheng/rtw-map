import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useChat, type ChatMessage } from '../agent/chat'
import { Button } from '../ui/kit'

const EXAMPLES = [
  'Plan 3 weeks in the Balkans in May, I like food and hiking',
  'Spend 2 more days in Kraków and skip Bratislava',
  'Which stops will be too hot in July?',
  'Is Taiwan visa-free for my passport?',
]

/** Basic Markdown, line by line: # headings, --- rules, "- " / "1. " lists, **bold** and *italic*. */
function RichText({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] => s.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b>
      : part.length > 2 && part.startsWith('*') && part.endsWith('*') ? <i key={i}>{part.slice(1, -1)}</i>
        : <Fragment key={i}>{part}</Fragment>)
  const out: ReactNode[] = []
  let list: string[] = []
  let para: string[] = []
  const flush = () => {
    if (list.length) out.push(<ul key={out.length} className="my-1 list-disc pl-4">{list.map((l, j) => <li key={j}>{inline(l)}</li>)}</ul>)
    if (para.length) out.push(<p key={out.length} className="my-1">{para.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>)
    list = []
    para = []
  }
  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/)
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (!line.trim()) flush()
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flush(); out.push(<hr key={out.length} className="my-2 border-line" />) }
    else if (heading) { flush(); out.push(<p key={out.length} className="mt-2 mb-1 font-semibold">{inline(heading[1].replace(/\*\*/g, ''))}</p>) }
    else if (bullet) { if (para.length) flush(); list.push(bullet[1]) }
    else { if (list.length) flush(); para.push(line) }
  }
  flush()
  return <>{out}</>
}

function AssistantMessage({ msg, index, canUndo }: { msg: Extract<ChatMessage, { role: 'assistant' }>; index: number; canUndo: boolean }) {
  const undo = useChat((s) => s.undo)
  return (
    <div className="text-[13px] leading-relaxed">
      {msg.error ? <p className="rounded-md bg-danger-soft px-2 py-1.5 text-danger">{msg.error}</p> : <RichText text={msg.text} />}
      {msg.steps.some((s) => !s.ok) && (
        <ul className="mt-1 text-[11px] text-muted">
          {msg.steps.filter((s) => !s.ok).map((s, i) => <li key={i}>⚠︎ {s.summary}</li>)}
        </ul>
      )}
      {msg.changes.length > 0 && (
        <div className={`mt-2 rounded-md border px-2.5 py-2 ${msg.undone ? 'border-line text-muted' : 'border-accent/40 bg-accent-soft'}`}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider uppercase">{msg.undone ? 'Undone' : 'Changed your trip'}</span>
            {canUndo && !msg.undone && <Button variant="ghost" className="!px-1.5 !py-0.5 text-[12px]" onClick={() => undo(index)}>↶ Undo</Button>}
          </div>
          <ul className={`list-disc pl-4 text-[12px] ${msg.undone ? 'line-through' : ''}`}>
            {msg.changes.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Chat with the trip assistant (Gemini), which can answer questions and change the trip; every change can be undone. */
export function AssistantPanel() {
  const { messages, busy, think, send, setThink, clear } = useChat()
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  // Undo is offered for the latest reply that changed the trip (undoing older ones would also undo what came after).
  const lastChange = messages.findLastIndex((m) => m.role === 'assistant' && m.changes.length > 0)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, busy])

  const submit = (text = draft) => {
    if (!text.trim() || busy) return
    setDraft('')
    void send(text)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="text-[13px]">
            <p className="font-medium">Ask the assistant to plan or change your trip.</p>
            <p className="mt-1 text-muted">It can add or remove stops, change nights, dates, pace or budget, and look up weather, costs, visas and transport from the app's data. Changes apply right away; each can be undone.</p>
            <div className="mt-3 flex flex-col gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => submit(e)} className="rounded-md border border-line px-2.5 py-1.5 text-left text-[12px] hover:bg-canvas">{e}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="ml-8 self-end rounded-lg bg-accent px-3 py-2 text-[13px] whitespace-pre-wrap text-white">{m.text}</div>
              ) : (
                <AssistantMessage key={i} msg={m} index={i} canUndo={i === lastChange} />
              ),
            )}
            {busy && <p className="text-[13px] text-muted">{think ? 'Thinking it through…' : 'Working on it…'}</p>}
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="border-t border-line px-3 py-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Ask or tell the assistant… (Enter to send)"
          className="w-full resize-none rounded-md border border-line bg-panel px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
        />
        <div className="mt-1 flex items-center gap-2 text-[12px]">
          <label className="flex items-center gap-1.5" title="Slower and a little more expensive, better for complex requests">
            <input type="checkbox" checked={think} onChange={(e) => setThink(e.target.checked)} /> Think harder
          </label>
          {messages.length > 0 && <button onClick={clear} disabled={busy} className="text-muted hover:text-ink disabled:opacity-40">New chat</button>}
          <Button variant="primary" className="ml-auto" disabled={busy || !draft.trim()} onClick={() => submit()}>Send</Button>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-muted">Messages and your trip are sent to Google Gemini to answer. Don't share personal details. The assistant can make mistakes; check visa and safety information with official sources.</p>
      </div>
    </div>
  )
}
