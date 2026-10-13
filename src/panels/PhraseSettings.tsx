// Settings → Phrases: who says the phrases, a woman or a man (their words where they differ, and the voice that reads
// them aloud).
import { type Speaker } from '../planner'
import { useTrip } from '../store/trip'
import { Segmented } from '../ui/kit'

const SPEAKERS: { value: Speaker; label: string }[] = [{ value: 'female', label: 'A woman' }, { value: 'male', label: 'A man' }]

export function PhraseSettings() {
  const speaker = useTrip((s) => s.speaker)
  const setSpeaker = useTrip((s) => s.setSpeaker)

  return (
    <div className="flex flex-col gap-2.5 text-[13px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">Said as</span>
        <div className="w-44"><Segmented value={speaker} onChange={setSpeaker} options={SPEAKERS} /></div>
      </div>
      <p className="text-[12px] text-muted">The voice that reads them aloud, and the words where a woman and a man say them differently (Thai, Portuguese, Hebrew).</p>
    </div>
  )
}
