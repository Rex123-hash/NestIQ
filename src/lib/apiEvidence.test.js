import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiNeighborhood, apiReviews } from './api.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  globalThis.sessionStorage?.clear?.()
})

describe('bounded evidence requests', () => {
  it('turns a stalled Community Reviews request into an honest unavailable state', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const request = apiReviews('slow', 'delhi-ncr')
    await vi.advanceTimersByTimeAsync(15000)
    await expect(request).resolves.toMatchObject({ status: 'temporarily_unavailable' })
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
