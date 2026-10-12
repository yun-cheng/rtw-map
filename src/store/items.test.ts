import { describe, expect, it, vi } from 'vitest'
import { mergeItems, notesAsItems, parseItems, webUrl, type TripItem } from './itemsCore'

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
    expect(parseItems({ entries: [{ id: 'x', kind: 'note', at: 'a>b>c', updatedAt: 1 }] })).toBeTypeOf('string')
    expect(parseItems({ entries: [{ id: 'x', kind: 'stay', at: 'krakow', from: 'May 1', updatedAt: 1 }] })).toBeTypeOf('string')
    // A removal keeps nothing but where it was.
    expect(parseItems({ entries: [{ id: 'x', kind: 'stay', at: 'krakow', title: 'gone', deleted: true, updatedAt: 1 }] })).toEqual([{ id: 'x', kind: 'stay', at: 'krakow', deleted: true, updatedAt: 1 }])
    expect(webUrl('photos.app.goo.gl/abc')).toBe('https://photos.app.goo.gl/abc')
    expect(webUrl('mailto:a@b.c')).toBe('')
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
})
