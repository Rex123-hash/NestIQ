// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import NeighborhoodDetail from './NeighborhoodDetail.jsx'
import { apiEssentials, apiLocalityPulse, apiNeighborhood, apiNeighborhoodForecast, apiNeighborhoods, apiRentVerification, apiReviews } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({
  apiNeighborhood: vi.fn(),
  apiNeighborhoodForecast: vi.fn().mockResolvedValue({ status: 'temporarily_unavailable', forecast: [] }),
  apiNeighborhoods: vi.fn().mockResolvedValue([]),
  apiReviews: vi.fn(),
  apiRentVerification: vi.fn(),
  apiLocalityPulse: vi.fn(),
  apiEssentials: vi.fn().mockResolvedValue({ status: 'temporarily_unavailable' }),
}))
vi.mock('../../lib/cityStore.jsx', () => ({ useCity: () => ({ city: 'delhi-ncr', setCity: vi.fn(), cities: [{ id: 'delhi-ncr', name: 'Delhi NCR' }] }) }))
vi.mock('../../lib/saved.js', () => ({ useSaved: () => [], toggleSaved: vi.fn() }))
vi.mock('./detailTabs.jsx', () => ({
  OverviewTab: ({ n, forecastStatus }) => <div>Overview · {forecastStatus} · {n.aqiSeries?.forecast?.[0]?.aqi ?? 'no forecast'}</div>, AffordabilityTab: () => null,
  SafetyTab: () => null, CommuteTab: () => null, LifestyleTab: () => null,
  AirQualityTab: () => null, CommunityTab: () => null,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

function renderDetail(path = '/neighborhood/missing') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/neighborhood/:id" element={<NeighborhoodDetail />} /></Routes>
    </MemoryRouter>,
  )
}

describe('NeighborhoodDetail loading and failure states', () => {
  it('renders a real not-found state instead of loading forever', async () => {
    apiNeighborhood.mockResolvedValue({ __error: 'not_found' })
    renderDetail()
    await waitFor(() => expect(screen.getByRole('heading', { name: /couldn’t find this neighborhood/i })).toBeTruthy())
    expect(screen.getByRole('link', { name: /back to results/i }).getAttribute('href')).toBe('/results')
  })

  it('renders a retryable unavailable state', async () => {
    apiNeighborhood.mockResolvedValue({ __error: 'temporarily_unavailable' })
    renderDetail('/neighborhood/offline')
    await waitFor(() => expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy())
    expect(screen.getByText(/does not mean the locality has no data/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(apiNeighborhood).toHaveBeenCalledTimes(2))
  })

  it('does not start grounded evidence or essentials on overview load', async () => {
    apiNeighborhood.mockResolvedValue({ __error: 'not_found' })
    renderDetail('/neighborhood/opened')
    await waitFor(() => expect(screen.getByText(/locality not found/i)).toBeTruthy())
    expect(apiRentVerification).not.toHaveBeenCalled()
    expect(apiReviews).not.toHaveBeenCalled()
    expect(apiLocalityPulse).not.toHaveBeenCalled()
    expect(apiEssentials).not.toHaveBeenCalled()
  })

  it('shows the cached city snapshot while richer detail is still pending', async () => {
    const peer = {
      id: 'opened', name: 'Opened Locality', short: 'Opened', lat: 28.6, lng: 77.3,
      median_rent: 24000, aqi: 90, aqi_category: 'Moderate', commute_min: 25, amenity_count: 8,
      subscores: { affordability: 80, safety: 70, commute: 75, lifestyle: 65, air_quality: 72 },
      fitScore: 75, match: 'Good Match', evidence: {},
    }
    apiNeighborhood.mockReturnValue(new Promise(() => {}))
    apiNeighborhoods.mockResolvedValueOnce([peer])
    renderDetail('/neighborhood/opened')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Opened Locality' })).toBeTruthy())
    expect(screen.getByText(/preparing the evidence-backed explanation/i)).toBeTruthy()
  })

  it('adds the fast AQI forecast to the snapshot without waiting for full detail', async () => {
    const peer = {
      id: 'fast-aqi', name: 'Fast AQI', short: 'Fast AQI', lat: 28.6, lng: 77.3,
      median_rent: 24000, aqi: 90, aqi_category: 'Moderate', commute_min: 25, amenity_count: 8,
      subscores: { affordability: 80, safety: 70, commute: 75, lifestyle: 65, air_quality: 72 },
      fitScore: 75, match: 'Good Match', evidence: {},
    }
    apiNeighborhood.mockReturnValue(new Promise(() => {}))
    apiNeighborhoods.mockResolvedValueOnce([peer])
    apiNeighborhoodForecast.mockResolvedValueOnce({
      status: 'available', forecast: [{ label: '10:00', aqi: 42 }],
    })
    renderDetail('/neighborhood/fast-aqi')
    expect(await screen.findByText(/Overview · ready · 42/i)).toBeTruthy()
  })
})
