// Draws the question `ask` (dialog.ts) puts up, over everything.
import { useEffect, useRef, useState } from 'react'
import { useDialog } from './dialog'

export function DialogHost() {
  const question = useDialog((s) => s.open)
  const cancelRef = useRef<HTMLButtonElement>(null)
  // The question the checkbox was ticked for (none: unticked; another question starts unticked).
  const [toggledFor, setToggledFor] = useState<object | null>(null)
  const toggled = !!question?.toggle && toggledFor === question
  const answer = (value: string | null) => {
    if (!question) return
    useDialog.setState({ open: null })
    question.resolve(value)
  }
  useEffect(() => {
    if (!question) return
    const before = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // (Esc answers the question only: not also the panel under it, which it closes otherwise.)
      e.stopImmediatePropagation()
      useDialog.setState({ open: null })
      question.resolve(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      // Back where the user was (the button that asked), if it's still there.
      if (before?.isConnected) before.focus()
    }
  }, [question])
  if (!question) return null
  const button = 'rounded-lg px-3 py-1.5 text-[13px] font-medium'
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && answer(null)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby={question.message ? 'dialog-message' : undefined} className="w-full max-w-[360px] rounded-xl bg-panel p-4 shadow-xl">
        <h2 id="dialog-title" className="text-[15px] font-semibold">{question.title}</h2>
        {question.message && <p id="dialog-message" className="mt-1.5 text-[13px] whitespace-pre-line text-muted">{question.message}</p>}
        {question.lists && (
          <div className="mt-2 flex max-h-[50vh] flex-col gap-2.5 overflow-y-auto">
            {question.lists.map((l, i) => (
              <div key={i} className={toggled && l.dropped ? 'opacity-50' : ''}>
                {l.heading && (
                  <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                    {l.heading}{toggled && l.dropped && <span className="font-normal tracking-normal normal-case"> · Not kept</span>}
                  </h3>
                )}
                <ul className={`mt-0.5 list-disc pl-5 text-[13px] ${toggled && l.dropped ? 'line-through' : ''}`}>
                  {l.items.map((item, j) => <li key={j}>{item}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
        {question.toggle && (
          <div className="mt-3 text-[13px]">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={toggled} onChange={(e) => setToggledFor(e.target.checked ? question : null)} className="mt-0.5" />
              {question.toggle.label}
            </label>
            {question.toggle.note && <p className="mt-0.5 pl-5 text-[12px] text-muted">{question.toggle.note}</p>}
          </div>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} onClick={() => answer(null)} className={`${button} text-muted hover:bg-canvas hover:text-ink`}>{question.cancel ?? 'Cancel'}</button>
          {question.answers.map((a) => (
            <button key={a.value} onClick={() => answer(toggled ? a.value + question.toggle!.toggled : a.value)} className={`${button} ${a.danger ? 'bg-danger-soft text-danger hover:bg-danger hover:text-panel' : 'bg-accent text-on-accent hover:opacity-90'}`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
