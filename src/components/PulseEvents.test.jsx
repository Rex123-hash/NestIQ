// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import PulseEvents from './PulseEvents.jsx'

afterEach(cleanup)

describe('PulseEvents', () => {
  it('renders an explicit pending message', () => {
    render(<PulseEvents pulse={{ status: 'pending', items: [] }} pendingLabel="Preparing verified alerts…" />)
    expect(screen.getByText('Preparing verified alerts…')).toBeTruthy()
  })

  it('renders a retry action for source failure', () => {
    const retry = vi.fn()
    render(<PulseEvents pulse={{ status: 'temporarily_unavailable', items: [] }} onRetry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/does not mean nothing is happening/i)).toBeTruthy()
  })

  it('labels a browser wait expiry truthfully and prevents duplicate retry clicks', () => {
    const retry = vi.fn()
    render(<PulseEvents pulse={{ status: 'client_wait_expired', items: [] }} onRetry={retry} />)
    expect(screen.getByText(/server may still be checking/i)).toBeTruthy()
    const button = screen.getByRole('button', { name: /try again/i })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('keeps stale evidence visible while a refresh is running', () => {
    render(<PulseEvents pulse={{
      status: 'available', cacheStatus: 'stale', refreshStatus: 'refreshing',
      items: [{ headline: 'Verified event', summary: 'Details', affectedArea: 'Area',
        category: 'civic', severity: 'moderate', freshness: '2 days ago',
        source: 'Official source', sourceUrl: 'https://example.gov.in' }],
    }} />)
    expect(screen.getByText('Verified event')).toBeTruthy()
    expect(screen.getByText(/while newer sources are checked/i)).toBeTruthy()
  })

  it('keeps stale evidence visible and offers one retry after refresh failure', () => {
    const retry = vi.fn()
    render(<PulseEvents onRetry={retry} pulse={{
      status: 'available', cacheStatus: 'stale', refreshStatus: 'failed',
      items: [{ headline: 'Earlier verified event', summary: 'Details', affectedArea: 'Area',
        category: 'civic', severity: 'moderate', freshness: '2 days ago',
        source: 'Official source', sourceUrl: 'https://example.gov.in' }],
    }} />)
    expect(screen.getByText('Earlier verified event')).toBeTruthy()
    const button = screen.getByRole('button', { name: /try refresh again/i })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
