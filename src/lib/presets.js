// Search presets. A preset is a named, transparent prioritization: the client
// only carries the preset id (and prefilled query) — the actual weight profile is
// resolved server-side against an allowlist, so the UI can never inject weights.
export const FAMILY_HEALTH = 'family_health'

export const PRESETS = {
  [FAMILY_HEALTH]: {
    id: FAMILY_HEALTH,
    label: 'Family Health & Resilience',
    subtitle: 'Cleaner air, safety, a hospital and school nearby, short commute',
    query:
      'Find a neighbourhood under ₹25,000 for my asthmatic child and elderly mother, with cleaner air, a hospital and school nearby, and under 30 minutes to work.',
  },
}

export function isPreset(id) {
  return !!id && Object.prototype.hasOwnProperty.call(PRESETS, id)
}

// Build a refresh-safe, shareable /results query string carrying the query and
// (when valid) the preset id. Unknown preset ids are dropped, never forwarded.
export function resultsSearch(query, presetId, city) {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (city) params.set('city', city)
  if (isPreset(presetId)) params.set('preset', presetId)
  const s = params.toString()
  return s ? `?${s}` : ''
}
