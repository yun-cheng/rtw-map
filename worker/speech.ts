// A phrase of the user's read aloud (POST /api/speech): the app's own phrases have clips made ahead of time
// (scripts/build-speech.ts); the ones the assistant translated for the user are read when first played, by Azure in
// the language's voice (data/gen/speech.json), and kept by the browser. Each clip Azure reads is also kept in R2 by
// its voice and text, so the same phrase asked for again, by anyone, comes from there: only phrases never read before
// reach Azure and count towards the account's day. Signed-in users only, a few a minute.
import speechJson from '../data/gen/speech.json'
import { clipName, SPEECH_CHARS, spokenText, synthesize, voiceOf, type SpeechIndex, type SpeechVoice } from '../src/data/speech'

const INDEX = speechJson as unknown as SpeechIndex

/** The language's voice and the text to read ({ lang, text, speaker }: a woman's or a man's), or why not. */
export function parseSpeechRequest(raw: unknown, index: Pick<SpeechIndex, 'voices'> = INDEX): { voice: SpeechVoice; text: string } | string {
  const { lang, text, speaker: who } = (raw ?? {}) as { lang?: unknown; text?: unknown; speaker?: unknown }
  if (typeof lang !== 'string' || typeof text !== 'string' || !text.trim()) return 'Invalid request'
  if (text.length > SPEECH_CHARS) return `Too long to read aloud (at most ${SPEECH_CHARS} characters)`
  const speaker = who === 'male' ? 'male' : 'female'
  const voice = voiceOf(index, lang, speaker)
  if (!voice) return 'No voice for this language'
  return { voice, text: spokenText(lang, text, speaker) }
}

/** Where clips read before are kept (an R2 bucket), by name. */
export type ClipStore = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
  put(key: string, body: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
}

export type SpeechDeps = {
  key: string
  region: string
  /** Clips read before (none: every phrase goes to Azure). */
  store?: ClipStore
  /** Counts one of the account's phrases for the day, or says they're used up (false); `giveBack` undoes it. */
  take: () => Promise<boolean>
  giveBack: () => Promise<void>
  /** The message when the day's are used up. */
  usedUp: string
  fetcher?: typeof fetch
}

// (The same text always sounds the same: the browser keeps it.)
const mp3 = (audio: ArrayBuffer) => new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=31536000, immutable' } })

/** The MP3 of the text: kept from before, else read by Azure (and kept), or an error response. */
export async function speech(raw: unknown, deps: SpeechDeps): Promise<Response> {
  const req = parseSpeechRequest(raw)
  if (typeof req === 'string') return Response.json({ error: req }, { status: 400 })
  const name = `own/${await clipName(req.voice.voice, req.text)}.mp3`
  const kept = await deps.store?.get(name).catch(() => null)
  if (kept) return mp3(await kept.arrayBuffer())
  if (!(await deps.take())) return Response.json({ error: deps.usedUp, daily: true }, { status: 429 })
  const audio = await synthesize(req.voice, req.text, deps.key, deps.region, deps.fetcher)
  if (!(audio instanceof ArrayBuffer)) {
    await deps.giveBack()
    console.error('Azure speech error', audio.status, audio.error)
    return Response.json({ error: audio.status === 429 ? 'Too many phrases at once: try again in a minute.' : 'The phrase couldn\'t be read aloud.' }, { status: audio.status === 429 ? 429 : 502 })
  }
  await deps.store?.put(name, audio, { httpMetadata: { contentType: 'audio/mpeg' } }).catch((e) => console.error('Keeping a clip', e))
  return mp3(audio)
}
