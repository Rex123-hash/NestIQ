// City Snapshot averages.
//
// Bug this pins: the averaging helper returned 0 for an empty list, so a city where
// every locality omits rent (a newly onboarded city with no sourced rent yet) rendered
// "Avg. median rent ₹0/mo" — a fabricated price presented as fact. Absence must produce
// null so the UI can say "Not available", never a zero that reads as real data.
import { describe, it, expect } from 'vitest'
import { citySnapshot } from './citySnapshot.js'

const loc = (over = {}) => ({ rent: 20000, aqi: 90, commuteMin: 30, ...over })

describe('citySnapshot', () => {
  it('averages the values that are present', () => {
    const s = citySnapshot([loc({ rent: 10000 }), loc({ rent: 20000 })])
    expect(s.rent).toBe(15000)
    expect(s.aqi).toBe(90)
    expect(s.commute).toBe(30)
  })

  it('returns null for rent when every locality omits it', () => {
    const s = citySnapshot([loc({ rent: null }), loc({ rent: null })])
    expect(s.rent).toBeNull()
  })

  it('never returns zero for a fully absent metric', () => {
    const s = citySnapshot([loc({ rent: null, aqi: null, commuteMin: null })])
    expect(s.rent).not.toBe(0)
    expect(s.aqi).not.toBe(0)
    expect(s.commute).not.toBe(0)
    expect(s.rent).toBeNull()
    expect(s.aqi).toBeNull()
    expect(s.commute).toBeNull()
  })

  it('averages only the present values when some are missing', () => {
    // A partially-sourced city must not have absent entries counted as zero.
    const s = citySnapshot([loc({ rent: 30000 }), loc({ rent: null })])
    expect(s.rent).toBe(30000)
  })

  it('ignores non-finite values rather than averaging them in', () => {
    const s = citySnapshot([loc({ rent: 10000 }), loc({ rent: undefined }), loc({ rent: NaN })])
    expect(s.rent).toBe(10000)
  })

  it('returns null for every metric on an empty list', () => {
    const s = citySnapshot([])
    expect(s).toEqual({ rent: null, aqi: null, commute: null })
  })

  it('rounds to whole numbers', () => {
    const s = citySnapshot([loc({ rent: 10000 }), loc({ rent: 15001 })])
    expect(Number.isInteger(s.rent)).toBe(true)
  })
})
