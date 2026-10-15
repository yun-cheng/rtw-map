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

/** The lines written, as plain text (a day's preview in a list of days): without a heading's "#", a list's "-", a
 *  to-do's box, a quote's ">", bold, italic or highlight marks, a link's address; empty lines and rules left out. */
export function plainLines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && l !== '&nbsp;' && !/^(-{3,}|\*{3,}|_{3,}|\|?[\s:|-]+\|?)$/.test(l)).map((line) => line
    .replace(/^(>\s*)+/, '')
    .replace(/^(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .replace(/^\||\|$/g, '').replace(/\s*\|\s*/g, ' · ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|==|`)(.+?)\1/g, '$2')
    .replace(/(^|\W)[*_](\S(?:.*?\S)?)[*_](?=\W|$)/g, '$1$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .trim()).filter(Boolean)
}
