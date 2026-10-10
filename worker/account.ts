// One Durable Object per signed-in Google account (keyed by its account ID). It holds that user's saved trips
// (SQLite), the assistant's runs on them (runs.ts) and today's assistant usage. A Durable Object handles one request
// at a time, so nothing can race. The rules are plain functions in limits.ts, trips.ts and runs.ts.
import { DurableObject } from 'cloudflare:workers'
import { canCall, current, spend, type AccountLimits, type Count } from './limits'
import { isStale, RUN_KEEP_MS, type RunRecord, type RunRequest, type RunStatus } from './runs'
import { summarize, TRIP_LIMITS, type TripPatch, type TripSummary } from './trips'

type Row = { id: string; name: string; data: string | null; chat: string | null; updated: number }
type RunRow = {
  id: string; trip_id: string; status: RunStatus; request: string; email: string | null; reply: string | null
  version: number; stop: number; error: string | null; created: number; updated: number
}
/** Trips a run is working on can't be saved from the browser (the run's changes would be lost). */
export const BUSY = 'The assistant is working on this trip: wait for it to finish, or stop it.'

export class Account extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT, chat TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL)`)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, status TEXT NOT NULL, request TEXT NOT NULL, email TEXT, reply TEXT,
      version INTEGER NOT NULL DEFAULT 0, stop INTEGER NOT NULL DEFAULT 0, error TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL)`)
  }

  // ---------------------------------------------------------------- assistant usage

  private async count(day: string): Promise<Count> {
    return current(await this.ctx.storage.get<Partial<Count>>('count'), day)
  }

  async status(day: string): Promise<Count> {
    return this.count(day)
  }

  /** Whether a model call of this request size may go out now under this daily limit (see canCall). */
  async allowed(day: string, message: boolean, requestChars: number, dailyUsd: number): Promise<{ ok: boolean; count: Count }> {
    const count = await this.count(day)
    return { ok: canCall(count, message, requestChars, dailyUsd), count }
  }

  /** Adds what a call cost, in USD. */
  async spend(day: string, usd: number): Promise<Count> {
    const next = spend(await this.count(day), usd)
    await this.ctx.storage.put('count', next)
    return next
  }

  // ---------------------------------------------------------------- account limits (on the "settings" instance only)

  async getLimits(): Promise<AccountLimits> {
    return (await this.ctx.storage.get<AccountLimits>('limits')) ?? {}
  }

  async setLimits(limits: AccountLimits): Promise<void> {
    await this.ctx.storage.put('limits', limits)
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

  /** The assistant's run on a trip, if one is under way. */
  async tripRun(tripId: string): Promise<RunRecord | null> {
    const run = this.activeRun(tripId)
    return run && this.record(run)
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

  /** Saves a trip from the browser: refused (BUSY) while a run is working on it. */
  async saveTrip(id: string, patch: TripPatch): Promise<TripSummary | null | string> {
    if (!this.row(id)) return null
    if (this.activeRun(id)) return BUSY
    return this.write(id, patch)
  }

  private write(id: string, patch: TripPatch): TripSummary {
    const sets = Object.entries(patch).filter(([, v]) => v !== undefined)
    this.ctx.storage.sql.exec(`UPDATE trips SET ${[...sets.map(([k]) => `${k} = ?`), 'updated = ?'].join(', ')} WHERE id = ?`,
      ...sets.map(([, v]) => v), Date.now(), id)
    return this.summary(this.row(id)!)
  }

  async deleteTrip(id: string): Promise<boolean | string> {
    const existed = !!this.row(id)
    if (this.activeRun(id)) return BUSY
    this.ctx.storage.sql.exec('DELETE FROM trips WHERE id = ?', id)
    this.ctx.storage.sql.exec('DELETE FROM runs WHERE trip_id = ?', id)
    if ((await this.ctx.storage.get<string>('lastTripId')) === id) await this.ctx.storage.delete('lastTripId')
    return existed
  }

  // ---------------------------------------------------------------- the assistant's runs (runs.ts)

  private run(id: string): RunRow | null {
    const r = this.ctx.storage.sql.exec<RunRow>('SELECT * FROM runs WHERE id = ?', id).toArray()[0] ?? null
    // A run that has gone quiet has died: say so.
    if (r && isStale(r.status, r.updated)) {
      const error = 'The assistant stopped answering. The changes so far are kept.'
      this.ctx.storage.sql.exec("UPDATE runs SET status = 'failed', error = ? WHERE id = ?", error, id)
      return { ...r, status: 'failed', error }
    }
    return r
  }

  private activeRun(tripId: string): RunRow | null {
    const ids = this.ctx.storage.sql.exec<{ id: string }>("SELECT id FROM runs WHERE trip_id = ? AND status = 'running'", tripId).toArray()
    return ids.map((r) => this.run(r.id)).find((r) => r?.status === 'running') ?? null
  }

  private record(r: RunRow): RunRecord {
    return { id: r.id, tripId: r.trip_id, text: (JSON.parse(r.request) as RunRequest).text, status: r.status, reply: r.reply, version: r.version, error: r.error, created: r.created, updated: r.updated }
  }

  /** Starts a run on a trip: saves the trip and chat as on screen, then adds the run (one at a time per trip). */
  async startRun(tripId: string, patch: TripPatch, request: RunRequest, email: string | undefined): Promise<RunRecord | string | null> {
    if (!this.row(tripId)) return null
    if (this.activeRun(tripId)) return 'The assistant is already working on this trip.'
    const now = Date.now()
    this.ctx.storage.sql.exec("DELETE FROM runs WHERE status != 'running' AND updated < ?", now - RUN_KEEP_MS)
    this.write(tripId, patch)
    const id = crypto.randomUUID()
    this.ctx.storage.sql.exec('INSERT INTO runs (id, trip_id, status, request, email, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, tripId, 'running', JSON.stringify(request), email ?? null, now, now)
    return this.record(this.run(id)!)
  }

  async getRun(id: string): Promise<RunRecord | null> {
    const r = this.run(id)
    return r && this.record(r)
  }

  /** The trip a run works on, as JSON text (the browser shows each change while it runs). */
  async runTripData(id: string): Promise<string | null> {
    const r = this.run(id)
    return (r && this.row(r.trip_id)?.data) ?? null
  }

  /** Asks a run to stop after the step under way (the runner hears it with its next progress). */
  async stopRun(id: string): Promise<RunRecord | null> {
    this.ctx.storage.sql.exec("UPDATE runs SET stop = 1 WHERE id = ? AND status = 'running'", id)
    return this.getRun(id)
  }

  /** For a model call of a run: whose allowance it uses (the account's limit may depend on the email), and whether
   *  the run was asked to stop or has ended (then it gets no more calls). */
  async runCaller(id: string): Promise<{ email: string | null; stop: boolean } | null> {
    const r = this.run(id)
    return r && { email: r.email, stop: r.stop === 1 || r.status !== 'running' }
  }

  /** For the runner: the run's message and the trip and chat it starts from, as JSON text. */
  async runInput(id: string): Promise<string | null> {
    const r = this.run(id)
    const trip = r && this.row(r.trip_id)
    if (!r || !trip) return null
    return `{"status":${JSON.stringify(r.status)},"created":${r.created},"request":${r.request},"data":${trip.data ?? 'null'},"chat":${trip.chat ?? 'null'}}`
  }

  /** From the runner, after each step and every few seconds while it waits: the reply so far and the trip when they
   *  changed (and that it's still going). Answers whether to stop. */
  async runProgress(id: string, reply: string | undefined, data: string | undefined): Promise<{ stop: boolean }> {
    const r = this.run(id)
    if (!r || r.status !== 'running') return { stop: true }
    if (data !== undefined) this.write(r.trip_id, { data })
    this.ctx.storage.sql.exec('UPDATE runs SET reply = ?, version = version + ?, updated = ? WHERE id = ?',
      reply ?? r.reply, data === undefined ? 0 : 1, Date.now(), id)
    return { stop: r.stop === 1 }
  }

  /** From the runner, at the end: the trip and its chat with the reply, and how it ended. */
  async finishRun(id: string, patch: TripPatch, reply: string, status: Exclude<RunStatus, 'running'>, error: string | null): Promise<boolean> {
    const r = this.ctx.storage.sql.exec<RunRow>('SELECT * FROM runs WHERE id = ?', id).toArray()[0]
    if (!r) return false
    this.write(r.trip_id, patch)
    this.ctx.storage.sql.exec('UPDATE runs SET status = ?, reply = ?, error = ?, version = version + 1, updated = ? WHERE id = ?', status, reply, error, Date.now(), id)
    return true
  }

  /** A run that couldn't be started (the runner wasn't reachable). */
  async failRun(id: string, error: string): Promise<void> {
    this.ctx.storage.sql.exec("UPDATE runs SET status = 'failed', error = ?, updated = ? WHERE id = ?", error, Date.now(), id)
  }
}
