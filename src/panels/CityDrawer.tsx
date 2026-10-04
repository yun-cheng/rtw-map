import { dataset as ds } from '../data/dataset'
import { ENGLISH_LABELS, TRANSIT_LABELS, addDays, dailyCost, englishLevel, groceryDay, monthOf, taxiEstimate, type Budget, type VisaReq } from '../planner'
import { useTrip } from '../store/trip'
import { MODE_ICON, compact, duration, flag, local, rateText, shortDate } from '../ui/format'
import { Badge, Button, LevelBar, Row, Section, Source } from '../ui/kit'
import { useMoney } from '../ui/useMoney'
import { ClimateChart } from './ClimateChart'

const VISA_TEXT: Record<VisaReq, { label: string; tone: 'ok' | 'warn' | 'error' | 'info' }> = {
  free_movement: { label: 'Free movement (EU citizen)', tone: 'ok' },
  visa_free: { label: 'Visa-free', tone: 'ok' },
  eta: { label: 'Electronic travel authorisation needed', tone: 'warn' },
  e_visa: { label: 'E-visa needed', tone: 'warn' },
  visa_on_arrival: { label: 'Visa on arrival', tone: 'info' },
  visa_required: { label: 'Visa required in advance', tone: 'error' },
  no_admission: { label: 'Passport not admitted', tone: 'error' },
  own_country: { label: 'Your own country', tone: 'ok' },
  unknown: { label: 'Unknown: check official sources', tone: 'info' },
}

const BUDGETS: { value: Budget; label: string }[] = [
  { value: 'shoestring', label: 'Shoestring' }, { value: 'backpacker', label: 'Backpacker' },
  { value: 'midrange', label: 'Mid-range' }, { value: 'comfort', label: 'Comfort' },
]

const GROCERIES: [keyof (typeof ds.costs)[string]['groceries'], string][] = [
  ['bread', 'Bread (loaf)'], ['eggs12', 'Eggs (12)'], ['milk1l', 'Milk (1 L)'], ['rice1kg', 'Rice (1 kg)'],
  ['chicken1kg', 'Chicken breast (1 kg)'], ['tomatoes1kg', 'Tomatoes (1 kg)'], ['beer05', 'Beer (0.5 L, shop)'], ['water15', 'Water (1.5 L)'],
]

export function CityDrawer({ cityId }: { cityId: string }) {
  const { plan, input, select, addCity, removeStop } = useTrip()
  const { currency, fmt } = useMoney()
  const city = ds.cities[cityId]
  const country = ds.countries[city.iso2]
  const cost = ds.costs[city.iso2]
  const climate = ds.climate[cityId]
  const adv = ds.advisories[city.iso2]
  const visa = ds.visa.rules[input.passport]?.[city.iso2]
  const passportName = ds.visa.passports.find((p) => p.code === input.passport)?.name
  const pop = ds.population[city.iso2]
  const english = englishLevel(ds, cityId)
  const transit = ds.localTransport.cities[cityId]
  const taxi = ds.localTransport.countries[city.iso2]?.taxi
  const taxiRide = taxiEstimate(ds, cityId)
  const stopIndex = plan?.stops.findIndex((s) => s.cityId === cityId) ?? -1
  const stop = stopIndex >= 0 ? plan!.stops[stopIndex] : null

  const stayMonths = new Set<number>()
  if (stop) for (let d = 0; d <= stop.nights; d++) stayMonths.add(monthOf(addDays(stop.arrive, d)))
  else stayMonths.add(useTrip.getState().layerMonth)

  const connections = ds.connections
    .filter((c) => c.from === cityId || c.to === cityId)
    .map((c) => ({ ...c, other: c.from === cityId ? c.to : c.from }))
    .sort((a, b) => a.durationMin - b.durationMin)

  return (
    <div className="pb-8">
      <div className="sticky top-0 z-10 border-b border-line bg-panel px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold">{city.name}</h2>
            <p className="text-[13px] text-muted">{flag(city.iso2)} {country.name} · {country.schengen ? 'Schengen area' : 'Outside Schengen'}</p>
          </div>
          <button onClick={() => select(null)} className="h-7 w-7 rounded text-muted hover:bg-canvas hover:text-ink" aria-label="Close">✕</button>
        </div>
        <p className="mt-2 text-[13px]">{city.blurb}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {city.tags.map((t) => <Badge key={t}>{t}</Badge>)}
          <span className="ml-1 text-[12px] text-muted">Suggested {city.days.min}–{city.days.max} days</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {stop ? (
            <>
              <span className="text-[13px]"><b>Stop {stopIndex + 1}</b> · {shortDate(stop.arrive)} – {shortDate(stop.depart)} · {stop.nights} nights</span>
              <Button className="ml-auto" onClick={() => { removeStop(stopIndex); select(null) }}>Remove</Button>
            </>
          ) : plan ? (
            <Button variant="primary" onClick={() => addCity(cityId)}>+ Add to trip</Button>
          ) : null}
        </div>
      </div>

      <Section title="Weather" aside={<span className="text-[11px] text-muted">avg 2016–2025</span>}>
        {climate ? (
          <>
            <ClimateChart data={climate} highlight={stayMonths} />
            <div className="mt-1 flex gap-3 text-[11px] text-muted">
              <span><span className="text-orange-600">●</span> High °C</span>
              <span><span className="text-sky-600">●</span> Low °C</span>
              <span><span className="text-blue-300">■</span> Rain days</span>
              <span className="text-accent">▮ {stop ? 'Your stay' : 'Selected month'}</span>
            </div>
            {[...stayMonths].map((m) => {
              const c = climate[m - 1]
              return (
                <p key={m} className="mt-1.5 text-[13px]">
                  <b>{new Date(2000, m - 1).toLocaleString('en', { month: 'long' })}:</b> {c.tLow}–{c.tHigh}°C, {c.rainDays} rain days, {c.sunHours}h sun/day, {c.humidity}% humidity
                </p>
              )
            })}
          </>
        ) : (
          <p className="text-[13px] text-muted">Climate data not loaded yet.</p>
        )}
        <Source>{ds.meta.climate.source}</Source>
      </Section>

      {cost && (
        <Section title="Costs" aside={<Badge tone="warn">estimates</Badge>}>
          <div className="mb-3 grid grid-cols-4 gap-1 text-center">
            {BUDGETS.map((b) => (
              <div key={b.value} className={`rounded-md border px-1 py-1.5 ${b.value === input.budget ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                <div className="text-[10px] text-muted">{b.label}</div>
                <div className="font-semibold">{fmt(dailyCost(ds, cityId, b.value))}</div>
                <div className="text-[10px] text-muted">/day</div>
              </div>
            ))}
          </div>
          <Row label="Hostel dorm bed">{fmt(cost.dormBed * city.costFactor)}</Row>
          <Row label="Private room">{fmt(cost.privateRoom * city.costFactor)}</Row>
          <Row label="Cheap meal">{fmt(cost.mealCheap * city.costFactor)}</Row>
          <Row label="Mid-range dinner">{fmt(cost.mealMid * city.costFactor)}</Row>
          <div className="mt-3 mb-1 text-[12px] font-semibold">Supermarket (cook it yourself)</div>
          {GROCERIES.map(([k, label]) => (
            <Row key={k} label={label}>
              {fmt(cost.groceries[k], true)} <span className="font-normal text-muted">{local(cost.groceries[k], country.currency, currency)}</span>
            </Row>
          ))}
          <Row label="Groceries for a day of cooking">{fmt(groceryDay(cost), true)}</Row>
          <Source>{ds.meta.costs.source} ({ds.meta.costs.updatedAt}). City price level ×{city.costFactor}.</Source>
        </Section>
      )}

      <Section title={`Visa · ${passportName ?? input.passport} passport`}>
        {visa && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={VISA_TEXT[visa.req].tone}>{VISA_TEXT[visa.req].label}</Badge>
            {visa.days && <span className="text-[13px]">up to {visa.days} days</span>}
          </div>
        )}
        {country.schengen && visa?.req !== 'free_movement' && (
          <p className="mt-2 text-[13px]">Part of the Schengen area: days here count toward the shared <b>90 days in any 180</b> limit.</p>
        )}
        <Source>{ds.meta.visa.source} Always check the official government website before travelling.</Source>
      </Section>

      {adv && (
        <Section title="Safety">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={adv.alertStatus.includes('avoid_all_travel_to_whole_country') ? 'error' : adv.alertStatus.length ? 'warn' : 'ok'}>
              UK: {adv.alertStatus.includes('avoid_all_travel_to_whole_country') ? 'Do not travel' : adv.alertStatus.length ? 'Avoid parts' : 'No travel restrictions'}
            </Badge>
            {adv.us && <Badge tone={adv.us.level >= 4 ? 'error' : adv.us.level >= 3 ? 'warn' : adv.us.level === 2 ? 'info' : 'ok'}>US: {adv.us.title.split(' - ')[1]}</Badge>}
          </div>
          {adv.excludedByDefault && <p className="mt-2 text-[13px]">{adv.warnings.slice(0, 420)}…</p>}
          <div className="mt-2 flex flex-col">
            {adv.safety.map((s) => (
              <details key={s.heading} className="border-b border-line py-1 text-[13px] last:border-0">
                <summary className="cursor-pointer font-medium">{s.heading}</summary>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{s.text}{s.text.length >= 500 && '…'}</p>
              </details>
            ))}
          </div>
          <Source>
            <a className="text-accent hover:underline" href={adv.url} target="_blank" rel="noreferrer">UK FCDO advice ↗</a> (updated {adv.updatedAt.slice(0, 10)})
            {adv.us && <> · <a className="text-accent hover:underline" href={adv.us.url} target="_blank" rel="noreferrer">US advisory ↗</a> (updated {adv.us.updatedAt.slice(0, 10)})</>}
          </Source>
        </Section>
      )}

      <Section title="Language" aside={<Badge tone="warn">estimate</Badge>}>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted">English</span>
          <LevelBar level={english.level} label="English" />
          <b className="text-[13px]">{ENGLISH_LABELS[english.level].short}</b>
        </div>
        <p className="mt-1 text-[13px]">{ENGLISH_LABELS[english.level].long}.</p>
        {english.reason && (
          <p className="mt-1 text-[12px] text-muted">
            {country.name} overall: {ENGLISH_LABELS[english.countryLevel].short.toLowerCase()}; {english.level > english.countryLevel ? 'easier' : 'harder'} here ({english.reason}).
          </p>
        )}
        <div className="mt-2">
          <Row label="Local language">{country.languages.join(', ')}</Row>
          {country.english.otherLanguages.length > 0 && <Row label="Also useful">{country.english.otherLanguages.join('; ')}</Row>}
          <Row label="Alphabet">{country.english.script}</Row>
        </div>
        <Source>
          Our estimate. Compare: <a className="text-accent hover:underline" href="https://www.ef.com/wwen/epi/" target="_blank" rel="noreferrer">EF English Proficiency Index ↗</a>
          {country.eu && <> and the EU's Eurobarometer survey "Europeans and their languages"</>}
        </Source>
      </Section>

      <Section title="People & practical">
        {city.population && <Row label="City population">{compact(city.population)}</Row>}
        {pop && <Row label={`${country.name} population (${pop.year})`}>{compact(pop.value)}</Row>}
        <Row label="Religion">{country.religion}</Row>
        <Row label="Currency">{country.currency}{rateText(currency, country.currency) && ` · ${rateText(currency, country.currency)}`}</Row>
        <Row label="Plugs">Type {country.plugs.join(' / ')} · 230V</Row>
        <Row label="Emergency">{country.emergency}</Row>
        {country.notes.length > 0 && (
          <ul className="mt-2 list-disc pl-4 text-[13px]">
            {country.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
        <Source>{ds.meta.population.source}; {ds.meta.countries.source}; {ds.meta.fx.source}</Source>
      </Section>

      {transit && (
        <Section title="Getting around" aside={<Badge tone="warn">estimate</Badge>}>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted">Public transport</span>
            <LevelBar level={transit.ease} label="Public transport" />
            <b className="text-[13px]">{TRANSIT_LABELS[transit.ease].short}</b>
          </div>
          <p className="mt-1 text-[13px]">{TRANSIT_LABELS[transit.ease].long}.{transit.walkable && ' The centre is walkable.'}</p>
          {transit.modes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {transit.modes.map((m) => (
                <span key={m} className="rounded-full border border-line px-2 py-0.5 text-[12px] capitalize">{MODE_ICON[m]} {m === 'cablecar' ? 'cable car' : m}</span>
              ))}
            </div>
          )}
          <div className="mt-2">
            {transit.pay && <Row label="How to pay">{transit.pay}</Row>}
            <Row label="Local transport / day">{cost ? fmt(cost.localTransportDay) : '–'}</Row>
          </div>
          {transit.note && <p className="mt-1 text-[13px]">{transit.note}</p>}

          {taxi && (
            <>
              <div className="mt-3 mb-1 text-[12px] font-semibold">Taxis</div>
              <Row label="Apps travellers use">
                {taxi.apps.length ? taxi.apps.join(', ') : <span className="font-normal text-muted">No Uber/Bolt-style apps: use local taxis</span>}
              </Row>
              {taxiRide && <Row label="5 km ride">{fmt(taxiRide.min)}–{fmt(taxiRide.max)}</Row>}
              <Row label="Start fare + per km">{fmt(taxi.flagFall, true)} + {fmt(taxi.perKm, true)}/km</Row>
              <p className="mt-1 text-[13px]">{taxi.tip}</p>
            </>
          )}
          <Source>
            {ds.meta.localTransport.source} Check{' '}
            <a className="text-accent hover:underline" href={`https://en.wikivoyage.org/wiki/Special:Search?go=Go&search=${encodeURIComponent(city.name)}#Get_around`} target="_blank" rel="noreferrer">
              Wikivoyage: {city.name} ↗
            </a>
          </Source>
        </Section>
      )}

      <Section title="Getting there & away">
        {connections.length ? (
          <ul className="flex flex-col">
            {connections.map((c) => (
              <li key={`${c.other}-${c.mode}`}>
                <button onClick={() => select({ type: 'city', id: c.other })} className="flex w-full items-center gap-2 py-1 text-left text-[13px] hover:text-accent">
                  <span>{MODE_ICON[c.mode] ?? '•'}</span>
                  <span className="flex-1 font-medium">{ds.cities[c.other].name}</span>
                  <span className="text-muted">{duration(c.durationMin)} · {fmt(c.priceMin)}–{fmt(c.priceMax)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">No timetable data yet; travel times are estimated from road distance.</p>
        )}
        <Source>{ds.meta.connections.source}</Source>
      </Section>
    </div>
  )
}
