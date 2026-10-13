// The user's own phrases in a language, under the app's seven on a city's Phrases tab: My visit items (itemsCore.ts),
// the assistant's translations of what they asked for (save_phrases), shown in every city where the language is spoken.
// Removing one asks first (there's no Undo for it): only here (this language), or the whole trip (the same phrase in
// every language it was kept in).
import { X } from 'lucide-react'
import { dataset as ds } from '../data/dataset'
import { useItems, useItemsAt, type TripItem } from '../store/items'
import { SHARED_TOKEN } from '../store/shareLink'
import { ask } from '../ui/dialog'

/** The same phrase in every language: the ids that end alike (`phrase:<tag>:<meaning>`). */
const meaning = (id: string) => id.split(':').slice(2).join(':')

async function removePhrase(p: TripItem) {
  const { books, key, remove } = useItems.getState()
  const everywhere = Object.values(books[key]?.entries ?? {}).filter((i) => i.kind === 'phrase' && !i.deleted && i.text?.trim() && meaning(i.id) === meaning(p.id))
  const here = ds.phrases.languages[p.at]?.name ?? p.at
  const answer = await ask(everywhere.length > 1
    ? {
        title: `Remove "${p.title}"?`,
        message: `It's in ${everywhere.length} languages on this trip.`,
        answers: [{ label: `Only in ${here}`, value: 'here', danger: true }, { label: 'Whole trip', value: 'all', danger: true }],
      }
    : { title: `Remove "${p.title}"?`, message: `Your phrase in ${here}.`, answers: [{ label: 'Remove', value: 'here', danger: true }] })
  for (const i of answer === 'all' ? everywhere : answer === 'here' ? [p] : []) remove(i.id)
}

export function MyPhrases({ tag }: { tag: string }) {
  const phrases = useItemsAt(tag, 'phrase').filter((p) => p.text?.trim())
  if (!phrases.length) return null
  return (
    <>
      <div className="mt-2 border-t border-line pt-2 text-[12px] font-semibold">Your phrases</div>
      {phrases.map((p) => (
        <div key={p.id} className="group flex items-baseline justify-between gap-3 py-1.5">
          <span className="flex min-w-0 items-baseline gap-1 text-[13px] text-muted">
            {p.title}
            {!SHARED_TOKEN && (
              <button
                onClick={() => void removePhrase(p)} aria-label={`Remove "${p.title}"`} title="Remove this phrase"
                className="self-center text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-ink max-md:opacity-100"
              >
                <X size={12} />
              </button>
            )}
          </span>
          <div className="min-w-0 text-right">
            <div lang={tag} className="text-[15px] font-medium">{p.text}</div>
            {p.say && <div className="text-[12px] text-muted">{p.say}</div>}
            {p.tip && <div className="text-[11px] text-muted">{p.tip}</div>}
          </div>
        </div>
      ))}
    </>
  )
}
