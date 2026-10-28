// The service worker: keeps the app on the device, so it opens and works with no connection (on the road, §14). The
// built app holds the city data, so caching it covers the city panels too; the trip is in the browser's storage
// already. Built by pwa/plugin.ts, which puts the built files (PRECACHE) and their VERSION in front of this.
//
// - The app's own files: from the cache, each version cached whole when it installs; a new version waits for the page
//   to say so (the "new version" notice, src/pwa.ts).
// - The map's tiles: kept as they're fetched (the latest TILE_LIMIT), so places looked at work offline, and the
//   areas downloaded for the trip's cities (src/offline/download.ts, OFFLINE, written by the page). Kept by place,
//   not by the map's weekly version: the current version's tile when there's a connection, else any kept one.
// - The map's style, sprites and labels' fonts, and the app's font: the cached copy at once, refreshed behind it.
// - /api (the account, trips, assistant), the pages and addresses of other apps' sign-in (/oauth, /.well-known) and
//   their MCP server (/mcp), and everything else: the network only.

declare const self: ServiceWorkerGlobalScope
declare const PRECACHE: string[]
declare const VERSION: string

const APP = `app-${VERSION}`
const TILES = 'map-tiles-2'
const OFFLINE = 'map-offline'
const STATIC = 'map-style'
const TILE_LIMIT = 2500
/** Paths the site's Worker answers, never the app: a page there (the sign-in for other apps) must not be the app. */
const SERVER = ['/api/', '/internal/', '/oauth/', '/.well-known/', '/mcp']
/** Caches of earlier versions of this worker, no longer used. */
const OLD = ['map-tiles']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(PRECACHE)))
})

self.addEventListener('message', (e) => {
  if (e.data === 'update') void self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) if ((name.startsWith('app-') && name !== APP) || OLD.includes(name)) await caches.delete(name)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  // (The page's own downloads, for the offline map: straight to the network.)
  if (req.method !== 'GET' || req.cache === 'no-store') return
  const url = new URL(req.url)
  if (url.origin === self.location.origin) {
    if (SERVER.some((p) => url.pathname.startsWith(p))) return
    // Any page is the app (it reads the address itself).
    if (req.mode === 'navigate') return e.respondWith(fromApp('/', req))
    return e.respondWith(fromApp(req, req))
  }
  if (url.hostname === 'tiles.openfreemap.org') {
    return e.respondWith(/\/\d+\/\d+\/\d+\.(pbf|png)$/.test(url.pathname) ? tile(req) : refreshed(req, e))
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return e.respondWith(refreshed(req, e))
})

/** Cached copies are found by address alone: a server's "Vary: Origin" would otherwise miss a module script (sent
 *  with an Origin) for the copy cached at install (without). */
const BY_URL = { ignoreVary: true }

/** The app's file from this version's cache, else the network (a file of a newer version, or not cached). */
async function fromApp(key: RequestInfo, req: Request) {
  const cached = await (await caches.open(APP)).match(key, BY_URL)
  return cached ?? fetch(req)
}

/** A tile's place, the same under any version of the map: ".../planet/<version>/z/x/y.pbf" as ".../planet/_/z/x/y.pbf"
 *  (as src/offline/tiles.ts writes it), and the version. */
function tilePlace(url: string): { key: string; version: string } {
  const m = url.match(/^(.*\/planet\/)([^/]+)(\/\d+\/\d+\/\d+\.pbf)$/)
  return m ? { key: `${m[1]}_${m[3]}`, version: m[2] } : { key: url, version: '' }
}
/** The header a kept tile carries its map version in. */
const VERSION_HEADER = 'x-tile-version'

let puts = 0
async function tile(req: Request) {
  const { key, version } = tilePlace(req.url)
  const copies = [await (await caches.open(OFFLINE)).match(key, BY_URL), await (await caches.open(TILES)).match(key, BY_URL)]
  const current = copies.find((c) => c?.headers.get(VERSION_HEADER) === version)
  if (current) return current
  const kept = copies.find(Boolean)
  let res: Response
  try {
    res = await fetch(req)
  } catch (err) {
    // Offline: a tile of another version is better than none.
    if (kept) return kept
    throw err
  }
  // (A tile the server can't give now: the kept one, of another version.)
  if (!res.ok && kept) return kept
  if (res.ok) {
    const cache = await caches.open(TILES)
    const headers = new Headers(res.headers)
    headers.set(VERSION_HEADER, version)
    await cache.put(key, new Response(await res.clone().blob(), { status: res.status, headers }))
    // Now and then, drop the oldest beyond the limit.
    if (++puts % 100 === 0) {
      const keys = await cache.keys()
      await Promise.all(keys.slice(0, Math.max(0, keys.length - TILE_LIMIT)).map((k) => cache.delete(k)))
    }
  }
  return res
}

/** The cached copy at once (refreshed behind it), else the network. */
async function refreshed(req: Request, e: FetchEvent) {
  const cache = await caches.open(STATIC)
  // (Or the labels' glyphs downloaded for the offline map.)
  const cached = (await cache.match(req, BY_URL)) ?? (await (await caches.open(OFFLINE)).match(req, BY_URL))
  const fresh = fetch(req).then(async (res) => {
    if (res.ok) await cache.put(req, res.clone())
    return res
  })
  if (!cached) return fresh
  e.waitUntil(fresh.catch(() => {}))
  return cached
}

// The assistant's notification when it has finished (worker/push.ts, sent with the app closed too; or the page's own,
// src/agent/notify.ts): not while the app is in front (the user sees the reply); a click brings the app to the front,
// at that trip's chat.
self.addEventListener('push', (e) => {
  const n = (e.data?.json() ?? null) as { title?: string; body?: string; tag?: string; tripId?: string } | null
  if (!n?.title) return
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window' })
    if (open.some((c) => c.focused)) return
    await self.registration.showNotification(n.title!, { body: n.body, tag: n.tag, icon: '/icons/icon-192.png', data: { tripId: n.tripId } })
  })())
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const tripId = (e.notification.data as { tripId?: string } | null)?.tripId
  e.waitUntil((async () => {
    const [open] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (!open) return void (await self.clients.openWindow('/?panel=assistant'))
    await open.focus()
    open.postMessage({ type: 'open-trip', tripId })
  })())
})
