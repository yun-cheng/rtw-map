// Rewrites of what an account keeps, run as its Durable Object starts (account.ts), each once: it finds only the rows
// still to change. Apart from the Account so it can be tested on a plain SQLite database (migrations.test.ts).
import { itemsNow, type Items } from '../src/store/itemsCore'
import type { ItemsChange } from './changes'
import { summarize } from './trips'

/** What a migration needs of the account's SQL storage (`ctx.storage.sql`). */
export type Sql = { exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] } }

/** Adds the columns a table doesn't have yet (each "name TYPE…", added after the table was made): whether it added
 *  any. */
export function addColumns(sql: Sql, table: string, columns: string[]): boolean {
  const has = new Set(sql.exec(`PRAGMA table_info(${table})`).toArray().map((c) => c.name))
  const missing = columns.filter((c) => !has.has(c.split(' ')[0]))
  for (const c of missing) sql.exec(`ALTER TABLE ${table} ADD COLUMN ${c}`)
  return missing.length > 0
}

/** Items kept with a kind since renamed (receipts are expenses), in the trips and in the changes kept for undo, as
 *  they are now. */
export function renameItemKinds(sql: Sql) {
  for (const table of ['trips', 'changes'] as const) {
    const rows = sql.exec(`SELECT id, items FROM ${table} WHERE items LIKE '%"kind":"receipt"%'`).toArray() as { id: string; items: string }[]
    for (const r of rows) {
      const kept = JSON.parse(r.items) as Items | ItemsChange
      const now = table === 'trips' ? itemsNow(kept as Items) : { ...(kept as ItemsChange), before: itemsNow((kept as ItemsChange).before) }
      sql.exec(`UPDATE ${table} SET items = ? WHERE id = ?`, JSON.stringify(now), r.id)
    }
  }
}

/** Each trip's summary for the trip list (its dates and number of stops), in columns of their own from its data, so
 *  listing the trips doesn't read every trip whole: filled in once, for the trips kept before the columns. */
export function fillTripSummaries(sql: Sql) {
  const rows = sql.exec('SELECT id, data FROM trips WHERE data IS NOT NULL').toArray() as { id: string; data: string }[]
  for (const r of rows) {
    const s = summarize(r.data)
    sql.exec('UPDATE trips SET start_date = ?, end_date = ?, stops = ? WHERE id = ?', s.startDate, s.endDate, s.stops, r.id)
  }
}
