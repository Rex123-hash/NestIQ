// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

describe('Rent verification', () => {
  it('shows honest background progress after Verify current rent', async () => {
    apiRentVerification.mockResolvedValue({ status: 'pending', refreshStatus: 'refreshing' })
    const n = {
      id: 'sector-18', cityId: 'delhi-ncr', name: 'Sector 18', short: 'Sector 18',
      rentDisplay: '₹24,000', subscores: { affordability: 80 },
      insights: { rent: { rank: 1, total: 1 }, peers: [{ id: 'sector-18', name: 'Sector 18', rent: 24000 }] },
      evidence: { affordability: { status: 'curated', source: 'NestIQ market dataset', sourceType: 'curated_market' } },
    }
    render(<AffordabilityTab n={n} />)
    fireEvent.click(screen.getByRole('button', { name: /verify current rent/i }))
    await waitFor(() => expect(screen.getByText(/running in the background/i)).toBeTruthy())
    expect(apiRentVerification).toHaveBeenCalledWith('sector-18', 'delhi-ncr', false)
  })
})
