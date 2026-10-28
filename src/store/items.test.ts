import { describe, expect, it, vi } from 'vitest'
import { isEmptyItem, itemsNow, mergeItems, NO_PLACE, notesAsItems, parseItems, phraseId, phrasesOf, priceId, publicItems, seenPrices, webUrl, withoutPhrases, type TripItem } from './itemsCore'

vi.hoisted(() => {
  const mem = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  }
})
const { useItems } = await import('./items')

const stay = (id: string, title: string, updatedAt: number): TripItem => ({ id, kind: 'stay', at: 'krakow', title, updatedAt })

describe('items', () => {
  it('merges item by item: the latest edit of each wins, a removal too', () => {
    const laptop = { a: stay('a', 'Hostel A', 10), b: stay('b', 'Hotel B', 10) }
    const merged = mergeItems(laptop, [{ ...stay('b', '', 20), deleted: true }, stay('c', 'Flat C', 5), stay('a', 'older', 1)])
    expect(merged.a.title).toBe('Hostel A')
    expect(merged.b.deleted).toBe(true)
    expect(merged.c.title).toBe('Flat C')
  })

  it('checks what a device sends: web links only, dates as days, long text cut', () => {
    const ok = parseItems({ entries: [{ id: 'stay:1', kind: 'stay', at: 'krakow', title: 't'.repeat(300), url: 'booking.com/x', from: '2027-05-01', to: '', extra: 1, updatedAt: 99 }] }, 50)
    expect(ok).toEqual([{ id: 'stay:1', kind: 'stay', at: 'krakow', title: 't'.repeat(200), url: 'https://booking.com/x', from: '2027-05-01', updatedAt: 50 }])
    expect(parseItems({ entries: [{ id: 'link:1', kind: 'link', at: 'krakow', url: 'javascript:alert(1)', updatedAt: 1 }] })).toBeTypeOf('string')
    expect(parseItems({ entries: [{ id: 'x', kind: 'ticket', at: 'krakow', updatedAt: 1 }] })).toBeTypeOf('string')
    // A ticket: a journey's, its times with the time of day; only a ticket's.
    const ticket = { id: 'ticket:1', kind: 'ticket', at: 'krakow>tirana', title: 'LO 335', mode: 'flight', from: '2027-05-04T07:35', to: '2027-05-04', fromPlace: 'KRK', updatedAt: 1 }
    expect(parseItems({ entries: [ticket] })).toEqual([ticket])
    expect(parseItems({ entries: [{ ...ticket, mode: 'rocket' }] })).toBeTypeOf('string')
    expect(parseItems({ entries: [{ ...ticket, from: '2027-05-04T25:00' }] })).toBeTypeOf('string')
    expect(parseItems({ entries: [{ ...ticket, kind: 'stay', at: 'krakow' }] })).toBeTypeOf('string')
    expect(isEmptyItem({ id: 'x', kind: 'ticket', at: 'a>b', fromPlace: 'KRK', updatedAt: 1 })).toBe(false)
    // Its seat, car, gate and boarding time (a time of day).
    const boarding = { ...ticket, seat: '20D', car: '2', gate: 'A7', boards: '17:35' }
    expect(parseItems({ entries: [boarding] })).toEqual([boarding])
    expect(parseItems({ entries: [{ ...ticket, boards: '5:35pm' }] })).toBeTypeOf('string')
    expect(isEmptyItem({ id: 'x', kind: 'ticket', at: 'a>b', seat: '20D', updatedAt: 1 })).toBe(false)
    // An expense: a city's, its amount and money once typed (checked), its day.
    const expense = { id: 'expense:1', kind: 'expense', at: 'krakow', title: 'Dinner', amount: 120.5, currency: 'PLN', from: '2027-05-04', updatedAt: 1 }
    expect(parseItems({ entries: [expense] })).toEqual([expense])
    expect(parseItems({ entries: [{ id: 'expense:2', kind: 'expense', at: 'krakow', title: 'Dinner', updatedAt: 1 }] })).toEqual([{ id: 'expense:2', kind: 'expense', at: 'krakow', title: 'Dinner', updatedAt: 1 }])
    expect(parseItems({ entries: [{ ...expense, amount: -1 }] })).toBeTypeOf('string')
    expect(parseItems({ entries: [{ ...expense, currency: 'zł' }] })).toBeTypeOf('string')
    expect(parseItems({ entries: [{ ...expense, at: 'krakow>tirana' }] })).toBeTypeOf('string')
    expect(parseItems({ entries: [{ ...expense, from: '2027-05-04T19:00' }] })).toBeTypeOf('string')
    expect(isEmptyItem({ id: 'x', kind: 'expense', at: 'krakow', amount: 0, updatedAt: 1 })).toBe(false)
    expect(isEmptyItem({ id: 'x', kind: 'expense', at: 'krakow', currency: 'PLN', updatedAt: 1 })).toBe(true)
    // A ticket, stay or expense may be at no city or journey; an expense may be for a stay or ticket.
    // (A package: one expense for several.)
    const linked = { ...expense, at: NO_PLACE, bookings: ['ticket:123', 'ticket:124', 'stay:9', 'ticket:123'] }
    expect(parseItems({ entries: [{ ...ticket, at: NO_PLACE }, linked] })).toEqual([{ ...ticket, at: NO_PLACE }, { ...linked, bookings: ['ticket:123', 'ticket:124', 'stay:9'] }])
    expect(parseItems({ entries: [{ id: 'note:x', kind: 'note', at: NO_PLACE, text: 'x', updatedAt: 1 }] })).toBeTypeOf('string')
    expect(parseItems({ entries: [{ ...expense, bookings: ['note:krakow'] }] })).toBeTypeOf('string')
    expect(parseItems({ entries: [{ ...expense, bookings: 'ticket:123' }] })).toBeTypeOf('string')
    // Public: only for the kinds the shared link can show; it shows only their safe fields.
    expect(parseItems({ entries: [{ ...ticket, public: true }, { ...expense, public: true }, { id: 'price:krakow:coffee', kind: 'price', at: 'krakow', amount: 9, currency: 'PLN', public: true, updatedAt: 1 }] }))
      .toEqual([{ ...ticket, public: true }, { ...expense, public: true }, { id: 'price:krakow:coffee', kind: 'price', at: 'krakow', amount: 9, currency: 'PLN', updatedAt: 1 }])
    const stay = { id: 'stay:1', kind: 'stay', at: 'krakow', title: 'Hostel', address: 'Floriańska 1', ref: 'X1', price: '€40', url: 'https://example.com/b', text: 'Door 1234', from: '2027-05-01', to: '2027-05-03', ai: true, updatedAt: 1 } as TripItem
    const link = { id: 'link:1', kind: 'link', at: 'krakow', title: 'Tour', url: 'https://example.com/t', updatedAt: 1 } as TripItem
    const paid = { ...(expense as TripItem), text: 'Split with Ana', bookings: ['stay:1'], public: true as const }
    expect(publicItems({ 'stay:1': { ...stay, public: true }, 'stay:2': { ...stay, id: 'stay:2' }, 'link:1': { ...link, public: true }, 'ticket:9': { ...(ticket as TripItem), id: 'ticket:9', ref: 'PNR', price: '€9', public: true }, 'expense:1': paid })).toEqual({
      'stay:1': { id: 'stay:1', kind: 'stay', at: 'krakow', title: 'Hostel', from: '2027-05-01', to: '2027-05-03', updatedAt: 1, public: true },
      'link:1': { ...link, public: true },
      'ticket:9': { id: 'ticket:9', kind: 'ticket', at: 'krakow>tirana', title: 'LO 335', mode: 'flight', from: '2027-05-04T07:35', to: '2027-05-04', fromPlace: 'KRK', updatedAt: 1, public: true },
      'expense:1': { id: 'expense:1', kind: 'expense', at: 'krakow', title: 'Dinner', amount: 120.5, currency: 'PLN', from: '2027-05-04', bookings: ['stay:1'], updatedAt: 1, public: true },
    })
    // Filled in by AI: kept as true, nothing else.
    expect(parseItems({ entries: [{ ...expense, ai: true }, { ...expense, id: 'expense:3', ai: 'yes' }] })).toEqual([{ ...expense, ai: true }, { ...expense, id: 'expense:3' }])
    expect(parseItems({ entries: [{ id: 'x', kind: 'note', at: 'a>b>c', updatedAt: 1 }] })).toBeTypeOf('string')
    expect(parseItems({ entries: [{ id: 'x', kind: 'stay', at: 'krakow', from: 'May 1', updatedAt: 1 }] })).toBeTypeOf('string')
    // A removal keeps nothing but where it was.
    expect(parseItems({ entries: [{ id: 'x', kind: 'stay', at: 'krakow', title: 'gone', deleted: true, updatedAt: 1 }] })).toEqual([{ id: 'x', kind: 'stay', at: 'krakow', deleted: true, updatedAt: 1 }])
    expect(webUrl('photos.app.goo.gl/abc')).toBe('https://photos.app.goo.gl/abc')
    expect(webUrl('mailto:a@b.c')).toBe('')
  })

  it('keeps prices seen in a city, in the money they were seen in, and gives them in EUR', () => {
    const price = (at: string, amount: unknown, currency: unknown) => ({ id: `price:${at}:mealLocal`, kind: 'price', at, amount, currency, updatedAt: 1 })
    expect(parseItems({ entries: [price('skopje', 400, 'MKD')] })).toEqual([{ id: 'price:skopje:mealLocal', kind: 'price', at: 'skopje', amount: 400, currency: 'MKD', updatedAt: 1 }])
    for (const bad of [price('skopje', -1, 'MKD'), price('skopje', '400', 'MKD'), price('skopje', 400, 'mkd'), price('skopje>ohrid', 400, 'MKD')]) {
      expect(parseItems({ entries: [bad] })).toBeTypeOf('string')
    }
    const items = {
      [priceId('skopje', 'mealLocal')]: { id: priceId('skopje', 'mealLocal'), kind: 'price' as const, at: 'skopje', amount: 400, currency: 'MKD', updatedAt: 1 },
      [priceId('skopje', 'day')]: { id: priceId('skopje', 'day'), kind: 'price' as const, at: 'skopje', deleted: true as const, updatedAt: 2 },
      [priceId('paris', 'coffee')]: { id: priceId('paris', 'coffee'), kind: 'price' as const, at: 'paris', amount: 3.5, currency: 'EUR', updatedAt: 1 },
      [priceId('paris', 'beerBar')]: { id: priceId('paris', 'beerBar'), kind: 'price' as const, at: 'paris', amount: 9, currency: 'XXX', updatedAt: 1 },
      'stay:1': stay('stay:1', 'Hostel', 1),
    }
    expect(seenPrices(items, { MKD: 61.5 })).toEqual({ skopje: { mealLocal: 400 / 61.5 }, paris: { coffee: 3.5 } })
  })

  it('keeps phrases by language, one per English meaning', () => {
    expect(phraseId('zh-TW', "Where's the toilet?")).toBe('phrase:zh-TW:where-s-the-toilet')
    const phrase = { id: phraseId('mk', 'Hi'), kind: 'phrase', at: 'mk', title: 'Hi', text: 'Здраво', say: 'ZDRAH-vo', tip: 'informal', updatedAt: 1 }
    expect(parseItems({ entries: [phrase] })).toEqual([phrase])
    expect(parseItems({ entries: [{ ...phrase, at: 'skopje>ohrid' }] })).toBeTypeOf('string')
    expect(isEmptyItem({ ...phrase, kind: 'phrase', text: ' ' })).toBe(true)
  })

  it("moves the notes kept with a trip's data into items, never over one written or removed since", () => {
    const items = { 'note:vienna': { id: 'note:vienna', kind: 'note' as const, at: 'vienna', deleted: true as const, updatedAt: 5 } }
    const moved = notesAsItems({ cities: { krakow: 'Hostel on Floriańska', vienna: 'Ana', empty: ' ' }, legs: { 'krakow>warsaw': 'EIP 06:40' } }, items, 9)
    expect(moved).toEqual([
      { id: 'note:krakow', kind: 'note', at: 'krakow', text: 'Hostel on Floriańska', updatedAt: 9 },
      { id: 'note:krakow>warsaw', kind: 'note', at: 'krakow>warsaw', text: 'EIP 06:40', updatedAt: 9 },
    ])
  })

  it('adds, changes and removes on this device, each to send', () => {
    const s = useItems.getState()
    s.open('t1', {})
    s.put({ id: 'stay:1', kind: 'stay', at: 'krakow', title: 'Hostel', from: '2027-05-01' })
    s.put({ id: 'stay:1', address: 'Floriańska 1', from: '' })
    let book = useItems.getState().books.t1
    expect(book.entries['stay:1']).toMatchObject({ kind: 'stay', at: 'krakow', title: 'Hostel', address: 'Floriańska 1' })
    expect(book.entries['stay:1']).not.toHaveProperty('from')
    // (No kind or place: nothing to add.)
    s.put({ id: 'link:9', title: 'x' })
    s.remove('stay:1')
    s.takeNotes({ cities: { krakow: 'note' } })
    book = useItems.getState().books.t1
    expect(book.entries['stay:1']).toMatchObject({ deleted: true })
    expect(book.entries['stay:1']).not.toHaveProperty('title')
    expect(book.pending).toEqual(['stay:1', 'note:krakow'])
  })

  it("gathers the phrases trips kept before they were the account's, and leaves them out of the trips' items", () => {
    const phrase = (tag: string, text: string, updatedAt: number): TripItem => ({ id: phraseId(tag, 'Thanks'), kind: 'phrase', at: tag, title: 'Thanks', text, updatedAt })
    const stay: TripItem = { id: 'stay:1', kind: 'stay', at: 'krakow', title: 'Hostel', updatedAt: 1 }
    const one = { [stay.id]: stay, 'phrase:pl:thanks': phrase('pl', 'Dzięki', 1) }
    const two = { 'phrase:pl:thanks': phrase('pl', 'Dziękuję', 2), 'phrase:mk:thanks': phrase('mk', 'Благодарам', 1) }
    const all = phrasesOf([one, two])
    expect(Object.keys(all).sort()).toEqual(['phrase:mk:thanks', 'phrase:pl:thanks'])
    // The latest edit of the same phrase.
    expect(all['phrase:pl:thanks'].text).toBe('Dziękuję')
    expect(withoutPhrases(one)).toEqual({ [stay.id]: stay })
  })

  it('reads receipts kept or sent before as the expenses they are now, their ids kept', async () => {
    const old = { id: 'receipt:1', kind: 'receipt', at: 'krakow', title: 'Dinner', amount: 30, currency: 'PLN', updatedAt: 1 }
    const now = { ...old, kind: 'expense' }
    // From a device, and as kept (on the server, in its undo history: a removed one is null there).
    expect(parseItems({ entries: [old, { ...old, id: 'receipt:2', deleted: true }] })).toEqual([now, { id: 'receipt:2', kind: 'expense', at: 'krakow', updatedAt: 1, deleted: true }])
    expect(itemsNow({ 'receipt:1': old as never, 'stay:1': null })).toEqual({ 'receipt:1': now, 'stay:1': null })
    const same = { 'expense:1': now as TripItem }
    expect(itemsNow(same)).toBe(same)
    // In this browser, those not yet sent too.
    localStorage.setItem('rtw-map-items', JSON.stringify({ state: { books: { local: { entries: { 'receipt:1': old }, pending: ['receipt:1'] } }, key: 'local' }, version: 1 }))
    await useItems.persist.rehydrate()
    expect(useItems.getState().books.local).toEqual({ entries: { 'receipt:1': now }, pending: ['receipt:1'] })
  })
})
