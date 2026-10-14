// Tells the user the assistant has finished when they're elsewhere (a reply, a plan, can take minutes). The tab's title
// says so until they come back. Once they've allowed notifications ("Notify me when it's done" while it works,
// AssistantPanel.tsx), the browser shows one too: sent by the server when this browser is signed up for it (Web Push,
// worker/push.ts; in the built app, which has the service worker), so it comes with the app closed, else shown by the
// page while it's open. A click on it brings the app to the front, at that trip's chat (pwa/sw.ts).
import { create } from 'zustand'
import { b64url, doneNotice } from '../../worker/push'
import { useSaved } from '../store/saved'
import { useTrip } from '../store/trip'
import { useAccount } from './account'
import { useChat } from './chat'

const supported = () => typeof Notification !== 'undefined'

type NotifyState = {
  /** Whether the browser may show notifications: 'default' until the user is asked; null where it can't show them. */
  permission: NotificationPermission | null
  /** This browser gets the server's notifications (with the app closed too). */
  push: boolean
}

export const useNotify = create<NotifyState>(() => ({ permission: supported() ? Notification.permission : null, push: false }))

/** Asks the browser (on a click: it asks the user); allowed, signs this browser up for the server's notifications. */
export async function askToNotify() {
  if (!supported()) return
  const permission = await Notification.requestPermission().catch(() => Notification.permission)
  useNotify.setState({ permission })
  if (permission === 'granted') await signUp()
}

const registration = () => navigator.serviceWorker?.getRegistration().catch(() => undefined) ?? Promise.resolve(undefined)

/** Signs this browser up for the server's notifications (again: the server keeps the latest), when signed in and
 *  allowed. */
async function signUp() {
  try {
    const reg = await registration()
    if (!reg?.pushManager || !useAccount.getState().user || Notification.permission !== 'granted') return
    const { key } = (await (await fetch('/api/push')).json()) as { key: string | null }
    if (!key) return
    let sub = await reg.pushManager.getSubscription()
    // (Signed up with an older key of the site's: again with this one.)
    const old = sub?.options.applicationServerKey
    if (sub && old && b64url.encode(new Uint8Array(old)) !== key) {
      await sub.unsubscribe()
      sub = null
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url.decode(key) })
    const res = await fetch('/api/push', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) })
    useNotify.setState({ push: res.ok })
  } catch {
    // (Not here: the page shows its own while it's open.)
  }
}

/** Signed out: this browser no longer gets that account's notifications (the server forgets it at the next one). */
async function signOff() {
  useNotify.setState({ push: false })
  await (await registration())?.pushManager?.getSubscription().then((sub) => sub?.unsubscribe()).catch(() => {})
}

/** The page's title before the notice, and the title with it. */
let title: string | null = null
let marked: string | null = null
let shown: Notification | null = null

/** Back in the tab: the title and notification go. */
function back() {
  // (Unless the page has put its own title meanwhile.)
  if (title !== null && document.title === marked) document.title = title
  title = marked = null
  shown?.close()
  shown = null
  void registration().then((reg) => reg?.getNotifications({ tag: doneNotice(null).tag })).then((n) => n?.forEach((x) => x.close())).catch(() => {})
}

/** The page's own notification, when the server doesn't send one to this browser. */
async function notify(notice: ReturnType<typeof doneNotice>) {
  if (useNotify.getState().permission !== 'granted' || useNotify.getState().push) return
  const options: NotificationOptions = { body: notice.body, tag: notice.tag, icon: '/icons/icon-192.png', data: { tripId: notice.tripId } }
  // (A phone's browser shows them only through the service worker; it's not there in development.)
  const reg = await registration()
  if (reg?.active) return void reg.showNotification(notice.title, options).catch(() => {})
  try {
    shown = new Notification(notice.title, options)
    shown.onclick = () => window.focus()
  } catch {
    // (Not allowed here after all.)
  }
}

/** From a notification's click (pwa/sw.ts): that trip's chat. */
function openTrip(tripId: unknown) {
  if (typeof tripId === 'string' && useSaved.getState().activeId !== tripId && useSaved.getState().trips.some((t) => t.id === tripId)) void useSaved.getState().open(tripId)
  useTrip.getState().setPanel('assistant')
}

export function startDoneNotice() {
  window.addEventListener('focus', back)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && document.hasFocus() && back())
  navigator.serviceWorker?.addEventListener('message', (e) => (e.data as { type?: string } | null)?.type === 'open-trip' && openTrip(e.data.tripId))
  useAccount.subscribe((s, prev) => {
    if (s.user && !prev.user) void signUp()
    else if (!s.user && prev.user) void signOff()
  })
  useChat.subscribe((s, prev) => {
    if (!prev.busy || s.busy) return
    // (Once the run's end is all in: a failed run's error is added just after.)
    setTimeout(() => {
      if (document.hasFocus() || useChat.getState().busy) return
      const last = useChat.getState().messages.at(-1)
      if (last?.role !== 'assistant') return
      const { activeId, trips } = useSaved.getState()
      const trip = trips.find((t) => t.id === activeId)
      const notice = doneNotice(last, trip && { id: trip.id, name: trip.name })
      if (document.title !== marked) title = document.title
      marked = document.title = `${last.error ? '!' : '✓'} ${doneNotice(last).title} · ${title}`
      void notify(notice)
    }, 0)
  })
}
