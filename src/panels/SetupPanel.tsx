import { useState } from 'react'
import { dataset as ds } from '../data/dataset'
import { INTERESTS, REGION_PRESETS, makeGroup } from '../data/presets'
import { daysBetween, type CountryMode, type TripGroup } from '../planner'
import { useTrip } from '../store/trip'
import { flag } from '../ui/format'
import { Button, Segmented } from '../ui/kit'

const MODE_STYLE: Record<CountryMode, string> = {
  must: 'border-accent bg-accent-soft text-accent',
  optional: 'border-line bg-panel text-ink border-dashed',
  excluded: 'border-line bg-canvas text-muted line-through',
}
const NEXT_MODE: Record<CountryMode, CountryMode> = { must: 'optional', optional: 'excluded', excluded: 'must' }

export function SetupPanel() {
  const { input, setInput, generate, loadTestCase, stops } = useTrip()
  const nights = daysBetween(input.startDate, input.endDate)
  const [adding, setAdding] = useState('')

  const updateGroup = (id: string, fn: (g: TripGroup) => TripGroup) =>
    setInput({ groups: input.groups.map((g) => (g.id === id ? fn(g) : g)) })
  const moveGroup = (i: number, d: -1 | 1) => {
    const groups = [...input.groups]
    const [g] = groups.splice(i, 1)
    groups.splice(i + d, 0, g)
    setInput({ groups })
  }
  const addGroup = (value: string) => {
    const preset = REGION_PRESETS.find((p) => p.name === value)
    const group = preset ? makeGroup(ds, preset.name, preset.countries) : makeGroup(ds, ds.countries[value].name, [value])
    setInput({ groups: [...input.groups, group] })
    setAdding('')
  }
  const used = new Set(input.groups.flatMap((g) => g.countries.map((c) => c.iso2)))
  const cityOptions = Object.values(ds.cities)
    .filter((c) => used.has(c.iso2))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Trip setup</h2>
        <Button variant="ghost" onClick={loadTestCase} title="Fill in the Balkans → Russia test trip">Load test case</Button>
      </div>

      <Field label="Dates">
        <div className="flex items-center gap-2">
          <input type="date" value={input.startDate} onChange={(e) => e.target.value && setInput({ startDate: e.target.value })} className={inputCls} />
          <span className="text-muted">→</span>
          <input type="date" value={input.endDate} min={input.startDate} onChange={(e) => e.target.value && setInput({ endDate: e.target.value })} className={inputCls} />
        </div>
        <p className="mt-1 text-[12px] text-muted">{nights > 0 ? `${nights + 1} days · ${nights} nights` : 'End date must be after the start date'}</p>
      </Field>

      <Field label="Where (in order)">
        <div className="flex flex-col gap-2">
          {input.groups.map((g, i) => (
            <div key={g.id} className="rounded-lg border border-line bg-panel p-2.5">
              <div className="mb-2 flex items-center gap-1">
                <span className="mr-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-panel">{i + 1}</span>
                <span className="flex-1 font-semibold">{g.name}</span>
                <label className="mr-1 flex items-center gap-1 text-[12px] text-muted" title="Spend more time here">
                  <input type="checkbox" checked={g.longer} onChange={(e) => updateGroup(g.id, (x) => ({ ...x, longer: e.target.checked }))} />
                  Longer
                </label>
                <IconBtn disabled={i === 0} onClick={() => moveGroup(i, -1)} label="Move up">↑</IconBtn>
                <IconBtn disabled={i === input.groups.length - 1} onClick={() => moveGroup(i, 1)} label="Move down">↓</IconBtn>
                <IconBtn onClick={() => setInput({ groups: input.groups.filter((x) => x.id !== g.id) })} label="Remove">✕</IconBtn>
              </div>
              <div className="flex flex-wrap gap-1">
                {g.countries.map((c) => {
                  const adv = ds.advisories[c.iso2]
                  return (
                    <button
                      key={c.iso2}
                      onClick={() => updateGroup(g.id, (x) => ({ ...x, countries: x.countries.map((y) => (y.iso2 === c.iso2 ? { ...y, mode: NEXT_MODE[y.mode] } : y)) }))}
                      className={`rounded-full border px-2 py-0.5 text-[12px] ${MODE_STYLE[c.mode]}`}
                      title={`${c.mode === 'must' ? 'Must visit' : c.mode === 'optional' ? 'Optional' : 'Excluded'}${adv?.excludedByDefault ? ' · do-not-travel advisory' : ''} (click to change)`}
                    >
                      {flag(c.iso2)} {ds.countries[c.iso2].name}
                      {adv?.excludedByDefault && ' ⚠'}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <select value={adding} onChange={(e) => e.target.value && addGroup(e.target.value)} className={inputCls}>
            <option value="">+ Add a region or country…</option>
            <optgroup label="Regions">
              {REGION_PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </optgroup>
            <optgroup label="Countries">
              {Object.values(ds.countries).sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                <option key={c.iso2} value={c.iso2}>{c.name}</option>
              ))}
            </optgroup>
          </select>
          <p className="text-[11px] text-muted">Click a country to cycle: must visit → optional → excluded. Countries in a region start optional (the planner picks the best ones, at least one per region); a country added on its own starts as must visit. Countries with a do-not-travel advisory start excluded.</p>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={input.keepGroupOrder} onChange={(e) => setInput({ keepGroupOrder: e.target.checked })} />
            Visit the regions in this order
          </label>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start city (optional)">
          <select value={input.startCityId ?? ''} onChange={(e) => setInput({ startCityId: e.target.value || null })} className={inputCls}>
            <option value="">Any</option>
            {cityOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="End city (optional)">
          <select value={input.endCityId ?? ''} onChange={(e) => setInput({ endCityId: e.target.value || null })} className={inputCls}>
            <option value="">Any</option>
            {cityOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Pace">
        <Segmented value={input.pace} onChange={(pace) => setInput({ pace })} options={[{ value: 'chill', label: '🐢 Chill' }, { value: 'balanced', label: '⚖️ Balanced' }, { value: 'fast', label: '🐇 Fast' }]} />
      </Field>
      <Field label="Budget">
        <Segmented value={input.budget} onChange={(budget) => setInput({ budget })} options={[{ value: 'shoestring', label: 'Shoestring' }, { value: 'backpacker', label: 'Backpacker' }, { value: 'midrange', label: 'Mid-range' }, { value: 'comfort', label: 'Comfort' }]} />
      </Field>
      <Field label="Interests">
        <div className="flex flex-wrap gap-1">
          {INTERESTS.map((t) => {
            const on = input.interests.includes(t)
            return (
              <button key={t} onClick={() => setInput({ interests: on ? input.interests.filter((x) => x !== t) : [...input.interests, t] })}
                className={`rounded-full border px-2 py-0.5 text-[12px] capitalize ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}>
                {t}
              </button>
            )
          })}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Passport">
          <select value={input.passport} onChange={(e) => setInput({ passport: e.target.value })} className={inputCls}>
            {ds.visa.passports.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Schengen days used before">
          <input type="number" min={0} max={90} value={input.schengenDaysBefore} onChange={(e) => setInput({ schengenDaysBefore: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })} className={inputCls} title="Days spent in the Schengen area in the 180 days before the trip" />
        </Field>
      </div>

      <Button variant="primary" className="py-2 text-[14px]" disabled={!input.groups.length || nights < 1} onClick={generate}>
        {stops.length ? 'Regenerate plan' : 'Generate plan'}
      </Button>
      {stops.length > 0 && <p className="-mt-2 text-[11px] text-muted">Regenerating replaces your current stops and edits.</p>}
    </div>
  )
}

const inputCls = 'w-full rounded-md border border-line bg-panel px-2 py-1.5 text-[13px] outline-none focus:border-accent'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</div>
      {children}
    </div>
  )
}

function IconBtn({ label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} className="h-6 w-6 rounded text-[12px] text-muted hover:bg-canvas hover:text-ink disabled:opacity-30" {...props} />
}
