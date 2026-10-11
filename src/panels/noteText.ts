// Changes to a note's Markdown text (Notes.tsx).

/** The note with the task whose list item starts at `offset` ("- [ ] …", "1. [x] …") ticked or unticked; the same
 *  note if no task starts there. */
export function toggleTask(text: string, offset: number): string {
  const task = /([-*+]|\d+[.)])([ \t]+\[)([ xX])\]/y
  task.lastIndex = offset
  const m = task.exec(text)
  if (!m) return text
  const at = offset + m[1].length + m[2].length
  return text.slice(0, at) + (m[3] === ' ' ? 'x' : ' ') + text.slice(at + 1)
}
