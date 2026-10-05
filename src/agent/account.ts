// Who is signed in for the trip assistant, and how many messages they have left today. The session itself is an
// HttpOnly cookie set by the Worker; this only mirrors what /api/session reports.
import { create } from 'zustand'

export type User = { sub: string; name: string; picture?: string }
export type Usage = { used: number; limit: number; remaining: number; resetsAt: string }

type AccountState = {
  loaded: boolean
  /** OAuth client ID for "Sign in with Google"; null when sign-in isn't set up on the server. */
  clientId: string | null
  user: User | null
  usage: Usage | null
  error: string | null
  load: () => Promise<void>
  signIn: (credential: string) => Promise<void>
  signOut: () => Promise<void>
  setUsage: (usage: Usage) => void
  signedOut: () => void
}

const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

export const useAccount = create<AccountState>()((set) => ({
  loaded: false,
  clientId: null,
  user: null,
  usage: null,
  error: null,

  load: async () => {
    try {
      const res = await fetch('/api/session')
      const data = await res.json()
      set({ loaded: true, clientId: data.clientId || null, user: data.user, usage: data.usage, error: null })
    } catch {
      set({ loaded: true, error: 'The assistant is not reachable right now.' })
    }
  },

  signIn: async (credential) => {
    const res = await post('/api/auth/google', { credential })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.user) return set({ error: data?.error ?? 'Sign-in failed: please try again.' })
    set({ user: data.user, usage: data.usage, error: null })
  },

  signOut: async () => {
    await post('/api/auth/logout').catch(() => null)
    window.google?.accounts.id.disableAutoSelect()
    set({ user: null, usage: null })
  },

  setUsage: (usage) => set({ usage }),
  signedOut: () => set({ user: null, usage: null }),
}))

// ---------------------------------------------------------------- "Sign in with Google" (Google Identity Services)

type GoogleId = {
  initialize: (options: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean; use_fedcm_for_prompt?: boolean }) => void
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
  disableAutoSelect: () => void
}
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

let script: Promise<void> | null = null
const loadScript = () => (script ??= new Promise<void>((resolve, reject) => {
  const s = document.createElement('script')
  s.src = 'https://accounts.google.com/gsi/client?hl=en' // the app is English-only
  s.async = true
  s.onload = () => resolve()
  s.onerror = () => {
    script = null
    reject(new Error('Could not load Google sign-in'))
  }
  document.head.append(s)
}))

let initializedFor: string | null = null

/** Renders Google's sign-in button into `parent`; signing in calls the Worker with the ID token. */
export async function renderGoogleButton(parent: HTMLElement, clientId: string, compact = false) {
  await loadScript()
  const id = window.google!.accounts.id
  if (initializedFor !== clientId) {
    id.initialize({ client_id: clientId, callback: ({ credential }) => void useAccount.getState().signIn(credential), use_fedcm_for_prompt: true })
    initializedFor = clientId
  }
  id.renderButton(parent, {
    type: 'standard', theme: 'outline', shape: 'pill', logo_alignment: 'left', locale: 'en',
    size: compact ? 'medium' : 'large', text: compact ? 'signin' : 'signin_with',
  })
}
