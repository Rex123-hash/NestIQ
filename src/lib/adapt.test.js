// Frontend adapter: API locality -> UI card model.
import { describe, it, expect } from 'vitest'
import { adaptNeighborhood, adaptList } from './adapt.js'

const locality = (over = {}) => ({
  id: 'x', name: 'X', short: 'X', accent: '#7C5CF6',
  lat: 28.6, lng: 77.2, median_rent: 19000, commute_min: 24,
  aqi: 90, aqi_category: 'Satisfactory air quality',
  subscores: { affordability: 70, safety: 75, commute: 80, lifestyle: 72, air_quality: 80 },
  fitScore: 78, match: 'Good Match',
  ...over,
})

describe('adaptNeighborhood', () => {
  it('formats rent in Indian notation with the rupee sign', () => {
    expect(adaptNeighborhood(locality()).rentDisplay).toBe('₹19,000')
  })

  it('groups thousands the Indian way for lakh-scale rents', () => {
    expect(adaptNeighborhood(locality({ median_rent: 125000 })).rentDisplay).toBe('₹1,25,000')
  })

  it('derives Clean Air tag when the air pillar is strong', () => {
    const n = adaptNeighborhood(locality({ subscores: { ...locality().subscores, air_quality: 90 } }))
    expect(n.tags).toContain('Clean Air')
  })

  it('falls back to neutral tags when nothing stands out', () => {
    const weak = { affordability: 45, safety: 45, commute: 45, lifestyle: 45, air_quality: 45 }
    expect(adaptNeighborhood(locality({ subscores: weak })).tags).toEqual(['Balanced', 'Diverse'])
  })

  it('exposes AQI and commute for the card badges', () => {
    const n = adaptNeighborhood(locality())
    expect(n.aqi).toBe(90)
    expect(n.commuteMin).toBe(24)
  })
})

describe('adaptList', () => {
  it('returns empty for empty input', () => {
    expect(adaptList([])).toEqual([])
    expect(adaptList(null)).toEqual([])
  })

  it('computes map pins inside the visible frame for every locality', () => {
    const list = adaptList([
      locality({ id: 'a', lat: 28.5, lng: 77.1 }),
      locality({ id: 'b', lat: 28.7, lng: 77.4 }),
    ])
    for (const n of list) {
      const top = parseFloat(n.pin.top)
      const left = parseFloat(n.pin.left)
      expect(top).toBeGreaterThan(0)
      expect(top).toBeLessThan(100)
      expect(left).toBeGreaterThan(0)
      expect(left).toBeLessThan(100)
    }
  })
})
