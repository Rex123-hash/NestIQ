// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const apiAsk = vi.fn()
const apiTranscribe = vi.fn()
const apiAnalyzeImage = vi.fn()

vi.mock('../lib/api.js', () => ({
  apiAsk: (...args) => apiAsk(...args),
  apiTranscribe: (...args) => apiTranscribe(...args),
  apiAnalyzeImage: (...args) => apiAnalyzeImage(...args),
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
  apiAnalyzeImage.mockReset()
  apiAnalyzeImage.mockResolvedValue({ answer: 'Visible greenery.', mode: 'image_evidence', imageStored: false })
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

  it('submits a Google Speech transcript automatically after recording stops', async () => {
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
      await waitFor(() => expect(apiAsk).toHaveBeenCalledWith('compare clean air localities', null, 'delhi-ncr', []))
      expect(screen.getByLabelText('Ask NestIQ Copilot').value).toBe('')
      expect(stopTrack).toHaveBeenCalled()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Start voice input' })).toBeTruthy())
    } finally {
      delete window.MediaRecorder
      delete navigator.mediaDevices
    }
  })

  it('renders Gemini bold markers as semantic bold text', async () => {
    apiAsk.mockResolvedValue({ answer: 'This is **Chota Imambara** in Lucknow.', mode: 'city_evidence' })
    render(<MemoryRouter><AskNestIQ /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Ask NestIQ Copilot'), { target: { value: 'What is this?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
    const bold = await screen.findByText('Chota Imambara')
    expect(bold.tagName).toBe('STRONG')
    expect(screen.queryByText(/\*\*Chota Imambara\*\*/)).toBeNull()
  })

  it('places Recent Questions before Popular Questions', () => {
    render(<MemoryRouter><AskNestIQ /></MemoryRouter>)
    const recentHeading = screen.getByText('Recent Questions')
    const popularHeading = screen.getByText('Popular Questions')
    expect(recentHeading.compareDocumentPosition(popularHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the newest question-and-answer exchange first', async () => {
    apiAsk
      .mockResolvedValueOnce({ answer: 'First answer', mode: 'city_evidence' })
      .mockResolvedValueOnce({ answer: 'Second answer', mode: 'city_evidence' })
    render(<MemoryRouter><AskNestIQ /></MemoryRouter>)
    const composer = screen.getByLabelText('Ask NestIQ Copilot')
    fireEvent.change(composer, { target: { value: 'First question' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
    await screen.findByText('First answer')
    fireEvent.change(composer, { target: { value: 'Second question' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
    await screen.findByText('Second answer')

    const visibleText = screen.getByLabelText('Copilot conversation').textContent
    expect(visibleText.indexOf('Second question')).toBeLessThan(visibleText.indexOf('Second answer'))
    expect(visibleText.indexOf('Second answer')).toBeLessThan(visibleText.indexOf('First question'))
    expect(visibleText.indexOf('First question')).toBeLessThan(visibleText.indexOf('First answer'))
  })

  it('previews and analyzes an attached image without persisting it', async () => {
    const createObjectURL = vi.fn(() => 'blob:preview')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    render(<MemoryRouter><AskNestIQ /></MemoryRouter>)
    const file = new File(['image'], 'street.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Choose an image'), { target: { files: [file] } })
    expect(await screen.findByAltText('Selected upload preview')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Ask NestIQ Copilot'), { target: { value: 'Is this street walkable?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
    await waitFor(() => expect(apiAnalyzeImage).toHaveBeenCalledWith(file, 'Is this street walkable?', 'delhi-ncr'))
    expect(await screen.findByText('Image evidence')).toBeTruthy()
    expect(screen.getByText('Image: street.png')).toBeTruthy()
  })
})
