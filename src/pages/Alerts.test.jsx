// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Alerts from './Alerts.jsx'
import { apiCityPulse } from '../lib/api.js'

vi.mock('../lib/api.js', () => ({
  apiNeighborhoods: vi.fn().mockResolvedValue([]),
  apiLocalityPulse: vi.fn(),
  apiCityPulse: vi.fn(),
}))
vi.mock('../lib/saved.js', () => {
  const emptySaved = []
  return { useSaved: () => emptySaved }
})
vi.mock('../lib/cityStore.jsx', () => ({
  useCity: () => ({ city: 'delhi-ncr', cities: [{ id: 'delhi-ncr', name: 'Delhi NCR' }] }),
}))
vi.mock('../components/layout/CityPicker.jsx', () => ({ default: () => <div>City picker</div> }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Alerts preloading', () => {
  it('starts City Pulse before the user opens its view', async () => {
    apiCityPulse.mockResolvedValue({ status: 'pending', items: [] })
    render(<MemoryRouter><Alerts /></MemoryRouter>)
    await waitFor(() => expect(apiCityPulse).toHaveBeenCalledWith(
      'delhi-ncr', false, expect.any(AbortSignal),
    ))
    fireEvent.click(screen.getByRole('button', { name: /city pulse/i }))
    expect(screen.getByText(/preparing verified civic evidence/i)).toBeTruthy()
  })

  it('reuses the preload and reveals a prepared result immediately', async () => {
    apiCityPulse.mockResolvedValue({ status: 'no_evidence', items: [] })
    render(<MemoryRouter><Alerts /></MemoryRouter>)
    await waitFor(() => expect(apiCityPulse).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /city pulse/i }))
    expect(apiCityPulse).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/no verified civic updates/i)).toBeTruthy()
  })
})
