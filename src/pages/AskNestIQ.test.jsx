// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const apiAsk = vi.fn()
const apiTranscribe = vi.fn()

vi.mock('../lib/api.js', () => ({
  apiAsk: (...args) => apiAsk(...args),
  apiTranscribe: (...args) => apiTranscribe(...args),
  apiNeighborhoods: vi.fn().mockResolvedValue([]),
}))

vi.mock('../components/layout/CityPicker.jsx', () => ({
  default: () => <div data-testid="city-picker" />,
}))

import AskNestIQ from './AskNestIQ.jsx'

beforeEach(() => {
  localStorage.clear()
  apiAsk.mockReset()
  apiAsk.mockResolvedValue({ answer: 'Grounded answer', sources: ['Test source'] })
  apiTranscribe.mockReset()
  apiTranscribe.mockResolvedValue({ transcript: 'compare clean air localities', audioStored: false })
})

afterEach(cleanup)

describe('NestIQ Copilot composer', () => {
  it('shows and executes an explicit clear action', () => {
    render(<MemoryRouter><AskNestIQ /></MemoryRouter>)
    const composer = screen.getByLabelText('Ask NestIQ Copilot')
    fireEvent.change(composer, { target: { value: 'Compare clean-air areas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear question' }))
    expect(composer.value).toBe('')
    expect(document.activeElement).toBe(composer)
  })

  it('submits on Enter but keeps Shift+Enter available for a new line', async () => {
    render(<MemoryRouter><AskNestIQ /></MemoryRouter>)
    const composer = screen.getByLabelText('Ask NestIQ Copilot')
    fireEvent.change(composer, { target: { value: 'Best air quality?' } })
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true })
    expect(apiAsk).not.toHaveBeenCalled()
    fireEvent.keyDown(composer, { key: 'Enter' })
    await waitFor(() => expect(apiAsk).toHaveBeenCalledWith('Best air quality?', null, 'delhi-ncr', []))
  })

  it('renders tool receipts, actions and executable follow-up questions', async () => {
    apiAsk
      .mockResolvedValueOnce({
        answer: 'Powai is the strongest match.',
        mode: 'city_analytics',
        sources: ['BigQuery (NL→SQL)'],
        tools: [
          { id: 'bigquery', label: 'BigQuery analytics' },
          { id: 'gemini', label: 'Gemini explanation' },
        ],
        actions: [{ type: 'view_locality', localityId: 'powai', label: 'View Powai' }],
        followUps: ['Compare the top two options on rent and air quality.'],
      })
      .mockResolvedValueOnce({ answer: 'Follow-up answer', mode: 'city_analytics' })

    render(<MemoryRouter><AskNestIQ /></MemoryRouter>)
    const composer = screen.getByLabelText('Ask NestIQ Copilot')
    fireEvent.change(composer, { target: { value: 'Which locality is best?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))

    expect(await screen.findByText('City data analysis')).toBeTruthy()
    expect(screen.getByText('BigQuery analytics')).toBeTruthy()
    expect(screen.getByRole('link', { name: /View Powai/ }).getAttribute('href')).toBe('/neighborhood/powai')

    fireEvent.click(screen.getByRole('button', { name: 'Compare the top two options on rent and air quality.' }))
    await waitFor(() => expect(apiAsk).toHaveBeenLastCalledWith(
      'Compare the top two options on rent and air quality.',
      null,
      'delhi-ncr',
      [
        { role: 'user', content: 'Which locality is best?' },
        { role: 'assistant', content: 'Powai is the strongest match.' },
      ],
    ))
  })

  it('starts a new in-memory conversation without clearing recent questions', async () => {
    render(<MemoryRouter><AskNestIQ /></MemoryRouter>)
    const composer = screen.getByLabelText('Ask NestIQ Copilot')
    fireEvent.change(composer, { target: { value: 'Where is rent affordable?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
    await waitFor(() => expect(screen.getAllByText('Grounded answer')).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: /New conversation/ }))
    expect(screen.queryByLabelText('Copilot conversation')).toBeNull()
    expect(screen.getByText('Where is rent affordable?')).toBeTruthy()
  })

  it('places a Google Speech transcript into the editable composer without submitting', async () => {
    let recorder
    class MockMediaRecorder {
      static isTypeSupported() {
        return true
      }
      constructor(_stream, options) {
        recorder = this
        this.mimeType = options?.mimeType || 'audio/webm'
        this.state = 'inactive'
      }
      start() {
        this.state = 'recording'
        this.onstart?.()
      }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) })
        this.onstop?.()
      }
    }
    const stopTrack = vi.fn()
    window.MediaRecorder = MockMediaRecorder
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) },
    })
    try {
      render(<MemoryRouter><AskNestIQ /></MemoryRouter>)
      fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Stop voice input' })).toBeTruthy())
      fireEvent.click(screen.getByRole('button', { name: 'Stop voice input' }))
      await waitFor(() => expect(apiTranscribe).toHaveBeenCalled())
      expect(screen.getByLabelText('Ask NestIQ Copilot').value).toBe('compare clean air localities')
      expect(apiAsk).not.toHaveBeenCalled()
      expect(stopTrack).toHaveBeenCalled()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Start voice input' })).toBeTruthy())
    } finally {
      delete window.MediaRecorder
      delete navigator.mediaDevices
    }
  })
})
