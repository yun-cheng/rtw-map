// Draws the question `ask` (dialog.ts) puts up, over everything.
import { useEffect, useRef } from 'react'
import { useDialog } from './dialog'

export function DialogHost() {
  const question = useDialog((s) => s.open)
  const cancelRef = useRef<HTMLButtonElement>(null)
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
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} onClick={() => answer(null)} className={`${button} text-muted hover:bg-canvas hover:text-ink`}>{question.cancel ?? 'Cancel'}</button>
          {question.answers.map((a) => (
            <button key={a.value} onClick={() => answer(a.value)} className={`${button} ${a.danger ? 'bg-danger-soft text-danger hover:bg-danger hover:text-panel' : 'bg-accent text-on-accent hover:opacity-90'}`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
