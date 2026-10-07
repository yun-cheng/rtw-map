import { useEffect, useState } from 'react'
import { DataTable } from './DataTable'
import { SOURCES, type Source, type Table } from './sources'

const problemsIn = (t: Table) => t.issues.filter((x) => Object.keys(x).length).length + t.missing.length
const problemsOf = (s: Source) => Object.values(s.tables).reduce((n, t) => n + problemsIn(t), 0)
const rowsOf = (s: Source) => Object.values(s.tables).reduce((n, t) => n + t.rows.length, 0)

/** "#local-transport/cities" → the file and its table; the first of each when missing. */
function fromHash(): { source: Source; part: string } {
  const [id, part] = decodeURIComponent(location.hash.slice(1)).split('/')
  const source = SOURCES.find((s) => s.id === id) ?? SOURCES[0]
  return { source, part: part && source.tables[part] ? part : Object.keys(source.tables)[0] }
}

/**
 * The data review page (development only: npm run dev, then /data.html). Each hand-curated seed file as a table to
 * sort, filter and search, with problems marked in red.
 */
export function ReviewApp() {
  const [at, setAt] = useState(fromHash)
  const [wrap, setWrap] = useState(false)
  const [onlyIssues, setOnlyIssues] = useState(false)
  useEffect(() => {
    const onHash = () => setAt(fromHash())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  // Re-read after the files change (hot reload brings new tables).
  const source = SOURCES.find((s) => s.id === at.source.id) ?? SOURCES[0]
  const parts = Object.entries(source.tables)
  const table = source.tables[at.part] ?? parts[0][1]
  const problems = problemsIn(table)
  const go = (s: Source, part = Object.keys(s.tables)[0]) => {
    history.pushState(null, '', `#${s.id}/${part}`)
    setAt(fromHash())
  }

  return (
    <div className="flex h-full flex-col bg-panel text-ink">
      <header className="flex items-center gap-4 border-b border-line px-4 pt-2.5">
        <h1 className="pb-2.5 text-[15px] font-semibold whitespace-nowrap">Seed data</h1>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto text-[13px]">
          {SOURCES.map((s) => {
            const n = problemsOf(s)
            return (
              <button
                key={s.id} onClick={() => go(s)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-2.5 pb-2 whitespace-nowrap ${s.id === source.id ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}
              >
                {s.label}
                <span className="text-[11px] text-muted">{rowsOf(s)}</span>
                {n > 0 && <span className="rounded-full bg-danger-soft px-1.5 text-[11px] font-semibold text-danger" title={`${n} problem${n === 1 ? '' : 's'}`}>{n}</span>}
              </button>
            )
          })}
        </nav>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pt-3 text-[13px]">
        {parts.length > 1 && (
          <div className="flex rounded-md bg-canvas p-0.5 ring-1 ring-line">
            {parts.map(([part, t]) => (
              <button
                key={part} onClick={() => go(source, part)}
                className={`rounded px-2.5 py-0.5 ${t === table ? 'bg-panel font-medium shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                {t.label} <span className="text-[11px] text-muted">{t.rows.length}</span>
              </button>
            ))}
          </div>
        )}
        <code className="text-[12px] text-muted">{source.file}</code>
        {source.updatedAt && <span className="text-[12px] text-muted">updated {source.updatedAt}</span>}
        <label className="ml-auto flex items-center gap-1.5">
          <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} className="accent-accent" /> Wrap long text
        </label>
        <label className={`flex items-center gap-1.5 ${problems ? '' : 'text-muted'}`}>
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} disabled={!problems} className="accent-accent" />
          Only rows with problems ({problems - table.missing.length})
        </label>
      </div>
      {source.about && <p className="max-w-5xl px-4 pt-1.5 text-[12px] text-muted">{source.about}</p>}
      {source.notes?.map((n) => <p key={n} className="max-w-5xl px-4 pt-1 text-[12px] text-muted">• {n}</p>)}
      {table.missing.length > 0 && (
        <p className="mx-4 mt-2 rounded-md bg-danger-soft px-3 py-1.5 text-[12.5px] text-danger">
          No row for {table.missing.length}: {table.missing.join(', ')}
        </p>
      )}
      <DataTable key={`${source.id}/${at.part}`} table={table} wrap={wrap} onlyIssues={onlyIssues} />
    </div>
  )
}
