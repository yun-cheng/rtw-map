// Settings → Phrases: who says the phrases (a woman's or a man's words where they differ, and voice), and saving their
// clips on the device beforehand, to play with no connection (src/offline/phrases.ts): the trip's languages, or every
// language that has a voice.
import { useEffect } from 'react'
import { useAccount } from '../agent/account'
import { CLIP_BYTES, clipsOf, speech, useSavedPhrases } from '../offline/phrases'
import { dataset as ds } from '../data/dataset'
import { phrasesFor, type Speaker } from '../planner'
import { useItems } from '../store/items'
import { SHARED_TOKEN } from '../store/shareLink'
import { useTrip } from '../store/trip'
import { Button, Segmented } from '../ui/kit'

const SPEAKERS: { value: Speaker; label: string }[] = [{ value: 'female', label: 'A woman' }, { value: 'male', label: 'A man' }]
const size = (bytes: number) => (bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} kB` : `${(bytes / 1e6).toFixed(1)} MB`)

export function PhraseSettings() {
  const speaker = useTrip((s) => s.speaker)
  const setSpeaker = useTrip((s) => s.setSpeaker)
  const plan = useTrip((s) => s.plan)
  const user = useAccount((s) => s.user)
  const { clips, bytes, progress, problem, count, save, removeAll } = useSavedPhrases()
  const book = useItems((s) => s.books[s.key])
  useEffect(() => count(), [count])

  // The trip's languages that have clips, and every language that has.
  const tripTags = [...new Set(plan?.stops.flatMap((s) => phrasesFor(ds, s.cityId)?.languages.map((l) => l.tag) ?? []) ?? [])].filter((t) => speech.clips[t])
  const allTags = Object.keys(speech.clips)
  // The user's own phrases (read by Azure through the account: signed in, not on someone else's trip).
  const own = user && !SHARED_TOKEN
    ? Object.values(book?.entries ?? {}).filter((i) => i.kind === 'phrase' && !i.deleted && i.text?.trim()).map((i) => ({ tag: i.at, text: i.text! }))
    : []
  const tripOwn = own.filter((p) => tripTags.includes(p.tag))
  const estimate = (tags: string[], extra: number) => size((clipsOf(tags, speaker).length + extra) * CLIP_BYTES)
  const who = speaker === 'female' ? 'a woman' : 'a man'

  return (
    <div className="flex flex-col gap-2.5 text-[13px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">Said as</span>
        <div className="w-44"><Segmented value={speaker} onChange={setSpeaker} options={SPEAKERS} /></div>
      </div>
      <p className="text-[12px] text-muted">The voice that reads them aloud, and the words where a woman and a man say them differently (Thai, Portuguese, Hebrew).</p>
      <div className="mt-1 border-t border-line pt-2.5">
        <p className="text-muted">Save the phrases read aloud on this device, to play with no connection (as {who} says them).</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {tripTags.length > 0 && (
            <Button disabled={!!progress} onClick={() => void save(tripTags, tripOwn, speaker)}>
              The trip's {tripTags.length} {tripTags.length === 1 ? 'language' : 'languages'} · {estimate(tripTags, tripOwn.length)}
            </Button>
          )}
          <Button disabled={!!progress} onClick={() => void save(allTags, own, speaker)}>
            Every language · {estimate(allTags, own.length)}
          </Button>
        </div>
      </div>
      {progress && (
        <div>
          <div className="flex justify-between text-[12px] text-muted"><span>Saving…</span><span>{progress.total ? Math.round((progress.done / progress.total) * 100) : 100}%</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%` }} />
          </div>
        </div>
      )}
      {!progress && problem && <p className="text-[12px] text-muted">{problem}</p>}
      {clips > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{clips} {clips === 1 ? 'phrase' : 'phrases'} on this device · {size(bytes)}</span>
          <Button disabled={!!progress} onClick={() => void removeAll()} className="shrink-0">Remove all</Button>
        </div>
      )}
    </div>
  )
}
