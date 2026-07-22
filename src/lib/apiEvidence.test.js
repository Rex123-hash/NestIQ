import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiAsk, apiLocalityPulse, apiNeighborhood, apiNeighborhoodForecast, apiRentVerification, apiReviews, prefetchNeighborhood } from './api.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  globalThis.sessionStorage?.clear?.()
})

describe('bounded evidence requests', () => {
  it('ends a stalled Copilot request with an explicit retryable answer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const request = apiAsk('Compare Adyar and Velachery', null, 'chennai')
    await vi.advanceTimersByTimeAsync(75000)
    await expect(request).resolves.toMatchObject({
      mode: 'temporarily_unavailable', evidenceStatus: 'temporarily_unavailable',
    })
  })

  it('keeps a stalled Community Reviews request in an honest pending state', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const request = apiReviews('slow', 'delhi-ncr')
    await vi.advanceTimersByTimeAsync(15000)
    await expect(request).resolves.toMatchObject({ status: 'pending', refreshStatus: 'refreshing' })
  })

  it('keeps a stalled Locality Pulse request pollable', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const request = apiLocalityPulse('slow', 'delhi-ncr')
    await vi.advanceTimersByTimeAsync(15000)
    await expect(request).resolves.toMatchObject({
      status: 'pending', refreshStatus: 'refreshing',
    })
  })

  it('keeps a stalled rent check pollable', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const request = apiRentVerification('slow-rent', 'delhi-ncr')
    await vi.advanceTimersByTimeAsync(15000)
    await expect(request).resolves.toMatchObject({
      status: 'pending', pollable: true, refreshStatus: 'refreshing',
    })
  })

  it('shares one transport for concurrent neighborhood requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'shared-locality' }),
    }))
    const [first, second] = await Promise.all([
      apiNeighborhood('shared-locality', 'delhi-ncr'),
      apiNeighborhood('shared-locality', 'delhi-ncr'),
    ])
    expect(first).toEqual(second)

    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('starts detail, AQI, Pulse, and grounded-rent work together on locality click', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve({
      ok: true,
      json: async () => String(url).includes('rent-verification') || String(url).includes('/pulse?')
        ? ({ status: 'pending', refreshStatus: 'refreshing' })
        : ({ id: 'jagatpura' }),
    })))

    await prefetchNeighborhood('jagatpura', 'jaipur')

    expect(fetch).toHaveBeenCalledTimes(4)
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([
      expect.stringContaining('/api/neighborhood/jagatpura?city=jaipur'),
      expect.stringContaining('/api/neighborhood/jagatpura/air-quality-forecast?city=jaipur'),
      expect.stringContaining('/api/neighborhood/jagatpura/rent-verification?city=jaipur'),
      expect.stringContaining('/api/neighborhood/jagatpura/pulse?city=jaipur'),
    ]))
  })
  it('shares one fast AQI forecast request and caches only real rows', async () => {
    const items = new Map()
    vi.stubGlobal('sessionStorage', {
      getItem: (key) => items.get(key) || null,
      setItem: (key, value) => items.set(key, value),
      clear: () => items.clear(),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'available', forecast: [{ label: '10:00', aqi: 42 }] }),
    }))
    const [first, second] = await Promise.all([
      apiNeighborhoodForecast('shared-aqi', 'jaipur'),
      apiNeighborhoodForecast('shared-aqi', 'jaipur'),
    ])
    expect(first).toEqual(second)
    expect(fetch).toHaveBeenCalledTimes(1)
    await expect(apiNeighborhoodForecast('shared-aqi', 'jaipur')).resolves.toEqual(first)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not cache an unavailable AQI result, so Retry can make a fresh request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'temporarily_unavailable', forecast: [] }),
    }))
    await apiNeighborhoodForecast('retry-aqi', 'jaipur')
    await apiNeighborhoodForecast('retry-aqi', 'jaipur')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('preserves a distinct not-found state for invalid neighborhoods', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(apiNeighborhood('missing', 'delhi-ncr')).resolves.toEqual({ __error: 'not_found' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('recovers from one transient neighborhood request failure', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new TypeError('network interrupted'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'indira-nagar-lko' }) }))

    const request = apiNeighborhood('indira-nagar-lko', 'lucknow')
    await vi.advanceTimersByTimeAsync(350)

    await expect(request).resolves.toEqual({ id: 'indira-nagar-lko' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries one transient server response, then returns the recovered response', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'indira-nagar-lko' }) }))

    const request = apiNeighborhood('indira-nagar-lko', 'lucknow')
    await vi.advanceTimersByTimeAsync(350)

    await expect(request).resolves.toEqual({ id: 'indira-nagar-lko' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry an intentionally aborted request', async () => {
    const abortError = new DOMException('aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    await expect(apiNeighborhood('indira-nagar-lko', 'lucknow')).resolves.toEqual({ __error: 'temporarily_unavailable' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
