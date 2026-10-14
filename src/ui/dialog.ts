// The app's own questions, in place of the browser's confirm(): a title, a line or two saying what happens (and lists,
// under headings, if it's about several things), and the answers, a risky one in red; a checkbox (`toggle`) can change
// what the answers do, with a note under it saying how. `ask` shows one and resolves with the chosen answer's value, or null for Cancel, Esc or
// a click outside (Cancel has the focus, so Enter never removes anything by accident). One at a time: asking again
// cancels the question still open. `DialogHost` (DialogHost.tsx, in App) draws it.
import { create } from 'zustand'

export type Answer = { label: string; value: string; danger?: boolean }
export type Question = {
  title: string; message?: string; answers: Answer[]; cancel?: string
  /** Lists under headings (`dropped`: shown struck through while the toggle is ticked, as what it leaves out). */
  lists?: { heading?: string; items: string[]; dropped?: boolean }[]
  /** A checkbox under the lists, with a note under it: ticked, an answer resolves as `value` + `toggled`. */
  toggle?: { label: string; note?: string; toggled: string }
}

export const useDialog = create<{ open: (Question & { resolve: (value: string | null) => void }) | null }>(() => ({ open: null }))

export function ask(question: Question): Promise<string | null> {
  return new Promise((resolve) => {
    useDialog.getState().open?.resolve(null)
    useDialog.setState({ open: { ...question, resolve } })
  })
}

/** A yes-or-no question: true for `ok` (red by default: "Remove", "Delete"). */
export async function confirm(title: string, { message, ok = 'OK', danger = true }: { message?: string; ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return (await ask({ title, message, answers: [{ label: ok, value: 'ok', danger }] })) === 'ok'
}
