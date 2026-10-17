// Rewrites of what an account keeps, run as its Durable Object starts (account.ts), each once: it finds only the rows
// still to change. Apart from the Account so it can be tested on a plain SQLite database (migrations.test.ts).
import { itemsNow, type Items } from '../src/store/itemsCore'
import type { ItemsChange } from './changes'

/** What a migration needs of the account's SQL storage (`ctx.storage.sql`). */
export type Sql = { exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] } }

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
