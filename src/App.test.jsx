// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App, { RouteFallback } from './App.jsx'

afterEach(cleanup)

describe('application routes', () => {
  it('renders an accessible route-loading state', () => {
    render(<RouteFallback />)
    expect(screen.getByRole('status').textContent).toMatch(/preparing nestiq/i)
  })

  it('shows a recoverable not-found page for unknown routes', () => {
    render(<MemoryRouter initialEntries={['/definitely-not-a-route']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /return home/i }).getAttribute('href')).toBe('/')
  })
})
