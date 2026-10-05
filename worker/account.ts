// One Durable Object per signed-in Google account (keyed by its account ID). It holds today's assistant usage.
// A Durable Object handles one request at a time, so the counts can't race. The rules are plain functions in limits.ts.
import { DurableObject } from 'cloudflare:workers'
import { current, refund, take, type Count } from './limits'

export class Account extends DurableObject {
  private async count(day: string): Promise<Count> {
    return current(await this.ctx.storage.get<Count>('count'), day)
  }

  async status(day: string): Promise<Count> {
    return this.count(day)
  }

  async take(day: string, message: boolean): Promise<{ ok: boolean; count: Count }> {
    const { ok, next } = take(await this.count(day), message)
    if (ok) await this.ctx.storage.put('count', next)
    return { ok, count: next }
  }

  async refund(day: string, message: boolean): Promise<Count> {
    const next = refund(await this.count(day), message)
    await this.ctx.storage.put('count', next)
    return next
  }
}
