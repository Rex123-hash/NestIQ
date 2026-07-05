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

  it('never repeats a word between the vibe line and the feature chips', () => {
    const n = adaptNeighborhood(locality())
    for (const chip of n.amenityTags) {
      expect(n.descriptors).not.toContain(chip)
    }
  })

  it('reports an honest +N more count from real leftover tags', () => {
    // 4 feature tags qualify (Clean Air, Safe, Affordable, Quick Commute)
    // -> 3 shown as chips, extraTags must be exactly 1.
    const n = adaptNeighborhood(locality())
    expect(n.amenityTags).toHaveLength(3)
    expect(n.extraTags).toBe(1)
  })

  it('hides the +N chip when every tag fits on the card', () => {
    const weak = { affordability: 45, safety: 45, commute: 45, lifestyle: 45, air_quality: 45 }
    expect(adaptNeighborhood(locality({ subscores: weak })).extraTags).toBe(0)
  })

  it('falls back to neutral tags when nothing stands out', () => {
    const weak = { affordability: 45, safety: 45, commute: 45, lifestyle: 45, air_quality: 45 }
    const n = adaptNeighborhood(locality({ subscores: weak }))
    expect(n.amenityTags).toEqual(['All-rounder'])
    expect(n.descriptors).toBe('Balanced')
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

  it('suppresses tags from a pillar that cannot differentiate localities', () => {
    // lifestyle is identical everywhere (saturated amenities signal), so no
    // card should claim Quiet or Lively from it.
    const flatLifestyle = (id, lat) =>
      locality({ id, lat, subscores: { ...locality().subscores, lifestyle: 40 } })
    const list = adaptList([flatLifestyle('a', 28.5), flatLifestyle('b', 28.7)])
    for (const n of list) {
      expect(n.descriptors).not.toContain('Quiet')
      expect(n.descriptors).not.toContain('Lively')
    }
  })

  it('keeps tags from pillars that do vary across the list', () => {
    const list = adaptList([
      locality({ id: 'a', lat: 28.5, subscores: { ...locality().subscores, air_quality: 90 } }),
      locality({ id: 'b', lat: 28.7, subscores: { ...locality().subscores, air_quality: 40 } }),
    ])
    expect(list[0].tags).toContain('Clean Air')
    expect(list[1].tags).not.toContain('Clean Air')
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
