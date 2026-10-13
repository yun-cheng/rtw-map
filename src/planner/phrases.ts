import type { Dataset, Phrase, PhraseKey, PhraseLanguage, Speaker } from './types'

/** The phrases every language has, in the order shown: just enough for a few days anywhere. */
export const PHRASES: { key: PhraseKey; label: string }[] = [
  { key: 'hello', label: 'Hello' },
  { key: 'thanks', label: 'Thank you' },
  { key: 'bye', label: 'Bye' },
  { key: 'howMuch', label: 'How much?' },
  { key: 'thisOne', label: 'This one' },
  { key: 'dontUnderstand', label: "I don't understand" },
  { key: 'cheers', label: 'Cheers!' },
]

/**
 * The languages spoken in a city, main one first, each with its phrases: the city's own if it has them, else its
 * country's. None where English is the common language, with a note saying so.
 */
export function phrasesFor(ds: Dataset, cityId: string): { languages: ({ tag: string } & PhraseLanguage)[]; note?: string } | null {
  const place = ds.phrases.cities?.[cityId] ?? ds.phrases.countries[ds.cities[cityId].iso2]
  if (!place) return null
  return { languages: place.languages.map((tag) => ({ tag, ...ds.phrases.languages[tag] })), note: place.note }
}

/**
 * A phrase as the speaker says it: a woman's own form where it has one; Thai's polite word, written for both
 * ("ขอบคุณครับ/ค่ะ", "khrap/kha"), as theirs (men ครับ, women ค่ะ or คะ).
 */
export function phraseAs(tag: string, p: Phrase, speaker: Speaker): Phrase {
  const own = speaker === 'female' && p.woman ? { ...p.woman } : { text: p.text, say: p.say, note: p.note }
  if (tag !== 'th') return own
  return {
    ...own,
    text: own.text.replace(/ครับ\/(ค่ะ|คะ)/g, (_, her: string) => (speaker === 'male' ? 'ครับ' : her)),
    say: own.say.replace(/khrap\/kha/g, speaker === 'male' ? 'khrap' : 'kha'),
  }
}
