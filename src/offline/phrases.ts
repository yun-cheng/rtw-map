// The phrases' clips on the device (Cache Storage, `phrase-speech`): those played are kept (src/ui/Speak.tsx), and
// Settings' Phrases card saves a set of them beforehand to play with no connection, the trip's languages or every
// language, as the speaker set there says them (their words and voice), with the user's own phrases (read by Azure
// through the Worker, signed in). The app's phrases are static files (/speech/<tag>/…, scripts/build-speech.ts);
// the user's are kept under a made-up address with the same text, language and voice in it, so each is read once.
import { create } from 'zustand'
import speechJson from '../../data/gen/speech.json'
import { clipName, spokenText, voiceOf, type SpeechIndex } from '../data/speech'
import type { PhraseKey, Speaker } from '../planner'

export const speech = speechJson as unknown as SpeechIndex
const CACHE = 'phrase-speech'

/** The address of one of the app's phrases' clips, as the speaker says it; none where the language has no voice. */
export function clipUrl(tag: string, key: PhraseKey, speaker: Speaker): string | undefined {
  const clips = Object.hasOwn(speech.clips, tag) ? speech.clips[tag] : undefined
  const name = (clips?.[speaker] ?? clips?.[speaker === 'female' ? 'male' : 'female'])?.[key]
  return name && `/speech/${tag}/${name}`
}

/** Whether a phrase of the user's in this language can be read by Azure (it has a voice for it). */
export const canRead = (tag: string) => !!voiceOf(speech, tag, 'female')

/** A phrase of the user's: where it's kept, and how to have it read. */
async function ownClip(tag: string, text: string, speaker: Speaker): Promise<{ key: string; get: () => Promise<Response> }> {
  const voice = voiceOf(speech, tag, speaker)!
  const key = `/speech/own/${tag}/${await clipName(voice.voice, spokenText(tag, text, speaker))}.mp3`
  const body = JSON.stringify({ lang: tag, text, speaker })
  return { key, get: () => fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }) }
}

async function openCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE)
  } catch {
    // (No Cache Storage here, e.g. a page not on https: nothing is kept.)
    return null
  }
}

/** The clip from the device, else fetched (and kept). */
async function cached(key: string, get: () => Promise<Response>): Promise<Blob> {
  const cache = await openCache()
  const hit = await cache?.match(key).catch(() => undefined)
  if (hit) return hit.blob()
  const res = await get()
  if (!res.ok || !res.headers.get('Content-Type')?.startsWith('audio/')) throw new Error(`speech ${res.status}`)
  const blob = await res.blob()
  await cache?.put(key, new Response(blob, { headers: { 'Content-Type': 'audio/mpeg' } })).catch(() => {})
  useSavedPhrases.getState().count()
  return blob
}

/** One of the app's phrases' clips. */
export const appClip = (url: string) => cached(url, () => fetch(url))

/** A phrase of the user's, read by Azure the first time. */
export async function userClip(tag: string, text: string, speaker: Speaker): Promise<Blob> {
  const { key, get } = await ownClip(tag, text, speaker)
  return cached(key, get)
}

type SavedPhrases = {
  /** Clips on the device, and their size. */
  clips: number
  bytes: number
  /** While saving: how far. */
  progress: { done: number; total: number } | null
  /** Why the last save stopped short. */
  problem: string | null
  count: () => void
  /** Saves the clips of these languages, and the user's own phrases (signed in), as the speaker says them. */
  save: (tags: string[], own: { tag: string; text: string }[], speaker: Speaker) => Promise<void>
  removeAll: () => Promise<void>
}

/** The clips of these languages, as the speaker says them (their addresses). */
export const clipsOf = (tags: string[], speaker: Speaker) =>
  tags.flatMap((tag) => Object.keys(speech.clips[tag]?.[speaker] ?? speech.clips[tag]?.female ?? {}).map((key) => clipUrl(tag, key as PhraseKey, speaker)!))

/** About how big a set of clips is (12 kB each). */
export const CLIP_BYTES = 12_400

let counting: Promise<void> | null = null
let recount = false

export const useSavedPhrases = create<SavedPhrases>()((set, get) => ({
  clips: 0,
  bytes: 0,
  progress: null,
  problem: null,
  count: () => {
    // (One count at a time; one asked for meanwhile runs after it, so the last count sees every clip.)
    if (counting) {
      recount = true
      return
    }
    counting = (async () => {
      const cache = await openCache()
      const keys = (await cache?.keys().catch(() => [])) ?? []
      let bytes = 0
      for (const k of keys) bytes += (await (await cache!.match(k))?.blob())?.size ?? 0
      set({ clips: keys.length, bytes })
    })().finally(() => {
      counting = null
      if (recount) {
        recount = false
        get().count()
      }
    })
  },
  save: async (tags, own, speaker) => {
    if (get().progress) return
    const cache = await openCache()
    if (!cache) return set({ problem: 'This browser can\'t keep files for offline use.' })
    const jobs: { key: string; get: () => Promise<Response> }[] = clipsOf(tags, speaker).map((url) => ({ key: url, get: () => fetch(url) }))
    for (const p of own) if (canRead(p.tag)) jobs.push(await ownClip(p.tag, p.text, speaker))
    const todo = []
    for (const j of jobs) if (!(await cache.match(j.key))) todo.push(j)
    set({ progress: { done: 0, total: todo.length }, problem: null })
    let problem: string | null = null
    for (const [i, j] of todo.entries()) {
      try {
        await cached(j.key, j.get)
      } catch {
        problem = navigator.onLine ? 'Some phrases couldn\'t be saved: try again in a minute.' : 'No connection: try again when you\'re online.'
        if (!navigator.onLine) break
      }
      set({ progress: { done: i + 1, total: todo.length } })
    }
    set({ progress: null, problem })
    get().count()
  },
  removeAll: async () => {
    try {
      await caches.delete(CACHE)
    } catch {
      // (Nothing kept.)
    }
    set({ clips: 0, bytes: 0, problem: null })
  },
}))
