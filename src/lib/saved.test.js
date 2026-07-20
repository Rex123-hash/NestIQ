// Saved-locality scoring-version migration: records saved under the old scoring
// model must be detectable and refreshable so they can't keep showing stale
// values (e.g. AQI 500 with an air sub-score of 96).
import { describe, it, expect, beforeEach } from 'vitest'
import { SAVE_VERSION, isOutdated, mergeFresh, refreshSaved, toggleSaved, getSaved } from './saved.js'

// Minimal localStorage/window polyfill so these storage-backed helpers can be
// tested without pulling in a full DOM environment.
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
  globalThis.window = { dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} }
  globalThis.Event = class { constructor(t) { this.type = t } }
})

describe('isOutdated', () => {
  it('flags records with no version', () => {
    expect(isOutdated({ id: 'x' })).toBe(true)
  })
  it('flags records from an older version', () => {
    expect(isOutdated({ id: 'x', scoreVersion: 1 })).toBe(true)
  })
  it('accepts current-version records', () => {
    expect(isOutdated({ id: 'x', scoreVersion: SAVE_VERSION })).toBe(false)
  })
})

describe('toggleSaved stamps the current version', () => {
  it('new saves carry SAVE_VERSION', () => {
    toggleSaved({ id: 'a', fitScore: 80 }, 'delhi-ncr')
    expect(getSaved()[0].scoreVersion).toBe(SAVE_VERSION)
  })
})

describe('mergeFresh', () => {
  it('overwrites stale scoring and stamps the current version', () => {
    const oldRecord = { id: 'a', name: 'A', savedAt: 123, aqi: 500, fitScore: 96, subscores: { air_quality: 96 } }
    const fresh = { aqi: 500, fitScore: 41, matchDisplay: 'Fair Match', subscores: { air_quality: 0 }, criticalRisk: { severity: 'critical' } }
    const merged = mergeFresh(oldRecord, fresh)
    expect(merged.scoreVersion).toBe(SAVE_VERSION)
    expect(merged.fitScore).toBe(41)
    expect(merged.subscores.air_quality).toBe(0) // no longer the bogus 96
    expect(merged.savedAt).toBe(123) // identity preserved
    expect(isOutdated(merged)).toBe(false)
  })
})

describe('refreshSaved', () => {
  it('migrates old-model records in place', () => {
    localStorage.setItem('nestiq_saved', JSON.stringify([
      { id: 'a', name: 'A', aqi: 500, fitScore: 96, subscores: { air_quality: 96 } }, // v1, no version
    ]))
    refreshSaved({ a: { fitScore: 41, subscores: { air_quality: 0 }, aqi: 500 } })
    const [rec] = getSaved()
    expect(rec.scoreVersion).toBe(SAVE_VERSION)
    expect(rec.fitScore).toBe(41)
    expect(isOutdated(rec)).toBe(false)
  })
})
