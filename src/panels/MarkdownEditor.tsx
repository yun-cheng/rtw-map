// A note or a day of the journal written as it's shown (Notes.tsx, Journal.tsx): Markdown applies as it's typed ("# "
// a heading, "- " a list, "[ ] " a to-do, **bold**…), or from the toolbar, and it's saved as Markdown text (shown by
// NoteMarkdown.tsx where it's read). Loaded when an editor is first shown, like the charts.
import { Extension, InputRule, type JSONContent } from '@tiptap/core'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { Plugin } from '@tiptap/pm/state'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Heading, Italic, Link, List, ListOrdered, ListTodo, Quote, Strikethrough, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/** Keeps the text, as Markdown, within `max` characters: a change that would make it longer is not made. */
const Limit = Extension.create<{ max: number }>({
  name: 'limit',
  addOptions: () => ({ max: Infinity }),
  addProseMirrorPlugins() {
    const { editor, options } = this
    const size = (doc: JSONContent) => editor.markdown?.serialize(doc).length ?? 0
    return [new Plugin({
      // (One that doesn't make it longer is: text that came in longer, e.g. from another device, can still be cut.)
      filterTransaction: (tr, state) => !tr.docChanged || tr.getMeta('limit') === false || size(tr.doc.toJSON()) <= options.max || size(tr.doc.toJSON()) <= size(state.doc.toJSON()),
    })]
  },
})

/** "[ ] " (or "[x] ") typed at the start of a list's item, as "- [ ] " is written: the item becomes a to-do. */
const ListToTask = Extension.create({
  name: 'listToTask',
  addInputRules: () => [new InputRule({
    find: /^\s*\[([ xX])?\]\s$/,
    handler: ({ state, range, match, chain }) => {
      const { $from } = state.selection
      if ($from.node(-1)?.type.name !== 'listItem' || $from.node(-2)?.type.name !== 'bulletList') return null
      chain().deleteRange(range).liftListItem('listItem').toggleTaskList().updateAttributes('taskItem', { checked: /x/i.test(match[1] ?? '') }).run()
    },
  })],
})

/** `value`, Markdown, changed as it's typed (`onChange`); set from elsewhere (another device, Undo), it's shown. */
export default function MarkdownEditor({ value, onChange, max, placeholder, label, autoFocus, tall }: {
  value: string; onChange: (text: string) => void; max: number; placeholder: string; label: string; autoFocus?: boolean; tall?: boolean
}) {
  // The text last sent or shown, to tell a change from elsewhere.
  const shown = useRef(value)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
      TaskList, TaskItem.configure({ nested: true }), TableKit.configure({ table: { resizable: false } }),
      ListToTask, Placeholder.configure({ placeholder }), Markdown, Limit.configure({ max }),
    ],
    // (Without empty lines after it, kept by an older version: they'd be empty lines here.)
    content: value.trimEnd(),
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        'aria-label': label, 'aria-multiline': 'true', role: 'textbox',
        // (16px on a phone: smaller, iOS zooms the page in to type.)
        class: `note-md md-editor ${tall ? 'min-h-48' : 'min-h-16'} px-2.5 py-1.5 outline-none max-md:!text-[16px]`,
      },
    },
    onUpdate: ({ editor }) => {
      // (Without the empty lines after it: the cursor's line, as it's typed.)
      const text = editor.getMarkdown().trimEnd()
      shown.current = text
      onChange(text)
    },
  })

  useEffect(() => {
    if (!editor || value === shown.current) return
    shown.current = value
    editor.chain().setMeta('limit', false).setMeta('addToHistory', false).setContent(value.trimEnd(), { contentType: 'markdown', emitUpdate: false }).run()
  }, [editor, value])

  return (
    <div className="rounded-md border border-line bg-panel focus-within:border-accent">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

type Tool = { icon: LucideIcon; label: string; key?: string; on: (e: Editor) => boolean; run: (e: Editor) => void }
const TOOLS: Tool[][] = [
  [
    { icon: Heading, label: 'Heading', key: '#', on: (e) => e.isActive('heading'), run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
    { icon: Bold, label: 'Bold', key: '⌘B', on: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
    { icon: Italic, label: 'Italic', key: '⌘I', on: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
    { icon: Strikethrough, label: 'Strikethrough', on: (e) => e.isActive('strike'), run: (e) => e.chain().focus().toggleStrike().run() },
  ],
  [
    { icon: List, label: 'List', key: '-', on: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
    { icon: ListOrdered, label: 'Numbered list', key: '1.', on: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
    { icon: ListTodo, label: 'To-do', key: '[ ]', on: (e) => e.isActive('taskList'), run: (e) => e.chain().focus().toggleTaskList().run() },
    { icon: Quote, label: 'Quote', key: '>', on: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
  ],
]

/** The text's styles, each lit where the cursor is; and a link, from an address typed in. */
function Toolbar({ editor }: { editor: Editor | null }) {
  const active = useEditorState({ editor, selector: ({ editor: e }) => e && [...TOOLS.flat().map((t) => t.on(e)), e.isActive('link')] })
  const [linking, setLinking] = useState<string | null>(null)
  if (!editor || !active) return null
  const button = (lit: boolean) => `flex size-7 shrink-0 items-center justify-center rounded ${lit ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-canvas hover:text-ink'}`
  // (Pressing a button keeps the cursor and selection in the text.)
  const keep = (e: React.MouseEvent) => e.preventDefault()
  const addLink = () => {
    const url = linking?.trim()
    setLinking(null)
    if (!url) return void editor.commands.focus()
    const href = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`
    if (editor.state.selection.empty) editor.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href } }] }).run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }
  let i = 0
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-line px-1 py-0.5" role="toolbar" aria-label="Text style">
      {linking !== null ? (
        <form onSubmit={(e) => { e.preventDefault(); addLink() }} className="flex min-w-0 flex-1 items-center gap-1">
          <input
            autoFocus value={linking} onChange={(e) => setLinking(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (setLinking(null), editor.commands.focus())}
            placeholder="https://…" aria-label="Link address" className="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-[12px] outline-none max-md:!text-[16px]"
          />
          <button type="submit" className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft">Add link</button>
        </form>
      ) : (
        <>
          {TOOLS.map((group, g) => (
            <span key={g} className={`flex items-center gap-0.5 ${g ? 'border-l border-line pl-1' : ''}`}>
              {group.map((t) => {
                const lit = active[i++]
                return (
                  <button key={t.label} type="button" onMouseDown={keep} onClick={() => t.run(editor)} aria-pressed={lit} title={t.key ? `${t.label} (${t.key})` : t.label} aria-label={t.label} className={button(lit)}>
                    <t.icon size={14} />
                  </button>
                )
              })}
            </span>
          ))}
          <span className="flex items-center border-l border-line pl-1">
            <button
              type="button" onMouseDown={keep} aria-pressed={active.at(-1)} title={active.at(-1) ? 'Remove link' : 'Link'} aria-label={active.at(-1) ? 'Remove link' : 'Link'} className={button(!!active.at(-1))}
              onClick={() => active.at(-1) ? editor.chain().focus().extendMarkRange('link').unsetLink().run() : setLinking('')}
            >
              <Link size={14} />
            </button>
          </span>
        </>
      )}
    </div>
  )
}
