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
    await useChat.getState().send('lock it', [], { rounds: 24 })
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

  it('allows more tool rounds when asked (Plan with AI)', async () => {
    const fetch = serve(...Array(30).fill(toolCall), reply('Finished'))
    await useChat.getState().send('plan', [], { rounds: 40 })
    expect(fetch).toHaveBeenCalledTimes(31)
    expect(lastReply().text).toBe('Finished')
    // A chat message gets 12 calls; with "Think harder" on, as many as Plan with AI.
    serve(...Array(30).fill(toolCall))
    await useChat.getState().send('chat')
    expect(lastReply().text).toMatch(/ran out of steps while looking things up/)
    useChat.getState().setThink(true)
    serve(...Array(30).fill(toolCall), reply('Thought it through'))
    await useChat.getState().send('chat')
    expect(lastReply().text).toBe('Thought it through')
  })

  it('tells the model the steps left and makes the last call without tools', async () => {
    const fetch = serve(...Array(4).fill(toolCall), reply('Changed what I could; the rest needs another message.'))
    await useChat.getState().send('plan', [], { rounds: 5 })
    const bodies = (fetch.mock.calls as unknown as [string, RequestInit][]).map(([, init]) => JSON.parse(String(init.body)))
    expect(bodies.map((b) => b.final ?? false)).toEqual([false, false, false, false, true])
    // The latest tool result in each request (older ones are shortened).
    type Response = { steps_left?: number; note?: string }
    const latest = bodies.slice(1).map((b) => b.contents.at(-1).parts.at(-1).functionResponse.response as Response)
    expect(latest.map((r) => r.steps_left)).toEqual([3, 2, 1, 0])
    expect(latest[0].note).toMatch(/3 steps left/)
    expect(latest[3].note).toMatch(/answer now/)
    expect(lastReply().text).toMatch(/Changed what I could/)
    // A tool call in the final answer isn't kept unanswered in the conversation.
    serve(...Array(5).fill(toolCall))
    await useChat.getState().send('again', [], { rounds: 5 })
    const contents = useChat.getState().contents
    expect(contents.at(-1)!.parts.some((p) => p.functionCall)).toBe(false)
  })

  it('turns a last "Choices:" line into buttons', () => {
    expect(splitChoices('Swap Kotor for Budva?\n\nChoices: [Yes, swap them] [Keep Kotor]')).toEqual({ text: 'Swap Kotor for Budva?', choices: ['Yes, swap them', 'Keep Kotor'] })
    expect(splitChoices('Choices: [a] [b]\nmore text')).toEqual({ text: 'Choices: [a] [b]\nmore text', choices: [] })
    expect(splitChoices('No choices here [really]').choices).toEqual([])
    expect(splitChoices('Pick\nChoices: [1] [2] [3] [4] [5]').choices).toHaveLength(4)
  })

  it('offers the model\'s choices, Continue when out of steps, and Try again after a failure', async () => {
    serve(reply('Make Sarajevo longer?\nChoices: [Yes] [No]'))
    await useChat.getState().send('hi')
    expect(lastReply()).toMatchObject({ text: 'Make Sarajevo longer?', choices: ['Yes', 'No'] })

    serve(...Array(12).fill(toolCall))
    await useChat.getState().send('chat')
    expect(lastReply().choices).toEqual(['Continue'])

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
