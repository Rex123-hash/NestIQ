// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NeighborhoodCard from './NeighborhoodCard.jsx'
import { apiLocalityPulse, apiRentVerification, apiReviews } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({
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

describe('NeighborhoodCard evidence warmup', () => {
  it('warms rent, reviews and pulse at 1.5-second intervals', async () => {
    vi.useFakeTimers()
    render(<MemoryRouter><NeighborhoodCard n={locality} rank={1} /></MemoryRouter>)
    const card = screen.getByRole('link', { name: /powai/i })

    fireEvent.mouseEnter(card)
    expect(apiRentVerification).toHaveBeenCalledWith('powai', 'mumbai', false, false)
    expect(apiReviews).not.toHaveBeenCalled()
    expect(apiLocalityPulse).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1500)
    expect(apiReviews).toHaveBeenCalledWith('powai', 'mumbai')
    expect(apiLocalityPulse).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1500)
    expect(apiLocalityPulse).toHaveBeenCalledWith('powai', 'mumbai')
  })

  it('cancels stages that have not started when hover ends', async () => {
    vi.useFakeTimers()
    render(<MemoryRouter><NeighborhoodCard n={locality} rank={1} /></MemoryRouter>)
    const card = screen.getByRole('link', { name: /powai/i })

    fireEvent.mouseEnter(card)
    fireEvent.mouseLeave(card)
    await vi.advanceTimersByTimeAsync(4000)

    expect(apiRentVerification).toHaveBeenCalledTimes(1)
    expect(apiReviews).not.toHaveBeenCalled()
    expect(apiLocalityPulse).not.toHaveBeenCalled()
  })
})
