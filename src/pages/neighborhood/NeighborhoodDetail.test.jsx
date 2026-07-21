// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import NeighborhoodDetail from './NeighborhoodDetail.jsx'
import { apiNeighborhood } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({
  apiNeighborhood: vi.fn(),
  apiNeighborhoods: vi.fn().mockResolvedValue([]),
  apiReviews: vi.fn(),
  apiRentVerification: vi.fn(),
  apiLocalityPulse: vi.fn(),
  apiEssentials: vi.fn().mockResolvedValue({ status: 'temporarily_unavailable' }),
}))
vi.mock('../../lib/cityStore.jsx', () => ({ useCity: () => ({ city: 'delhi-ncr' }) }))
vi.mock('../../lib/saved.js', () => ({ useSaved: () => [], toggleSaved: vi.fn() }))
vi.mock('./detailTabs.jsx', () => ({
  OverviewTab: () => <div>Overview</div>, AffordabilityTab: () => null,
  SafetyTab: () => null, CommuteTab: () => null, LifestyleTab: () => null,
  AirQualityTab: () => null, CommunityTab: () => null,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderDetail(path = '/neighborhood/missing') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/neighborhood/:id" element={<NeighborhoodDetail />} /></Routes>
    </MemoryRouter>,
  )
}

describe('NeighborhoodDetail failure states', () => {
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
})
