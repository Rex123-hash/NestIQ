import { describe, expect, it } from 'vitest'
import { essentialCards, essentialsSummary } from './essentials.js'

describe('essential-services display model', () => {
  it('preserves live counts and the fixed category order', () => {
    const cards = essentialCards({
      categories: {
        hospital: { value: 8, status: 'live', confidence: 'high' },
        doctor: { value: 14, status: 'live', confidence: 'high' },
      },
    })
    expect(cards.map((card) => card.key)).toEqual(['hospital', 'doctor', 'pharmacy', 'school', 'university'])
    expect(cards[0].value).toBe(8)
    expect(cards[1].value).toBe(14)
  })

  it('never turns an unavailable category into zero', () => {
    const [hospital] = essentialCards({
      categories: { hospital: { value: null, status: 'temporarily_unavailable', confidence: 'unavailable' } },
    })
    expect(hospital.value).toBeNull()
    expect(hospital.status).toBe('temporarily_unavailable')
  })

  it('explains partial and total failures honestly', () => {
    expect(essentialsSummary({ status: 'partial' }).note).toMatch(/Some categories/i)
    expect(essentialsSummary({ status: 'temporarily_unavailable' }).note).toMatch(/temporarily unavailable/i)
  })
})
