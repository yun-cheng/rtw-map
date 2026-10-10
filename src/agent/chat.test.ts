import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { testCaseInput } from '../data/testCase'
import { useTrip } from '../store/trip'
import { splitChoices, useChat } from './chat'

const reply = (text: string) => ({ status: 200, body: { content: { role: 'model', parts: [{ text }] } } })
const toolCall = { status: 200, body: { content: { role: 'model', parts: [{ functionCall: { name: 'get_options', args: {} } }] } } }
const busy = { status: 429, body: { error: 'Too many requests: wait a minute and try again.' } }
const outForToday = { status: 429, body: { error: "You have used all of today's assistant messages.", usage: { used: 20, limit: 20, remaining: 0, resetsAt: '' } } }

/** Answers /api/chat with the given responses in turn. */
function serve(...responses: { status: number; body: unknown }[]) {
  const fetch = vi.fn(async () => {
    const r = responses.shift() ?? reply('Done')
    return new Response(JSON.stringify(r.body), { status: r.status })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

beforeEach(() => {
  vi.useFakeTimers()
  useTrip.setState({ input: testCaseInput(ds, 'US'), stops: [], plan: null })
  useChat.getState().clear()
  useChat.getState().setThink(false)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const lastReply = () => useChat.getState().messages.at(-1) as { text: string; error?: string; choices?: string[] }

describe('assistant chat', () => {
  it('waits and tries again when the per-minute limit is hit', async () => {
    const fetch = serve(busy, reply('All set'))
    const sent = useChat.getState().send('hello')
    await vi.runAllTimersAsync()
    await sent
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(lastReply().text).toBe('All set')
  })

  it("stops at once when today's limit is used up", async () => {
    const fetch = serve(outForToday)
    await useChat.getState().send('hello')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(lastReply().error).toMatch(/today/)
  })

  it('keeps long conversations and long runs of changes within the request limits', async () => {
    // A long earlier conversation, and a reply that makes many changes in a row.
    const filler = 'x'.repeat(6_000)
    useChat.setState({
      contents: Array.from({ length: 70 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', parts: [{ text: `${i} ${filler}` }] })) as never,
    })
    useTrip.getState().generate()
    const change = { status: 200, body: { content: { role: 'model', parts: [{ functionCall: { name: 'set_locked', args: { city: useTrip.getState().stops[0].cityId, locked: true } } }] } } }
    const fetch = serve(...Array(20).fill(change), reply('Done'))
    await useChat.getState().send('lock it')
    for (const [, init] of fetch.mock.calls as unknown as [string, RequestInit][]) {
      const body = String(init.body)
      expect(body.length).toBeLessThan(200_000)
      expect(JSON.parse(body).contents.length).toBeLessThanOrEqual(80)
    }
    expect(lastReply().text).toBe('Done')
    // Only the latest change result still carries the whole trip.
    const lastBody = JSON.parse(String((fetch.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body))
    const withTrip = lastBody.contents.filter((c: { parts: { functionResponse?: { response?: { trip?: string } } }[] }) => c.parts.some((p) => p.functionResponse?.response?.trip))
    expect(withTrip).toHaveLength(1)
  })

  it('keeps going until the model answers, with no limit on the steps', async () => {
    const fetch = serve(...Array(150).fill(toolCall), reply('Finished'))
    await useChat.getState().send('plan')
    expect(fetch).toHaveBeenCalledTimes(151)
    expect(lastReply().text).toBe('Finished')
    // A run that long drops its oldest steps to stay within the request limits, and says so.
    const bodies = (fetch.mock.calls as unknown as [string, RequestInit][]).map(([, init]) => String(init.body))
    expect(Math.max(...bodies.map((b) => b.length))).toBeLessThan(200_000)
    expect(Math.max(...bodies.map((b) => JSON.parse(b).contents.length))).toBeLessThanOrEqual(80)
    const last = JSON.parse(bodies.at(-1)!).contents
    expect(last[0].parts.map((p: { text?: string }) => p.text).join()).toMatch(/plan.*left out to save space/s)
    expect(last.at(-1).parts[0].functionResponse).toBeTruthy()
  })

  it('stops when asked, keeping the changes made so far', async () => {
    useTrip.getState().generate()
    const city = useTrip.getState().stops[0].cityId
    const change = { status: 200, body: { content: { role: 'model', parts: [{ functionCall: { name: 'set_locked', args: { city, locked: true } } }] } } }
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      // The user presses Stop while the second call is under way.
      if (++calls === 2) useChat.getState().stop()
      return new Response(JSON.stringify(calls === 1 ? change.body : toolCall.body), { status: 200 })
    }))
    await useChat.getState().send('lock it')
    expect(calls).toBe(2)
    expect(lastReply()).toMatchObject({ text: 'Stopped. The changes so far are kept.', choices: ['Continue'] })
    expect(useTrip.getState().stops[0].locked).toBe(true)
    // The conversation ends with the model's turn, so the next message can follow.
    expect(useChat.getState().contents.at(-1)!.role).toBe('model')
    expect(useChat.getState().busy).toBe(false)
  })

  it("adds up the tokens and cost of a reply's calls, failed attempts included", async () => {
    const spent = { input: 1000, cached: 200, output: 50, usd: 0.001 }
    serve({ ...busy, body: { ...busy.body, spent } }, { ...toolCall, body: { ...toolCall.body, spent } }, { ...reply('Done'), body: { ...reply('Done').body, spent } })
    const sent = useChat.getState().send('hello')
    await vi.runAllTimersAsync()
    await sent
    expect((useChat.getState().messages.at(-1) as { spent?: unknown }).spent).toEqual({ calls: 3, input: 3000, cached: 600, output: 150, usd: 0.003 })
  })

  it('turns a last "Choices:" line into buttons', () => {
    expect(splitChoices('Swap Kotor for Budva?\n\nChoices: [Yes, swap them] [Keep Kotor]')).toEqual({ text: 'Swap Kotor for Budva?', choices: ['Yes, swap them', 'Keep Kotor'] })
    expect(splitChoices('Choices: [a] [b]\nmore text')).toEqual({ text: 'Choices: [a] [b]\nmore text', choices: [] })
    expect(splitChoices('No choices here [really]').choices).toEqual([])
    expect(splitChoices('Pick\nChoices: [1] [2] [3] [4] [5]').choices).toHaveLength(4)
  })

  it('offers the model\'s choices, and Try again after a failure', async () => {
    serve(reply('Make Sarajevo longer?\nChoices: [Yes] [No]'))
    await useChat.getState().send('hi')
    expect(lastReply()).toMatchObject({ text: 'Make Sarajevo longer?', choices: ['Yes', 'No'] })

    serve({ status: 502, body: { error: 'The assistant failed to answer: try again.' } }, reply('Here you go'))
    await useChat.getState().send('question')
    expect(lastReply().error).toBeTruthy()
    const before = useChat.getState().messages.length
    await useChat.getState().retry(before - 1)
    const messages = useChat.getState().messages
    // The failed attempt is replaced, not repeated.
    expect(messages).toHaveLength(before)
    expect(messages.at(-2)).toMatchObject({ role: 'user', text: 'question' })
    expect(lastReply().text).toBe('Here you go')
  })
})
