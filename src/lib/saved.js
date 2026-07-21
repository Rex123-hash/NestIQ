// localStorage-backed "saved localities" store. Persists the display snapshot
// so the Saved page works offline and across cities without a refetch.
import { useEffect, useState } from 'react'

const KEY = 'nestiq_saved'
const EVT = 'nestiq-saved-change'

// Bump when the scoring model changes in a way that makes previously-saved
// snapshots misleading. v2 = absolute CPCB air-health scoring (records saved
// under v1 could show AQI 500 with an air sub-score of 96, so they must not be
// shown as authoritative until refreshed against the current backend).
// v3 = Phase 2 evidence envelopes + removal of fabricated commute/amenity
// fallbacks, so v2 snapshots must refresh before being treated as current.
export const SAVE_VERSION = 3

export function isOutdated(n) {
  return !n || n.scoreVersion !== SAVE_VERSION
}

// Scoring/provenance fields that a live refresh should overwrite on a saved
// snapshot (identity fields like id/name/accent/savedAt are preserved).
const SCORE_FIELDS = [
  'aqi', 'aqiCategory', 'rent', 'rentDisplay', 'commuteMin', 'subscores', 'fitScore',
  'match', 'matchDisplay', 'criticalRisk', 'healthQualifier', 'airHealthBand',
  'airHealthScore', 'airDataStatus', 'airStale', 'fitScoreDataStatus', 'isProvisional',
  'missingPillars', 'coveragePercent', 'amenity_count', 'amenity_breakdown', 'evidence',
  // Keep the Places photo resource name current without storing an expiring URL.
  'photo',
]

export function mergeFresh(saved, fresh) {
  const out = { ...saved, scoreVersion: SAVE_VERSION }
  for (const k of SCORE_FIELDS) if (k in fresh) out[k] = fresh[k]
  return out
}

export function getSaved() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

// Update stored snapshots with fresh adapted localities (keyed by id) and stamp
// the current scoring version, so old-model records stop showing stale values.
export function refreshSaved(freshById) {
  const list = getSaved()
  let changed = false
  const next = list.map((n) => {
    const f = freshById[n.id]
    if (!f) return n
    changed = true
    return mergeFresh(n, f)
  })
  if (changed) write(next)
  return next
}

function write(list) {
  localStorage.setItem(KEY, JSON.stringify(list))
  window.dispatchEvent(new Event(EVT))
}

export function isSaved(id) {
  return getSaved().some((n) => n.id === id)
}

export function toggleSaved(n, city) {
  const list = getSaved()
  const i = list.findIndex((x) => x.id === n.id)
  if (i >= 0) list.splice(i, 1)
  else list.unshift({ ...n, city, savedAt: Date.now(), scoreVersion: SAVE_VERSION })
  write(list)
  return isSaved(n.id)
}

export function removeSaved(id) {
  write(getSaved().filter((n) => n.id !== id))
}

// Subscribe a component to the saved list (updates on any change, any tab).
export function useSaved() {
  const [list, setList] = useState(getSaved)
  useEffect(() => {
    const sync = () => setList(getSaved())
    window.addEventListener(EVT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return list
}
