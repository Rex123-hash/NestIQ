// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NeighborhoodCard from './NeighborhoodCard.jsx'
import { apiLocalityPulse, apiRentVerification, apiReviews, prefetchNeighborhood } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({
  prefetchNeighborhood: vi.fn().mockResolvedValue([]),
  apiLocalityPulse: vi.fn().mockResolvedValue({ status: 'pending' }),
  apiRentVerification: vi.fn().mockResolvedValue({ status: 'pending' }),
  apiReviews: vi.fn().mockResolvedValue({ status: 'pending' }),
}))
vi.mock('../../lib/gmaps.js', () => ({ useMapsKey: () => '', placesPhotoUrl: () => '' }))
vi.mock('../../lib/cityStore.jsx', () => ({ useCity: () => ({ city: 'mumbai' }) }))
vi.mock('../../lib/saved.js', () => ({ useSaved: () => [], toggleSaved: vi.fn() }))
vi.mock('../ui/ScoreGauge.jsx', () => ({ default: () => <div>Gauge</div> }))

const locality = {
  id: 'powai', name: 'Powai', descriptors: 'Green and connected', accent: '#6D5DFB',
  photo: '', fitScore: 82, commuteMin: 30, aqi: 91, aqiCategory: 'moderate air quality',
  rent: 60000, rentDisplay: '₹60,000', amenityTags: ['Green'], extraTags: 0,
  match: 'Good Match', matchDisplay: 'Good Match', isProvisional: false,
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('NeighborhoodCard request discipline', () => {
  it('does not start grounded jobs from hover or keyboard focus', () => {
    render(<MemoryRouter><NeighborhoodCard n={locality} rank={1} /></MemoryRouter>)
    const card = screen.getByRole('link', { name: /powai/i })
    fireEvent.mouseEnter(card)
    fireEvent.focus(card)
    fireEvent.mouseLeave(card)
    fireEvent.blur(card)
    expect(prefetchNeighborhood).not.toHaveBeenCalled()
    expect(apiRentVerification).not.toHaveBeenCalled()
    expect(apiReviews).not.toHaveBeenCalled()
    expect(apiLocalityPulse).not.toHaveBeenCalled()
  })

  it('starts the shared detail request on click before navigation', () => {
    render(<MemoryRouter><NeighborhoodCard n={locality} rank={1} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('link', { name: /powai/i }))
    expect(prefetchNeighborhood).toHaveBeenCalledTimes(1)
    expect(prefetchNeighborhood).toHaveBeenCalledWith('powai', 'mumbai')
  })
})
