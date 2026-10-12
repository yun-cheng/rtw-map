import { describe, expect, it, vi } from 'vitest'
import { mergeJournal, parseEntries, type DayEntry } from './journalCore'

vi.hoisted(() => {
  const mem = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  }
})
const { useJournal } = await import('./journal')

const day = (date: string, text: string, updatedAt: number): DayEntry => ({ date, highlight: '', text, updatedAt })

describe('journal', () => {
  it('merges day by day: the latest edit of each day wins', () => {
    const laptop = { '2027-05-01': day('2027-05-01', 'laptop', 10), '2027-05-02': day('2027-05-02', 'old', 10) }
    const merged = mergeJournal(laptop, [day('2027-05-02', 'phone', 20), day('2027-05-03', 'new', 5), day('2027-05-01', 'older', 1)])
    expect(Object.values(merged).map((e) => e.text)).toEqual(['laptop', 'phone', 'new'])
  })

  it('checks what a device sends, and cuts what is too long', () => {
    const ok = parseEntries({ entries: [{ date: '2027-05-01', highlight: 'h'.repeat(500), text: 'a day', rating: 4, updatedAt: 99, extra: 1 }] }, 50)
    expect(ok).toEqual([{ date: '2027-05-01', highlight: 'h'.repeat(140), text: 'a day', rating: 4, updatedAt: 50 }])
    expect(parseEntries({ entries: [{ date: 'May 1', highlight: '', text: '', updatedAt: 1 }] })).toBeTypeOf('string')
    expect(parseEntries({ entries: [{ date: '2027-05-01', highlight: '', text: '', rating: 9, updatedAt: 1 }] })).toBeTypeOf('string')
    expect(parseEntries({})).toBeTypeOf('string')
  })

  it('keeps days changed on this device until the server has them, and a day changed while sending', () => {
    const j = useJournal.getState()
    j.open('t1', {})
    j.write('2027-05-01', { text: 'first' })
    const sending = Object.values(useJournal.getState().books.t1.entries)
    // Written again before the server answered.
    vi.setSystemTime(Date.now() + 1000)
    j.write('2027-05-01', { text: 'first, longer' })
    j.sent('t1', sending, { ...Object.fromEntries(sending.map((e) => [e.date, e])), '2027-05-02': day('2027-05-02', 'laptop', 1) })
    const book = useJournal.getState().books.t1
    expect(book.pending).toEqual(['2027-05-01'])
    expect(book.entries['2027-05-01'].text).toBe('first, longer')
    expect(book.entries['2027-05-02'].text).toBe('laptop')
    vi.useRealTimers()
  })

  it("opens a trip with the server's journal, keeping days not sent yet", () => {
    useJournal.getState().clear()
    useJournal.getState().open('t2', {})
    useJournal.getState().write('2027-05-03', { highlight: 'the lake' })
    useJournal.getState().open('t2', { '2027-05-03': day('2027-05-03', 'stale', 1), '2027-05-04': day('2027-05-04', 'laptop', 1) })
    const { entries } = useJournal.getState().books.t2
    expect(entries['2027-05-03'].highlight).toBe('the lake')
    expect(entries['2027-05-04'].text).toBe('laptop')
  })

  it("moves the browser's own journal to the trip it becomes in the account", () => {
    useJournal.getState().clear()
    useJournal.getState().write('2027-05-01', { text: 'signed out' })
    useJournal.getState().adopt('t3')
    const s = useJournal.getState()
    expect(s.key).toBe('t3')
    expect(s.books.local).toBeUndefined()
    expect(s.books.t3.pending).toEqual(['2027-05-01'])
  })
})
