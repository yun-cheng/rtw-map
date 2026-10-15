// A note shown as Markdown (Notes.tsx): GitHub's flavour (tables, task lists, strikethrough, bare links) and
// ==highlighted== text, as it's written (MarkdownEditor.tsx); no raw HTML.
// Loaded when a note is first shown, like the charts.
import { createContext, useContext, type ComponentProps } from 'react'
import Markdown, { type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Nodes, PhrasingContent, Root } from 'mdast'

/** ==Highlighted== text, in a piece of text (not across bold or a link), shown marked. */
function remarkHighlight() {
  const walk = (node: Nodes) => {
    if (!('children' in node)) return
    node.children = node.children.flatMap((child): Nodes[] => {
      if (child.type !== 'text') return walk(child), [child]
      const parts = child.value.split(/==([^=\s](?:[^=]*[^=\s])?)==/)
      if (parts.length === 1) return [child]
      return parts.flatMap((value, i): PhrasingContent[] => (
        i % 2 ? [{ type: 'emphasis', data: { hName: 'mark' }, children: [{ type: 'text', value }] }] : value ? [{ type: 'text', value }] : []
      ))
    }) as typeof node.children
  }
  return (tree: Root) => walk(tree)
}

/** Ticking a task's box: where its list item starts in the note's text. */
const Toggle = createContext<(offset: number) => void>(() => {})
/** The list item a box is in (its start in the note's text). */
const Item = createContext<number | null>(null)

function ListItem({ node, ...props }: ComponentProps<'li'> & ExtraProps) {
  return <Item.Provider value={node?.position?.start.offset ?? null}><li {...props} /></Item.Provider>
}

function TaskBox({ node: _, ...props }: ComponentProps<'input'> & ExtraProps) {
  const toggle = useContext(Toggle)
  const at = useContext(Item)
  if (props.type !== 'checkbox' || at === null) return <input {...props} />
  return <input type="checkbox" checked={!!props.checked} onChange={() => toggle(at)} aria-label="Done" />
}

const Link = ({ node: _, ...props }: ComponentProps<'a'> & ExtraProps) => <a {...props} target="_blank" rel="noreferrer" />

/** `onToggle`: a task's box was ticked or unticked (where its list item starts in `text`). */
export default function NoteMarkdown({ text, onToggle }: { text: string; onToggle: (offset: number) => void }) {
  return (
    <div className="note-md">
      <Toggle.Provider value={onToggle}>
        <Markdown remarkPlugins={[remarkGfm, remarkHighlight]} components={{ a: Link, li: ListItem, input: TaskBox }}>{text}</Markdown>
      </Toggle.Provider>
    </div>
  )
}
