import { dataset as ds } from '../data/dataset'
import { comparePrices, costSanity } from '../planner'
import { useTrip } from '../store/trip'
import { money } from '../ui/format'
import { Row } from '../ui/kit'

/** Display currency → the country people paying in it most likely compare prices with. */
const HOME_BY_CURRENCY: Record<string, string> = {
  USD: 'US', GBP: 'GB', EUR: 'DE', CHF: 'CH', SEK: 'SE', NOK: 'NO', DKK: 'DK', CAD: 'CA', AUD: 'AU',
  NZD: 'NZ', JPY: 'JP', KRW: 'KR', TWD: 'TW', HKD: 'HK', SGD: 'SG', CNY: 'CN', INR: 'IN',
}

/** Euro-area countries without their own Big Mac price use the euro-area average. */
const EUROZONE = new Set(['HR', 'SI', 'GR', 'BG', 'SK', 'LT', 'LV', 'EE', 'DE', 'FR', 'NL', 'IT', 'ES'])

function bigMacFor(iso2: string) {
  const own = ds.bigMac.prices[iso2]
  if (own) return { ...own, euroAverage: false }
  if (EUROZONE.has(iso2) && ds.bigMac.euroArea) return { ...ds.bigMac.euroArea, euroAverage: true }
  return null
}

/** EUR value of an amount in any currency we have a rate for. */
const toEur = (amount: number, currency: string) => (currency === 'EUR' ? amount : amount / (ds.fx.rates[currency] ?? NaN))

export function PriceLevel({ iso2, countryName }: { iso2: string; countryName: string }) {
  const { currency, priceCompare, setPriceCompare } = useTrip()
  const here = ds.priceLevels.levels[iso2]
  const compareIso = priceCompare ?? HOME_BY_CURRENCY[currency] ?? 'US'
  const other = ds.priceLevels.compare.find((c) => c.iso2 === compareIso) ?? ds.priceLevels.compare[0]
  const otherLevel = ds.priceLevels.levels[other.iso2]
  const sanity = costSanity(ds, iso2)
  const mac = bigMacFor(iso2)
  const otherMac = bigMacFor(other.iso2)

  return (
    <div className="mt-3 rounded-md border border-line p-2.5">
      {here ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] font-semibold">Price level</span>
            <label className="flex items-center gap-1 text-[12px] text-muted">
              compare with
              <select
                value={other.iso2}
                onChange={(e) => setPriceCompare(e.target.value)}
                className="rounded border border-line bg-panel px-1 py-0.5 text-[12px] text-ink"
                aria-label="Compare prices with"
              >
                {ds.priceLevels.compare.map((c) => <option key={c.iso2} value={c.iso2}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <p className="mt-1 text-[14px] font-semibold">
            {countryName} is {otherLevel ? comparePrices(here.level, otherLevel.level, other.name) : '–'}
          </p>
          <p className="text-[12px] text-muted">
            Price level {here.level.toFixed(2)} (US = 1.00): about {Math.round(here.level * 100)}% of US prices.
          </p>
          <details className="mt-1.5 text-[12px]">
            <summary className="cursor-pointer text-accent">How to read the price level</summary>
            <div className="mt-1 flex flex-col gap-1 leading-relaxed text-muted">
              <p>It shows how far your money goes here once exchanged at the normal rate, compared with the United States (= 1.00). 0.50 means things cost about half of US prices; above 1.00 means pricier than the US.</p>
              <p>To compare two countries, divide one by the other. For example, Poland 0.51 ÷ Germany 0.80 ≈ 0.64, so Poland is about 35% cheaper. A €10 meal in Germany costs about €6.40 there.</p>
              <p>It's based on the same large basket of goods and services priced in every country (food, rent, transport, restaurants, services), so it's a national average:</p>
              <ul className="list-disc pl-4">
                <li>capitals and tourist hotspots usually cost more than the average;</li>
                <li>local services (meals, taxis, guesthouses) vary the most between countries; imported goods (phones, brand clothes) much less.</li>
              </ul>
            </div>
          </details>
          {sanity != null && (sanity > 1.25 || sanity < 0.8) && (
            <p className="mt-1.5 text-[12px]">
              ⚠ Our prices above are about {Math.round(Math.abs(sanity - 1) * 100)}% {sanity > 1 ? 'higher' : 'lower'} than this price level suggests
              {sanity > 1 ? ' (tourist areas often cost more than the national average)' : ''}. Treat them as rough.
            </p>
          )}
        </>
      ) : (
        <p className="text-[12px] text-muted">No national price level available for {countryName}.</p>
      )}

      <div className="mt-2 border-t border-line pt-2">
        {mac ? (
          <Row label={`🍔 Big Mac${mac.euroAverage ? ' (euro-area average)' : ''}`}>
            {money(toEur(mac.localPrice, mac.currency), currency, true)}
            {otherMac && other.iso2 !== iso2 && (
              <span className="font-normal text-muted"> · {other.name}: {money(toEur(otherMac.localPrice, otherMac.currency), currency, true)}</span>
            )}
          </Row>
        ) : (
          <Row label="🍔 Big Mac"><span className="font-normal text-muted">Not in the index here</span></Row>
        )}
      </div>
    </div>
  )
}
