import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { allowanceNote, renderGoogleButton, seenMultiple, setSeenMultiple, useAccount, type Usage } from '../agent/account'
import { NO_SPENT, useChat, type ChatMessage, type Spent } from '../agent/chat'
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

/** Basic Markdown, line by line: # headings, --- rules, "- " / "1. " lists, | tables |, **bold** and *italic*. */
function RichText({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] => s.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b>
      : part.length > 2 && part.startsWith('*') && part.endsWith('*') ? <i key={i}>{part.slice(1, -1)}</i>
        : <Fragment key={i}>{part}</Fragment>)
  const out: ReactNode[] = []
  let list: string[] = []
  let para: string[] = []
  let table: string[] = []
  const flush = () => {
    if (list.length) out.push(<ul key={out.length} className="my-1 list-disc pl-4">{list.map((l, j) => <li key={j}>{inline(l)}</li>)}</ul>)
    if (para.length) out.push(<p key={out.length} className="my-1">{para.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>)
    if (table.length) out.push(<Table key={out.length} rows={table} inline={inline} />)
    list = []
    para = []
    table = []
  }
  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/)
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    const row = /^\s*\|.*\|\s*$/.test(line)
    if (table.length && !row) flush()
    if (!line.trim()) flush()
    else if (row) { if (list.length || para.length) flush(); table.push(line) }
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flush(); out.push(<hr key={out.length} className="my-2 border-line" />) }
    else if (heading) { flush(); out.push(<p key={out.length} className="mt-2 mb-1 font-semibold">{inline(heading[1].replace(/\*\*/g, ''))}</p>) }
    else if (bullet) { if (para.length) flush(); list.push(bullet[1]) }
    else { if (list.length) flush(); para.push(line) }
  }
  flush()
  return <>{out}</>
}

/** A Markdown table: its rows ("| a | b |"), the first one a header when a "|---|---:|" line follows it (which also
 *  aligns columns: ":" on the right for right, on both sides for centred). Scrolls sideways when it's wider than the
 *  chat. */
function Table({ rows, inline }: { rows: string[]; inline: (s: string) => ReactNode[] }) {
  const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  const divider = (row: string) => cells(row).every((c) => /^:?-{2,}:?$/.test(c))
  const head = rows.length > 1 && divider(rows[1]) ? cells(rows[0]) : null
  const body = rows.slice(head ? 2 : 0).filter((r) => !divider(r)).map(cells)
  const align = (head ? cells(rows[1]) : []).map((c) => (c.endsWith(':') ? (c.startsWith(':') ? 'text-center' : 'text-right') : 'text-left'))
  return (
    <div className="my-1.5 overflow-x-auto">
      <table className="border-collapse text-[12px]">
        {head && (
          <thead>
            <tr>{head.map((c, i) => <th key={i} className={`border-b border-line px-2 py-1 font-semibold whitespace-nowrap first:pl-0 ${align[i] ?? 'text-left'}`}>{inline(c)}</th>)}</tr>
          </thead>
        )}
        <tbody>
          {body.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={`border-b border-line/60 px-2 py-1 align-top first:pl-0 ${align[j] ?? 'text-left'}`}>{inline(c)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A number of tokens, short: 850, 12.3k, 1.2M. */
const tokens = (n: number) => (n < 1000 ? String(n) : n < 1e6 ? `${(n / 1000).toFixed(n < 1e4 ? 1 : 0)}k` : `${(n / 1e6).toFixed(1)}M`)
/** US dollars, to a tenth of a cent below a dime. */
const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`

/** A length of time, short: 8s, 2m 05s, 1h 02m. */
function duration(ms: number) {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return s < 60 ? `${s}s` : m < 60 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** What a reply (or the chat) took: how long, the model calls, tokens read and written, and their cost. */
function SpentLine({ spent, ms, label }: { spent: Spent; ms?: number; label?: string }) {
  const parts = [
    ms !== undefined && duration(ms),
    spent.calls > 0 && `${spent.calls} call${spent.calls === 1 ? '' : 's'}`,
    spent.calls > 0 && `${tokens(spent.input)} tokens in, ${tokens(spent.output)} out`,
    spent.calls > 0 && usd(spent.usd),
  ].filter(Boolean)
  return (
    <p
      className="text-[11px] text-muted tabular-nums"
      title={`${ms !== undefined ? `Took ${duration(ms)}; ` : ''}${spent.input.toLocaleString()} tokens read (${spent.cached.toLocaleString()} of them cached, cheaper), ${spent.output.toLocaleString()} written, thinking included; ${usd(spent.usd)} at Gemini's prices`}
    >
      {label}{parts.join(' · ')}
    </p>
  )
}

/** The reply under way: its time so far, counting up, and what it has used. */
function RunningLine({ spent, startedAt }: { spent: Spent; startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return <SpentLine spent={spent} ms={startedAt === null ? undefined : Math.max(0, now - startedAt)} label="So far: " />
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
      {((msg.spent && msg.spent.calls > 0) || msg.ms !== undefined) && <div className="mt-1"><SpentLine spent={msg.spent ?? NO_SPENT} ms={msg.ms} /></div>}
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
      <p className="font-medium">Sign in to plan your trip with the assistant.</p>
      <p className="mt-1 text-muted">It plans the trip to your wishes and preferences, and changes it when you ask: stops, nights, dates, pace or budget, looking up weather, costs, visas and transport from the app's data. Looking around the map and the cities works without signing in.</p>
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
  const { messages, busy, think, spent, startedAt, send, stop, retry, setThink, clear } = useChat()
  const [draft, setDraft] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const view = useViewItems()
  // Items the user chose not to share; keyed by item, so something newly opened is shared again.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const shared = view.filter((v) => !hidden.has(v.key))
  // Undo is offered for the latest reply that changed the trip (undoing older ones would also undo what came after).
  const lastChange = messages.findLastIndex((m) => m.role === 'assistant' && m.changes.length > 0)
  // What this chat has used, the reply under way included, and how long its replies took.
  const total = [...messages.map((m) => (m.role === 'assistant' && m.spent) || NO_SPENT), busy ? spent : NO_SPENT]
    .reduce((a, b) => ({ calls: a.calls + b.calls, input: a.input + b.input, cached: a.cached + b.cached, output: a.output + b.output, usd: a.usd + b.usd }), NO_SPENT)
  // (The time only when every reply has one: replies from before times were kept have none.)
  const replies = messages.flatMap((m) => (m.role === 'assistant' ? [m] : []))
  const totalMs = replies.length && replies.every((m) => m.ms !== undefined) ? replies.reduce((sum, m) => sum + m.ms!, 0) : undefined

  // To the latest message, scrolling only the list (scrollIntoView would also scroll the phone's sheet around it).
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight
  }, [messages.length, busy])

  const submit = (text = draft) => {
    if (!text.trim() || busy || outOfAllowance) return
    setDraft('')
    void send(text, shared)
  }

  return (
    <div className="flex h-full flex-col">
      {(usage || total.calls > 0) && (
        <div className="flex items-center gap-3 border-b border-line px-4 py-1.5 text-[12px]">
          {total.calls > 0 && <SpentLine spent={total} ms={totalMs} label="This chat: " />}
          {usage && <span className="ml-auto"><UsageLine usage={usage} /></span>}
        </div>
      )}
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
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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
            {busy && (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-[13px] text-muted">{think ? 'Thinking it through…' : 'Working on it…'}</p>
                  <RunningLine spent={spent} startedAt={startedAt} />
                </div>
                <Button variant="ghost" className="!py-0.5 text-[12px]" onClick={stop}>■ Stop</Button>
              </div>
            )}
          </div>
        )}
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
          {busy
            ? <Button className="ml-auto" onClick={stop}>■ Stop</Button>
            : <Button variant="primary" className="ml-auto" disabled={!draft.trim() || outOfAllowance} onClick={() => submit()}>Send</Button>}
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
