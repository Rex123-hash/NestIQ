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
  })
})
