// One Durable Object per signed-in Google account (keyed by its account ID). It holds that user's saved trips
// (SQLite) and their version history (versions.ts), the assistant's runs on them (runs.ts), the user's own phrases
// (for every trip), today's assistant usage and phrases read aloud, the other apps allowed to read and change the
// trips (oauth.ts) and those apps' changes (changes.ts). A Durable Object handles one request at a time, so nothing
// can race. The rules are plain functions in limits.ts, trips.ts, runs.ts, changes.ts and versions.ts.
import { DurableObject } from 'cloudflare:workers'
import { CHANGE_KEEP, CHANGE_KEEP_MS, CHANGED_ELSEWHERE, changeView, joinedBefore, latestOf, overwrites, undoSet, type ChangeRecord, type ChangeView } from './changes'
import { canCall, current, spend, takeSpeech, type AccountLimits, type Count, type SpeechCount } from './limits'
import { isStale, RUN_KEEP_MS, type RunRecord, type RunRequest, type RunStatus } from './runs'
import { isPhrase, ITEM_LIMITS, mergeItems, phraseCount, phrasesOf, withoutPhrases, type Items, type TripItem } from '../src/store/itemsCore'
import { JOURNAL_LIMITS, mergeJournal, type DayEntry, type Journal } from '../src/store/journalCore'
import type { Grant, NewGrant } from './oauth'
import { publicTripData, shareToken, summarize, TRIP_LIMITS, type TripPatch, type TripSummary } from './trips'
import { ASKED_CHARS, joinsLatest, RESTORE_SAME, VERSION_PAGE, type VersionBy } from './versions'

type Row = { id: string; name: string; data: string | null; chat: string | null; updated: number; share: string | null; rev: number; outside: number | null }
type GrantRow = Grant & { status: 'pending' | 'active'; gen: number }
type ChangeRow = {
  id: string; trip_id: string; grant_id: string | null; app: string; tool: string; summary: string
  rev_before: number; rev_after: number; created: number; undone: number
}
type VersionRow = { id: string; by: string; rev: number; started: number; updated: number; data: string | null }
type RunRow = {
  id: string; trip_id: string; status: RunStatus; request: string; email: string | null; reply: string | null
  version: number; stop: number; error: string | null; created: number; updated: number
}
/** How long an app has to take its tokens after the user allowed it; how many apps an account keeps; how often a
 *  grant's last use is written down. */
const GRANT_PENDING_MS = 10 * 60_000
const GRANT_LIMIT = 50
const GRANT_USED_MS = 10 * 60_000
export const BUSY = 'The assistant is working on this trip: wait for it to finish, or stop it.'
/** Another app's change, refused while the app's own assistant works on the trip. */
const BUSY_OUTSIDE = 'The app\'s own assistant is working on this trip right now: try again when it has finished.'

export class Account extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT, chat TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL)`)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, status TEXT NOT NULL, request TEXT NOT NULL, email TEXT, reply TEXT,
      version INTEGER NOT NULL DEFAULT 0, stop INTEGER NOT NULL DEFAULT 0, error TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL)`)
    // A trip's public link (its token), added after the table: older accounts get the column now.
    if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(trips)').toArray().some((c) => c.name === 'share')) {
      ctx.storage.sql.exec('ALTER TABLE trips ADD COLUMN share TEXT')
    }
    // The trip's journal (src/store/journalCore.ts), apart from its data: merged day by day, never touched by a run.
    if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(trips)').toArray().some((c) => c.name === 'journal')) {
      ctx.storage.sql.exec('ALTER TABLE trips ADD COLUMN journal TEXT')
    }
    // The cities' items (stays, albums, links, notes; src/store/itemsCore.ts), the same way: merged item by item.
    if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(trips)').toArray().some((c) => c.name === 'items')) {
      ctx.storage.sql.exec('ALTER TABLE trips ADD COLUMN items TEXT')
    }
    // Each save counts the trip's `rev` up; `outside`: its rev when another app last changed it (changes.ts), so the
    // browser's save from before that is refused instead of overwriting the change.
    if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(trips)').toArray().some((c) => c.name === 'rev')) {
      ctx.storage.sql.exec('ALTER TABLE trips ADD COLUMN rev INTEGER NOT NULL DEFAULT 0')
      ctx.storage.sql.exec('ALTER TABLE trips ADD COLUMN outside INTEGER')
    }
    // Other apps' changes to the trips, with each trip as it was before, for undo (changes.ts).
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS changes (
      id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, grant_id TEXT, app TEXT NOT NULL, tool TEXT NOT NULL, summary TEXT NOT NULL,
      before TEXT, rev_before INTEGER NOT NULL, rev_after INTEGER NOT NULL, created INTEGER NOT NULL, undone INTEGER NOT NULL DEFAULT 0)`)
    // Each trip's versions (versions.ts): the trip after each spell of changes, by whom, kept for good.
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, by TEXT NOT NULL, data TEXT, rev INTEGER NOT NULL, started INTEGER NOT NULL, updated INTEGER NOT NULL)`)
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS versions_trip ON versions (trip_id, started)')
    // Apps allowed to read the trips (oauth.ts): pending from the user's yes until the app takes its first tokens.
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS grants (
      id TEXT PRIMARY KEY, client TEXT NOT NULL, redirect TEXT NOT NULL, scope TEXT NOT NULL, status TEXT NOT NULL,
      gen INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, used INTEGER NOT NULL)`)
    // On the settings instance only: which account and trip each public link opens.
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, sub TEXT NOT NULL, trip_id TEXT NOT NULL)')
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

  // ---------------------------------------------------------------- phrases read aloud

  /** Counts one of today's phrases read aloud, or says the day's are used up (false). */
  async takeSpeech(day: string): Promise<boolean> {
    const next = takeSpeech(await this.ctx.storage.get<SpeechCount>('speech'), day)
    if (next) await this.ctx.storage.put('speech', next)
    return !!next
  }

  /** Gives one back, when Azure couldn't read it. */
  async giveBackSpeech(day: string): Promise<void> {
    const kept = await this.ctx.storage.get<SpeechCount>('speech')
    if (kept?.day === day && kept.n > 0) await this.ctx.storage.put('speech', { day, n: kept.n - 1 })
  }

  // ---------------------------------------------------------------- account limits (on the "settings" instance only)

  async getLimits(): Promise<AccountLimits> {
    return (await this.ctx.storage.get<AccountLimits>('limits')) ?? {}
  }

  async setLimits(limits: AccountLimits): Promise<void> {
    await this.ctx.storage.put('limits', limits)
  }

  // ---------------------------------------------------------------- public links (on the "settings" instance only)

  async addShare(token: string, sub: string, tripId: string): Promise<void> {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO shares (token, sub, trip_id) VALUES (?, ?, ?)', token, sub, tripId)
  }

  async removeShare(token: string): Promise<void> {
    this.ctx.storage.sql.exec('DELETE FROM shares WHERE token = ?', token)
  }

  async findShare(token: string): Promise<{ sub: string; tripId: string } | null> {
    const r = this.ctx.storage.sql.exec<{ sub: string; trip_id: string }>('SELECT sub, trip_id FROM shares WHERE token = ?', token).toArray()[0]
    return r ? { sub: r.sub, tripId: r.trip_id } : null
  }

  // ---------------------------------------------------------------- trips

  private row(id: string): Row | null {
    return this.ctx.storage.sql.exec<Row>('SELECT id, name, data, chat, updated, share, rev, outside FROM trips WHERE id = ?', id).toArray()[0] ?? null
  }

  private summary(r: Row): TripSummary {
    return { id: r.id, name: r.name, updated: r.updated, share: r.share ?? null, rev: r.rev, ...summarize(r.data) }
  }

  /** All trips, most recently changed first, and the one opened last (to open again on any device). */
  async listTrips(): Promise<{ trips: TripSummary[]; lastId: string | null }> {
    const rows = this.ctx.storage.sql.exec<Row>('SELECT id, name, data, NULL AS chat, updated, share, rev, outside FROM trips ORDER BY updated DESC').toArray()
    return { trips: rows.map((r) => this.summary(r)), lastId: (await this.ctx.storage.get<string>('lastTripId')) ?? null }
  }

  async getTrip(id: string): Promise<(TripSummary & { data: unknown; chat: unknown; journal: Journal; items: Items }) | null> {
    const r = this.row(id)
    if (!r) return null
    await this.ctx.storage.put('lastTripId', id)
    return {
      ...this.summary(r), data: r.data ? JSON.parse(r.data) : null, chat: r.chat ? JSON.parse(r.chat) : null,
      journal: this.kept<Journal>(id, 'journal') ?? {}, items: this.kept<Items>(id, 'items') ?? {},
    }
  }

  /** A trip as stored (JSON text) and its rev, with its items or journal if asked, for another app's assistant
   *  (mcp.ts): unlike opening it, this doesn't make it the trip the app opens next. */
  async tripTexts(id: string, extra: 'items' | 'journal' | null): Promise<{ data: string | null; extra: string | null; rev: number } | null> {
    const r = this.row(id)
    if (!r) return null
    return { data: r.data, extra: extra && JSON.stringify(extra === 'items' ? await this.visitItems(id) : this.kept(id, extra)), rev: r.rev }
  }

  /** A trip's items with the user's phrases, as the assistant's tools see them (null if there's no such trip). */
  private async visitItems(id: string): Promise<Items | null> {
    const items = this.kept<Items>(id, 'items')
    return items && { ...withoutPhrases(items), ...(await this.phrases()) }
  }

  /** A trip's journal or items (null if there's no such trip). */
  private kept<T>(id: string, column: 'journal' | 'items'): T | null {
    const r = this.ctx.storage.sql.exec<{ kept: string | null }>(`SELECT ${column} AS kept FROM trips WHERE id = ?`, id).toArray()[0]
    return r ? JSON.parse(r.kept ?? '{}') as T : null
  }

  /** Adds days written on a device to a trip's journal (each day's latest edit wins): the whole journal after, or
   *  null if there's no such trip. Also while the assistant works on the trip: a run never changes the journal. */
  async saveJournal(id: string, entries: DayEntry[]): Promise<Journal | null | string> {
    const journal = this.kept<Journal>(id, 'journal')
    if (!journal) return null
    const merged = mergeJournal(journal, entries)
    const text = JSON.stringify(merged)
    if (Object.keys(merged).length > JOURNAL_LIMITS.days || text.length > JOURNAL_LIMITS.bytes) return "This trip's journal is too long to save"
    this.ctx.storage.sql.exec('UPDATE trips SET journal = ? WHERE id = ?', text, id)
    return merged
  }

  /** Adds items changed on a device to a trip's (each one's latest edit wins), as the journal: all of them after, or
   *  null if there's no such trip. */
  async saveItems(id: string, entries: TripItem[]): Promise<Items | null | string> {
    const items = this.kept<Items>(id, 'items')
    if (!items) return null
    // (Phrases are the account's: those from the assistant's runs, or a page from before, go there.)
    const phrases = entries.filter((i) => isPhrase(i.id))
    if (phrases.length) {
      const saved = await this.savePhrases(phrases)
      if (typeof saved === 'string') return saved
    }
    const rest = entries.filter((i) => !isPhrase(i.id))
    if (!rest.length) return items
    const merged = mergeItems(items, rest)
    const text = JSON.stringify(merged)
    if (Object.keys(merged).length > ITEM_LIMITS.items || text.length > ITEM_LIMITS.bytes) return "This trip's stays, links and notes are too many to save"
    this.ctx.storage.sql.exec('UPDATE trips SET items = ? WHERE id = ?', text, id)
    return merged
  }

  // ---------------------------------------------------------------- the user's own phrases (for every trip)

  /** The user's phrases. The first time, those kept with the trips before (each trip's own), gathered (the trips'
   *  copies are left as they are, and left out from then on). */
  private async phrases(): Promise<Items> {
    const kept = await this.ctx.storage.get<Items>('phrases')
    if (kept) return kept
    const all = phrasesOf(this.ctx.storage.sql.exec<{ items: string }>('SELECT items FROM trips WHERE items IS NOT NULL').toArray().map((r) => JSON.parse(r.items) as Items))
    await this.ctx.storage.put('phrases', all)
    return all
  }

  async getPhrases(): Promise<Items> {
    return this.phrases()
  }

  /** Phrases changed on a device or by the assistant, merged as items are: answers with all of them, or why not
   *  (more than ITEM_LIMITS.phrases; only more are refused, so removing some always works). */
  async savePhrases(entries: TripItem[]): Promise<Items | string> {
    const kept = await this.phrases()
    const merged = mergeItems(kept, entries.filter((i) => isPhrase(i.id) && i.kind === 'phrase'))
    const count = phraseCount(merged)
    if (count > ITEM_LIMITS.phrases && count > phraseCount(kept)) return `You can keep at most ${ITEM_LIMITS.phrases} of your own phrases: remove some first`
    await this.ctx.storage.put('phrases', merged)
    return merged
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
    if (patch.data) this.addVersion(id, { who: 'you' }, patch.data, 0, now)
    await this.ctx.storage.put('lastTripId', id)
    return this.summary(this.row(id)!)
  }

  /** Saves a trip from the browser: refused while a run is working on it (BUSY), and, when `base` (the rev the page
   *  has) is given, if another app has changed it since (CHANGED_ELSEWHERE). */
  async saveTrip(id: string, patch: TripPatch, base?: number): Promise<TripSummary | null | string> {
    const r = this.row(id)
    if (!r) return null
    if (this.activeRun(id)) return BUSY
    if (patch.data !== undefined && overwrites(base, r.outside)) return CHANGED_ELSEWHERE
    return this.write(id, patch, { who: 'you' })
  }

  /** Saves a trip; its rev counts up when its data changes (a new name, or the chat alone, leaves it as it is, so
   *  other apps' changes can still be undone), and a changed trip goes into its version history as `by`'s. `outside`:
   *  another app's change. */
  private write(id: string, patch: TripPatch, by: VersionBy, outside = false): TripSummary {
    const before = this.row(id)
    const sets = Object.entries(patch).filter(([, v]) => v !== undefined)
    const changed = patch.data !== undefined && patch.data !== before?.data
    const bump = outside || changed
    const revs = bump ? ['rev = rev + 1', ...(outside ? ['outside = rev + 1'] : [])] : []
    const now = Date.now()
    this.ctx.storage.sql.exec(`UPDATE trips SET ${[...sets.map(([k]) => `${k} = ?`), 'updated = ?', ...revs].join(', ')} WHERE id = ?`,
      ...sets.map(([, v]) => v), now, id)
    const after = this.row(id)!
    if (before && changed) this.keepVersion(id, before, patch.data!, after.rev, by, now)
    return this.summary(after)
  }

  // ---------------------------------------------------------------- version history (versions.ts)

  private addVersion(tripId: string, by: VersionBy, data: string | null, rev: number, started: number, updated = started) {
    this.ctx.storage.sql.exec('INSERT INTO versions (id, trip_id, by, data, rev, started, updated) VALUES (?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(), tripId, JSON.stringify(by), data, rev, started, updated)
  }

  /** The trip after a change by `by` (it was `before`): in the latest version if that's the same author's spell of
   *  changes, else as a new one. The first kept also keeps the trip from before it (`earlier`). */
  private keepVersion(tripId: string, before: Row, data: string, rev: number, by: VersionBy, now: number) {
    const latest = this.ctx.storage.sql.exec<VersionRow>('SELECT id, by, rev, started, updated, NULL AS data FROM versions WHERE trip_id = ? ORDER BY started DESC LIMIT 1', tripId).toArray()[0]
    if (!latest && before.data) this.addVersion(tripId, { who: 'earlier' }, before.data, before.rev, before.updated)
    if (latest && joinsLatest({ by: JSON.parse(latest.by) as VersionBy, updated: latest.updated }, by, now)) {
      this.ctx.storage.sql.exec('UPDATE versions SET data = ?, rev = ?, updated = ? WHERE id = ?', data, rev, now, latest.id)
    } else this.addVersion(tripId, by, data, rev, now)
  }

  /** A trip's versions, newest first, from before `before` (when the next one started) on: a page of them and the
   *  one before the oldest (so its changes can be told), as JSON text with each version's trip. Null: no such trip. */
  async listVersions(tripId: string, before?: number): Promise<string | null> {
    if (!this.row(tripId)) return null
    const rows = this.ctx.storage.sql.exec<VersionRow>('SELECT id, by, data, rev, started, updated FROM versions WHERE trip_id = ? AND started < ? ORDER BY started DESC LIMIT ?',
      tripId, before ?? Number.MAX_SAFE_INTEGER, VERSION_PAGE + 1).toArray()
    // (The trips as kept, not parsed again.)
    const list = rows.map((v) => `{"id":${JSON.stringify(v.id)},"by":${v.by},"rev":${v.rev},"started":${v.started},"updated":${v.updated},"data":${v.data ?? 'null'}}`)
    return `{"versions":[${list.join(',')}],"more":${rows.length > VERSION_PAGE}}`
  }

  /** Puts a trip back as it was after one of its versions, as a new version (so going back can itself be undone):
   *  refused while the assistant works on it. */
  async restoreVersion(tripId: string, versionId: string): Promise<TripSummary | string | null> {
    const r = this.row(tripId)
    if (!r) return null
    if (this.activeRun(tripId)) return BUSY
    const v = this.ctx.storage.sql.exec<VersionRow>('SELECT id, by, data, rev, started, updated FROM versions WHERE id = ? AND trip_id = ?', versionId, tripId).toArray()[0]
    if (!v || v.data === null) return 'No such version.'
    if (v.data === r.data) return RESTORE_SAME
    return this.write(tripId, { data: v.data }, { who: 'restore', from: v.started })
  }

  async deleteTrip(id: string): Promise<boolean | string> {
    const existed = !!this.row(id)
    if (this.activeRun(id)) return BUSY
    this.ctx.storage.sql.exec('DELETE FROM trips WHERE id = ?', id)
    this.ctx.storage.sql.exec('DELETE FROM runs WHERE trip_id = ?', id)
    this.ctx.storage.sql.exec('DELETE FROM changes WHERE trip_id = ?', id)
    this.ctx.storage.sql.exec('DELETE FROM versions WHERE trip_id = ?', id)
    if ((await this.ctx.storage.get<string>('lastTripId')) === id) await this.ctx.storage.delete('lastTripId')
    return existed
  }

  /** Turns on a trip's public link (the same one if it's on already): its token, or null if there's no such trip. */
  async shareTrip(id: string): Promise<string | null> {
    const r = this.row(id)
    if (!r) return null
    if (r.share) return r.share
    const token = shareToken()
    this.ctx.storage.sql.exec('UPDATE trips SET share = ? WHERE id = ?', token, id)
    return token
  }

  /** Turns a trip's public link off: the token it had, if any. */
  async unshareTrip(id: string): Promise<string | null> {
    const token = this.row(id)?.share ?? null
    if (token) this.ctx.storage.sql.exec('UPDATE trips SET share = NULL WHERE id = ?', id)
    return token
  }

  /** A trip as its public link shows it, if the link is still on (the token is the trip's own). */
  async sharedTrip(id: string, token: string): Promise<{ name: string; data: unknown } | null> {
    const r = this.row(id)
    return r && r.share === token ? { name: r.name, data: publicTripData(r.data) } : null
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

  /** Starts a run on a trip: saves the trip and chat as on screen, then adds the run (one at a time per trip; not
   *  from a trip on screen older than another app's change, `base` as in saveTrip). */
  async startRun(tripId: string, patch: TripPatch, request: RunRequest, email: string | undefined, base?: number): Promise<RunRecord | string | null> {
    const trip = this.row(tripId)
    if (!trip) return null
    if (this.activeRun(tripId)) return 'The assistant is already working on this trip.'
    if (overwrites(base, trip.outside)) return CHANGED_ELSEWHERE
    const now = Date.now()
    this.ctx.storage.sql.exec("DELETE FROM runs WHERE status != 'running' AND updated < ?", now - RUN_KEEP_MS)
    // (The trip as on screen: the user's, before the assistant's version.)
    this.write(tripId, patch, { who: 'you' })
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

  /** For the runner: the run's message and the trip, chat and My visit items it starts from, as JSON text. */
  async runInput(id: string): Promise<string | null> {
    const r = this.run(id)
    const trip = r && this.row(r.trip_id)
    if (!r || !trip) return null
    const items = JSON.stringify(await this.visitItems(r.trip_id))
    return `{"status":${JSON.stringify(r.status)},"created":${r.created},"request":${r.request},"data":${trip.data ?? 'null'},"chat":${trip.chat ?? 'null'},"items":${items}}`
  }

  /** From the runner, after each step and every few seconds while it waits: the reply so far and the trip when they
   *  changed (and that it's still going), and the My visit items it changed (merged as a device's). Answers whether
   *  to stop. */
  async runProgress(id: string, reply: string | undefined, data: string | undefined, items: TripItem[] = []): Promise<{ stop: boolean }> {
    const r = this.run(id)
    if (!r || r.status !== 'running') return { stop: true }
    if (data !== undefined) this.write(r.trip_id, { data }, this.runBy(r))
    if (items.length) await this.saveItems(r.trip_id, items)
    this.ctx.storage.sql.exec('UPDATE runs SET reply = ?, version = version + ?, updated = ? WHERE id = ?',
      reply ?? r.reply, data === undefined ? 0 : 1, Date.now(), id)
    return { stop: r.stop === 1 }
  }

  /** From the runner, at the end: the trip and its chat with the reply, the My visit items changed, and how it ended. */
  async finishRun(id: string, patch: TripPatch, reply: string, status: Exclude<RunStatus, 'running'>, error: string | null, items: TripItem[] = []): Promise<boolean> {
    const r = this.ctx.storage.sql.exec<RunRow>('SELECT * FROM runs WHERE id = ?', id).toArray()[0]
    if (!r) return false
    this.write(r.trip_id, patch, this.runBy(r))
    if (items.length) await this.saveItems(r.trip_id, items)
    this.ctx.storage.sql.exec('UPDATE runs SET status = ?, reply = ?, error = ?, version = version + 1, updated = ? WHERE id = ?', status, reply, error, Date.now(), id)
    return true
  }

  /** A run's changes, in the version history: the assistant's, one version per run, with what it was asked. */
  private runBy(r: RunRow): VersionBy {
    return { who: 'assistant', run: r.id, asked: (JSON.parse(r.request) as RunRequest).text.trim().slice(0, ASKED_CHARS) }
  }

  /** A run that couldn't be started (the runner wasn't reachable). */
  async failRun(id: string, error: string): Promise<void> {
    this.ctx.storage.sql.exec("UPDATE runs SET status = 'failed', error = ?, updated = ? WHERE id = ?", error, Date.now(), id)
  }

  // ---------------------------------------------------------------- other apps' changes (changes.ts)

  private changeRecords(tripId: string): ChangeRecord[] {
    // (Without the trips from before: they're large, and needed only to undo.)
    return this.ctx.storage.sql.exec<ChangeRow>('SELECT id, trip_id, grant_id, app, tool, summary, rev_before, rev_after, created, undone FROM changes WHERE trip_id = ? ORDER BY rev_after DESC', tripId).toArray().map((c) => ({
      id: c.id, tripId: c.trip_id, grant: c.grant_id, app: c.app, tool: c.tool, summary: JSON.parse(c.summary) as string[],
      revBefore: c.rev_before, revAfter: c.rev_after, created: c.created, undone: c.undone === 1,
    }))
  }

  /** Another app's change to a trip (its data, checked, as JSON text), made on the trip at rev `base`: saved, with the
   *  trip from before for undo. Refused while the app's assistant works on the trip, or if the trip changed since. */
  async saveChange(tripId: string, base: number, data: string, change: { grant: string | null; app: string; tool: string; summary: string[] }): Promise<{ change: ChangeView } | string | null> {
    const r = this.row(tripId)
    if (!r) return null
    if (this.activeRun(tripId)) return BUSY_OUTSIDE
    if (r.rev !== base) return 'The trip changed while this was being done (in the app, or by another app): look at it again and retry.'
    const saved = this.write(tripId, { data }, { who: 'app', app: change.app }, true)
    const now = Date.now()
    const id = crypto.randomUUID()
    this.ctx.storage.sql.exec('INSERT INTO changes (id, trip_id, grant_id, app, tool, summary, before, rev_before, rev_after, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, tripId, change.grant, change.app, change.tool, JSON.stringify(change.summary), r.data, r.rev, saved.rev, now)
    // The oldest go (and with them, undoing that far back).
    this.ctx.storage.sql.exec('DELETE FROM changes WHERE trip_id = ? AND (created < ? OR id IN (SELECT id FROM changes WHERE trip_id = ? ORDER BY rev_after DESC LIMIT -1 OFFSET ?))',
      tripId, now - CHANGE_KEEP_MS, tripId, CHANGE_KEEP)
    return { change: changeView(this.changeRecords(tripId).find((c) => c.id === id)!) }
  }

  /** A trip's rev and the changes other apps made to it from rev `since` on (all those kept without it), newest first. */
  async listChanges(tripId: string, since?: number): Promise<{ rev: number; changes: ChangeView[] } | null> {
    const r = this.row(tripId)
    if (!r) return null
    return { rev: r.rev, changes: this.changeRecords(tripId).filter((c) => since === undefined || c.revBefore >= since).map(changeView) }
  }

  /** Undoes a change (`id`), or an app's own latest (`grant`; null: anyone's), with every later one still on: puts
   *  back the trip from before it. Refused when the trip has changed in other ways since (changes.ts). `by`: who
   *  undoes it (the user, or the app), for the version history. */
  async undoChange(tripId: string, which: { id: string } | { grant: string | null }, by: VersionBy): Promise<{ undone: ChangeView[]; rev: number } | string | null> {
    const r = this.row(tripId)
    if (!r) return null
    if (this.activeRun(tripId)) return BUSY_OUTSIDE
    const changes = this.changeRecords(tripId)
    const target = 'id' in which ? changes.find((c) => c.id === which.id) : latestOf(changes, which.grant)
    if (!target) return 'id' in which ? 'No such change (only the latest few of the last two weeks are kept).' : 'There\'s no change to undo.'
    const set = undoSet(changes, target, r.rev)
    if (typeof set === 'string') return set
    const joined = joinedBefore(changes, set)
    const before = this.ctx.storage.sql.exec<{ before: string | null }>('SELECT before FROM changes WHERE id = ?', target.id).one().before
    const saved = this.write(tripId, { data: before } as TripPatch, by, true)
    for (const c of set) this.ctx.storage.sql.exec('UPDATE changes SET undone = 1 WHERE id = ?', c.id)
    if (joined) this.ctx.storage.sql.exec('UPDATE changes SET rev_after = ? WHERE id = ?', saved.rev, joined)
    return { undone: set.map((c) => changeView({ ...c, undone: true })), rev: saved.rev }
  }

  // ---------------------------------------------------------------- other apps allowed (oauth.ts)

  private grant(id: string): GrantRow | null {
    return this.ctx.storage.sql.exec<GrantRow>('SELECT * FROM grants WHERE id = ?', id).toArray()[0] ?? null
  }

  private dropGrant(id: string) {
    this.ctx.storage.sql.exec('DELETE FROM grants WHERE id = ?', id)
  }

  /** The user allowed an app: its grant, pending until the app takes its tokens. */
  async addGrant(g: NewGrant): Promise<string> {
    const now = Date.now()
    // Apps allowed and never connected (the code not used in time) are forgotten, and the ones used longest ago go
    // when there are too many.
    this.ctx.storage.sql.exec("DELETE FROM grants WHERE status = 'pending' AND created < ?", now - GRANT_PENDING_MS)
    const id = crypto.randomUUID()
    this.ctx.storage.sql.exec("INSERT INTO grants (id, client, redirect, scope, status, gen, created, used) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)",
      id, g.client, g.redirect, g.scope, now, now)
    this.ctx.storage.sql.exec('DELETE FROM grants WHERE id IN (SELECT id FROM grants ORDER BY used DESC LIMIT -1 OFFSET ?)', GRANT_LIMIT)
    return id
  }

  /** The app took its first tokens with the code: its refresh tokens' generation. A code used again removes the
   *  grant (whoever has it may not be the app). */
  async activateGrant(id: string): Promise<{ scope: string; gen: number } | null> {
    const g = this.grant(id)
    if (!g) return null
    if (g.status !== 'pending') {
      this.dropGrant(id)
      return null
    }
    this.ctx.storage.sql.exec("UPDATE grants SET status = 'active', gen = 1, used = ? WHERE id = ?", Date.now(), id)
    return { scope: g.scope, gen: 1 }
  }

  /** The app's refresh token of this generation, used: the next one's. An older one removes the grant (refresh
   *  tokens are used once, so it was copied). */
  async rotateGrant(id: string, gen: number): Promise<{ scope: string; gen: number } | null> {
    const g = this.grant(id)
    if (g?.status !== 'active') return null
    if (g.gen !== gen) {
      this.dropGrant(id)
      return null
    }
    this.ctx.storage.sql.exec('UPDATE grants SET gen = ?, used = ? WHERE id = ?', gen + 1, Date.now(), id)
    return { scope: g.scope, gen: gen + 1 }
  }

  /** An access token of the grant's, used: whether it's still allowed, what for and which app it is (and when it was
   *  last used, roughly). */
  async useGrant(id: string): Promise<{ scope: string; client: string } | null> {
    const g = this.grant(id)
    if (g?.status !== 'active') return null
    const now = Date.now()
    if (now - g.used > GRANT_USED_MS) this.ctx.storage.sql.exec('UPDATE grants SET used = ? WHERE id = ?', now, id)
    return { scope: g.scope, client: g.client }
  }

  /** The apps allowed, the one used last first. */
  async listGrants(): Promise<Grant[]> {
    return this.ctx.storage.sql.exec<Grant>("SELECT id, client, redirect, scope, created, used FROM grants WHERE status = 'active' ORDER BY used DESC").toArray()
  }

  /** Disconnects an app: its tokens stop working at once. */
  async revokeGrant(id: string): Promise<boolean> {
    const existed = !!this.grant(id)
    this.dropGrant(id)
    return existed
  }
}
