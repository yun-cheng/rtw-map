// Phrases read aloud by Azure's text-to-speech (a computer voice, not recordings of people). Shared by the script
// that makes the app's own phrases' clips ahead of time (scripts/build-speech.ts, data/gen/speech/), the Worker that
// makes one for a phrase of the user's (POST /api/speech) and the app that plays them (src/ui/Speak.tsx).
import { phraseAs } from '../planner/phrases'
import type { Speaker } from '../planner/types'

/** data/gen/speech.json: the voices used for each language (tag → a woman's and a man's Azure voice, where Azure
 *  has them), and the app's phrases' clips. */
export type SpeechIndex = {
  _meta: { source: string; updatedAt: string }
  voices: Record<string, Partial<Record<Speaker, SpeechVoice>>>
  /** tag → who says it → phrase key → the clip's file name, under /speech/<tag>/ (its name changes with the text or
   *  voice). Both speakers have clips where the language has a voice, in the other's voice where it has only one. */
  clips: Record<string, Partial<Record<Speaker, Record<string, string>>>>
}

/** An Azure voice ("sq-AL-AnilaNeural"), its locale, and whether it speaks as a man or a woman. */
export type SpeechVoice = { voice: string; locale: string; gender: Speaker }

/** The language's voice for the speaker: theirs, else the other one Azure has. */
export function voiceOf(index: Pick<SpeechIndex, 'voices'>, tag: string, speaker: Speaker): SpeechVoice | undefined {
  const v = Object.hasOwn(index.voices, tag) ? index.voices[tag] : undefined
  return v?.[speaker] ?? v?.[speaker === 'female' ? 'male' : 'female']
}

/** MP3, small enough for a few words: about 6 kB a second. */
export const SPEECH_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
/** The longest phrase of the user's the Worker reads (a sentence or two). */
export const SPEECH_CHARS = 200

export const speechEndpoint = (region: string) => `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`
export const voicesEndpoint = (region: string) => `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** What Azure is asked to read: the text, in the voice, a little slower than normal (it's for learning). */
export function ssml(voice: SpeechVoice, text: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.locale}"><voice name="${voice.voice}"><prosody rate="-10%">${escapeXml(text.trim())}</prosody></voice></speak>`
}

/** A phrase of the user's as the speaker says it (Thai's polite word, written for both, as theirs: phraseAs). */
export function spokenText(tag: string, text: string, speaker: Speaker): string {
  return phraseAs(tag, { text: text.trim(), say: '' }, speaker).text
}

/** A clip's name: the same text in the same voice always has the same one (a short hash). */
export async function clipName(voice: string, text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${voice}|${text.trim()}`))
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Reads the text aloud with Azure: the MP3, or the error. */
export async function synthesize(voice: SpeechVoice, text: string, key: string, region: string, fetcher: typeof fetch = fetch): Promise<ArrayBuffer | { status: number; error: string }> {
  const res = await fetcher(speechEndpoint(region), {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': SPEECH_FORMAT, 'User-Agent': 'rtw-map' },
    body: ssml(voice, text),
  })
  if (!res.ok) return { status: res.status, error: (await res.text().catch(() => '')).slice(0, 200) }
  return res.arrayBuffer()
}
