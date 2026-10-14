import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataset as ds } from '../data/dataset'
import { draftStops, testCaseInput } from '../data/testCase'
import { useItems } from '../store/items'
import { useTrip } from '../store/trip'
import { createTripStore } from '../store/tripCore'
import { setAside, splitChoices, useChat, type ChatMessage } from './chat'
import { runAssistant, type Content } from './engine'
import { planChanges } from './tools'

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

  it("puts a card's question and the app's answer in the chat, which the model then sees", async () => {
    useChat.getState().preset('How do I update where I stay in Kraków with AI?', 'Send me your booking.')
    expect(useChat.getState().messages).toEqual([
      { role: 'user', text: 'How do I update where I stay in Kraków with AI?', at: expect.any(Number) },
      { role: 'assistant', text: 'Send me your booking.', steps: [], changes: [] },
    ])
    const fetch = serve(reply('Saved it.'))
    await useChat.getState().send('Hostel Mleczarnia, 4 to 7 May')
    const sent = JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body).contents as Content[]
    expect(sent.map((c) => c.role)).toEqual(['user', 'model', 'user'])
    expect(sent[1].parts[0].text).toBe('Send me your booking.')
    useChat.getState().preset('Phrases?', 'Tell me.', ["I'm vegetarian"])
    expect(useChat.getState().messages.at(-1)).toMatchObject({ role: 'assistant', choices: ["I'm vegetarian"] })
    // Not while it's answering.
    useChat.setState({ busy: true })
    useChat.getState().preset('Another?', 'No.')
    expect(useChat.getState().messages).toHaveLength(6)
    useChat.setState({ busy: false })
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
    useTrip.getState().setStops(draftStops(ds, useTrip.getState().input))
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
    useTrip.getState().setStops(draftStops(ds, useTrip.getState().input))
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

  it('plans afresh with Plan with AI: the assistant\'s own itinerary, none of the conversation so far, and Undo back to the trip before', async () => {
    useChat.setState({ contents: [{ role: 'user', parts: [{ text: 'earlier' }] }, { role: 'model', parts: [{ text: 'reply' }] }] as never })
    const itinerary = { status: 200, body: { content: { role: 'model', parts: [{ functionCall: { name: 'set_itinerary', args: { stops: [{ city: 'Kraków', nights: 60 }, { city: 'Warsaw', nights: 92 }] } } }] } } }
    const fetch = serve(itinerary, reply('Planned'))
    await useChat.getState().send('Plan my trip from scratch.', [], { think: true, plan: 'new' })
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Plan my trip from scratch.' }] }])
    // No draft from the old planner: the plan is the assistant's.
    expect(useTrip.getState().stops.map((s) => [s.cityId, s.nights])).toEqual([['krakow', 60], ['warsaw', 92]])
    expect(planChanges(useTrip.getState())).toEqual([])
    // Undo takes the trip back to before the plan.
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

  it('lists what changed since the plan (setup, edits by hand, nights), and updates the plan for it', async () => {
    useTrip.getState().setStops(draftStops(ds, useTrip.getState().input))
    useTrip.getState().markPlanned()
    const changes = () => planChanges(useTrip.getState())
    expect(changes()).toEqual([])
    const first = useTrip.getState().stops[0]
    // Edits by hand change only what they touch: the nights no longer add up until the plan is updated.
    useTrip.getState().setInput({ pace: 'fast' })
    useTrip.getState().setNights(0, first.nights + 2)
    expect(changes()).toEqual(['Pace: balanced → fast', expect.stringMatching(new RegExp(`: ${first.nights} → ${first.nights + 2} nights`)), '2 nights over the dates'])
    useChat.setState({ contents: [{ role: 'user', parts: [{ text: 'earlier' }] }, { role: 'model', parts: [{ text: 'reply' }] }] as never })
    const fitted = { status: 200, body: { content: { role: 'model', parts: [{ functionCall: { name: 'set_nights', args: { city: useTrip.getState().stops[1].cityId, nights: useTrip.getState().stops[1].nights - 2 } } }] } } }
    const fetch = serve(fitted, reply('Updated'))
    await useChat.getState().send(`Update my plan: ${changes().join('; ')}`, [], { think: true, plan: 'update' })
    // The model starts afresh, keeps the user's edit, and the plan is up to date again.
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)).contents).toHaveLength(1)
    expect(useTrip.getState().stops[0]).toMatchObject({ nights: first.nights + 2, locked: true })
    expect(changes()).toEqual([])
  })

  it('marks the plan up to date after the assistant changes the trip in the chat, not after a stopped update', async () => {
    useTrip.getState().setStops(draftStops(ds, useTrip.getState().input))
    useTrip.getState().markPlanned()
    useTrip.getState().removeStop(0)
    expect(planChanges(useTrip.getState()).length).toBeGreaterThan(0)
    vi.stubGlobal('fetch', vi.fn(async () => {
      useChat.getState().stop()
      return new Response(JSON.stringify(toolCall.body), { status: 200 })
    }))
    await useChat.getState().send('Update my plan', [], { plan: 'update' })
    expect(planChanges(useTrip.getState()).length).toBeGreaterThan(0)
    const nights = useTrip.getState().plan!.totalNights - useTrip.getState().plan!.assignedNights + useTrip.getState().stops[0].nights
    serve({ status: 200, body: { content: { role: 'model', parts: [{ functionCall: { name: 'set_nights', args: { city: useTrip.getState().stops[0].cityId, nights } } }] } } }, reply('Done'))
    await useChat.getState().send('Give the freed nights to my first stop')
    expect(planChanges(useTrip.getState())).toEqual([])
  })

  it('saves to My visit, and Undo takes it back, also on a read-only trip', async () => {
    useItems.setState({ books: {}, key: 'local' })
    useTrip.getState().setReadOnly(true)
    const save = { status: 200, body: { content: { role: 'model', parts: [{ functionCall: { name: 'save_visit_item', args: { kind: 'stay', city: 'Kraków', title: 'Hostel Mleczarnia', check_in: '2026-05-04' } } }] } } }
    serve(save, reply('Saved your stay.'))
    await useChat.getState().send('Save this booking')
    const entries = () => Object.values(useItems.getState().books.local?.entries ?? {})
    expect(entries()).toMatchObject([{ kind: 'stay', at: 'krakow', title: 'Hostel Mleczarnia', from: '2026-05-04' }])
    const index = useChat.getState().messages.length - 1
    expect(useChat.getState().messages[index]).toMatchObject({ changes: ['Added stay Hostel Mleczarnia (Kraków)'] })
    expect(useChat.getState().messages[index]).not.toHaveProperty('before')
    useChat.getState().undo(index)
    expect(entries()).toMatchObject([{ kind: 'stay', deleted: true }])
    expect(useChat.getState().note).toMatch(/My visit is back/)
    useTrip.getState().setReadOnly(false)
  })

  it('sends a message\'s attachments with their tokens, and keeps them with the message to try again', async () => {
    const file = { name: 'ticket.png', mimeType: 'image/png', uri: 'https://generativelanguage.googleapis.com/v1beta/files/t1', token: 'tok', thumb: 'data:image/jpeg;base64,AA' }
    const fetch = serve({ status: 502, body: { error: 'The assistant failed to answer: try again.' } }, reply('Your bus leaves at 08:40.'))
    await useChat.getState().send('When does my bus leave?', [], { media: [file] })
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.media).toEqual([{ uri: file.uri, token: 'tok' }])
    expect(body.contents.at(-1).parts[0]).toEqual({ fileData: { mimeType: 'image/png', fileUri: file.uri } })
    const { messages } = useChat.getState()
    expect(messages.at(-2)).toMatchObject({ role: 'user', media: [file] })
    await useChat.getState().retry(messages.length - 1)
    const again = JSON.parse(String((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body))
    expect(again.media).toEqual([{ uri: file.uri, token: 'tok' }])
    expect(lastReply().text).toBe('Your bus leaves at 08:40.')
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
    // The model puts in an itinerary, gives its first stop 9 nights, then answers.
    const answers: (() => Content)[] = [
      () => ({ role: 'model', parts: [{ functionCall: { name: 'set_itinerary', args: { stops: [{ city: 'Kraków', nights: 60 }, { city: 'Warsaw', nights: 92 }] } } }] }),
      () => ({ role: 'model', parts: [{ functionCall: { name: 'set_nights', args: { city: 'Kraków', nights: 9 } } }] }),
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
    expect(reply).toMatchObject({ text: 'Planned, with 9 nights at the start.', plan: 'new', spent: { calls: 3, input: 3000, output: 300 } })
    expect(reply.changes).toContain(`New itinerary: ${trip.getState().stops.length} stops`)
    // Its time counts from when the run was started (on the server, before the runner picked it up).
    expect(reply.ms).toBeGreaterThanOrEqual(5000)
    // Nights it set itself aren't locked.
    expect(trip.getState().stops[0]).toMatchObject({ cityId: 'krakow', nights: 9, locked: false })
    expect(trip.getState().input.planned).toBeTruthy()
    expect(contents).toHaveLength(6)
    expect(useTrip.getState().stops).toBe(shown)
  })

  it('sends attached files with every step of their message, and keeps only their names after', async () => {
    const trip = createTripStore({ input: testCaseInput(ds, 'US'), stops: [] })
    const file = { name: 'booking.pdf', mimeType: 'application/pdf', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123', token: 't' }
    const answers: Content[] = [
      { role: 'model', parts: [{ functionCall: { name: 'get_options', args: {} } }] },
      { role: 'model', parts: [{ text: 'Your stay is from 4 to 7 May.' }] },
    ]
    const sent: { contents: Content[]; media: unknown }[] = []
    const { contents } = await runAssistant({
      trip, view: [], history: [], note: null, text: 'When is my stay?', media: [file], think: false,
      callModel: async (c, _x, _t, _s, _o, media) => {
        sent.push({ contents: structuredClone(c), media })
        return answers.shift()!
      },
      signal: new AbortController().signal,
    })
    for (const call of sent) {
      expect(call.contents[0].parts[0]).toEqual({ fileData: { mimeType: 'application/pdf', fileUri: file.uri } })
      expect(call.media).toEqual([file])
    }
    expect(sent).toHaveLength(2)
    expect(JSON.stringify(contents)).not.toContain('fileData')
    expect(contents[0].parts[0].text).toMatch(/attached booking\.pdf/)
    expect(contents[0].parts[1].text).toBe('When is my stay?')
  })

  it('keeps the user\'s setup while planning, and locks only nights the user asked for', async () => {
    const trip = createTripStore({ input: testCaseInput(ds, 'US'), stops: [] })
    trip.getState().setStops(draftStops(ds, trip.getState().input))
    const regions = trip.getState().input.groups.length
    const [first, second] = trip.getState().stops.map((s) => s.cityId)
    const calls = [
      { name: 'update_region', args: { region: trip.getState().input.groups[0].name, remove: true } },
      { name: 'set_locked', args: { city: second, locked: true } },
      { name: 'set_nights', args: { city: first, nights: 6, lock: true } },
      { name: 'set_nights', args: { city: second, nights: 5 } },
    ]
    const answers: Content[] = [
      { role: 'model', parts: calls.map((functionCall) => ({ functionCall })) },
      { role: 'model', parts: [{ text: 'Updated.' }] },
    ]
    const { reply, contents } = await runAssistant({
      trip, view: [], history: [], note: null, text: 'Update my plan.', think: false, plan: 'update',
      callModel: async () => answers.shift()!, signal: new AbortController().signal,
    })
    const results = contents[2].parts.map((p) => (p.functionResponse as { response: { error?: string } }).response)
    expect(results[0].error).toMatch(/setup .* stays as the user set it/)
    expect(results[1].error).toMatch(/setup .* stays as the user set it/)
    expect(trip.getState().input.groups).toHaveLength(regions)
    const stops = trip.getState().stops
    expect(stops.find((s) => s.cityId === first)).toMatchObject({ nights: 6, locked: true })
    expect(stops.find((s) => s.cityId === second)).toMatchObject({ nights: 5, locked: false })
    expect(reply.changes.join()).not.toMatch(/Removed region/)
  })

  // Two drafts by the planner: about 10 s on CI.
  it('reverses only the stops while planning, and not when the regions are to be visited in order', async () => {
    const plan = async (keepGroupOrder: boolean) => {
      const trip = createTripStore({ input: { ...testCaseInput(ds, 'US'), keepGroupOrder }, stops: [] })
      trip.getState().setStops(draftStops(ds, trip.getState().input))
      const before = trip.getState()
      const answers: Content[] = [
        { role: 'model', parts: [{ functionCall: { name: 'reorder_stops', args: { reverse: true } } }] },
        { role: 'model', parts: [{ text: 'Done.' }] },
      ]
      const { contents } = await runAssistant({
        trip, view: [], history: [], note: null, text: 'Update my plan.', think: false, plan: 'update',
        callModel: async () => answers.shift()!, signal: new AbortController().signal,
      })
      return { before, after: trip.getState(), result: (contents[2].parts[0].functionResponse as { response: { error?: string } }).response }
    }
    const free = await plan(false)
    expect(free.result.error).toBeUndefined()
    expect(free.after.stops.map((s) => s.cityId)).toEqual(free.before.stops.map((s) => s.cityId).reverse())
    expect(free.after.input.groups).toEqual(free.before.input.groups)
    const ordered = await plan(true)
    expect(ordered.result.error).toMatch(/In this order/)
    expect(ordered.after.stops).toEqual(ordered.before.stops)
  }, 30_000)
})

describe('past chats', () => {
  it('sets a chat aside without Undo, still saying what each reply changed', () => {
    const before = createTripStore({ input: testCaseInput(ds, 'US'), stops: [] }).getState()
    const messages: ChatMessage[] = [
      { role: 'user', text: 'Add Kraków', at: 1 },
      { role: 'assistant', text: 'Added', steps: [], changes: ['Added Kraków'], before: { input: before.input, stops: before.stops } as never },
      { role: 'assistant', text: 'Saved the link', steps: [], changes: ['Added a link'], itemsBefore: { a: null } },
    ]
    const aside = setAside({ messages, contents: [], note: 'The user pressed Undo' })
    expect(aside.note).toBeNull()
    expect(aside.messages[0]).toBe(messages[0])
    expect(aside.messages[1]).toEqual({ role: 'assistant', text: 'Added', steps: [], changes: ['Added Kraków'], changedTrip: true })
    expect(aside.messages[2]).toEqual({ role: 'assistant', text: 'Saved the link', steps: [], changes: ['Added a link'] })
  })
})
