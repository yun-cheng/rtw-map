// A note or a day of the journal as plain text, its Markdown marks left out (noteText.ts): shown for the moment
// before NoteMarkdown.tsx is loaded, rather than the marks themselves.
import { plainLines } from './noteText'

export function PlainNote({ text }: { text: string }) {
  return <p className="text-[13px] leading-normal whitespace-pre-line">{plainLines(text).join('\n')}</p>
}
