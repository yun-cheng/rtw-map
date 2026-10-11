// The service worker (pwa/sw.ts): the app opens and works with no connection, installed on a phone's home screen or
// not. A new version, once downloaded, waits for the user (UpdateNotice): taking over while the page is open would
// mix two versions' files.
import { create } from 'zustand'

/** A new version, downloaded and waiting. */
export const useUpdate = create<{ waiting: ServiceWorker | null }>(() => ({ waiting: null }))

let updating = false

/** Switches to the waiting version and reloads the page on it. */
export function applyUpdate() {
  const { waiting } = useUpdate.getState()
  if (!waiting) return
  updating = true
  waiting.postMessage('update')
}

export function registerServiceWorker() {
  // (Not in development: the dev server's files change all the time.)
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('controllerchange', () => updating && location.reload())
  window.addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register('/sw.js').catch(() => null)
    if (!reg) return
    // (The first version installs without asking: there's nothing to replace.)
    const waitFor = (w: ServiceWorker | null) => {
      if (!w || !navigator.serviceWorker.controller) return
      if (w.state === 'installed') useUpdate.setState({ waiting: w })
      else w.addEventListener('statechange', () => w.state === 'installed' && useUpdate.setState({ waiting: w }))
    }
    waitFor(reg.waiting)
    reg.addEventListener('updatefound', () => waitFor(reg.installing))
    // A phone's app may stay open for days: look for a new version each time it comes back to the front.
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reg.update().catch(() => {}))
    // Installed: ask the browser to keep the cache when the device runs short of space (in a tab, Firefox would ask
    // the user, so only then).
    if (matchMedia('(display-mode: standalone)').matches) void navigator.storage?.persist?.()
  })
}
