// A price in the city panel's Daily cost and Prices that the user can change to the one they saw or paid there. My
// visit keeps it (itemsCore.ts), in the money it was typed in, and the costs use it in place of ours for that city
// (cost.ts: cityPrices): the daily cost, the trip's total, the budget checks and the map's Cost view.
import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { dataset as ds } from '../data/dataset'
import type { PriceKey } from '../planner'
import { isEmptyItem, priceId, useItems } from '../store/items'
import { SHARED_TOKEN } from '../store/shareLink'
import { useMoney } from '../ui/useMoney'

const rateOf = (currency: string) => (currency === 'EUR' ? 1 : ds.fx.rates[currency])
/** An amount as it's typed: whole from 100 up, else to the cent (no trailing zeros). */
const typed = (v: number) => (v >= 100 ? String(Math.round(v)) : String(Math.round(v * 100) / 100))

/**
 * `eur`: the price of one (ours, or the user's), shown `count` times (2 coffees; a day's cost for the nights);
 * `ours`: ours, for the reset. Typed in the currency shown (useMoney: the display currency, or the city's own), per
 * one (`per` says so when `count` isn't 1). Someone else's shared trip shows the prices without editing.
 */
export function PriceEdit({ cityId, what, eur, ours, count = 1, per = 'each', precise, label, className = '' }: {
  cityId: string
  what: PriceKey
  eur: number
  ours: number
  count?: number
  per?: string
  precise?: boolean
  /** What it's the price of, for screen readers ("Local meal"). */
  label: string
  className?: string
}) {
  const { currency, fmt } = useMoney()
  const id = priceId(cityId, what)
  const seen = useItems((s) => !isEmptyItem(s.books[s.key]?.entries[id]))
  const [text, setText] = useState<string | null>(null)
  const rate = rateOf(currency) ?? 1
  const shown = fmt(eur * count, precise)
  // (A day's own cost goes back to what its items add up to.)
  const back = what === 'day' ? 'the sum of the items' : 'our price'
  if (SHARED_TOKEN) return <span className={`tabular-nums ${className}`}>{shown}</span>

  const save = () => {
    if (text === null) return
    setText(null)
    const amount = Number(text.replace(/\s/g, '').replace(',', '.'))
    // Nothing typed, not a number, or the same as before: no change.
    if (!text.trim() || !Number.isFinite(amount) || amount < 0 || text === typed(eur * rate)) return
    useItems.getState().put({ id, kind: 'price', at: cityId, amount: Math.round(amount * 100) / 100, currency })
  }

  if (text !== null) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); save() }} className="inline-flex items-baseline gap-1">
        <input
          autoFocus value={text} inputMode="decimal" aria-label={`${label}: the price you saw, in ${currency}`}
          onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Escape' && setText(null)}
          onFocus={(e) => e.target.select()}
          className="w-20 rounded-md border border-accent bg-panel px-1.5 py-0.5 text-right text-[13px] tabular-nums outline-none max-md:!text-[16px]"
        />
        <span className="text-[12px] text-muted">{currency}{count !== 1 && ` ${per}`}</span>
      </form>
    )
  }
  return (
    <span className="inline-flex items-baseline gap-1">
      {seen && (
        <button
          onClick={() => useItems.getState().remove(id)} aria-label={`${label}: back to ${back}`} title={`Back to ${back}, ${fmt(ours * count, precise)}`}
          className="self-center text-accent hover:opacity-70"
        >
          <RotateCcw size={12} />
        </button>
      )}
      <button
        onClick={() => setText(typed(eur * rate))}
        title={seen ? 'The price you saw: click to change it' : 'Click to put in the price you saw or paid'}
        aria-label={`${label}: ${shown}${seen ? ', the price you saw' : ''}. Change it`}
        className={`tabular-nums underline decoration-dotted decoration-1 underline-offset-[3px] hover:decoration-solid ${seen ? 'text-accent decoration-accent' : 'decoration-muted/50'} ${className}`}
      >
        {shown}
      </button>
    </span>
  )
}
