// Aggregates per-locality pulse responses into one Watchlist status.
//
// Honesty rule: a confident claim requires positive evidence. "no_evidence" tells the
// user "nothing is happening, and this is NOT a source failure" — the strongest claim
// this component can make — so it is only produced when a source actually came back and
// confirmed it. Anything unknown, missing or unrecognised degrades to
// "temporarily_unavailable", because not knowing is not the same as nothing happening.
//
// (Previously "no_evidence" was the fallback branch, so a failed or unexpected response
// silently rendered as "no alerts ... different from a source failure".)

const SEVERE = new Set(['moderate', 'high'])

// Run expensive locality jobs with a small worker pool. Each worker keeps its
// slot until that locality reaches a terminal state, so a fast `pending`
// response cannot accidentally start every Gemini job at once.
export async function runPulseQueue(localities, fetchUntilTerminal, concurrency = 2) {
  const source = localities || []
  const results = new Array(source.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < source.length) {
      const index = nextIndex++
      const n = source[index]
      results[index] = { n, p: await fetchUntilTerminal(n) }
    }
  }
  const workerCount = Math.min(Math.max(1, concurrency), source.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

export function aggregateWatchlistPulse(results) {
  const items = []
  let anyPending = false
  let anyUnavailable = false
  let anyConfirmed = false // a source positively answered: available or no_evidence
  let anyUnknown = false

  for (const { n, p } of results || []) {
    const status = p?.status
    if (status === 'pending') {
      anyPending = true
    } else if (status === 'temporarily_unavailable') {
      anyUnavailable = true
    } else if (status === 'available') {
      anyConfirmed = true
      for (const it of p.items || []) {
        if (SEVERE.has(it.severity)) items.push({ ...it, _locality: n?.name })
      }
    } else if (status === 'no_evidence') {
      anyConfirmed = true
    } else {
      // Missing, null or an unrecognised status: we do not know.
      anyUnknown = true
    }
  }

  if (items.length) return { status: 'available', items }
  if (anyPending) return { status: 'pending', items: [] }
  // Any failure or unknown response means we cannot honestly say "nothing happened".
  if (anyUnavailable || anyUnknown) return { status: 'temporarily_unavailable', items: [] }
  if (anyConfirmed) return { status: 'no_evidence', items: [] }
  // Nothing was watched at all.
  return { status: 'no_evidence', items: [] }
}
