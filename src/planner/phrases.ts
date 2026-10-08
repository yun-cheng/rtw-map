import type { Dataset, PhraseKey, PhraseLanguage } from './types'

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
