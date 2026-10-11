// The service worker: keeps the app on the device, so it opens and works with no connection (on the road, §14). The
// built app holds the city data, so caching it covers the city panels too; the trip is in the browser's storage
// already. Built by pwa/plugin.ts, which puts the built files (PRECACHE) and their VERSION in front of this.
//
// - The app's own files: from the cache, each version cached whole when it installs; a new version waits for the page
//   to say so (the "new version" notice, src/pwa.ts).
// - The map's tiles: kept as they're fetched (the latest TILE_LIMIT), so places looked at work offline.
// - The map's style, sprites and labels' fonts, and the app's font: the cached copy at once, refreshed behind it.
// - /api (the account, trips, assistant) and everything else: the network only.

declare const self: ServiceWorkerGlobalScope
declare const PRECACHE: string[]
declare const VERSION: string

const APP = `app-${VERSION}`
const TILES = 'map-tiles'
const STATIC = 'map-style'
const TILE_LIMIT = 2500

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(PRECACHE)))
})

self.addEventListener('message', (e) => {
  if (e.data === 'update') void self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('app-') && name !== APP) await caches.delete(name)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/internal/')) return
    // Any page is the app (it reads the address itself).
    if (req.mode === 'navigate') return e.respondWith(fromApp('/', req))
    return e.respondWith(fromApp(req, req))
  }
  if (url.hostname === 'tiles.openfreemap.org') {
    // Tiles are under a dated version of the map, so a tile never changes.
    return e.respondWith(/\/\d+\/\d+\/\d+\.pbf$/.test(url.pathname) ? tile(req) : refreshed(req, e))
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

let puts = 0
async function tile(req: Request) {
  const cache = await caches.open(TILES)
  const cached = await cache.match(req, BY_URL)
  if (cached) return cached
  const res = await fetch(req)
  if (res.ok) {
    await cache.put(req, res.clone())
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
  const cached = await cache.match(req, BY_URL)
  const fresh = fetch(req).then(async (res) => {
    if (res.ok) await cache.put(req, res.clone())
    return res
  })
  if (!cached) return fresh
  e.waitUntil(fresh.catch(() => {}))
  return cached
}
