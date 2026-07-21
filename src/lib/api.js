// Thin client for the NestIQ backend. Every call returns null on failure so
// callers can fall back to mock data — the UI never hard-breaks.
import { isPreset } from './presets.js'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
// Optional development-only origin for grounded community reviews. This lets a
// local UI use the deployed Cloud Run service account when the developer's ADC
// identity cannot invoke Vertex AI, while every scoring/AQI request still goes
// to the local backend. Production leaves this unset and continues using BASE.
const REVIEWS_BASE = import.meta.env.VITE_REVIEWS_API_URL || BASE
const reviewRequests = new Map()
const SNAPSHOT_TTL = 30 * 60 * 1000
const RENT_TTL = 24 * 60 * 60 * 1000
const EVIDENCE_TIMEOUT = 15000

function stored(storage, key, ttl) {
  try {
    const item = JSON.parse(storage.getItem(key))
    return item && Date.now() - item.savedAt < ttl ? item.value : null
  } catch {
    return null
  }
}

function remember(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }))
  } catch {
    // Storage can be disabled or full; network behavior remains unchanged.
  }
  return value
}

function sessionValue(key, ttl = SNAPSHOT_TTL) {
  return typeof sessionStorage === 'undefined' ? null : stored(sessionStorage, key, ttl)
}

function rememberSession(key, value) {
  return typeof sessionStorage === 'undefined' ? value : remember(sessionStorage, key, value)
}

async function jget(path) {
  const r = await fetch(BASE + path)
  if (!r.ok) throw new Error(`GET ${path} ${r.status}`)
  return r.json()
}
async function jpost(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`POST ${path} ${r.status}`)
  return r.json()
}

async function timedJson(base, path, timeout = EVIDENCE_TIMEOUT, externalSignal) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (externalSignal?.aborted) controller.abort()
  else externalSignal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(base + path, { signal: controller.signal })
    if (!response.ok) {
      const error = new Error(`GET ${path} ${response.status}`)
      error.status = response.status
      throw error
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abort)
  }
}

export async function apiCities() {
  try {
    return await jget('/api/cities')
  } catch (e) {
    console.warn('[api] cities fallback:', e.message)
    return null
  }
}

let _configCache = null
export async function apiConfig() {
  if (_configCache) return _configCache
  try {
    _configCache = await jget('/api/config')
    return _configCache
  } catch (e) {
    console.warn('[api] config fallback:', e.message)
    return null
  }
}

export async function apiNeighborhoods(city) {
  const key = `nestiq:snapshot:city:${city}`
  const cached = sessionValue(key)
  if (cached) return cached
  try {
    return rememberSession(key, (await timedJson(BASE, `/api/neighborhoods?city=${encodeURIComponent(city)}`)).results)
  } catch (e) {
    console.warn('[api] neighborhoods fallback:', e.message)
    return null
  }
}

export async function apiSearch(query, city, preset) {
  try {
    return await jpost('/api/search', { query, city, ...(isPreset(preset) ? { preset } : {}) })
  } catch (e) {
    console.warn('[api] search fallback:', e.message)
    return null
  }
}

// SSE stream of the agent fan-out for a search. Returns the EventSource so the
// caller can close it. Falls back silently — callers handle onError. An optional
// validated preset id is forwarded so the applied prioritization streams too.
export function streamSearch(query, city, { onAgent, onFinal, onError, preset } = {}) {
  try {
    const presetParam = isPreset(preset) ? `&preset=${encodeURIComponent(preset)}` : ''
    const url = `${BASE}/api/search/stream?q=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}${presetParam}`
    const es = new EventSource(url)
    es.addEventListener('agent', (e) => onAgent?.(JSON.parse(e.data)))
    es.addEventListener('final', (e) => {
      onFinal?.(JSON.parse(e.data))
      es.close()
    })
    es.onerror = () => {
      onError?.()
      es.close()
    }
    return es
  } catch (e) {
    console.warn('[api] streamSearch failed:', e.message)
    onError?.()
    return null
  }
}

export async function apiNeighborhood(id, city) {
  const key = `nestiq:snapshot:detail:${city}:${id}`
  const cached = sessionValue(key)
  if (cached) return cached
  try {
    return rememberSession(key, await timedJson(BASE, `/api/neighborhood/${id}?city=${encodeURIComponent(city)}`))
  } catch (e) {
    console.warn('[api] neighborhood fallback:', e.message)
    return { __error: e.status === 404 ? 'not_found' : 'temporarily_unavailable' }
  }
}

export async function apiReviews(id, city, refresh = false) {
  const key = `${city}:${id}`
  if (!refresh && reviewRequests.has(key)) return reviewRequests.get(key)
  const request = (async () => {
    try {
      const path = `/api/neighborhood/${id}/reviews?city=${encodeURIComponent(city)}${refresh ? '&refresh=true' : ''}`
      return await timedJson(REVIEWS_BASE, path)
    } catch (e) {
      console.warn('[api] reviews fallback:', e.message)
      reviewRequests.delete(key)
      return { status: 'temporarily_unavailable', summary: '', citations: [], limitation: 'Verified community sources did not respond in time.' }
    }
  })()
  if (!refresh) reviewRequests.set(key, request)
  try {
    return await request
  } finally {
    // De-duplicate only the active HTTP request; pending must remain pollable.
    if (reviewRequests.get(key) === request) reviewRequests.delete(key)
  }
}

export async function apiLocalityPulse(id, city, refresh = false, signal) {
  try {
    const path = `/api/neighborhood/${id}/pulse?city=${encodeURIComponent(city)}${refresh ? '&refresh=true' : ''}`
    return await timedJson(REVIEWS_BASE, path, EVIDENCE_TIMEOUT, signal)
  } catch (e) {
    console.warn('[api] locality pulse unavailable:', e.message)
    return { status: 'temporarily_unavailable', items: [], citations: [] }
  }
}

// Additive essential-services proximity (hospitals, doctors, pharmacies, schools,
// universities) for a locality. Shown for context on the detail page; never part
// of the FitScore. Fails soft to an honest unavailable state, never a fake count.
export async function apiEssentials(id, city) {
  try {
    const path = `/api/neighborhood/${id}/essentials?city=${encodeURIComponent(city)}`
    const r = await fetch(BASE + path)
    if (!r.ok) throw new Error(`GET ${path} ${r.status}`)
    return await r.json()
  } catch (e) {
    console.warn('[api] essentials unavailable:', e.message)
    return { status: 'temporarily_unavailable', categories: {}, labels: {}, failedCategories: [] }
  }
}

// City-wide grounded pulse for the Alerts City Pulse view. Reuses the same
// backend pulse pipeline as apiLocalityPulse, scoped to the whole city.
export async function apiCityPulse(city, refresh = false, signal) {
  try {
    const path = `/api/city/${encodeURIComponent(city)}/pulse${refresh ? '?refresh=true' : ''}`
    return await timedJson(REVIEWS_BASE, path, EVIDENCE_TIMEOUT, signal)
  } catch (e) {
    console.warn('[api] city pulse unavailable:', e.message)
    return { status: 'temporarily_unavailable', items: [], citations: [] }
  }
}

export async function apiCivicKnowledge(id, city, question) {
  try {
    const path = `/api/neighborhood/${id}/civic-knowledge?city=${encodeURIComponent(city)}&q=${encodeURIComponent(question)}`
    const r = await fetch(BASE + path)
    if (!r.ok) throw new Error(`GET ${path} ${r.status}`)
    return await r.json()
  } catch (e) {
    console.warn('[api] civic knowledge unavailable:', e.message)
    return { status: 'temporarily_unavailable', answer: '', citations: [], retrievedCount: 0 }
  }
}

export async function apiRentVerification(id, city, refresh = false, persist = true) {
  const cacheKey = `nestiq:rent-verification:${city}:${id}`
  const path = `/api/neighborhood/${id}/rent-verification?city=${encodeURIComponent(city)}${refresh ? '&refresh=true' : ''}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EVIDENCE_TIMEOUT)
  try {
    const r = await fetch(REVIEWS_BASE + path, { signal: controller.signal })
    if (r.status === 404) return {
      status: 'deployment_required',
      limitation: 'The Rent Verification Agent is ready locally but is not available on the deployed backend yet.',
    }
    if (!r.ok) throw new Error(`GET ${path} ${r.status}`)
    let result = await r.json()
    if (persist && result.status === 'available' && typeof localStorage !== 'undefined') remember(localStorage, cacheKey, result)
    return result
  } catch (e) {
    console.warn('[api] rent verification fallback:', e.message)
    if (e.name === 'AbortError') return {
      status: 'pending',
      pollable: false,
      limitation: 'The source check is continuing. You can keep browsing and check again shortly.',
    }
    return {
      status: 'temporarily_unavailable',
      limitation: 'The verification service could not be reached. The previous evidence remains available.',
    }
  } finally {
    clearTimeout(timer)
  }
}

export function getCachedRentVerification(id, city) {
  return typeof localStorage === 'undefined' ? null : stored(localStorage, `nestiq:rent-verification:${city}:${id}`, RENT_TTL)
}

// Warm a locality's slow, evidence-only endpoints the moment the user shows intent
// (hovering or clicking a card), so the detail page opens with data already in flight
// instead of starting cold. The grounded pulse is the slow one: it kicks off a
// background source check on the server, and starting that early is most of the win.
//
// Every call below already fails soft and is cached (sessionStorage for the detail
// payload, in-flight de-dup for reviews, server-side caches for the rest), so a
// prefetch that is never used costs nothing beyond one warm request.
const prefetched = new Map()
const PREFETCH_TTL = 60 * 1000

export function prefetchLocality(id, city) {
  if (!id || !city) return
  const key = `${city}:${id}`
  const last = prefetched.get(key)
  // Do not re-fire on every mousemove over the same card.
  if (last && Date.now() - last < PREFETCH_TTL) return
  prefetched.set(key, Date.now())

  // Fire and forget. Errors are handled inside each helper.
  apiNeighborhood(id, city)
  apiLocalityPulse(id, city)
  apiEssentials(id, city)
  apiReviews(id, city)
  apiRentVerification(id, city, false, false)
}

export async function apiAsk(question, neighborhoodId, city, history = []) {
  try {
    return await jpost('/api/ask', { question, neighborhoodId, city, history: history.slice(-6) })
  } catch (e) {
    console.warn('[api] ask fallback:', e.message)
    return null
  }
}

export async function apiTranscribe(audioBlob, durationMs, languageCode = 'en-IN') {
  try {
    const path = `/api/copilot/transcribe?durationMs=${encodeURIComponent(Math.round(durationMs))}&languageCode=${encodeURIComponent(languageCode)}`
    const response = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
      body: audioBlob,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.detail || `Voice transcription failed (${response.status})`)
    }
    return await response.json()
  } catch (error) {
    console.warn('[api] voice transcription unavailable:', error.message)
    return {
      status: 'temporarily_unavailable',
      transcript: '',
      limitation: error.message || 'Voice transcription is temporarily unavailable. You can continue typing.',
    }
  }
}

export async function apiAnalyzeImage(imageFile, question, city) {
  try {
    const path = `/api/copilot/analyze-image?city=${encodeURIComponent(city)}&question=${encodeURIComponent(question || '')}`
    const response = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': imageFile.type },
      body: imageFile,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.detail || `Image analysis failed (${response.status})`)
    }
    return await response.json()
  } catch (error) {
    console.warn('[api] image analysis unavailable:', error.message)
    return {
      answer: '',
      status: 'temporarily_unavailable',
      limitation: error.message || 'Image analysis is temporarily unavailable.',
    }
  }
}
