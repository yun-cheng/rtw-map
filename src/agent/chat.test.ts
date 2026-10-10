import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { testCaseInput } from '../data/testCase'
import { useTrip } from '../store/trip'
import { createTripStore } from '../store/tripCore'
import { splitChoices, useChat } from './chat'
import { runAssistant, type Content } from './engine'
import { setupChanges } from './tools'

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

  it('plans afresh with Plan with AI: a new draft, none of the conversation so far, and Undo back to the trip before', async () => {
    useChat.setState({ contents: [{ role: 'user', parts: [{ text: 'earlier' }] }, { role: 'model', parts: [{ text: 'reply' }] }] as never })
    const fetch = serve(reply('Planned'))
    await useChat.getState().send('Plan my trip from scratch.', [], { think: true, plan: 'new' })
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Plan my trip from scratch.' }] }])
    expect(body.context).toMatch(/stops/i)
    expect(useTrip.getState().stops.length).toBeGreaterThan(0)
    // Undo takes the trip back to before the plan, not to the planner's draft.
    useChat.getState().undo(useChat.getState().messages.length - 1)
    expect(useTrip.getState().stops).toEqual([])
  })

  it('tries a failed plan again as a plan from scratch', async () => {
    useChat.setState({ contents: [{ role: 'user', parts: [{ text: 'earlier' }] }, { role: 'model', parts: [{ text: 'reply' }] }] as never })
    serve({ status: 502, body: { error: 'The assistant failed to answer: try again.' } })
    await useChat.getState().send('Plan my trip from scratch.', [], { plan: 'new' })
    const fetch = serve(reply('Planned'))
    await useChat.getState().retry(useChat.getState().messages.length - 1)
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.contents).toHaveLength(1)
    expect(useTrip.getState().input.planned).toBeTruthy()
  })

  it('updates the plan for what changed in the setup, keeping its stops, and notes the plan fits the setup again', async () => {
    useTrip.getState().generate()
    const stops = useTrip.getState().stops
    const setup = () => useTrip.getState().input
    expect(setupChanges(setup().planned!, setup())).toEqual([])
    useTrip.getState().setInput({ pace: 'fast' })
    expect(setupChanges(setup().planned!, setup())).toEqual(['Pace: balanced → fast'])
    useChat.setState({ contents: [{ role: 'user', parts: [{ text: 'earlier' }] }, { role: 'model', parts: [{ text: 'reply' }] }] as never })
    const fetch = serve(reply('Updated'))
    await useChat.getState().send('Update my plan: Pace: balanced → fast', [], { think: true, plan: 'update' })
    // No new draft, and the model starts afresh.
    expect(useTrip.getState().stops).toEqual(stops)
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)).contents).toHaveLength(1)
    expect(setupChanges(setup().planned!, setup())).toEqual([])
  })

  it('keeps showing what changed when an update is stopped', async () => {
    useTrip.getState().generate()
    useTrip.getState().setInput({ pace: 'fast' })
    vi.stubGlobal('fetch', vi.fn(async () => {
      useChat.getState().stop()
      return new Response(JSON.stringify(toolCall.body), { status: 200 })
    }))
    await useChat.getState().send('Update my plan', [], { plan: 'update' })
    expect(setupChanges(useTrip.getState().input.planned!, useTrip.getState().input)).toEqual(['Pace: balanced → fast'])
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

describe('the assistant loop on a trip of its own (as on the server)', () => {
  it('plans and changes that trip, not the one on screen', async () => {
    const trip = createTripStore({ input: testCaseInput(ds, 'US'), stops: [] })
    const shown = useTrip.getState().stops
    // The model gives the first stop of the planner's draft 9 nights, then answers.
    const answers: (() => Content)[] = [
      () => ({ role: 'model', parts: [{ functionCall: { name: 'set_nights', args: { city: trip.getState().stops[0].cityId, nights: 9 } } }] }),
      () => ({ role: 'model', parts: [{ text: 'Planned, with 9 nights at the start.' }] }),
    ]
    const { reply, contents } = await runAssistant({
      trip, view: [], history: [], note: null, text: 'Plan my trip from scratch.', think: false, plan: 'new', startedAt: Date.now() - 5000,
      callModel: async (_c, _x, _t, _s, onSpent) => {
        onSpent({ input: 1000, output: 100, usd: 0.001 })
        return answers.shift()!()
      },
      signal: new AbortController().signal,
    })
    expect(reply).toMatchObject({ text: 'Planned, with 9 nights at the start.', plan: 'new', spent: { calls: 2, input: 2000, output: 200 } })
    expect(reply.changes).toContain(`New itinerary: ${trip.getState().stops.length} stops`)
    // Its time counts from when the run was started (on the server, before the runner picked it up).
    expect(reply.ms).toBeGreaterThanOrEqual(5000)
    expect(trip.getState().stops[0].nights).toBe(9)
    expect(trip.getState().input.planned).toBeTruthy()
    expect(contents).toHaveLength(4)
    expect(useTrip.getState().stops).toBe(shown)
  })
})
