// City auto-detection from free-text search queries.
import { describe, it, expect } from 'vitest'
import { detectCity } from './cityStore.jsx'

const CITIES = [
  { id: 'delhi-ncr', name: 'Delhi NCR' },
  { id: 'mumbai', name: 'Mumbai' },
  { id: 'bangalore', name: 'Bengaluru' },
  { id: 'patna', name: 'Patna (Bihar)' },
  { id: 'ranchi', name: 'Ranchi (Jharkhand)' },
]

describe('detectCity', () => {
  it('detects a city named mid-sentence', () => {
    expect(detectCity('clean air flat in patna under 15000', CITIES)?.id).toBe('patna')
  })

  it('matches the local name Bengaluru to the bangalore city id', () => {
    expect(detectCity('safe area in bengaluru', CITIES)?.id).toBe('bangalore')
  })

  it('matches state mentions like Jharkhand to Ranchi', () => {
    expect(detectCity('cheap place in jharkhand', CITIES)?.id).toBe('ranchi')
  })

  it('is case-insensitive', () => {
    expect(detectCity('MUMBAI waterfront', CITIES)?.id).toBe('mumbai')
  })

  it('returns null when no city is mentioned', () => {
    expect(detectCity('clean air, short commute, under 25k', CITIES)).toBeNull()
  })

  it('ignores tiny tokens that could false-positive', () => {
    expect(detectCity('a nice flat', CITIES)).toBeNull()
  })
})
