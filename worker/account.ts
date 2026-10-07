// One Durable Object per signed-in Google account (keyed by its account ID). It holds that user's saved trips
// (SQLite) and today's assistant usage. A Durable Object handles one request at a time, so nothing can race.
// The rules are plain functions in limits.ts and trips.ts.
import { DurableObject } from 'cloudflare:workers'
import { canCall, current, spend, type Count } from './limits'
import { summarize, TRIP_LIMITS, type TripPatch, type TripSummary } from './trips'

type Row = { id: string; name: string; data: string | null; chat: string | null; updated: number }

export class Account extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT, chat TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL)`)
  }

  // ---------------------------------------------------------------- assistant usage

  private async count(day: string): Promise<Count> {
    return current(await this.ctx.storage.get<Partial<Count>>('count'), day)
  }

  async status(day: string): Promise<Count> {
    return this.count(day)
  }

  /** Whether a model call of this request size may go out now (see canCall). */
  async allowed(day: string, message: boolean, requestChars: number): Promise<{ ok: boolean; count: Count }> {
    const count = await this.count(day)
    return { ok: canCall(count, message, requestChars), count }
  }

  /** Adds what a call cost, in USD. */
  async spend(day: string, usd: number): Promise<Count> {
    const next = spend(await this.count(day), usd)
    await this.ctx.storage.put('count', next)
    return next
  }

  // ---------------------------------------------------------------- trips

  private row(id: string): Row | null {
    return this.ctx.storage.sql.exec<Row>('SELECT id, name, data, chat, updated FROM trips WHERE id = ?', id).toArray()[0] ?? null
  }

  private summary(r: Row): TripSummary {
    return { id: r.id, name: r.name, updated: r.updated, ...summarize(r.data) }
  }

  /** All trips, most recently changed first, and the one opened last (to open again on any device). */
  async listTrips(): Promise<{ trips: TripSummary[]; lastId: string | null }> {
    const rows = this.ctx.storage.sql.exec<Row>('SELECT id, name, data, NULL AS chat, updated FROM trips ORDER BY updated DESC').toArray()
    return { trips: rows.map((r) => this.summary(r)), lastId: (await this.ctx.storage.get<string>('lastTripId')) ?? null }
  }

  async getTrip(id: string): Promise<(TripSummary & { data: unknown; chat: unknown }) | null> {
    const r = this.row(id)
    if (!r) return null
    await this.ctx.storage.put('lastTripId', id)
    return { ...this.summary(r), data: r.data ? JSON.parse(r.data) : null, chat: r.chat ? JSON.parse(r.chat) : null }
  }

  async createTrip(patch: TripPatch): Promise<TripSummary | string> {
    const n = this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM trips').one().n
    if (n >= TRIP_LIMITS.trips) return `You can keep up to ${TRIP_LIMITS.trips} trips: delete one first`
    const id = crypto.randomUUID()
    const now = Date.now()
    this.ctx.storage.sql.exec('INSERT INTO trips (id, name, data, chat, created, updated) VALUES (?, ?, ?, ?, ?, ?)',
      id, patch.name ?? 'My trip', patch.data ?? null, patch.chat ?? null, now, now)
    await this.ctx.storage.put('lastTripId', id)
    return this.summary(this.row(id)!)
  }

  async saveTrip(id: string, patch: TripPatch): Promise<TripSummary | null> {
    if (!this.row(id)) return null
    const sets = Object.entries(patch).filter(([, v]) => v !== undefined)
    this.ctx.storage.sql.exec(`UPDATE trips SET ${[...sets.map(([k]) => `${k} = ?`), 'updated = ?'].join(', ')} WHERE id = ?`,
      ...sets.map(([, v]) => v), Date.now(), id)
    return this.summary(this.row(id)!)
  }

  async deleteTrip(id: string): Promise<boolean> {
    const existed = !!this.row(id)
    this.ctx.storage.sql.exec('DELETE FROM trips WHERE id = ?', id)
    if ((await this.ctx.storage.get<string>('lastTripId')) === id) await this.ctx.storage.delete('lastTripId')
    return existed
  }
}
