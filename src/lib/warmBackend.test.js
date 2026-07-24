import { afterEach, describe, expect, it, vi } from 'vitest'
import { warmBackend } from './api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('warmBackend', () => {
  it('pings the backend health endpoint once with a GET', () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    warmBackend()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/health$/)
    expect(options).toMatchObject({ method: 'GET' })
  })

  it('never throws or leaks a rejection when the ping fails (fire-and-forget)', async () => {
    // A cold or unreachable backend must never surface an error at app boot.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))))

    expect(() => warmBackend()).not.toThrow()
    // Flush the microtask queue: the internal .catch() must absorb the rejection.
    await Promise.resolve()
  })

  it('never throws when fetch itself throws synchronously', () => {
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('boom')
    }))

    expect(() => warmBackend()).not.toThrow()
  })
})
