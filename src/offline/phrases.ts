// The phrases' clips on the device (Cache Storage, `phrase-speech`): each kept once played (src/ui/Speak.tsx), so it
// plays with no connection after that. The app's phrases are static files (/speech/<tag>/…, scripts/build-speech.ts);
// the user's are read by Azure through the Worker (signed in) and kept under a made-up address with the same text,
// language and voice in it, so each is read once.
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
  return blob
}

/** One of the app's phrases' clips. */
export const appClip = (url: string) => cached(url, () => fetch(url))

/** A phrase of the user's, read by Azure the first time. */
export async function userClip(tag: string, text: string, speaker: Speaker): Promise<Blob> {
  const { key, get } = await ownClip(tag, text, speaker)
  return cached(key, get)
}
