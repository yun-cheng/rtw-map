// A phrase of the user's read aloud (POST /api/speech): the app's own phrases have clips made ahead of time
// (scripts/build-speech.ts); the ones the assistant translated for the user are read when first played, by Azure in
// the language's voice (data/gen/speech.json), and kept by the browser. Signed-in users only, a few a minute.
import speechJson from '../data/gen/speech.json'
import { SPEECH_CHARS, spokenText, synthesize, voiceOf, type SpeechIndex, type SpeechVoice } from '../src/data/speech'

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

/** The MP3 of the text, or an error response. */
export async function speech(raw: unknown, key: string, region: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const req = parseSpeechRequest(raw)
  if (typeof req === 'string') return Response.json({ error: req }, { status: 400 })
  const audio = await synthesize(req.voice, req.text, key, region, fetcher)
  if (!(audio instanceof ArrayBuffer)) {
    console.error('Azure speech error', audio.status, audio.error)
    return Response.json({ error: audio.status === 429 ? 'Too many phrases at once: try again in a minute.' : 'The phrase couldn\'t be read aloud.' }, { status: audio.status === 429 ? 429 : 502 })
  }
  // (The same text always sounds the same: the browser keeps it.)
  return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=31536000, immutable' } })
}
