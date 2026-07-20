// Shared FitScore reweighting policy — the single source of truth the frontend
// uses so client-side re-ranking matches the backend's score_india exactly.
//
// Missing-pillar policy (identical to backend): a pillar with no numeric
// subscore is EXCLUDED from the weighted average and the weights are
// renormalized over the pillars that remain. A missing pillar is never treated
// as zero, and any missing pillar makes the score "provisional".

export const INDIA_PILLARS = ['affordability', 'safety', 'commute', 'lifestyle', 'air_quality']

export function matchLabel(s) {
  return s >= 85 ? 'Excellent Match' : s >= 75 ? 'Good Match' : 'Fair Match'
}

export function reweight(subscores, weights, pillars = INDIA_PILLARS) {
  const sub = subscores || {}
  const avail = pillars.filter((k) => Number.isFinite(sub[k]))
  const totalW = pillars.reduce((a, k) => a + (weights[k] || 0), 0) || 1
  const wsum = avail.reduce((a, k) => a + (weights[k] || 0), 0) || 1
  const score = Math.round(avail.reduce((a, k) => a + sub[k] * (weights[k] || 0), 0) / wsum)
  const missingPillars = pillars.filter((k) => !Number.isFinite(sub[k]))
  const status = missingPillars.length ? 'provisional' : 'complete'
  const coveragePercent = Math.round((100 * avail.reduce((a, k) => a + (weights[k] || 0), 0)) / totalW)
  const match = matchLabel(score)
  return {
    score,
    missingPillars,
    status,
    coveragePercent,
    match,
    matchDisplay: missingPillars.length ? `Provisional ${match}` : match,
  }
}
