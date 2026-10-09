import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { allowanceNote, renderGoogleButton, seenMultiple, setSeenMultiple, useAccount, type Usage } from '../agent/account'
import { useChat, type ChatMessage } from '../agent/chat'
import { viewItems, type ViewItem } from '../agent/view'
import { useTrip } from '../store/trip'
import { Button } from '../ui/kit'
import { useTheme } from '../ui/theme'

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

/** A reply, with its changes (and Undo) and, on the latest reply, buttons to answer it with a click. */
function AssistantMessage({ msg, index, canUndo, onChoose, onRetry }: {
  msg: Extract<ChatMessage, { role: 'assistant' }>
  index: number
  canUndo: boolean
  /** Set on the latest reply when a choice can be sent. */
  onChoose?: (text: string) => void
  onRetry?: () => void
}) {
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
      {(onChoose && msg.choices?.length) || (onRetry && msg.error) ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {msg.error && onRetry && <ChoiceButton onClick={onRetry}>↻ Try again</ChoiceButton>}
          {!msg.error && onChoose && msg.choices?.map((c) => <ChoiceButton key={c} onClick={() => onChoose(c)}>{c}</ChoiceButton>)}
        </div>
      ) : null}
    </div>
  )
}

function ChoiceButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-full border border-accent/50 px-2.5 py-1 text-left text-[12px] text-accent hover:bg-accent-soft">
      {children}
    </button>
  )
}

const resetTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** "Sign in with Google" card, shown instead of the chat until the user signs in. */
function SignIn() {
  const { clientId, error } = useAccount()
  const button = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const theme = useTheme((s) => s.theme)
  useEffect(() => {
    if (clientId && button.current) renderGoogleButton(button.current, clientId).catch(() => setFailed(true))
  }, [clientId, theme])
  return (
    <div className="px-4 py-4 text-[13px]">
      <p className="font-medium">Plan and change your trip by chatting with the assistant.</p>
      <p className="mt-1 text-muted">It can add or remove stops, change nights, dates, pace or budget, and look up weather, costs, visas and transport from the app's data. Everything else in the app works without signing in.</p>
      <p className="mt-3 text-muted">Sign in with Google to use it: each account gets a free daily allowance. We keep only an anonymous account ID, how much of it you've used today, and the trips you save; your email is only checked against the list of accounts with a different limit, never saved.</p>
      {clientId ? <div ref={button} className="mt-3 min-h-[44px]" /> : <p className="mt-3 rounded-md bg-warn-soft px-2 py-1.5 text-warn">Sign-in isn't set up yet.</p>}
      {failed && <p className="mt-2 text-danger">Couldn't load Google sign-in. Check your connection or ad blocker.</p>}
      {error && <p className="mt-2 text-danger">{error}</p>}
    </div>
  )
}

function UsageLine({ usage }: { usage: Usage }) {
  const low = usage.remaining <= 15
  return (
    <span
      className={low ? 'font-semibold text-warn' : 'text-muted'}
      title={`Counted by how much the assistant reads and writes: a quick question uses little, Plan with AI or Think harder much more. Resets at ${resetTime(usage.resetsAt)} (midnight UTC).`}
    >
      {usage.remaining}% of today's assistant use left
      {allowanceNote(usage) && usage.multiple !== 0 && <> · {allowanceNote(usage)}</>}
    </span>
  )
}

/** The assistant tab: sign-in first, then the chat. */
export function AssistantPanel() {
  const { loaded, user } = useAccount()
  if (!loaded) return <p className="px-4 py-4 text-[13px] text-muted">Loading…</p>
  return user ? <Chat /> : <SignIn />
}

/** Chat with the trip assistant (Gemini), which can answer questions and change the trip; every change can be undone. */
function Chat() {
  const usage = useAccount((s) => s.usage)
  const sub = useAccount((s) => s.user?.sub)
  const outOfAllowance = usage?.remaining === 0
  const turnedOff = usage?.multiple === 0
  // Tell the user once when their account's allowance was raised (lowering it needs no notice).
  const multiple = usage?.multiple ?? 1
  const [seen, setSeen] = useState(() => (sub ? seenMultiple(sub) : 1))
  useEffect(() => {
    if (sub) setSeen(seenMultiple(sub))
  }, [sub])
  useEffect(() => {
    if (sub && multiple < seen) {
      setSeenMultiple(sub, multiple)
      setSeen(multiple)
    }
  }, [sub, multiple, seen])
  const raised = !!sub && multiple > 1 && multiple > seen
  const { messages, busy, think, send, retry, setThink, clear } = useChat()
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const view = useViewItems()
  // Items the user chose not to share; keyed by item, so something newly opened is shared again.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const shared = view.filter((v) => !hidden.has(v.key))
  // Undo is offered for the latest reply that changed the trip (undoing older ones would also undo what came after).
  const lastChange = messages.findLastIndex((m) => m.role === 'assistant' && m.changes.length > 0)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, busy])

  const submit = (text = draft) => {
    if (!text.trim() || busy || outOfAllowance) return
    setDraft('')
    void send(text, shared)
  }

  return (
    <div className="flex h-full flex-col">
      {usage && <div className="border-b border-line px-4 py-1.5 text-right text-[12px]"><UsageLine usage={usage} /></div>}
      {raised && (
        <div className="flex items-start gap-2 border-b border-line bg-accent-soft px-4 py-2 text-[12px]">
          <p className="flex-1">🎉 Your daily assistant allowance was raised to <b>{allowanceNote(usage)}</b>: more room for Plan with AI and long changes.</p>
          <button
            onClick={() => {
              setSeenMultiple(sub!, multiple)
              setSeen(multiple)
            }}
            className="text-muted hover:text-ink" aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="text-[13px]">
            <p className="font-medium">Ask the assistant to plan or change your trip.</p>
            <p className="mt-1 text-muted">It can add or remove stops, change nights, dates, pace or budget, and look up weather, costs, visas and transport from the app's data. Changes apply right away; each can be undone.</p>
            <div className="mt-3 flex flex-col gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => submit(e)} disabled={outOfAllowance} className="rounded-md border border-line px-2.5 py-1.5 text-left text-[12px] hover:bg-canvas">{e}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="ml-8 flex flex-col items-end gap-0.5 self-end">
                  <div className="rounded-lg bg-accent px-3 py-2 text-[13px] whitespace-pre-wrap text-on-accent">{m.text}</div>
                  {m.view && <div className="text-[11px] text-muted" title="What you were looking at, sent with this message">Context: {m.view.join(', ')}</div>}
                </div>
              ) : (
                <AssistantMessage
                  key={i} msg={m} index={i} canUndo={i === lastChange}
                  {...(i === messages.length - 1 && !busy && !outOfAllowance && {
                    onChoose: (text: string) => void send(text, shared, { think: m.think }),
                    onRetry: () => void retry(i, shared),
                  })}
                />
              ),
            )}
            {busy && <p className="text-[13px] text-muted">{think ? 'Thinking it through…' : 'Working on it…'}</p>}
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="border-t border-line px-3 py-2">
        {outOfAllowance && usage && (
          <p className="mb-1.5 rounded-md bg-warn-soft px-2 py-1.5 text-[12px] text-warn">
            {turnedOff
              ? <>The assistant is turned off for this account. You can still edit the trip by hand.</>
              : <>You've used today's assistant allowance. More at {resetTime(usage.resetsAt)}. You can still edit the trip by hand.</>}
          </p>
        )}
        {view.length > 0 && (
          <ViewChips
            items={view}
            hidden={hidden}
            toggle={(key) => setHidden((h) => {
              const next = new Set(h)
              if (!next.delete(key)) next.add(key)
              return next
            })}
          />
        )}
        <textarea
          data-assistant-input
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
          disabled={outOfAllowance}
          placeholder="Ask or tell the assistant… (Enter to send)"
          className="w-full resize-none rounded-md border border-line bg-panel px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
        />
        <div className="mt-1 flex items-center gap-2 text-[12px]">
          <label className="flex items-center gap-1.5" title="Slower and a little more expensive, better for complex requests">
            <input type="checkbox" checked={think} onChange={(e) => setThink(e.target.checked)} /> Think harder
          </label>
          {messages.length > 0 && <button onClick={clear} disabled={busy} className="text-muted hover:text-ink disabled:opacity-40">New chat</button>}
          <Button variant="primary" className="ml-auto" disabled={busy || !draft.trim() || outOfAllowance} onClick={() => submit()}>Send</Button>
        </div>
      </div>
    </div>
  )
}

/** The parts of the current view (open city or journey, map view) that can be shared; updates as the view changes. */
function useViewItems(): ViewItem[] {
  // Re-render on the parts of the state the items are built from.
  useTrip((s) => s.selected)
  useTrip((s) => s.cityTab)
  useTrip((s) => s.layer)
  useTrip((s) => s.layerMonth)
  useTrip((s) => s.nearbyKind)
  useTrip((s) => s.weatherBy)
  useTrip((s) => s.routeBy)
  useTrip((s) => s.plan)
  return viewItems()
}

/** What will be shared with the next message; each chip can be left out (and added back). */
function ViewChips({ items, hidden, toggle }: { items: ViewItem[]; hidden: Set<string>; toggle: (key: string) => void }) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-muted" title="What you're looking at, sent with your next message so the assistant knows what &quot;here&quot; or &quot;this city&quot; means">Context:</span>
      {items.map((v) => {
        const off = hidden.has(v.key)
        return (
          <button
            key={v.key}
            onClick={() => toggle(v.key)}
            title={off ? 'Not shared: click to share it with your next message' : 'Click to leave this out of your next message'}
            aria-pressed={!off}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${off ? 'border-dashed border-muted/50 text-muted' : 'border-accent bg-accent-soft text-ink'}`}
          >
            <span aria-hidden className={`w-2.5 text-center font-semibold ${off ? '' : 'text-accent'}`}>{off ? '+' : '✓'}</span>
            {v.label}
          </button>
        )
      })}
    </div>
  )
}
