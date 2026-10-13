// 🔊 beside a phrase: plays it read aloud. The app's own phrases have clips made ahead of time by Azure
// (data/gen/speech, scripts/build-speech.ts); the user's own are read by Azure when first played (POST /api/speech,
// signed in); both are kept on the device (src/offline/phrases.ts), so a phrase played once plays offline (and
// Settings can save them all beforehand). Where there's no clip (Azure has no voice for the language, or it can't be
// reached), the device's own voice reads it, if it has one for the language. No button when there's neither.
import { Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAccount } from '../agent/account'
import { appClip, canRead, clipUrl, userClip } from '../offline/phrases'
import { phraseAs, type PhraseKey } from '../planner'
import { SHARED_TOKEN } from '../store/shareLink'
import { useTrip } from '../store/trip'

const hasDeviceSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window

/** The device's voices, once it has listed them (some browsers list them a moment after the page opens). */
function useDeviceVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(() => (hasDeviceSpeech ? speechSynthesis.getVoices() : []))
  useEffect(() => {
    if (!hasDeviceSpeech) return
    const update = () => setVoices(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', update)
    return () => speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  return voices
}

/** The device's voice for a language tag: the same language and country ("pt-BR"), else the language. */
function deviceVoice(tag: string, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const lang = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase()
  const want = tag.toLowerCase()
  return voices.find((v) => lang(v) === want) ?? voices.find((v) => lang(v).split('-')[0] === want.split('-')[0])
}

/** What's playing, so a second phrase stops the first. */
let playing: { audio: HTMLAudioElement; url: string } | null = null
function stop() {
  if (playing) {
    playing.audio.pause()
    URL.revokeObjectURL(playing.url)
    playing = null
  }
  if (hasDeviceSpeech) speechSynthesis.cancel()
}

function playBlob(blob: Blob, done: () => void) {
  stop()
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  playing = { audio, url }
  audio.onended = audio.onerror = () => {
    if (playing?.audio === audio) stop()
    done()
  }
  return audio.play()
}

function playDevice(voice: SpeechSynthesisVoice, text: string, done: () => void) {
  stop()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = 0.9
  u.onend = u.onerror = done
  speechSynthesis.speak(u)
}

/**
 * `phrase`: one of the app's phrases (its clip); without it, a phrase of the user's (`text`, read when first played).
 * `tag`: the language. Said as the speaker set in Settings says it (their words and voice).
 */
export function Speak({ tag, text, phrase }: { tag: string; text: string; phrase?: PhraseKey }) {
  const user = useAccount((s) => s.user)
  const speaker = useTrip((s) => s.speaker)
  const voices = useDeviceVoices()
  const [busy, setBusy] = useState(false)
  const clip = phrase ? clipUrl(tag, phrase, speaker) : undefined
  const server = !phrase && canRead(tag) && !!user && !SHARED_TOKEN
  const device = deviceVoice(tag, voices)
  if (!clip && !server && !device) return null

  const done = () => setBusy(false)
  const play = async () => {
    setBusy(true)
    try {
      if (clip) return await playBlob(await appClip(clip), done)
      if (server) return await playBlob(await userClip(tag, text, speaker), done)
    } catch {
      // (Offline and not kept, or Azure couldn't read it: the device's voice, below.)
    }
    if (device) playDevice(device, phraseAs(tag, { text, say: '' }, speaker).text, done)
    else done()
  }

  return (
    <button
      onClick={() => void play()}
      aria-label={`Listen to "${text}"`}
      title={clip || server ? 'Listen (a computer voice)' : 'Listen (your device\'s voice)'}
      className={`shrink-0 self-center rounded-full p-0.5 hover:bg-accent-soft hover:text-accent ${busy ? 'animate-pulse text-accent' : 'text-muted'}`}
    >
      <Volume2 size={14} />
    </button>
  )
}
