import { useMemo, useState } from 'react'
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable,
  type Column, type ColumnDef, type ColumnFiltersState, type FilterFn, type RowData, type SortingState,
} from '@tanstack/react-table'
import { EMPTY, isEmpty, kindOf, matches, textOf, type Kind } from './cells'
import { cityNames, countryNames, type Table, type Value } from './sources'

/** One table row: the record, where it is in the file and its problems. */
type Item = { i: number; where: string; row: Record<string, Value>; issues: Record<string, string> }

/** The search box: any cell (or the line number) containing the text. */
const bySearch: FilterFn<Item> = (row, _id, search: string) => {
  const q = search.trim().toLowerCase()
  return !q || row.original.where.toLowerCase().includes(q) || Object.values(row.original.row).some((v) => textOf(v).toLowerCase().includes(q))
}

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    kind: Kind
    /** Choices for the column's dropdown filter; none means a text box. */
    options?: { value: string; label: string }[]
    link?: 'city' | 'country'
  }
}

/** Dropdown choices: yes/no, a list's items, or a text column's values when there are only a few. */
function optionsFor(values: Value[], kind: Kind): { value: string; label: string }[] | undefined {
  const empty = values.some(isEmpty) ? [{ value: EMPTY, label: '(empty)' }] : []
  if (kind === 'bool') return [{ value: '=yes', label: 'yes' }, { value: '=no', label: 'no' }, ...empty]
  if (kind === 'list') {
    const items = [...new Set(values.flatMap((v) => (Array.isArray(v) ? v.map(textOf) : [])))].sort()
    return items.length <= 30 && items.every((x) => x.length <= 40) ? [...items.map((x) => ({ value: `∋${x}`, label: x })), ...empty] : undefined
  }
  if (kind === 'text') {
    const distinct = [...new Set(values.filter((v) => !isEmpty(v)).map(textOf))].sort()
    return distinct.length <= 12 && distinct.length < values.length / 2 && distinct.every((x) => x.length <= 40)
      ? [...distinct.map((x) => ({ value: `=${x}`, label: x })), ...empty] : undefined
  }
}

export function DataTable({ table, wrap, onlyIssues }: { table: Table; wrap: boolean; onlyIssues: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [filters, setFilters] = useState<ColumnFiltersState>([])
  const [search, setSearch] = useState('')

  const items = useMemo(() => table.rows.map((row, i): Item => ({ i, where: table.where[i], row, issues: table.issues[i] })), [table])
  const data = useMemo(() => (onlyIssues ? items.filter((it) => Object.keys(it.issues).length) : items), [items, onlyIssues])

  const columns = useMemo<ColumnDef<Item>[]>(() => {
    const cols: ColumnDef<Item>[] = table.columns.map((name) => {
      const values = table.rows.map((r) => r[name] ?? null)
      const kind = kindOf(values)
      return {
        id: name,
        header: name,
        // Sorted by number, or by text without case; empty cells last either way.
        accessorFn: (it) => {
          const v = it.row[name] ?? null
          if (isEmpty(v)) return undefined
          return kind === 'number' ? v : textOf(v).toLowerCase()
        },
        sortUndefined: 'last',
        sortingFn: kind === 'number' ? 'basic' : 'alphanumeric',
        filterFn: (it, id, filter: string) => matches(it.original.row[id] ?? null, filter, kind),
        meta: { kind, options: optionsFor(values, kind), link: table.links[name] },
        cell: ({ row }) => <Cell value={row.original.row[name] ?? null} kind={kind} link={table.links[name]} wrap={wrap} />,
      }
    })
    if (table.lines) cols.unshift({ id: '#', header: '#', accessorFn: (it) => it.i, enableColumnFilter: false, cell: ({ row }) => <span className="text-muted">{row.original.i + 2}</span>, meta: { kind: 'number' } })
    return cols
  }, [table, wrap])

  const t = useReactTable({
    data, columns,
    state: { sorting, columnFilters: filters, globalFilter: search },
    onSortingChange: setSorting, onColumnFiltersChange: setFilters, onGlobalFilterChange: setSearch,
    globalFilterFn: bySearch,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel()
  })
  const shown = t.getRowModel().rows
  const filtered = !!search || filters.length > 0 || sorting.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-[13px]">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all columns"
          className="w-64 rounded-md border border-line bg-panel px-2.5 py-1 outline-none focus:border-accent"
        />
        <span className="text-muted">{shown.length === table.rows.length ? `${shown.length} rows` : `${shown.length} of ${table.rows.length} rows`}</span>
        {filtered && (
          <button onClick={() => { setSearch(''); setFilters([]); setSorting([]) }} className="text-accent hover:underline">Clear sort and filters</button>
        )}
        <span className="ml-auto text-[12px] text-muted" title="In a column's box: empty, 5, >5, <=5 or 2..5 for numbers, or any text it contains">
          Column filters: text, <code>&gt;5</code>, <code>2..5</code>, <code>empty</code>
        </span>
      </div>
      <div className="thin-scrollbar min-h-0 flex-1 overflow-auto border-t border-line">
        <table className="border-separate border-spacing-0 text-[12.5px]">
          <thead className="sticky top-0 z-20 bg-panel">
            <tr>
              {t.getFlatHeaders().map((h, n) => (
                <th key={h.id} className={`border-b border-line px-2.5 pt-2 pb-1 text-left font-semibold whitespace-nowrap ${n === 0 ? 'sticky left-0 z-10 bg-panel' : ''}`}>
                  <button onClick={h.column.getToggleSortingHandler()} className="flex items-center gap-1 hover:text-accent" title="Sort (Shift-click to add a second sort)">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    <span className="w-3 text-accent">{{ asc: '↑', desc: '↓' }[h.column.getIsSorted() as string] ?? ''}</span>
                  </button>
                </th>
              ))}
            </tr>
            <tr>
              {t.getFlatHeaders().map((h, n) => (
                <th key={h.id} className={`border-b border-line px-1.5 pb-1.5 font-normal ${n === 0 ? 'sticky left-0 z-10 bg-panel' : ''}`}>
                  {h.column.getCanFilter() && <Filter column={h.column} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="group">
                {r.getVisibleCells().map((c, n) => {
                  const issue = r.original.issues[c.column.id]
                  return (
                    <td
                      key={c.id}
                      title={issue}
                      className={`border-b border-line px-2.5 py-1.5 align-top group-hover:bg-canvas ${n === 0 ? 'sticky left-0 z-10 bg-panel' : ''} ${issue ? '!bg-danger-soft text-danger' : ''} ${c.column.columnDef.meta?.kind === 'number' ? 'text-right tabular-nums' : ''}`}
                    >
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                      {issue && <span className="ml-1 font-bold">!</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="px-4 py-6 text-[13px] text-muted">No rows match.</p>}
      </div>
    </div>
  )
}

function Filter({ column }: { column: Column<Item> }) {
  const meta = column.columnDef.meta
  const value = (column.getFilterValue() as string) ?? ''
  const box = 'w-full min-w-16 rounded border border-line bg-panel px-1.5 py-0.5 text-[12px] outline-none focus:border-accent'
  if (meta?.options) {
    return (
      <select value={value} onChange={(e) => column.setFilterValue(e.target.value || undefined)} className={`${box} ${value ? 'border-accent' : 'text-muted'}`}>
        <option value="">All</option>
        {meta.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  return (
    <input
      value={value} onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      placeholder={meta?.kind === 'number' ? '>0, 2..5' : 'Filter'}
      className={`${box} ${value ? 'border-accent' : ''}`}
    />
  )
}

function Cell({ value, kind, link, wrap }: { value: Value; kind: Kind; link?: 'city' | 'country'; wrap: boolean }) {
  if (isEmpty(value)) return <span className="text-muted opacity-50">—</span>
  if (typeof value === 'boolean') return <span className={value ? 'text-accent' : 'text-muted'}>{value ? 'yes' : 'no'}</span>
  if (kind === 'list' && Array.isArray(value) && !(value.length === 2 && value.every((x) => typeof x === 'number'))) {
    return (
      <span className={`flex gap-1 ${wrap ? 'max-w-md flex-wrap' : ''}`}>
        {value.map((x, i) => <span key={i} className="rounded bg-canvas px-1.5 whitespace-nowrap ring-1 ring-line">{textOf(x)}</span>)}
      </span>
    )
  }
  const text = textOf(value)
  if (link) {
    const name = (link === 'city' ? cityNames : countryNames).get(text)
    // Countries by code, with the name; cities by id, with the name on hover.
    return <span title={name} className="whitespace-nowrap">{text}{name && link === 'country' && <span className="ml-1.5 text-muted">{name}</span>}</span>
  }
  if (/^https?:\/\//.test(text)) return <a href={text} target="_blank" rel="noreferrer" className="text-accent hover:underline">{text}</a>
  return <span title={wrap ? undefined : text} className={`inline-block align-top ${wrap ? 'max-w-md' : 'max-w-xs truncate'}`}>{text}</span>
}
