// Presets carry only a validated id + prefilled query into a refresh-safe URL.
// Weights are resolved server-side, so the client never encodes them.
import { describe, it, expect } from 'vitest'
import { PRESETS, FAMILY_HEALTH, isPreset, resultsSearch } from './presets.js'

describe('presets', () => {
  it('defines the family_health preset with a prefilled query', () => {
    expect(PRESETS[FAMILY_HEALTH].id).toBe('family_health')
    expect(PRESETS[FAMILY_HEALTH].query).toMatch(/asthmatic/i)
    expect(PRESETS[FAMILY_HEALTH].label).toBe('Family Health & Resilience')
  })

  it('validates known vs unknown preset ids', () => {
    expect(isPreset(FAMILY_HEALTH)).toBe(true)
    expect(isPreset('nope')).toBe(false)
    expect(isPreset('')).toBe(false)
    expect(isPreset(undefined)).toBe(false)
  })

  it('builds a URL with query and a valid preset', () => {
    const s = resultsSearch('clean air', FAMILY_HEALTH, 'mumbai')
    const params = new URLSearchParams(s)
    expect(params.get('q')).toBe('clean air')
    expect(params.get('preset')).toBe('family_health')
    expect(params.get('city')).toBe('mumbai')
  })

  it('drops an unknown preset id but keeps the query', () => {
    const s = resultsSearch('clean air', 'totally_made_up')
    const params = new URLSearchParams(s)
    expect(params.get('q')).toBe('clean air')
    expect(params.get('preset')).toBeNull()
  })

  it('returns an empty string when there is nothing to encode', () => {
    expect(resultsSearch('', undefined)).toBe('')
  })
})
