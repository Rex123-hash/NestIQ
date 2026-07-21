// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AffordabilityTab, ReviewsPanel } from './detailTabs.jsx'
import { apiRentVerification, apiReviews } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({
  apiReviews: vi.fn(),
  apiRentVerification: vi.fn(),
  apiLocalityPulse: vi.fn(),
  apiCivicKnowledge: vi.fn(),
  getCachedRentVerification: vi.fn(() => null),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('Community Reviews', () => {
  it('keeps the two-second preparation state before revealing prepared evidence', async () => {
    vi.useFakeTimers()
    apiReviews.mockResolvedValue({ status: 'available', summary: 'Grounded resident summary', citations: [] })
    render(<ReviewsPanel n={{ id: 'sector-18', cityId: 'delhi-ncr' }} />)
    expect(screen.getByText(/preparing community evidence/i)).toBeTruthy()
    expect(screen.queryByText('Grounded resident summary')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.getByText('Grounded resident summary')).toBeTruthy()
  })

  it('stops polling after 90 seconds and offers a retryable unavailable state', async () => {
    vi.useFakeTimers()
    apiReviews.mockResolvedValue({ status: 'pending', summary: '', citations: [] })
    render(<ReviewsPanel n={{ id: 'slow', cityId: 'delhi-ncr' }} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(90000) })
    expect(screen.getByText(/community insights temporarily unavailable/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })
})

const RENT_NEIGHBORHOOD = {
  id: 'sector-18', cityId: 'delhi-ncr', name: 'Sector 18', short: 'Sector 18',
  rentDisplay: '\u20B924,000', subscores: { affordability: 80 },
  insights: { rent: { rank: 1, total: 1 }, peers: [{ id: 'sector-18', name: 'Sector 18', rent: 24000 }] },
  evidence: { affordability: { status: 'curated', source: 'NestIQ market dataset', sourceType: 'curated_market' } },
}

describe('Rent verification', () => {
  it('shows honest background progress after Verify current rent', async () => {
    vi.useFakeTimers()
    apiRentVerification.mockResolvedValue({ status: 'pending', refreshStatus: 'refreshing' })
    const n = {
      id: 'sector-18', cityId: 'delhi-ncr', name: 'Sector 18', short: 'Sector 18',
      rentDisplay: '₹24,000', subscores: { affordability: 80 },
      insights: { rent: { rank: 1, total: 1 }, peers: [{ id: 'sector-18', name: 'Sector 18', rent: 24000 }] },
      evidence: { affordability: { status: 'curated', source: 'NestIQ market dataset', sourceType: 'curated_market' } },
    }
    render(<AffordabilityTab n={n} />)
    fireEvent.click(screen.getByRole('button', { name: /verify current rent/i }))
    expect(screen.getByText(/preparing grounded rent evidence/i)).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.getByText(/running in the background/i)).toBeTruthy()
    expect(apiRentVerification.mock.calls[0].slice(0, 3)).toEqual(['sector-18', 'delhi-ncr', false])
  })

  it('keeps stale verified rent visible when a refresh fails', async () => {
    vi.useFakeTimers()
    apiRentVerification.mockResolvedValueOnce({
      status: 'pending', refreshStatus: 'refreshing',
    })
    apiRentVerification.mockResolvedValueOnce({
      status: 'available', refreshStatus: 'failed', cacheStatus: 'stale',
      medianRent: 21000, rangeLow: 19000, rangeHigh: 23000,
      sampleSize: 4, sourceCount: 2, citations: [], confidence: 'medium', confidenceScore: 65,
      limitation: 'Showing previously verified rent evidence because the latest refresh did not complete.',
    })
    render(<AffordabilityTab n={RENT_NEIGHBORHOOD} />)
    fireEvent.click(screen.getByRole('button', { name: /verify current rent/i }))
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(screen.getAllByText(/showing previously verified rent evidence/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/21,000 median/i)).toBeTruthy()
  })

  it('shows one terminal failure and forces a fresh job on explicit retry', async () => {
    vi.useFakeTimers()
    apiRentVerification.mockResolvedValue({
      status: 'temporarily_unavailable',
      limitation: 'Grounded rent sources could not be reached just now. The curated market estimate remains available.',
    })
    render(<AffordabilityTab n={RENT_NEIGHBORHOOD} />)

    fireEvent.click(screen.getByRole('button', { name: /verify current rent/i }))
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })

    expect(screen.getAllByText(/grounded rent sources could not be reached/i)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /verify current rent/i }))
    expect(apiRentVerification.mock.calls[1].slice(0, 3)).toEqual(['sector-18', 'delhi-ncr', true])
  })

  it('stops client polling after the bounded wait window', async () => {
    vi.useFakeTimers()
    apiRentVerification.mockResolvedValue({ status: 'pending', refreshStatus: 'refreshing' })
    render(<AffordabilityTab n={RENT_NEIGHBORHOOD} />)
    fireEvent.click(screen.getByRole('button', { name: /verify current rent/i }))
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(80000) })
    expect(screen.getByText(/still running on the server/i)).toBeTruthy()
    expect(apiRentVerification.mock.calls.length).toBeGreaterThan(1)
    expect(apiRentVerification.mock.calls.length).toBeLessThanOrEqual(21)
  })
})
