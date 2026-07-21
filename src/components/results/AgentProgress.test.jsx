// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import AgentProgress from './AgentProgress.jsx'

afterEach(cleanup)

describe('AgentProgress startup state', () => {
  it('shows the complete ADK flow before the first server event arrives', () => {
    render(<AgentProgress agents={[]} />)

    expect(screen.getByText('NestIQ Planner')).toBeTruthy()
    expect(screen.getByText('Live Signals Agent')).toBeTruthy()
    expect(screen.getByText('Analytics Agent')).toBeTruthy()
    expect(screen.getByText('Civic Intelligence Agent')).toBeTruthy()
    expect(screen.getByText('Validator Agent')).toBeTruthy()
    expect(screen.getByText('Explainer')).toBeTruthy()
  })

  it('replaces a queued stage with the real streamed state', () => {
    render(<AgentProgress agents={[{
      id: 'live_signals_agent',
      name: 'Live Signals Agent',
      status: 'done',
      msg: 'Live signals ready',
    }]} />)

    expect(screen.getByText('Live signals ready')).toBeTruthy()
    expect(screen.getByText('Waiting for validated locality signals')).toBeTruthy()
  })
})
