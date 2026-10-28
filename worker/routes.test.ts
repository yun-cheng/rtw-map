import { describe, expect, it, vi } from 'vitest'

// (The Account Durable Object needs Cloudflare's runtime; the routing doesn't reach it signed out.)
vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))
const { default: worker } = await import('./index')

const env = { GOOGLE_CLIENT_ID: 'client', ASSETS: { fetch: async () => new Response('app') } } as never
const ctx = {} as ExecutionContext
const call = (method: string, path: string, origin?: string) =>
  worker.fetch(new Request(`https://rtw.example${path}`, { method, headers: origin ? { Origin: origin } : {} }), env, ctx)

describe('the API routes', () => {
  it('answers each address that exists, and only for the methods it takes', async () => {
    const session = await call('GET', '/api/session')
    expect(session.status).toBe(200)
    expect(await session.json()).toMatchObject({ clientId: 'client', user: null })
    // Signed out: the trip routes ask to sign in.
    for (const [method, path] of [['GET', '/api/trips'], ['PUT', '/api/trips/t1'], ['PUT', '/api/trips/t1/journal'], ['POST', '/api/trips/t1/changes/c1/undo'], ['GET', '/api/runs/r1'], ['POST', '/api/chat']]) {
      expect((await call(method, path)).status, `${method} ${path}`).toBe(401)
    }
    for (const [method, path] of [['PUT', '/api/session'], ['GET', '/api/chat'], ['GET', '/api/media'], ['POST', '/api/shared/abc'], ['GET', '/api/nothing'], ['GET', '/api/trips/a/b'], ['GET', '/api/trips/t1/changes/c1']]) {
      expect((await call(method, path)).status, `${method} ${path}`).toBe(404)
    }
  })

  it("refuses changes from other sites' pages (and from pages that hide their address)", async () => {
    for (const origin of ['https://evil.example', 'null']) {
      expect((await call('POST', '/api/trips', origin)).status).toBe(403)
      expect((await call('PUT', '/api/trips/t1/items', origin)).status).toBe(403)
    }
    expect((await call('POST', '/api/trips', 'https://rtw.example')).status).toBe(401)
    expect((await call('GET', '/api/session', 'https://evil.example')).status).toBe(200)
  })

  it('serves the app for everything else', async () => {
    expect(await (await call('GET', '/trip/anything')).text()).toBe('app')
  })
})
