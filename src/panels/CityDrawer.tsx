import { Fragment, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { dataset as ds } from '../data/dataset'
import { CARD_LABELS, ENGLISH_LABELS, RENTAL_INFO, TAP_WATER_LABELS, TRANSIT_LABELS, airBand, tapWater, vaccinesFor, mobileInternet, nearby, roughCount, roughKm, addDays, dailyCost, cardLevel, costProfile, englishLevel, groceryDay, likelyMonth, schengenApplies, suggestedDays, monthOf, taxiEstimate, type Budget, type Pace, type VisaReq } from '../planner'
import { useTrip, type CityTab } from '../store/trip'
import { MODE_ICON, WEATHER_STYLE, compact, duration, flag, local, rateText, shortDate, shownTemps, weatherKind } from '../ui/format'
import { FeelsToggle } from '../ui/FeelsToggle'
import { useSideScroll } from '../ui/useSideScroll'
import { Badge, Button, LevelBar, Links, Row, Section } from '../ui/kit'
import { useMoney } from '../ui/useMoney'
import { useTemp } from '../ui/useTemp'
import { PriceLevel } from './PriceLevel'

/** The weather and air charts use a charting library (Recharts), loaded only when a Weather tab is first opened. */
const ClimateChart = lazy(() => import('./ClimateChart').then((m) => ({ default: m.ClimateChart })))
const AirChart = lazy(() => import('./AirChart').then((m) => ({ default: m.AirChart })))
const SunChart = lazy(() => import('./SunChart').then((m) => ({ default: m.SunChart })))

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

const PACES: { value: Pace; icon: string; label: string }[] = [
  { value: 'chill', icon: '🐢', label: 'Chill' }, { value: 'balanced', icon: '⚖️', label: 'Balanced' }, { value: 'fast', icon: '🐇', label: 'Fast' },
]

type SectionKey =
  | 'around' | 'gettingThere' | 'weather' | 'air' | 'costs' | 'money' | 'language' | 'phone' | 'services' | 'people'
  | 'vaccines' | 'health' | 'medical' | 'safety' | 'visa'

/** Tabs of the city panel and the sections each one shows, most useful first. */
const TABS: { key: CityTab; label: string; sections: SectionKey[] }[] = [
  { key: 'overview', label: 'Overview', sections: [] },
  { key: 'transport', label: 'Transport', sections: ['around', 'gettingThere'] },
  { key: 'weather', label: 'Weather', sections: ['weather', 'air'] },
  { key: 'money', label: 'Money', sections: ['costs', 'money'] },
  { key: 'daily', label: 'Daily life', sections: ['language', 'phone', 'services', 'people'] },
  { key: 'health', label: 'Health', sections: ['vaccines', 'health', 'medical'] },
  { key: 'safety', label: 'Safety', sections: ['safety'] },
  { key: 'entry', label: 'Entry', sections: ['visa'] },
]

/** A number with a label underneath, in the grids of shops and medical help. */
const Tile = ({ value, label }: { value: string; label: string }) => (
  <div className="rounded-md border border-line px-1 py-1.5">
    <div className="text-[15px] font-semibold">{value}</div>
    <div className="text-[10px] text-muted">{label}</div>
  </div>
)

type Tone = 'ok' | 'info' | 'warn' | 'error'
const TONE_DOT: Record<Tone, string> = { ok: 'bg-green-600', info: 'bg-slate-400', warn: 'bg-amber-500', error: 'bg-red-600' }
const toneOf = (level: number): Tone => (level >= 4 ? 'ok' : level === 3 ? 'info' : 'warn')
const tabRank = (tab: CityTab) => TABS.findIndex((t) => t.key === tab)
const PROBLEM_ORDER: CityTab[] = ['entry', 'safety', 'money']

const BUDGETS: { value: Budget; label: string }[] = [
  { value: 'shoestring', label: 'Shoestring' }, { value: 'backpacker', label: 'Backpacker' }, { value: 'private', label: 'Private' },
  { value: 'midrange', label: 'Mid-range' }, { value: 'comfort', label: 'Comfort' },
]

const GROCERIES: [keyof (typeof ds.costs)[string]['groceries'], string][] = [
  ['bread', 'Bread (loaf)'], ['eggs12', 'Eggs (12)'], ['milk1l', 'Milk (1 L)'], ['rice1kg', 'Rice (1 kg)'],
  ['chicken1kg', 'Chicken breast (1 kg)'], ['tomatoes1kg', 'Tomatoes (1 kg)'], ['beer05', 'Beer (0.5 L, shop)'], ['water15', 'Water (1.5 L)'],
]

export function CityDrawer({ cityId }: { cityId: string }) {
  const { plan, input, select, addCity, removeStop, cityTab, setCityTab, layer, layerMonth } = useTrip()
  const { currency, fmt } = useMoney()
  const { range } = useTemp()
  // Temperatures as they feel or as measured: one setting for the whole app.
  const feels = useTrip((s) => s.tempFeels)
  // The month under the pointer in each chart: its details replace the shown months' under that chart.
  const [hover, setHover] = useState<{ chart: 'weather' | 'sun' | 'air'; month: number } | null>(null)
  const hoverFor = (chart: 'weather' | 'sun' | 'air') => (month: number | null) => setHover(month ? { chart, month } : null)
  const monthsFor = (chart: 'weather' | 'sun' | 'air') => (hover?.chart === chart ? [hover.month] : [...stayMonths])
  const city = ds.cities[cityId]
  const country = ds.countries[city.iso2]
  const costInfo = costProfile(ds, city.iso2)
  const cost = costInfo?.profile
  const climate = ds.climate[cityId]
  const adv = ds.advisories[city.iso2]
  const visa = ds.visa.rules[input.passport]?.[city.iso2]
  const passportName = ds.visa.passports.find((p) => p.code === input.passport)?.name
  const pop = ds.population[city.iso2]
  const english = englishLevel(ds, cityId)
  const suggested = suggestedDays(ds, input, cityId)
  const transit = ds.localTransport.cities[cityId]
  const taxi = ds.localTransport.countries[city.iso2]?.taxi
  const taxiRide = taxiEstimate(ds, cityId)
  const rentals = ds.localTransport.countries[city.iso2]?.rentals
  const health = ds.health.countries[city.iso2]
  const vaccines = vaccinesFor(ds, city.iso2)
  const mobile = mobileInternet(ds, cityId)
  const water = tapWater(ds, cityId)
  const air = ds.air.byCity[cityId]
  const services = nearby(ds, cityId)
  const shopping = ds.shopping[city.iso2]
  const pay = ds.payments.countries[city.iso2]
  const card = cardLevel(ds, cityId)
  const payNote = ds.payments.cities[cityId]?.note
  const entryNotices = country.schengen && schengenApplies(ds, input.passport)
    ? ds.notices.filter((n) => n.appliesTo === 'schengen-non-eu' || (n.appliesTo === 'schengen-visa-free' && visa?.req === 'visa_free'))
    : []
  const stopIndex = plan?.stops.findIndex((s) => s.cityId === cityId) ?? -1
  const stop = stopIndex >= 0 ? plan!.stops[stopIndex] : null

  // The months the weather and air shown are for: a month picked on the map's Weather or Air view; else the stay
  // (for a stop) or when the trip would pass by.
  const pickedMonth = (layer === 'climate' || layer === 'air') && layerMonth ? layerMonth : 0
  const stayMonths = new Set<number>()
  if (pickedMonth) stayMonths.add(pickedMonth)
  else if (stop) for (let d = 0; d <= stop.nights; d++) stayMonths.add(monthOf(addDays(stop.arrive, d)))
  else stayMonths.add(likelyMonth(ds, plan, input, cityId))
  const monthsLabel = pickedMonth ? 'Map month' : stop ? 'Your stay' : 'Trip month'

  const connections = ds.connections
    .filter((c) => c.from === cityId || c.to === cityId)
    .map((c) => ({ ...c, other: c.from === cityId ? c.to : c.from }))
    .sort((a, b) => a.durationMin - b.durationMin)

  // Sections, built once and rendered in order of importance (see `order` below).
  const sections: Record<SectionKey, ReactNode> = {
    around: transit && (
      <Section title="In the city" aside={<Badge tone="warn">estimate</Badge>}>
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

        <div className="mt-3 mb-1 text-[12px] font-semibold">Rentals</div>
        {transit.rentals.length ? (
          <>
            <div className="flex flex-wrap gap-1">
              {transit.rentals.map((r) => (
                <span key={r} className="rounded-full border border-line px-2 py-0.5 text-[12px]">{RENTAL_INFO[r].icon} {RENTAL_INFO[r].label}</span>
              ))}
            </div>
            <div className="mt-2">
              {rentals && rentals.apps.length > 0 && (transit.rentals.includes('bikeShare') || transit.rentals.includes('eScooter')) && (
                <Row label="Bike / scooter apps">{rentals.apps.join(', ')}</Row>
              )}
              {rentals && transit.rentals.includes('car') && <Row label="Car / day">{fmt(rentals.carDay[0])}–{fmt(rentals.carDay[1])}</Row>}
              {rentals?.motoDay && transit.rentals.includes('moto') && <Row label="Scooter / motorbike / day">{fmt(rentals.motoDay[0])}–{fmt(rentals.motoDay[1])}</Row>}
            </div>
            {transit.rentalNote && <p className="mt-1 text-[13px]">{transit.rentalNote}</p>}
            <ul className="mt-1.5 flex flex-col gap-1">
              {transit.rentals.map((r) => (
                <li key={r} className="text-[12px] text-muted">{RENTAL_INFO[r].icon} {RENTAL_INFO[r].tip}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[13px] text-muted">{transit.rentalNote ?? 'No rentals to speak of here.'}</p>
        )}
        <Links>
          <a className="text-accent hover:underline" href={`https://en.wikivoyage.org/wiki/Special:Search?go=Go&search=${encodeURIComponent(city.name)}#Get_around`} target="_blank" rel="noreferrer">
            Wikivoyage: {city.name} ↗
          </a>
        </Links>
      </Section>
    ),
    weather: (
      <Section
        title="Weather"
        aside={
          <span className="flex items-center gap-2 text-[11px] text-muted">
            {climate?.every((c) => c.feelsHigh !== undefined) && <FeelsToggle />}
            avg 2016–2025
          </span>
        }
      >
        {climate ? (
          <>
            <Suspense fallback={<div className="h-[180px]" />}>
              <ClimateChart data={climate} highlight={stayMonths} monthsLabel={monthsLabel} onHover={hoverFor('weather')} />
            </Suspense>
            {monthsFor('weather').map((m) => {
              const c = climate[m - 1]
              return (
                <p key={m} className="mt-1.5 text-[13px]">
                  <b>{new Date(2000, m - 1).toLocaleString('en', { month: 'long' })}:</b>{' '}
                  {shownTemps(c, feels).feels ? `feels like ${range(c.feelsLow!, c.feelsHigh!)}` : range(c.tLow, c.tHigh)}, {c.rainDays} rain days, {c.humidity}% humidity
                </p>
              )
            })}
            <div className="mt-3 flex items-baseline justify-between text-[11px]">
              <span className="font-semibold tracking-wider text-muted uppercase">Sunshine</span>
              <span className="text-muted">hours a day</span>
            </div>
            <Suspense fallback={<div className="h-[130px]" />}>
              <SunChart data={climate} highlight={stayMonths} monthsLabel={monthsLabel} onHover={hoverFor('sun')} />
            </Suspense>
            {monthsFor('sun').map((m) => (
              <p key={m} className="mt-1 text-[13px]">
                <b>{new Date(2000, m - 1).toLocaleString('en', { month: 'long' })}:</b>{' '}
                {climate[m - 1].sunHours < 0.5 ? 'almost no sun (polar night or very cloudy)' : `${climate[m - 1].sunHours} hours of sunshine a day`}
              </p>
            ))}
          </>
        ) : (
          <p className="text-[13px] text-muted">Climate data not loaded yet.</p>
        )}
      </Section>
    ),
    costs: cost && (
      <Section title="Costs" aside={<Badge tone="warn">{costInfo?.estimated ? 'estimated from price level' : 'estimates'}</Badge>}>
        <div className="mb-3 grid grid-cols-5 gap-1 text-center">
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
        <PriceLevel iso2={city.iso2} countryName={country.name} />
      </Section>
    ),
    money: pay && (
      <Section title="Paying & cash" aside={<Badge tone="warn">estimate</Badge>}>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted">Paying by card</span>
          <LevelBar level={card.level} label="Card acceptance" />
          <b className="text-[13px]">{CARD_LABELS[card.level].short}</b>
        </div>
        <p className="mt-1 text-[13px]">{CARD_LABELS[card.level].long}.</p>
        {card.reason && pay.foreignCardsWork && (
          <p className="mt-1 text-[12px] text-muted">
            {country.name} overall: {CARD_LABELS[card.countryLevel].short.toLowerCase()}; {card.level > card.countryLevel ? 'easier' : 'harder'} here ({card.reason}).
          </p>
        )}
        {payNote && <p className="mt-1 text-[13px]">{payNote}</p>}
        <div className="mt-2">
          <Row label="Contactless & phone pay">{pay.mobilePay === 'common' ? 'Common' : pay.mobilePay === 'some' ? 'In bigger shops and cities' : 'Not for foreign cards'}</Row>
          <Row label="Currency">{country.currency}{rateText(currency, country.currency) && ` · ${rateText(currency, country.currency)}`}</Row>
          {services && <Row label={`ATMs within ${ds.amenities.radiusKm} km`}>{roughCount(services.atm)}</Row>}
        </div>
        <p className="mt-2 text-[13px]"><span className="text-muted">Cash needed for:</span> {pay.cashFor}</p>
        <p className="mt-1 text-[13px]">🏧 {pay.atm}</p>
        {pay.note && <p className="mt-1 text-[13px]">{pay.note}</p>}
        <ul className="mt-2 flex flex-col gap-1">
          {ds.payments.tips.map((t) => <li key={t} className="text-[12px] text-muted">💡 {t}</li>)}
        </ul>
      </Section>
    ),
    health: health && (
      <Section title="Health">
        {water && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-muted">Tap water</span>
              <Badge tone={TAP_WATER_LABELS[water.level].tone}>{TAP_WATER_LABELS[water.level].short}</Badge>
            </div>
            <p className="mt-1 text-[13px]">{water.note}</p>
          </>
        )}
        <div className="mt-3 mb-1 text-[12px] font-semibold">Health risks</div>
        <ul className="list-disc pl-4 text-[13px]">{health.risks.map((r) => <li key={r}>{r}</li>)}</ul>
        <div className="mt-2 mb-1 text-[12px] font-semibold">Healthcare</div>
        <p className="text-[13px]">{health.healthcare}</p>
      </Section>
    ),
    medical: (
      <Section title="Medical help nearby">
        {services ? (
          <>
            <p className="mb-1 text-[12px] text-muted">Roughly how many within {ds.amenities.radiusKm} km of the centre:</p>
            <div className="grid grid-cols-3 gap-1 text-center">
              {([['pharmacy', '💊', 'Pharmacies'], ['clinic', '🩺', 'Clinics & doctors']] as const).map(([k, icon, label]) => (
                <Tile key={k} value={`${icon} ${roughCount(services[k])}`} label={label} />
              ))}
              {services.nearestHospitalKm !== undefined && <Tile value={`🏥 ${roughKm(services.nearestHospitalKm)}`} label="Nearest hospital" />}
              {services.hospitalWithin && <Tile value={`🏥 <${services.hospitalWithin} km`} label="Nearest hospital" />}
            </div>
          </>
        ) : (
          <p className="text-[13px] text-muted">No data for {city.name} yet.</p>
        )}
        <div className="mt-2">
          <Row label="Emergency number">{country.emergency}</Row>
        </div>
      </Section>
    ),
    air: (
      <Section title="Air quality" aside={<span className="text-[11px] text-muted">PM2.5, µg/m³</span>}>
        {air ? (
          <>
            <Suspense fallback={<div className="h-[140px]" />}>
              <AirChart data={air} highlight={stayMonths} who={ds.air.whoDaily} monthsLabel={monthsLabel} onHover={hoverFor('air')} />
            </Suspense>
            {monthsFor('air').map((m) => {
              const a = air[m - 1]
              return (
                <p key={m} className="mt-1 text-[13px]">
                  <b>{new Date(2000, m - 1).toLocaleString('en', { month: 'long' })}:</b> {airBand(a.pm25).short} (avg {a.pm25} µg/m³, ~{Math.round(a.daysOverWho)} days above the WHO daily guideline)
                </p>
              )
            })}
          </>
        ) : (
          <p className="text-[13px] text-muted">Air quality data not loaded yet.</p>
        )}

      </Section>
    ),
    vaccines: health && (
      <Section title="Vaccines & medicines">
        <p className="mb-1 text-[12px] text-muted">To discuss with a travel clinic, ideally 4–6 weeks before going.</p>
        <ul className="list-disc space-y-0.5 pl-4 text-[13px]">
              <li>Routine vaccines up to date, including measles (MMR)</li>
              {vaccines.items.map((v) => (
                <li key={v.name}>
                  <b className="font-medium">{v.name}</b>
                  {vaccines.source === 'cdc' && <span className={v.advice === 'recommended' ? ' text-ink' : ' text-muted'}>{v.advice === 'recommended' ? ' · recommended' : ' · consider'}</span>}
                  {v.note && <span className="text-muted">: {v.note}</span>}
                </li>
              ))}
        </ul>
        <Links>
          <a className="text-accent hover:underline" href={`https://wwwnc.cdc.gov/travel/destinations/traveler/none/${health.cdcSlug}`} target="_blank" rel="noreferrer">CDC: {country.name} ↗</a>
        </Links>
      </Section>
    ),
    phone: (
      <Section title="Phone & power">
        {mobile ? (
          <div className="flex items-center gap-2" title={mobile.long}>
            <span className="text-[13px] text-muted">Mobile internet</span>
            <LevelBar level={mobile.level} label="Mobile internet" />
            <b className="text-[13px]">{mobile.short}</b>
            <span className="text-[12px] text-muted">~{mobile.downMbps} Mbps</span>
          </div>
        ) : (
          <p className="text-[13px] text-muted">No mobile internet speeds for {country.name}.</p>
        )}
        {mobile && <p className="mt-1 text-[13px]">{mobile.long}.</p>}
        <div className="mt-2">
          <Row label="Plugs">Type {country.plugs.join(' / ')} · {country.voltage}V</Row>
        </div>
      </Section>
    ),
    services: (
      <Section title="Shops">
        {services ? (
          <>
            <p className="mb-1 text-[12px] text-muted">Roughly how many within {ds.amenities.radiusKm} km of the centre:</p>
            <div className="grid grid-cols-3 gap-1 text-center">
              {([['supermarket', '🛒', 'Supermarkets'], ['convenience', '🏪', 'Convenience'], ['atm', '🏧', 'ATMs']] as const).map(([k, icon, label]) => (
                <Tile key={k} value={`${icon} ${roughCount(services[k])}`} label={label} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-[13px] text-muted">No data for {city.name} yet.</p>
        )}
        {shopping && (
          <div className="mt-2">
            <Row label="Supermarket chains">{shopping.chains.join(', ')}</Row>
            {shopping.sunday && <p className="mt-1 text-[13px]">🗓 {shopping.sunday}</p>}
            {shopping.lateNight && <p className="mt-1 text-[13px]">🌙 {shopping.lateNight}</p>}
          </div>
        )}
      </Section>
    ),
    gettingThere: (
      <Section title="To other cities">
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
      </Section>
    ),
    safety: adv && (
      <Section title="Travel advice">
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
        <div className="mt-2">
          <Row label="Emergency number">{country.emergency}</Row>
          <Row label="Travel insurance">Strongly recommended</Row>
        </div>
        {adv.excludedByDefault && <p className="mt-1 text-[13px]">⚠ Many policies don't cover countries with do-not-travel advice: check yours covers {country.name}.</p>}
        <Links>
          <a className="text-accent hover:underline" href={adv.url} target="_blank" rel="noreferrer">UK FCDO advice ↗</a>
          {adv.us && <> · <a className="text-accent hover:underline" href={adv.us.url} target="_blank" rel="noreferrer">US advisory ↗</a></>}
        </Links>
      </Section>
    ),
    language: (
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
      </Section>
    ),
    visa: (
      <Section title={`Visa & entry · ${passportName ?? input.passport} passport`}>
        {visa && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={VISA_TEXT[visa.req].tone}>{VISA_TEXT[visa.req].label}</Badge>
            {visa.days && <span className="text-[13px]">up to {visa.days} days</span>}
          </div>
        )}
        {country.schengen && visa?.req !== 'free_movement' && (
          <p className="mt-2 text-[13px]">Part of the Schengen area: days here count toward the shared <b>90 days in any 180</b> limit.</p>
        )}
        {entryNotices.map((n) => (
          <div key={n.id} className="mt-2 rounded-md border border-line p-2 text-[13px]">
            <b>{n.title}</b>
            <p className="mt-0.5">{n.text}</p>
            <a className="text-[12px] text-accent hover:underline" href={n.url} target="_blank" rel="noreferrer">Official site ↗</a>
          </div>
        ))}
      </Section>
    ),
    people: (
      <Section title="People & culture">
        {city.population && <Row label="City population">{compact(city.population)}</Row>}
        {pop && <Row label={`${country.name} population (${pop.year})`}>{compact(pop.value)}</Row>}
        <Row label="Religion">{country.religion}</Row>
        {country.notes.length > 0 && (
          <>
          <div className="mt-2 mb-1 text-[12px] font-semibold">Good to know</div>
          <ul className="list-disc pl-4 text-[13px]">
            {country.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
          </>
        )}
      </Section>
    ),
  }

  // Problems that need attention before going: shown first on the Overview and as a dot on their tab.
  const visaProblem = !!visa && ['visa_required', 'e_visa', 'eta', 'no_admission'].includes(visa.req)
  const safetyProblem = !!adv && (adv.excludedByDefault || adv.level >= 3)
  const moneyProblem = !!pay && !pay.foreignCardsWork
  const problemTabs = new Set<CityTab>([...(visaProblem ? ['entry' as const] : []), ...(safetyProblem ? ['safety' as const] : []), ...(moneyProblem ? ['money' as const] : [])])

  // One line per topic for the Overview tab; each opens the tab with the details.
  const month = [...stayMonths][0]
  const monthName = new Date(2000, month - 1).toLocaleString('en', { month: 'short' })
  const clim = climate?.[month - 1]
  const climShown = clim && shownTemps(clim, feels)
  const airM = air?.[month - 1]
  const recommended = vaccines.items.filter((v) => v.advice === 'recommended').map((v) => v.name)
  const vaccineSummary = vaccines.source === 'cdc'
    ? recommended.length ? `Routine + ${recommended.join(', ')}` : 'Routine vaccines only'
    : `Routine + ${vaccines.items.length} to discuss`
  const glance: { icon: string; label: string; value: string; tone: Tone; tab: CityTab; problem?: boolean; color?: string }[] = [
    ...(visa ? [{ icon: '🛂', label: 'Visa', value: `${VISA_TEXT[visa.req].label}${visa.days ? ` (up to ${visa.days} days)` : ''}`, tone: VISA_TEXT[visa.req].tone, tab: 'entry' as const, problem: visaProblem }] : []),
    ...(adv ? [{
      icon: '🛡', label: 'Safety', tab: 'safety' as const, problem: safetyProblem,
      value: adv.excludedByDefault ? 'Do-not-travel advice' : adv.level >= 3 ? 'Avoid parts of the country' : adv.us && adv.us.level >= 2 ? adv.us.title.split(': ')[1] ?? 'Increased caution' : 'No travel restrictions',
      tone: (adv.excludedByDefault ? 'error' : adv.level >= 3 ? 'warn' : adv.us && adv.us.level >= 2 ? 'info' : 'ok') as Tone,
    }] : []),
    ...(transit ? [{ icon: '🚆', label: 'Public transport', value: `${TRANSIT_LABELS[transit.ease].short}${transit.walkable ? '; walkable centre' : ''}`, tone: toneOf(transit.ease), tab: 'transport' as const }] : []),
    ...(climShown ? [{ icon: '☀️', label: `Weather in ${monthName}`, value: `${climShown.feels ? 'feels like ' : ''}${range(climShown.low, climShown.high)}, ~${Math.round(clim!.rainDays)} rain days`, tone: 'info' as const, color: WEATHER_STYLE[weatherKind({ tHigh: climShown.high, rainDays: clim!.rainDays })].color, tab: 'weather' as const }] : []),
    ...(airM ? [{ icon: '🌫', label: `Air in ${monthName}`, value: airBand(airM.pm25).short, tone: toneOf(airBand(airM.pm25).level), tab: 'weather' as const }] : []),
    ...(water ? [{ icon: '💧', label: 'Tap water', value: TAP_WATER_LABELS[water.level].short, tone: TAP_WATER_LABELS[water.level].tone === 'ok' ? ('ok' as const) : TAP_WATER_LABELS[water.level].tone === 'info' ? ('info' as const) : ('warn' as const), tab: 'health' as const }] : []),
    ...(health ? [{ icon: '💉', label: 'Vaccines', value: vaccineSummary, tone: 'info' as const, tab: 'health' as const }] : []),
    ...(cost ? [{ icon: '💶', label: 'Daily budget', value: `${fmt(dailyCost(ds, cityId, input.budget))} (${BUDGETS.find((b) => b.value === input.budget)?.label.toLowerCase()})`, tone: 'info' as const, tab: 'money' as const }] : []),
    ...(pay ? [{ icon: '💳', label: 'Paying by card', value: CARD_LABELS[card.level].short, tone: moneyProblem ? ('error' as const) : toneOf(card.level), tab: 'money' as const, problem: moneyProblem }] : []),
    ...(mobile ? [{ icon: '📶', label: 'Mobile internet', value: `${mobile.short} (~${mobile.downMbps} Mbps)`, tone: toneOf(mobile.level), tab: 'daily' as const }] : []),
    { icon: '🗣', label: 'English', value: ENGLISH_LABELS[english.level].short, tone: toneOf(english.level), tab: 'daily' as const },
  ].sort((a, b) =>
    // Problems first, most serious first (can't get in, then don't go, then cash only); then in tab order.
    Number(!!b.problem) - Number(!!a.problem) ||
    (a.problem ? PROBLEM_ORDER.indexOf(a.tab) - PROBLEM_ORDER.indexOf(b.tab) : tabRank(a.tab) - tabRank(b.tab)))

  const tabInfo = TABS.find((t) => t.key === cityTab) ?? TABS[0]
  // Keep the open tab in view when the tab bar scrolls sideways.
  const activeTab = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tabInfo.key])
  const tabBar = useSideScroll()

  return (
    <div className="pb-8">
      <div className="sticky top-0 z-10 border-b border-line bg-panel px-4 pt-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold">{city.name}</h2>
            <p className="text-[13px] text-muted">{flag(city.iso2)} {country.name} · {country.schengen ? 'Schengen area' : 'Outside Schengen'}</p>
          </div>
          <button onClick={() => select(null)} className="h-7 w-7 rounded text-muted hover:bg-canvas hover:text-ink" aria-label="Close">✕</button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {stop ? (
            <>
              <span className="text-[13px]"><b>Stop {stopIndex + 1}</b> · {shortDate(stop.arrive)} – {shortDate(stop.depart)} · {stop.nights} nights</span>
              <Button className="ml-auto" onClick={() => { removeStop(stopIndex); select(null) }}>Remove</Button>
            </>
          ) : plan ? (
            <Button variant="primary" onClick={() => addCity(cityId)}>+ Add to trip</Button>
          ) : null}
        </div>
        <nav ref={tabBar.ref} style={tabBar.mask} className="no-scrollbar -mx-4 -mb-px mt-2 flex gap-1 overflow-x-auto overflow-y-hidden scroll-px-4 px-3" role="tablist" aria-label="City information">
          {TABS.map((t) => (
            <button
              key={t.key}
              ref={t.key === tabInfo.key ? activeTab : undefined}
              role="tab"
              aria-selected={t.key === tabInfo.key}
              onClick={() => setCityTab(t.key)}
              className={`relative shrink-0 border-b-2 px-2 py-2 text-[13px] font-medium whitespace-nowrap ${t.key === tabInfo.key ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {t.label}
              {problemTabs.has(t.key) && <span className="absolute top-1 right-0.5 h-1.5 w-1.5 rounded-full bg-red-600" aria-label="needs attention" />}
            </button>
          ))}
        </nav>
      </div>

      {tabInfo.key === 'overview' ? (
        <div className="px-4 py-3">
          <p className="text-[13px]">{city.blurb}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {city.tags.map((t) => <Badge key={t}>{t}</Badge>)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-muted">Suggested days:</span>
            {PACES.map((p) => (
              <span
                key={p.value}
                title={p.value === input.pace ? 'Your pace' : undefined}
                className={`rounded-full border px-2 py-0.5 ${p.value === input.pace ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-line text-muted'}`}
              >
                {p.icon} {p.label} <b>{suggested[p.value]}</b>
              </span>
            ))}
          </div>
          {suggested.longer && <p className="mt-1 text-[11px] text-muted">Includes extra time because {suggested.longer} is marked "Longer".</p>}

          <h3 className="mt-4 mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">At a glance</h3>
          <ul className="flex flex-col">
            {glance.map((g) => (
              <li key={g.label}>
                <button
                  onClick={() => setCityTab(g.tab)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-canvas ${g.problem ? 'bg-danger-soft' : ''}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${g.color ? '' : TONE_DOT[g.tone]}`} style={g.color ? { background: g.color } : undefined} />
                  <span className="w-5 shrink-0 text-center">{g.icon}</span>
                  <span className="w-32 shrink-0 text-muted">{g.label}</span>
                  <span className={`flex-1 font-medium ${g.problem ? 'text-danger' : ''}`}>{g.value}</span>
                  <span className="text-muted">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        tabInfo.sections.map((k) => <Fragment key={k}>{sections[k]}</Fragment>)
      )}
    </div>
  )
}
