import { Fragment, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { dataset as ds } from '../data/dataset'
import { CARD_LABELS, ENGLISH_LABELS, RENTAL_INFO, TAP_WATER_LABELS, TRANSIT_LABELS, airBand, tapWater, vaccinesFor, mobileInternet, nearby, roughCount, roughKm, addDays, cityPrices, dailyCost, cardLevel, COST_HINTS, costProfile, englishLevel, PHRASES, phraseAs, phrasesFor, likelyMonth, schengenApplies, suggestedDays, monthOf, taxiEstimate, type GroceryKey, type Pace, type PriceKey } from '../planner'
import { useTrip, type CityTab } from '../store/trip'
import { MODE_ICON, VISA_TEXT, compact, duration, flag, dateRange, rateText, shownTemps } from '../ui/format'
import { CurrencyToggle } from '../ui/CurrencyToggle'
import { FeelsToggle } from '../ui/FeelsToggle'
import { HoverTip, type Tip } from '../ui/HoverTip'
import { useSideScroll } from '../ui/useSideScroll'
import { Badge, Button, LevelBar, Links, Row, Section, Sections, Segmented } from '../ui/kit'
import { MoneyCurrency, useMoney } from '../ui/useMoney'
import { useTemp } from '../ui/useTemp'
import { AiHelp } from './AiHelp'
import { AskButton } from './AskButton'
import { CheckNotes, checkSection, checkTab } from './Checks'
import { CostDay } from './CostDay'
import { Forecast, SubHead } from './Forecast'
import { VisitTab } from './Visit'
import { isEmptyItem, useAllItems } from '../store/items'
import { SHARED_TOKEN } from '../store/shareLink'
import { Holidays } from './Holidays'
import { MyPhrases } from './MyPhrases'
import { Speak } from '../ui/Speak'
import { PriceEdit } from './PriceEdit'
import { PriceLevel } from './PriceLevel'
import { TABS, type SectionKey } from './cityTabs'

/** The weather and air charts use a charting library (Recharts), loaded only when a Weather tab is first opened. */
const ClimateChart = lazy(() => import('./ClimateChart').then((m) => ({ default: m.ClimateChart })))
const RainChart = lazy(() => import('./ClimateChart').then((m) => ({ default: m.RainChart })))
const AirChart = lazy(() => import('./AirChart').then((m) => ({ default: m.AirChart })))
const SunChart = lazy(() => import('./SunChart').then((m) => ({ default: m.SunChart })))

const PACES: { value: Pace; icon: string; label: string }[] = [
  { value: 'chill', icon: '🐢', label: 'Chill' }, { value: 'balanced', icon: '⚖️', label: 'Balanced' }, { value: 'fast', icon: '🐇', label: 'Fast' },
]


/** A number with a label underneath, in the grids of shops and medical help. */
const Tile = ({ value, label }: { value: string; label: string }) => (
  <div className="rounded-md border border-line px-1 py-1.5">
    <div className="text-[15px] font-semibold">{value}</div>
    <div className="text-[10px] text-muted">{label}</div>
  </div>
)

const tabRank = (tab: CityTab) => TABS.findIndex((t) => t.key === tab)
const PROBLEM_ORDER: CityTab[] = ['entry', 'safety', 'costs']
/** A tab's or sub-tab's dot: red when it needs attention, orange for a warning. */
const Dot = ({ severity, className }: { severity?: 'warn' | 'error'; className: string }) =>
  severity ? <span className={`absolute h-1.5 w-1.5 rounded-full ${severity === 'error' ? 'bg-red-600' : 'bg-amber-500'} ${className}`} aria-label={severity === 'error' ? 'needs attention' : 'has a warning'} /> : null

const GROCERIES: [GroceryKey, string][] = [
  ['water15', 'Water (1.5 L)'], ['coke05', 'Coca-Cola (0.5 L)'], ['beer05', 'Beer (0.5 L, shop)'], ['bread', 'Bread (loaf)'],
  ['eggs10', 'Eggs (10)'], ['milk1l', 'Milk (1 L)'], ['pasta500g', 'Pasta (500 g)'], ['bananas1kg', 'Bananas (1 kg)'],
  ['tomatoes1kg', 'Tomatoes (1 kg)'], ['chicken500g', 'Chicken breast (500 g)'],
]

export function CityDrawer({ cityId }: { cityId: string }) {
  const { plan, input, select, addCity, editInItinerary, cityTab, cityPart, setCityTab, layer, layerMonth, readOnly } = useTrip()
  const { currency, fmt } = useMoney()
  const { range } = useTemp()
  // Temperatures as they feel or as measured: one setting for the whole app.
  const feels = useTrip((s) => s.tempFeels)
  const city = ds.cities[cityId]
  const country = ds.countries[city.iso2]
  const costInfo = costProfile(ds, city.iso2)
  const cost = costInfo?.profile
  // Prices are estimates anyway; only those worked out from the price level (no price list for the country) say so.
  const roughCosts = costInfo?.estimated ? <Badge tone="warn">estimated from price level</Badge> : undefined
  // The daily cost and prices can show the city's own currency instead (one setting for every city), where it has a rate.
  const costsLocal = useTrip((s) => s.costsLocal)
  const ownCurrency = country.currency !== currency && (country.currency === 'EUR' || ds.fx.rates[country.currency]) ? country.currency : null
  const priceCurrency = costsLocal && ownCurrency ? ownCurrency : currency
  // The city's prices, the user's where they saw one (My visit), and ours.
  const seenPrices = useTrip((s) => s.seenPrices)
  const prices = cityPrices(ds, cityId, seenPrices)
  const ours = cityPrices(ds, cityId)
  const price = (what: Exclude<PriceKey, GroceryKey | 'day'>, label: string, precise = false) =>
    prices && ours && <PriceEdit cityId={cityId} what={what} eur={prices[what]!} ours={ours[what]!} label={label} precise={precise} />
  const climate = ds.climate[cityId]
  const adv = ds.advisories[city.iso2]
  const visa = ds.visa.rules[input.passport]?.[city.iso2]
  const passportName = ds.visa.passports.find((p) => p.code === input.passport)?.name
  const pop = ds.population[city.iso2]
  const english = englishLevel(ds, cityId)
  const suggested = suggestedDays(ds, cityId)
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
  const phrases = phrasesFor(ds, cityId)
  // The language the Phrases tab is in: the city's main one until another is picked.
  const [phraseLang, setPhraseLang] = useState<string | null>(null)
  const lang = phrases?.languages.find((l) => l.tag === phraseLang) ?? phrases?.languages[0]
  // (As a woman or a man says them: Settings.)
  const speaker = useTrip((s) => s.speaker)
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

  // The stop's checks (problems and warnings), each inside the card it's about and on the Overview's line for it.
  const stopChecks = stop ? plan!.warnings.filter((w) => w.cityId === cityId && w.severity !== 'info') : []
  const checksIn = (...keys: SectionKey[]) => stopChecks.filter((w) => keys.includes(checkSection(w)!))
  const notes = (key: SectionKey) => <CheckNotes warnings={checksIn(key)} cityId={cityId} />

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
          <Row label="Local transport / day">{!cost ? '–' : cost.localTransportDay ? fmt(cost.localTransportDay) : 'Free'}</Row>
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
        {notes('weather')}
        {climate ? (
          <>
            <Suspense fallback={<div className="h-[370px]" />}>
              <ClimateChart data={climate} highlight={stayMonths} monthsLabel={monthsLabel} />
              <SubHead title="Rain" unit="rain days a month" />
              <RainChart data={climate} highlight={stayMonths} monthsLabel={monthsLabel} />
            </Suspense>
            <Forecast cityId={cityId} />
            <SubHead title="Sunshine" unit="hours a day" />
            <Suspense fallback={<div className="h-[130px]" />}>
              <SunChart data={climate} highlight={stayMonths} monthsLabel={monthsLabel} />
            </Suspense>
          </>
        ) : (
          <p className="text-[13px] text-muted">Climate data not loaded yet.</p>
        )}
      </Section>
    ),
    day: cost && <MoneyCurrency.Provider value={priceCurrency}><CostDay cityId={cityId} /></MoneyCurrency.Provider>,
    stay: prices && ours && (
      <Section title="Stay" action={<AiHelp topic="stayPrices" place={city.name} />} aside={roughCosts}>
        <MoneyCurrency.Provider value={priceCurrency}>
          <Row label="Hostel dorm bed">{price('dormBed', 'Hostel dorm bed')}</Row>
          <Row label="Private room">{price('privateRoom', 'Private room')}</Row>
        </MoneyCurrency.Provider>
        <p className="mt-1 text-[12px] text-muted">A night, in this city. Hotel and apartment prices aren't in our data yet.</p>
        <p className="mt-1 text-[12px] text-muted">Click a price to put in the one you saw or paid; it's then used for this city.</p>
      </Section>
    ),
    // Without curated prices, still the national price level and Big Mac price (open data), with no prices of ours.
    food: !cost ? ds.priceLevels.levels[city.iso2] && (
      <Section title="Price level">
        <p className="text-[13px] text-muted">No prices for {country.name} yet.</p>
        <PriceLevel iso2={city.iso2} countryName={country.name} />
      </Section>
    ) : (
      <Section title="Food & drink" action={<AiHelp topic="foodPrices" place={city.name} />} aside={roughCosts}>
        <MoneyCurrency.Provider value={priceCurrency}>
          <Row label="Local meal" hint={COST_HINTS.mealLocal}>{price('mealLocal', 'Local meal')}</Row>
          <Row label="Restaurant dinner" hint={COST_HINTS.mealDinner}>{price('mealDinner', 'Restaurant dinner')}</Row>
          <Row label="Café coffee" hint={COST_HINTS.coffee}>{price('coffee', 'Café coffee', true)}</Row>
          <Row label="Beer in a bar (0.5 L)" hint={COST_HINTS.beerBar}>{price('beerBar', 'Beer in a bar', true)}</Row>
          <div className="mt-3 mb-1 text-[12px] font-semibold">Supermarket</div>
          {prices && ours && GROCERIES.map(([k, label]) => (
            <Row key={k} label={label}>
              <PriceEdit cityId={cityId} what={k} eur={prices.groceries[k]} ours={ours.groceries[k]} label={label} precise />
            </Row>
          ))}
          <Row label="Groceries for a day" hint={COST_HINTS.groceryDay}>{price('groceryDay', 'Groceries for a day', true)}</Row>
        </MoneyCurrency.Provider>
        <PriceLevel iso2={city.iso2} countryName={country.name} />
      </Section>
    ),
    money: pay && card && (
      <Section title="Paying & cash" aside={<Badge tone="warn">estimate</Badge>}>
        {notes('money')}
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
          {country.emergency && <Row label="Emergency number">{country.emergency}</Row>}
        </div>
      </Section>
    ),
    air: (
      <Section title="Air quality" aside={<span className="text-[11px] text-muted">PM2.5, µg/m³</span>}>
        {notes('air')}
        {air ? (
          <>
            <Suspense fallback={<div className="h-[140px]" />}>
              <AirChart data={air} highlight={stayMonths} who={ds.air.whoDaily} monthsLabel={monthsLabel} />
            </Suspense>
          </>
        ) : (
          <p className="text-[13px] text-muted">Air quality data not loaded yet.</p>
        )}

      </Section>
    ),
    // CDC's advice where it has a page, even for a country without a curated health entry (only its capital, open data).
    vaccines: (health || vaccines.source === 'cdc') && (
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
          <a className="text-accent hover:underline" href={vaccines.url ?? `https://wwwnc.cdc.gov/travel/destinations/traveler/none/${health?.cdcSlug}`} target="_blank" rel="noreferrer">CDC: {country.name} ↗</a>
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
          {(country.plugs.length > 0 || country.voltage) && (
            <Row label="Plugs">{[country.plugs.length && `Type ${country.plugs.join(' / ')}`, country.voltage && `${country.voltage}V`].filter(Boolean).join(' · ')}</Row>
          )}
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
        {notes('gettingThere')}
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
          <p className="text-[13px] text-muted">
            {city.auto
              ? `No connections yet: plans leave ${country.name} out until it has curated cities.`
              : 'No timetable data yet; travel times are estimated from road distance.'}
          </p>
        )}
      </Section>
    ),
    holidays: <Holidays iso2={city.iso2} countryName={country.name} stay={stop && { arrive: stop.arrive, depart: stop.depart }} />,
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
          {country.emergency && <Row label="Emergency number">{country.emergency}</Row>}
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
        {notes('language')}
        {english && (
          <>
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
          </>
        )}
        <div className={english ? 'mt-2' : undefined}>
          <Row label="Local language">{country.languages.join(', ')}</Row>
          {!!country.english?.otherLanguages.length && <Row label="Also useful">{country.english.otherLanguages.join('; ')}</Row>}
          {country.english && <Row label="Alphabet">{country.english.script}</Row>}
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
    phrases: phrases && (
      <Section title={lang ? `In ${lang.name}` : 'Phrases'} action={lang && <AiHelp topic="phrases" place={country.name} />}>
        {/* Where more than one language is spoken, a switch picks which one the phrases are in; the main one first. */}
        {phrases.languages.length > 1 && (
          <div className="mb-2">
            <Segmented value={lang!.tag} onChange={setPhraseLang} options={phrases.languages.map((l) => ({ value: l.tag, label: l.name }))} />
          </div>
        )}
        {(phrases.note || lang?.note) && <p className="mb-1.5 text-[12px] text-muted">{[lang?.note, phrases.note].filter(Boolean).join(' ')}</p>}
        {lang && PHRASES.map(({ key, label }) => {
          const p = phraseAs(lang.tag, lang.phrases[key], speaker)
          return (
            <div key={key} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="shrink-0 text-[13px] text-muted">{label}</span>
              <div className="min-w-0 text-right">
                <div className="flex items-baseline justify-end gap-1.5">
                  <Speak tag={lang.tag} text={p.text} phrase={key} />
                  <span lang={lang.tag} className="text-[15px] font-medium">{p.text}</span>
                </div>
                <div className="text-[12px] text-muted">{p.say}</div>
                {p.note && <div className="text-[11px] text-muted">{p.note}</div>}
              </div>
            </div>
          )
        })}
        {lang && <MyPhrases tag={lang.tag} />}
      </Section>
    ),
    people: (
      <Section title="People & culture">
        {city.population && <Row label="City population">{compact(city.population)}</Row>}
        {pop && <Row label={`${country.name} population (${pop.year})`}>{compact(pop.value)}</Row>}
        {country.religion && <Row label="Religion">{country.religion}</Row>}
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
  const problemTabs = new Set<CityTab>([...(visaProblem ? ['entry' as const] : []), ...(safetyProblem ? ['safety' as const] : []), ...(moneyProblem ? ['costs' as const] : [])])
  // The stop's checks (the plan against the preferences: budget, weather, travel days; air): a dot on their tab and
  // sub-tab too, orange for a warning (red for a problem). Sub-tabs are keyed "tab:sub".
  const dots = new Map<string, 'warn' | 'error'>()
  const mark = (key: string, severity: 'warn' | 'error') => dots.get(key) !== 'error' && dots.set(key, severity)
  for (const w of stop ? plan!.warnings : []) {
    const at = w.cityId === cityId && w.severity !== 'info' && checkTab(w)
    if (!at) continue
    const [tab, sub] = at
    mark(tab, w.severity as 'warn' | 'error')
    if (sub) mark(`${tab}:${sub}`, w.severity as 'warn' | 'error')
  }
  for (const tab of problemTabs) mark(tab, 'error')
  if (moneyProblem) mark('costs:paying', 'error')

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
  // The stop's warnings, each said in a few words on its line, which is tinted for it.
  // The way here, when the journey has a check: longer than the longest travel day, overnight, a border crossing, no
  // known route (a problem).
  const legIn = stopIndex > 0 ? plan!.legs[stopIndex - 1] : null
  const legChecks = checksIn('gettingThere')
  const legNote = legChecks.some((w) => w.kind === 'border') ? 'crossing may be refused'
    : legIn?.overnight ? 'overnight' : `over your ${input.prefs.maxTravelHours} h a day`
  // The weather by the traveller's limits: colder, hotter or wetter than they like (cold and hot ones carry the high).
  const weatherNote = checksIn('weather').map((w) => `${w.tempC === undefined ? 'wetter' : w.tempC >= input.prefs.tempBreaks[3] ? 'hotter' : 'colder'} than you like`)[0]
  // The daily cost: over the daily or the bed budget, or an expensive place for the trip.
  const dayChecks = checksIn('day')
  const overWhat = [dayChecks.some((w) => w.amount?.per === 'day') && 'daily', dayChecks.some((w) => w.amount?.per === 'night') && 'bed'].filter(Boolean)
  const dayNote = overWhat.length ? `over ${overWhat.join(' and ')} budget` : dayChecks.length ? 'expensive for this trip' : input.cityCosts?.[cityId] ? 'changed here' : 'your preferences'
  // `warn`: one of the stop's warnings, said in the value; the line is tinted for it.
  const glance: { icon: string; label: string; value: string; tab: CityTab; part?: string; problem?: boolean; warn?: boolean }[] = [
    ...(visa ? [{ icon: '🛂', label: 'Visa', value: `${VISA_TEXT[visa.req].label}${visa.days ? ` (up to ${visa.days} days)` : ''}`, tab: 'entry' as const, problem: visaProblem }] : []),
    ...(adv ? [{
      icon: '🛡', label: 'Safety', tab: 'safety' as const, problem: safetyProblem,
      value: adv.excludedByDefault ? 'Do-not-travel advice' : adv.level >= 3 ? 'Avoid parts of the country' : adv.us && adv.us.level >= 2 ? adv.us.title.split(': ')[1] ?? 'Increased caution' : 'No travel restrictions',
    }] : []),
    ...(legIn && legChecks.length ? [{
      icon: '🧭', label: 'Getting here', tab: 'transport' as const, warn: true,
      problem: legChecks.some((w) => w.severity === 'error'),
      value: legIn.reachable ? `${duration(legIn.durationMin)} from ${ds.cities[legIn.from].name} (${legNote})` : `No known route from ${ds.cities[legIn.from].name}`,
    }] : []),
    ...(transit ? [{ icon: '🚆', label: 'Public transport', value: `${TRANSIT_LABELS[transit.ease].short}${transit.walkable ? '; walkable centre' : ''}`, tab: 'transport' as const }] : []),
    ...(climShown ? [{ icon: '☀️', label: `Weather in ${monthName}`, value: `${climShown.feels ? 'feels like ' : ''}${range(climShown.low, climShown.high)}, ~${Math.round(clim!.rainDays)} rain days${weatherNote ? ` (${weatherNote})` : ''}`, tab: 'weather' as const, warn: !!weatherNote }] : []),
    ...(airM ? [{ icon: '🌫', label: `Air in ${monthName}`, value: airBand(airM.pm25).short, tab: 'weather' as const, warn: checksIn('air').length > 0 }] : []),
    ...(water ? [{ icon: '💧', label: 'Tap water', value: TAP_WATER_LABELS[water.level].short, tab: 'health' as const }] : []),
    ...(health || vaccines.source === 'cdc' ? [{ icon: '💉', label: 'Vaccines', value: vaccineSummary, tab: 'health' as const }] : []),
    ...(cost ? [{ icon: '💶', label: 'Daily cost', value: `${fmt(dailyCost(ds, cityId, { ...input, prices: seenPrices }))} (${dayNote})`, tab: 'costs' as const, part: 'daily', warn: dayChecks.length > 0 }] : []),
    ...(card ? [{ icon: '💳', label: 'Paying by card', value: CARD_LABELS[card.level].short, tab: 'costs' as const, part: 'paying', problem: moneyProblem }] : []),
    ...(mobile ? [{ icon: '📶', label: 'Mobile internet', value: `${mobile.short} (~${mobile.downMbps} Mbps)`, tab: 'daily' as const }] : []),
    ...(english ? [{ icon: '🗣', label: 'English', value: ENGLISH_LABELS[english.level].short, tab: 'daily' as const }] : []),
  ].sort((a, b) =>
    // Problems first, most serious first (can't get in, then don't go, then cash only); then the stop's warnings; then
    // in tab order.
    Number(!!b.problem) - Number(!!a.problem) || Number(!!b.warn) - Number(!!a.warn) ||
    (a.problem ? PROBLEM_ORDER.indexOf(a.tab) - PROBLEM_ORDER.indexOf(b.tab) : tabRank(a.tab) - tabRank(b.tab)))

  // (On someone else's shared trip, the owner's own stays, links and notes only if they made some public.)
  const visit = Object.values(useAllItems()).some((i) => i.at === cityId && !isEmptyItem(i))
  // (Named neutrally there: it's the owner's visit.)
  const tabs = !SHARED_TOKEN ? TABS : TABS.filter((t) => t.key !== 'notes' || visit).map((t) => (t.key === 'notes' ? { ...t, label: 'Visit' } : t))
  const tabInfo = tabs.find((t) => t.key === cityTab) ?? tabs[0]
  const part = tabInfo.parts && (tabInfo.parts.find((p) => p.key === cityPart[tabInfo.key]) ?? tabInfo.parts[0])
  // Keep the open tab in view when the tab bar scrolls sideways (only the bar: scrollIntoView would also scroll the
  // panel, e.g. while a phone's sheet is still opening).
  const activeTab = useRef<HTMLButtonElement>(null)
  const tabBar = useSideScroll()
  useEffect(() => {
    const bar = tabBar.ref.current
    const tab = activeTab.current
    if (!bar || !tab) return
    const b = bar.getBoundingClientRect()
    const t = tab.getBoundingClientRect()
    if (t.left < b.left) bar.scrollLeft -= b.left - t.left + 16
    else if (t.right > b.right) bar.scrollLeft += t.right - b.right + 16
  }, [tabInfo.key, tabBar.ref])
  const [tabTip, setTabTip] = useState<Tip | null>(null)

  return (
    <div className="pb-8">
      <div data-sheet-peek className="sticky top-0 z-10 border-b border-line bg-panel px-4 pt-3 max-md:pt-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold">{city.name}</h2>
            <p className="text-[13px] text-muted">{flag(city.iso2)} {country.name} · {country.schengen ? 'Schengen area' : 'Outside Schengen'}</p>
          </div>
          <AskButton />
          <button onClick={() => select(null)} className="h-7 w-7 rounded text-muted hover:bg-canvas hover:text-ink" aria-label="Close">✕</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {stop ? (
            <>
              <span className="text-[13px]"><b>Stop {stopIndex + 1}</b> · {dateRange(stop.arrive, stop.depart)} · {stop.nights} nights</span>
              {/* (Its nights, lock and removal are the Itinerary's, opened beside this at the stop: next to them here.) */}
              {!readOnly && (
                // (Styled as Ask AI, above.)
                <button
                  onClick={editInItinerary}
                  title="Change its nights, lock or remove it in the Itinerary"
                  className="flex h-7 shrink-0 items-center rounded-full border border-accent/50 px-2.5 text-[12px] font-medium text-accent hover:bg-accent-soft"
                >
                  Make changes
                </button>
              )}
            </>
          ) : plan && !readOnly && !city.auto ? (
            <Button variant="primary" onClick={() => addCity(cityId)}>+ Add to trip</Button>
          ) : null}
        </div>
        <nav ref={tabBar.ref} style={tabBar.mask} className="no-scrollbar -mx-4 -mb-px mt-2 flex gap-1 overflow-x-auto overflow-y-hidden scroll-px-4 px-3" role="tablist" aria-label="City information">
          {/* Icons; the open tab also has its name, the others name themselves on hover. */}
          {tabs.map((t) => {
            const active = t.key === tabInfo.key
            return (
              <button
                key={t.key}
                ref={active ? activeTab : undefined}
                role="tab"
                aria-selected={active}
                aria-label={t.label}
                onMouseEnter={active ? undefined : (e) => setTabTip({ content: { lines: [t.label] }, rect: e.currentTarget.getBoundingClientRect() })}
                onMouseLeave={() => setTabTip(null)}
                onClick={() => { setTabTip(null); setCityTab(t.key) }}
                // (Wider on a phone, for a finger.)
                className={`relative flex shrink-0 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-[13px] max-md:min-w-11 max-md:px-3 max-md:py-2.5 font-medium whitespace-nowrap ${active ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}
              >
                <t.icon size={16} />
                {active && t.label}
                <Dot severity={dots.get(t.key)} className="top-1 right-0.5 max-md:top-1.5 max-md:right-1.5" />
              </button>
            )
          })}
          <HoverTip tip={tabTip} />
        </nav>
        {tabInfo.parts && (
          <div className="-mx-4 flex gap-1 border-t border-line px-4 py-1.5" role="tablist" aria-label={`${tabInfo.label} sections`}>
            {tabInfo.parts.map((p) => (
              <button
                key={p.key}
                role="tab"
                aria-selected={p.key === part!.key}
                onClick={() => setCityTab(tabInfo.key, p.key)}
                className={`relative rounded-full px-2.5 py-1 text-[12px] font-medium whitespace-nowrap ${p.key === part!.key ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-canvas hover:text-ink'}`}
              >
                {p.label}
                <Dot severity={dots.get(`${tabInfo.key}:${p.key}`)} className="top-0.5 right-0.5" />
              </button>
            ))}
            {cost && ownCurrency && (part!.key === 'daily' || part!.key === 'prices') && (
              <span className="ml-auto self-center"><CurrencyToggle local={ownCurrency} /></span>
            )}
          </div>
        )}
      </div>

      <Sections>
      {tabInfo.key === 'overview' ? (
        <>
        <Section>
          {city.blurb && <p className="text-[13px]">{city.blurb}</p>}
          {city.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {city.tags.map((t) => <Badge key={t}>{t}</Badge>)}
            </div>
          )}
          {/* A capital from open data only: no suggested stay (its days are a plain default), so say what it has. */}
          {city.auto ? (
            <p className={`${city.blurb ? 'mt-2 ' : ''}text-[12px] text-muted`}>Only open data here so far (GeoNames, Wikidata, official advice, weather and map data): no local tips or prices yet, and plans leave it out.</p>
          ) : (
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
          )}
        </Section>

        <Section title="At a glance">
          <ul className="-mx-2 flex flex-col">
            {glance.map((g) => (
              <li key={g.label}>
                <button
                  onClick={() => setCityTab(g.tab, g.part)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-canvas ${g.problem ? 'bg-danger-soft' : g.warn ? 'bg-warn-soft' : ''}`}
                >
                  <span className="w-5 shrink-0 text-center">{g.icon}</span>
                  <span className="w-32 shrink-0 text-muted">{g.label}</span>
                  <span className="flex-1">
                    <span className={`font-medium ${g.problem ? 'text-danger' : ''}`}>{g.value}</span>
                  </span>
                  <span className="text-muted">›</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
        </>
      ) : tabInfo.key === 'notes' ? (
        <VisitTab cityId={cityId} />
      ) : (
        (part?.sections ?? tabInfo.sections).some((k) => sections[k])
          ? (part?.sections ?? tabInfo.sections).map((k) => <Fragment key={k}>{sections[k]}</Fragment>)
          // Nothing for this city yet (a capital from open data has no phrases; the UK has no UK travel advice).
          : <Section><p className="text-[13px] text-muted">Nothing here for {city.name} yet.</p></Section>
      )}
      </Sections>
    </div>
  )
}
