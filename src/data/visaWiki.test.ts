import { describe, expect, it } from 'vitest'
import { applySite, extendable, limitRule, parseVisaPage, plain, sectionsOf, stayDays } from './visaWiki'

// Rows as the articles write them (shortened), and a note kept on the shared page.
const PAGE = `Intro
{| class="wikitable sortable"
! Country / Region !! Visa requirement !! Allowed stay !! Notes (excluding departure fees)
|-
| {{flag|Indonesia}}
| {{Optional|e-VOA / Visa on arrival}}<ref>{{Timatic|nationality=US|destination=ID}}</ref>
| data-sort-value="30" | 30 days<ref>{{cite web | url=https://evisa.imigrasi.go.id | title=e-VOA}}</ref>
|
* Can be bought for IDR 500.000 (approx. US$35).
* Can be extended once for another 30 days.{{cn|date=September 2024}}
|{{no}}
|-
| {{flag|Turkey}}
| {{yes|Visa not required}}
| {{sort|90|90 days}}
|
* Maximum stay of 90 days within any 180-day period.<ref>{{cite web | url=https://evisa.govn.tr/blog | title=Not the official site}}</ref>
|-
| {{flag|India}}
| {{yes2|eVisa}}<ref>{{cite web | url=https://indianvisaonline.gov.in/visa/tvoa.html | title=India eVisa}}</ref>
| data-sort-value="30" | 30 days
|
{{trim|{{#section-h::Template:Transcluded sections for the visa articles|India. eVisa}}}}
* [[United States|American]] citizens are also eligible for a '''ten-year''' tourist visa.
|-
| {{flag|Atlantis}}
| {{yes|Visa not required}}
| 90 days
|
|}
`
const SECTIONS = `Intro
==India. eVisa==
* e-Visa holders must arrive via 32 designated airports{{refn|group=Note|name=Airports|
* Ahmedabad
* Amritsar}} or 5 designated seaports.
<!-- * An old note.
-->
==Kenya. eTA==
* An eTA is required.
`
const ISO: Record<string, string> = { Indonesia: 'ID', Turkey: 'TR', India: 'IN' }

describe("a passport's visa article", () => {
  const { stays, unmatched } = parseVisaPage(PAGE, sectionsOf(SECTIONS), (n) => ISO[n] ?? null)

  it("reads each destination's stay, its notes, extending it and the official site", () => {
    expect(stays.ID).toEqual({
      text: '30 days', days: 30,
      notes: ['Can be bought for IDR 500.000 (approx. US$35).', 'Can be extended once for another 30 days.'],
      extend: true, apply: 'https://evisa.imigrasi.go.id',
    })
  })

  it('reads how the limit counts, and cites no site off the official domain', () => {
    expect(stays.TR).toMatchObject({ days: 90, window: { days: 90, in: 180 } })
    expect(stays.TR.apply).toBeUndefined()
  })

  it('writes in the notes kept on the shared page, without footnotes or comments', () => {
    expect(stays.IN.notes).toEqual([
      'e-Visa holders must arrive via 32 designated airports or 5 designated seaports.',
      'American citizens are also eligible for a ten-year tourist visa.',
    ])
    expect(stays.IN.apply).toBe('https://indianvisaonline.gov.in/visa/tvoa.html')
  })

  it('lists the names it has no code for', () => {
    expect(unmatched).toEqual(['Atlantis'])
  })
})

describe('reading the cells', () => {
  it('turns wikitext into plain text', () => {
    expect(plain("{{sort|90|3 months}} in [[Laos|the Lao PDR]], '''not''' <br/>[https://x.la here]{{cn|date=2024}}")).toBe('3 months in the Lao PDR, not here')
    expect(plain('{{yes|[[Visa policy of Kenya#eTA|eTA]]}}')).toBe('eTA')
  })

  it('takes the longest stay a cell allows', () => {
    expect([stayDays('30 days / 60 days'), stayDays('3 months'), stayDays('1 year'), stayDays('6 weeks'), stayDays('Unlimited stay')]).toEqual([60, 90, 365, 42, undefined])
  })

  it('reads a period limit and a per-entry one', () => {
    expect(limitRule('90 days within any 180-day period')).toEqual({ window: { days: 90, in: 180 } })
    expect(limitRule('90 days within any 6 months')).toEqual({ window: { days: 90, in: 180 } })
    expect(limitRule('30 days per trip, but no more than 90 days within any 1 calendar year')).toEqual({ window: { days: 90, in: 365 }, perEntry: true })
    expect(limitRule('30 days')).toEqual({})
  })

  it('says whether a stay can be extended only where a note says so', () => {
    expect([extendable(['Can be extended for 30 days.']), extendable(['The visa cannot be extended.']), extendable(['Return ticket required.'])]).toEqual([true, false, undefined])
    expect(extendable(['This extends to their spouse and children.'])).toBeUndefined()
  })

  it('takes an official site only on the destination’s own domain', () => {
    expect(applySite('url=https://evisa.gov.vn/ and https://vietnam-visa.com', 'VN')).toBe('https://evisa.gov.vn/')
    expect(applySite('url=https://esta.cbp.dhs.gov/', 'US')).toBe('https://esta.cbp.dhs.gov/')
    expect(applySite('url=https://www.gov.uk/foreign-travel-advice', 'VN')).toBeUndefined()
  })
})
