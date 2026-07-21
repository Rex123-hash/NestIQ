// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const navigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../lib/cityStore.jsx', () => ({
  useCity: () => ({
    city: 'lucknow',
    setCity: vi.fn(),
    cities: [{ id: 'lucknow', name: 'Lucknow (Uttar Pradesh)' }],
  }),
  detectCity: () => null,
}))

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => ({ user: { uid: 'guest' }, signInAsGuest: vi.fn() }),
}))

vi.mock('../lib/api.js', () => ({ apiNeighborhoods: vi.fn().mockResolvedValue(null) }))

import Home from './Home.jsx'

afterEach(() => {
  cleanup()
  navigate.mockReset()
})

describe('refined NestIQ homepage', () => {
  it('presents the human problem, product proof, differentiation and trust evidence', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /fits your life/i })).toBeTruthy()
    expect(screen.getByText(/family with an asthmatic child/i)).toBeTruthy()
    expect(screen.getByText('Illustrative NestIQ result')).toBeTruthy()
    expect(screen.getByText('Ordinary property search')).toBeTruthy()
    expect(screen.getAllByText('15/15', { selector: 'p' })).toHaveLength(2)
    expect(screen.getByText('441')).toBeTruthy()
    expect(screen.getByText(/Every signal is sourced, dated/i)).toBeTruthy()
  })

  it('uses verified catalog coverage rather than the former nine-city figure', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByText('13', { selector: 'p' })).toBeTruthy()
    expect(screen.getByText('73', { selector: 'p' })).toBeTruthy()
    expect(screen.queryByText('9', { selector: 'p' })).toBeNull()
  })

  it('preserves the functional search entry and family-health preset', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    const input = screen.getByPlaceholderText('Describe your ideal neighborhood...')
    fireEvent.click(screen.getByRole('button', { name: /Try Family Health & Resilience Mode/ }))
    expect(input.value).toMatch(/asthmatic child/i)
    fireEvent.click(screen.getByRole('button', { name: /Get Started/ }))
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/results'))
  })

  it('exposes meaningful navigation and final calls to action', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Why NestIQ' }).getAttribute('href')).toBe('#why')
    expect(screen.getAllByRole('link', { name: /Find my neighborhood/ })[0].getAttribute('href')).toBe('#home-search')
    expect(screen.getByRole('link', { name: /See how NestIQ works/ }).getAttribute('href')).toBe('#how')
  })
})
