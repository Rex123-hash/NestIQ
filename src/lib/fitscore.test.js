// Frontend FitScore reweighting must use the SAME missing-pillar policy as the
// backend score_india: exclude pillars with no subscore and renormalize the
// weights over what remains (never treat a missing pillar as zero).
import { describe, it, expect } from 'vitest'
import { reweight, matchLabel, INDIA_PILLARS } from './fitscore.js'

const sub = { affordability: 80, safety: 60, commute: 70, lifestyle: 50, air_quality: 0 }
const w = { affordability: 20, safety: 20, commute: 20, lifestyle: 15, air_quality: 25 }

describe('reweight', () => {
  it('averages all pillars when all present', () => {
    const r = reweight(sub, w)
    // (80*20 + 60*20 + 70*20 + 50*15 + 0*25) / 100 = 49.5 -> 50
    expect(r.score).toBe(50)
    expect(r.status).toBe('complete')
    expect(r.missingPillars).toEqual([])
    expect(r.coveragePercent).toBe(100)
  })

  it('excludes a missing pillar and renormalizes (does NOT treat it as zero)', () => {
    const missingAir = { ...sub, air_quality: null }
    const r = reweight(missingAir, w)
    // over 4 pillars, weights 20/20/20/15 = 75: (80*20+60*20+70*20+50*15)/75 = 66
    expect(r.score).toBe(66)
    expect(r.status).toBe('provisional')
    expect(r.missingPillars).toEqual(['air_quality'])
    expect(r.coveragePercent).toBe(75)
    expect(r.matchDisplay).toBe('Provisional Fair Match')
  })

  it('treating-as-zero would give a different (wrong) score', () => {
    // Guard against regressing to (sub[k]||0): that path yields 50, not 66.
    const missingAir = { ...sub, air_quality: null }
    const zeroPolicy = Math.round(
      INDIA_PILLARS.reduce((a, k) => a + (missingAir[k] || 0) * w[k], 0) /
        INDIA_PILLARS.reduce((a, k) => a + w[k], 0),
    )
    expect(zeroPolicy).toBe(50)
    expect(reweight(missingAir, w).score).not.toBe(zeroPolicy)
  })
})

describe('matchLabel', () => {
  it('mirrors backend thresholds', () => {
    expect(matchLabel(85)).toBe('Excellent Match')
    expect(matchLabel(75)).toBe('Good Match')
    expect(matchLabel(60)).toBe('Fair Match')
  })
})
