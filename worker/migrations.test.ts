import { describe, expect, it } from 'vitest'
import { fillTripSummaries, renameItemKinds, type Sql } from './migrations'

/** Node's own SQLite, what the tests use of it (the Worker's types have no Node). */
type Statement = { all(...b: unknown[]): unknown[]; get(...b: unknown[]): unknown; run(...b: unknown[]): unknown }
const { DatabaseSync } = (await import('node:sqlite' as string)) as { DatabaseSync: new (path: string) => { exec(q: string): void; prepare(q: string): Statement } }

/** A plain SQLite database, as the Account's storage is. */
function account() {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE trips (id TEXT PRIMARY KEY, items TEXT)')
  db.exec('CREATE TABLE changes (id TEXT PRIMARY KEY, items TEXT)')
  const sql: Sql = {
    exec: (query, ...bindings) => {
      const q = db.prepare(query)
      const rows = query.startsWith('SELECT') ? q.all(...bindings) : (q.run(...bindings), [])
      return { toArray: () => rows as Record<string, unknown>[] }
    },
  }
  const items = (table: string, id: string) => JSON.parse((db.prepare(`SELECT items FROM ${table} WHERE id = ?`).get(id) as { items: string }).items)
  return { db, sql, items }
}

describe('migrations', () => {
  it("makes the receipts kept the expenses they are now, in the trips and the changes kept for undo, once", () => {
    const { db, sql, items } = account()
    const receipt = { id: 'receipt:1', kind: 'receipt', at: 'krakow', title: 'Dinner', amount: 30, currency: 'PLN', updatedAt: 1 }
    const stay = { id: 'stay:1', kind: 'stay', at: 'krakow', title: 'Hostel', updatedAt: 1 }
    db.prepare('INSERT INTO trips VALUES (?, ?)').run('t1', JSON.stringify({ [receipt.id]: receipt, [stay.id]: stay }))
    db.prepare('INSERT INTO trips VALUES (?, ?)').run('t2', JSON.stringify({ [stay.id]: stay }))
    db.prepare('INSERT INTO trips VALUES (?, ?)').run('t3', null)
    db.prepare('INSERT INTO changes VALUES (?, ?)').run('c1', JSON.stringify({ before: { [receipt.id]: receipt, 'stay:2': null }, after: { [receipt.id]: 2, 'stay:2': 2 } }))
    db.prepare('INSERT INTO changes VALUES (?, ?)').run('c2', null)
    renameItemKinds(sql)
    expect(items('trips', 't1')).toEqual({ [receipt.id]: { ...receipt, kind: 'expense' }, [stay.id]: stay })
    expect(items('trips', 't2')).toEqual({ [stay.id]: stay })
    expect(items('changes', 'c1')).toEqual({ before: { [receipt.id]: { ...receipt, kind: 'expense' }, 'stay:2': null }, after: { [receipt.id]: 2, 'stay:2': 2 } })
    // Again: nothing left to change.
    const writes: string[] = []
    renameItemKinds({ exec: (q, ...b) => (q.startsWith('UPDATE') && writes.push(q), sql.exec(q, ...b)) })
    expect(writes).toEqual([])
  })

  it("fills in the trip list's summary of each trip kept before it had one: its dates and number of stops", () => {
    const db = new DatabaseSync(':memory:')
    db.exec('CREATE TABLE trips (id TEXT PRIMARY KEY, data TEXT, start_date TEXT, end_date TEXT, stops INTEGER NOT NULL DEFAULT 0)')
    const sql: Sql = {
      exec: (q, ...b) => {
        const rows = q.startsWith('SELECT') ? db.prepare(q).all(...b) : (db.prepare(q).run(...b), [])
        return { toArray: () => rows as Record<string, unknown>[] }
      },
    }
    db.prepare('INSERT INTO trips (id, data) VALUES (?, ?)').run('t1', JSON.stringify({ input: { startDate: '2027-05-01', endDate: '2027-06-01' }, stops: [{}, {}, {}] }))
    db.prepare('INSERT INTO trips (id, data) VALUES (?, ?)').run('t2', null)
    db.prepare('INSERT INTO trips (id, data) VALUES (?, ?)').run('t3', 'not json')
    fillTripSummaries(sql)
    const row = (id: string) => db.prepare('SELECT start_date, end_date, stops FROM trips WHERE id = ?').get(id)
    expect(row('t1')).toEqual({ start_date: '2027-05-01', end_date: '2027-06-01', stops: 3 })
    expect(row('t2')).toEqual({ start_date: null, end_date: null, stops: 0 })
    expect(row('t3')).toEqual({ start_date: null, end_date: null, stops: 0 })
  })
})
