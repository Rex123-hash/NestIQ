// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AffordabilityTab, OverviewTab, ReviewsPanel, forecastTrend } from './detailTabs.jsx'
import { apiRentVerification, apiReviews, getCachedRentVerification } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({
  apiReviews: vi.fn(),
  apiRentVerification: vi.fn(),
  apiLocalityPulse: vi.fn(),
  apiCivicKnowledge: vi.fn(),
  getCachedRentVerification: vi.fn(() => null),
}))
vi.mock('../../components/LocalityMap.jsx', () => ({ default: () => <div>Map</div> }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  getCachedRentVerification.mockReturnValue(null)
  vi.useRealTimers()
})

describe('Community Reviews', () => {
  it('reveals prepared evidence without an artificial delay', async () => {
    apiReviews.mockResolvedValue({ status: 'available', summary: 'Grounded resident summary', citations: [] })
    render(<ReviewsPanel n={{ id: 'sector-18', cityId: 'delhi-ncr' }} />)
    expect(await screen.findByText('Grounded resident summary')).toBeTruthy()
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

describe('Overview AQI forecast label', () => {
  it('describes the same Google series that the Overview chart draws', () => {
    const trend = forecastTrend({
      aqi: 50,
      aqiSeries: {
        forecast: [{ aqi: 55 }, { aqi: 60 }],
        bqmlForecast: [{ aqi: 400 }, { aqi: 500 }],
      },
    })
    expect(trend).toMatchObject({ end: 60, peak: 60, source: 'Google forecast' })
  })

  it('ends the spinner with an honest retry state when Google has no forecast', () => {
    const retry = vi.fn()
    const neighborhood = {
      id: 'retry-aqi', name: 'Retry AQI', short: 'Retry AQI', rent: 20000, rentDisplay: '₹20,000',
      aqi: 80, aqiCategory: 'Satisfactory', commuteMin: 20,
      subscores: { affordability: 70, safety: 70, commute: 70, lifestyle: 70, air_quality: 70 },
      insights: { peers: [], aqi: { rank: 1, total: 1 }, rent: { rank: 1, total: 1 } },
      evidence: {}, aqiSeries: { forecast: [] },
    }
    render(<MemoryRouter><OverviewTab n={neighborhood} forecastStatus="temporarily_unavailable" onRetryForecast={retry} /></MemoryRouter>)
    expect(screen.queryByText(/loading live aqi forecast/i)).toBeNull()
    expect(screen.getByText(/no values were estimated or substituted/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})

const RENT_NEIGHBORHOOD = {
  id: 'sector-18', cityId: 'delhi-ncr', name: 'Sector 18', short: 'Sector 18',
  rentDisplay: '\u20B924,000', subscores: { affordability: 80 },
  insights: { rent: { rank: 1, total: 1 }, peers: [{ id: 'sector-18', name: 'Sector 18', rent: 24000 }] },
  evidence: { affordability: { status: 'curated', source: 'NestIQ market dataset', sourceType: 'curated_market' } },
}

describe('Rent verification', () => {
  it('keeps a preloaded verified result hidden until the user asks to see it', () => {
    getCachedRentVerification.mockReturnValue({
      status: 'available', medianRent: 21000, rangeLow: 19000, rangeHigh: 23000,
      sampleSize: 4, sourceCount: 2, citations: [], confidence: 'medium', confidenceScore: 65,
    })
    render(<AffordabilityTab n={RENT_NEIGHBORHOOD} />)
    expect(screen.queryByText(/grounded market verification/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /verify current rent/i }))
    expect(screen.getByText(/grounded market verification/i)).toBeTruthy()
    expect(apiRentVerification).not.toHaveBeenCalled()
  })

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
    await act(async () => {})
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
    await act(async () => {})
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
    await act(async () => {})

    expect(screen.queryByText(/grounded rent sources could not be reached/i)).toBeNull()
    expect(screen.getByText(/published estimate remains active/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /verify current rent/i }))
    expect(apiRentVerification.mock.calls[1].slice(0, 3)).toEqual(['sector-18', 'delhi-ncr', true])
  })

  it('stops client polling after the bounded wait window', async () => {
    vi.useFakeTimers()
    apiRentVerification.mockResolvedValue({ status: 'pending', refreshStatus: 'refreshing' })
    render(<AffordabilityTab n={RENT_NEIGHBORHOOD} />)
    fireEvent.click(screen.getByRole('button', { name: /verify current rent/i }))
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(80000) })
    expect(screen.getByText(/still running on the server/i)).toBeTruthy()
    expect(apiRentVerification.mock.calls.length).toBeGreaterThan(1)
    expect(apiRentVerification.mock.calls.length).toBeLessThanOrEqual(40)
  })
})
