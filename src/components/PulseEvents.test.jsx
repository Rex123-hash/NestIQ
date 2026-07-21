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
})
