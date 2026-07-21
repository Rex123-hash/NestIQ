// Aggregating per-locality pulse results for the Watchlist.
//
// Bug this pins: "no_evidence" used to be the FALLBACK branch, so any unexpected or
// missing response silently became the most confident possible claim — the UI told the
// user "No important civic alerts ... This is different from a source failure" even when
// the source had in fact failed. Confident claims must require positive evidence;
// anything unknown must degrade to "temporarily unavailable".
import { describe, it, expect, vi } from 'vitest'
import { aggregateWatchlistPulse, pollPulse, runPulseQueue } from './watchlistPulse.js'

const loc = (name) => ({ name })
const item = (severity) => ({ severity, headline: 'x' })

describe('aggregateWatchlistPulse', () => {
  it('reports available and keeps only moderate/high items, tagged by locality', () => {
    const out = aggregateWatchlistPulse([
      { n: loc('Saket'), p: { status: 'available', items: [item('high'), item('low')] } },
    ])
    expect(out.status).toBe('available')
    expect(out.items).toHaveLength(1)
    expect(out.items[0]._locality).toBe('Saket')
  })

  it('reports pending while any locality is still loading', () => {
    const out = aggregateWatchlistPulse([
      { n: loc('A'), p: { status: 'pending' } },
      { n: loc('B'), p: { status: 'no_evidence' } },
    ])
    expect(out.status).toBe('pending')
  })

  it('reports no_evidence only when a source POSITIVELY confirmed nothing', () => {
    const out = aggregateWatchlistPulse([
      { n: loc('A'), p: { status: 'no_evidence' } },
    ])
    expect(out.status).toBe('no_evidence')
  })

  it('treats a successful fetch with no severe items as no_evidence', () => {
    const out = aggregateWatchlistPulse([
      { n: loc('A'), p: { status: 'available', items: [item('low')] } },
    ])
    expect(out.status).toBe('no_evidence')
    expect(out.items).toEqual([])
  })

  it('reports temporarily_unavailable when the source failed', () => {
    const out = aggregateWatchlistPulse([
      { n: loc('A'), p: { status: 'temporarily_unavailable' } },
    ])
    expect(out.status).toBe('temporarily_unavailable')
  })

  it('never claims "no alerts" for an unknown status', () => {
    const out = aggregateWatchlistPulse([
      { n: loc('A'), p: { status: 'something_new' } },
    ])
    expect(out.status).toBe('temporarily_unavailable')
  })

  it('never claims "no alerts" for a missing or null response', () => {
    expect(aggregateWatchlistPulse([{ n: loc('A'), p: null }]).status)
      .toBe('temporarily_unavailable')
    expect(aggregateWatchlistPulse([{ n: loc('A'), p: undefined }]).status)
      .toBe('temporarily_unavailable')
  })

  it('does not let one failure hide another locality\'s real alerts', () => {
    const out = aggregateWatchlistPulse([
      { n: loc('A'), p: { status: 'temporarily_unavailable' } },
      { n: loc('B'), p: { status: 'available', items: [item('high')] } },
    ])
    expect(out.status).toBe('available')
    expect(out.items).toHaveLength(1)
  })

  it('prefers the honest unavailable state when some failed and others found nothing', () => {
    // A partial failure means we genuinely do not know, so do not claim "nothing happened".
    const out = aggregateWatchlistPulse([
      { n: loc('A'), p: { status: 'temporarily_unavailable' } },
      { n: loc('B'), p: { status: 'no_evidence' } },
    ])
    expect(out.status).toBe('temporarily_unavailable')
  })

  it('handles an empty list without claiming a failure', () => {
    expect(aggregateWatchlistPulse([]).status).toBe('no_evidence')
  })
})

describe('runPulseQueue', () => {
  it('never runs more than two locality jobs at once and preserves order', async () => {
    let active = 0
    let peak = 0
    const localities = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name }))
    const results = await runPulseQueue(localities, async (n) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return { status: 'no_evidence', name: n.name }
    }, 2)
    expect(peak).toBe(2)
    expect(results.map(({ n }) => n.name)).toEqual(['A', 'B', 'C', 'D', 'E'])
  })
})

describe('pollPulse', () => {
  const noWait = async () => {}

  it('publishes pending then available and stops', async () => {
    const seen = []
    const fetch = vi.fn()
      .mockResolvedValueOnce({ status: 'pending', items: [] })
      .mockResolvedValueOnce({ status: 'available', items: [{ headline: 'x' }] })
    const result = await pollPulse(fetch, { delay: noWait, onUpdate: (x) => seen.push(x.status) })
    expect(result.status).toBe('available')
    expect(seen).toEqual(['pending', 'available'])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps polling while stale evidence refreshes', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ status: 'available', cacheStatus: 'stale', refreshStatus: 'refreshing', items: [] })
      .mockResolvedValueOnce({ status: 'available', items: [{ headline: 'fresh' }] })
    const result = await pollPulse(fetch, { delay: noWait })
    expect(result.items[0].headline).toBe('fresh')
    expect(fetch).toHaveBeenCalledTimes(2)
  })


  it.each(['no_evidence', 'temporarily_unavailable'])('stops immediately on %s', async (status) => {
    const fetch = vi.fn().mockResolvedValue({ status, items: [] })
    expect((await pollPulse(fetch, { delay: noWait })).status).toBe(status)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('returns a truthful client-only timeout at the bounded deadline', async () => {
    let elapsed = 0
    const result = await pollPulse(async () => ({ status: 'pending', items: [] }), {
      deadline: 12, interval: 4, now: () => elapsed,
      delay: async (_signal, ms) => { elapsed += ms },
    })
    expect(result.status).toBe('client_wait_expired')
  })

  it('sends refresh only on the first request and honours cancellation', async () => {
    const controller = new AbortController()
    const flags = []
    const result = await pollPulse(async (refresh) => {
      flags.push(refresh)
      controller.abort()
      return { status: 'pending' }
    }, { signal: controller.signal, refresh: true, delay: noWait })
    expect(flags).toEqual([true])
    expect(result.status).toBe('client_wait_expired')
  })
})
