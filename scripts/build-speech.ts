// Reads the app's phrases (data/gen/phrases.json) aloud with Azure's text-to-speech, as a woman and as a man says
// them (her own words where they differ, phraseAs; each in a woman's or a man's voice, or the one Azure has), into
// data/gen/speech/<tag>/<name>.mp3, and writes data/gen/speech.json: the voices used for each language and the clips.
// A computer voice, not recordings of people. Languages Azure has no voice for get none (the app then tries the
// device's own voice). Only new or changed phrases are read again, so running it after a phrase changes is cheap.
// Needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in the environment or .env.local.
//   tsx scripts/build-speech.ts            every language
//   tsx scripts/build-speech.ts sq mk      only these
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { clipName, synthesize, voiceOf, voicesEndpoint, type SpeechIndex, type SpeechVoice } from '../src/data/speech'
import { phraseAs } from '../src/planner/phrases'
import type { Phrases, Speaker } from '../src/planner/types'
import { GEN, ROOT, readJson, sleep, today, writeJson } from './lib.ts'

const envFile = join(ROOT, '.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)
const { AZURE_SPEECH_KEY: KEY, AZURE_SPEECH_REGION: REGION } = process.env
if (!KEY || !REGION) {
  console.error('Missing Azure settings. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local (see README, "Phrases read aloud").')
  process.exit(1)
}

const OUT = join(GEN, 'speech')
const INDEX = join(GEN, 'speech.json')

/** Where our language tag isn't Azure's: Montenegrin is written like Serbian in Latin letters; Cantonese in
 *  traditional characters is Hong Kong's. */
const LOCALE_FOR: Record<string, string> = { cnr: 'sr-Latn-RS', yue: 'zh-HK' }

type AzureVoice = { ShortName: string; Locale: string; Gender: string; VoiceType: string; Status?: string }

const phrases = readJson<Phrases>(join(GEN, 'phrases.json'))
const old: SpeechIndex | null = existsSync(INDEX) ? readJson<SpeechIndex>(INDEX) : null

const res = await fetch(voicesEndpoint(REGION), { headers: { 'Ocp-Apim-Subscription-Key': KEY } })
if (!res.ok) throw new Error(`Azure voices list: ${res.status} ${(await res.text()).slice(0, 200)}`)
// Plain neural voices of one language (not the multilingual or HD ones, which cost more and read other languages
// with an accent).
const voices = ((await res.json()) as AzureVoice[]).filter((v) => v.VoiceType === 'Neural' && !/Multilingual|:|HD/.test(v.ShortName) && v.Status !== 'Deprecated')
const locales = new Set(voices.map((v) => v.Locale))

/** Where each language is spoken (the countries), to pick the voice from there when Azure has several. */
const spokenIn: Record<string, string[]> = {}
for (const [iso2, place] of Object.entries(phrases.countries)) for (const tag of place.languages) (spokenIn[tag] ??= []).push(iso2)

/** Azure's locale for a language tag: the same one; the language's "own" country (fr-FR); a country it's spoken in
 *  (sw-KE); else the first Azure has for the language (zh-MY → zh-CN). None where Azure doesn't speak it. */
function localeFor(tag: string): string | undefined {
  if (LOCALE_FOR[tag]) return locales.has(LOCALE_FOR[tag]) ? LOCALE_FOR[tag] : undefined
  if (locales.has(tag)) return tag
  const base = tag.split('-')[0]
  const tries = [`${base}-${base.toUpperCase()}`, ...(spokenIn[tag] ?? []).map((c) => `${base}-${c}`)]
  return tries.find((l) => locales.has(l)) ?? [...locales].filter((l) => l.split('-').length === 2 && l.startsWith(`${base}-`)).sort()[0]
}

const SPEAKERS: Speaker[] = ['female', 'male']

/** The language's woman's and man's voices (those Azure has). */
function voicesFor(tag: string): Partial<Record<Speaker, SpeechVoice>> {
  const locale = localeFor(tag)
  const out: Partial<Record<Speaker, SpeechVoice>> = {}
  for (const speaker of SPEAKERS) {
    const gender = speaker === 'male' ? 'Male' : 'Female'
    // (The same voice as last time, while Azure still has it, so a re-run doesn't read everything again.)
    const kept = (old?.voices[tag] as Partial<Record<Speaker, SpeechVoice>> | undefined)?.[speaker]?.voice
    const v = voices.find((x) => x.ShortName === kept && x.Locale === locale && x.Gender === gender) ?? voices.find((x) => x.Locale === locale && x.Gender === gender)
    if (v) out[speaker] = { voice: v.ShortName, locale: v.Locale, gender: speaker }
  }
  return out
}

const only = process.argv.slice(2)
const index: SpeechIndex = {
  _meta: {
    source: 'Read aloud by Azure AI Speech (neural text-to-speech, Microsoft): computer voices reading the phrases, a woman\'s and a man\'s, not recordings of people. Languages Azure has no voice for have no clips.',
    updatedAt: today(),
  },
  voices: { ...old?.voices },
  clips: { ...old?.clips },
}
const missing: string[] = []
let made = 0

for (const [tag, lang] of Object.entries(phrases.languages)) {
  if (only.length && !only.includes(tag)) continue
  const found = voicesFor(tag)
  if (!found.female && !found.male) {
    missing.push(`${tag} (${lang.name})`)
    delete index.voices[tag]
    delete index.clips[tag]
    continue
  }
  index.voices[tag] = found
  const dir = join(OUT, tag)
  mkdirSync(dir, { recursive: true })
  const clips: Partial<Record<Speaker, Record<string, string>>> = {}
  for (const speaker of SPEAKERS) {
    const voice = voiceOf(index, tag, speaker)!
    const own: Record<string, string> = {}
    for (const [key, p] of Object.entries(lang.phrases)) {
      const text = phraseAs(tag, p, speaker).text
      const name = `${key}.${await clipName(voice.voice, text)}.mp3`
      own[key] = name
      if (existsSync(join(dir, name))) continue
      // Azure's free tier takes 20 requests a minute: wait and try again when it says so.
      for (let attempt = 1; ; attempt++) {
        const audio = await synthesize(voice, text, KEY, REGION)
        if (audio instanceof ArrayBuffer) {
          writeFileSync(join(dir, name), new Uint8Array(audio))
          made++
          break
        }
        if (audio.status !== 429 || attempt >= 8) throw new Error(`Azure ${tag} ${key}: ${audio.status} ${audio.error}`)
        await sleep(10_000 * attempt)
      }
    }
    clips[speaker] = own
  }
  // Clips of earlier texts or voices.
  const used = new Set(Object.values(clips).flatMap((c) => Object.values(c)))
  for (const f of readdirSync(dir)) if (!used.has(f)) rmSync(join(dir, f))
  index.clips[tag] = clips
  console.log(`${tag}: ${[found.female?.voice, found.male?.voice].filter(Boolean).join(', ')}`)
  // (Written as it goes, so a stopped run keeps what it made.)
  writeFileSync(INDEX, JSON.stringify(index, null, 1) + '\n')
}

// Languages no longer in the phrases.
for (const tag of Object.keys(index.voices)) {
  if (phrases.languages[tag]) continue
  delete index.voices[tag]
  delete index.clips[tag]
  rmSync(join(OUT, tag), { recursive: true, force: true })
}
writeJson(INDEX, index)
const both = Object.values(index.voices).filter((v) => v.female && v.male).length
console.log(`${made} clip(s) made; ${Object.keys(index.voices).length} languages with a voice, ${both} with a woman's and a man's`)
if (missing.length) console.log(`No Azure voice for: ${missing.join(', ')}`)
