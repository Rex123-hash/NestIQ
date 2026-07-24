// Thin client for the NestIQ backend. Every call returns null on failure so
// callers can fall back to mock data — the UI never hard-breaks.
import { isPreset } from './presets.js'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
// Optional development-only origin for grounded community reviews. This lets a
// local UI use the deployed Cloud Run service account when the developer's ADC
// identity cannot invoke Vertex AI, while every scoring/AQI request still goes
// to the local backend. Production leaves this unset and continues using BASE.
const REVIEWS_BASE = import.meta.env.VITE_REVIEWS_API_URL || BASE

// Fire-and-forget backend warm-up. Called once at app boot so a cold-scaled
// Cloud Run container starts booting — and runs its startup hook that pre-warms
// the default city — while the user is still reading the landing page. It is
// never awaited and swallows every error, so it can never affect the UI.
export function warmBackend() {
  try {
    fetch(`${BASE}/api/health`, { method: 'GET', keepalive: true }).catch(() => {})
  } catch {
    /* best-effort only */
  }
}

const reviewRequests = new Map()
const snapshotRequests = new Map()
const evidenceRequests = new Map()
const SNAPSHOT_TTL = 30 * 60 * 1000
const RENT_TTL = 24 * 60 * 60 * 1000
const EVIDENCE_TIMEOUT = 15000
const DETAIL_TIMEOUT = 75000
const FORECAST_TIMEOUT = 20000
const ASK_TIMEOUT = 75000
const TRANSIENT_HTTP = new Set([408, 429, 500, 502, 503, 504])
const RETRY_DELAY_MS = 350

const retryDelay = () => new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))

async function resilientFetch(url, options = {}) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, options)
      if (attempt === 0 && TRANSIENT_HTTP.has(response.status)) {
        await retryDelay()
        continue
      }
      return response
    } catch (error) {
      if (error?.name === 'AbortError' || attempt === 1) throw error
      lastError = error
      await retryDelay()
    }
  }
  throw lastError
}

function singleFlight(requests, key, load) {
  if (requests.has(key)) return requests.get(key)
  const request = Promise.resolve().then(load)
  requests.set(key, request)
  const clear = () => {
    if (requests.get(key) === request) requests.delete(key)
  }
  request.then(clear, clear)
  return request
}

function abortError() {
  if (typeof DOMException !== 'undefined') return new DOMException('aborted', 'AbortError')
  const error = new Error('aborted')
  error.name = 'AbortError'
  return error
}

function waitForRequest(request, signal) {
  if (!signal) return request
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(abortError())
    }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    request.then(
      (value) => { cleanup(); resolve(value) },
      (error) => { cleanup(); reject(error) },
    )
  })
}

function evidenceJson(base, path, signal) {
  // Keep one transport request alive even if a React view unmounts. A new view
  // can join it instead of restarting the same cold Cloud Run/Firestore read.
  const key = base + path
  const request = singleFlight(evidenceRequests, key, () => timedJson(base, path))
  return waitForRequest(request, signal)
}

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
  const r = await resilientFetch(BASE + path)
  if (!r.ok) throw new Error(`GET ${path} ${r.status}`)
  return r.json()
}
async function jpost(path, body, timeout = ASK_TIMEOUT) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)
  try {
    const r = await resilientFetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!r.ok) throw new Error(`POST ${path} ${r.status}`)
    return r.json()
  } catch (error) {
    if (timedOut && error?.name === 'AbortError') {
      const timeoutError = new Error(`POST ${path} timed out`)
      timeoutError.name = 'TimeoutError'
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function timedJson(base, path, timeout = EVIDENCE_TIMEOUT, externalSignal) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  let timedOut = false
  if (externalSignal?.aborted) controller.abort()
  else externalSignal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)
  try {
    const response = await resilientFetch(base + path, { signal: controller.signal })
    if (!response.ok) {
      const error = new Error(`GET ${path} ${response.status}`)
      error.status = response.status
      throw error
    }
    return await response.json()
  } catch (error) {
    if (timedOut && error?.name === 'AbortError') {
      const timeoutError = new Error(`GET ${path} timed out`)
      timeoutError.name = 'TimeoutError'
      throw timeoutError
    }
    throw error
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
  return singleFlight(snapshotRequests, 'config', async () => {
    try {
      _configCache = await jget('/api/config')
      return _configCache
    } catch (e) {
      console.warn('[api] config fallback:', e.message)
      return null
    }
  })
}

export async function apiNeighborhoods(city) {
  const key = `nestiq:snapshot:city:${city}`
  const cached = sessionValue(key)
  if (cached) return cached
  return singleFlight(snapshotRequests, key, async () => {
    try {
      return rememberSession(key, (await timedJson(BASE, `/api/neighborhoods?city=${encodeURIComponent(city)}`)).results)
    } catch (e) {
      console.warn('[api] neighborhoods fallback:', e.message)
      return null
    }
  })
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
  const path = `/api/neighborhood/${id}?city=${encodeURIComponent(city)}`
  return singleFlight(snapshotRequests, key, async () => {
    try {
      // The page renders a city-snapshot shell immediately, so the richer
      // explanation can finish in the background instead of being aborted at
      // the evidence-poll timeout. AQI uses the dedicated fast route below.
      return rememberSession(key, await timedJson(BASE, path, DETAIL_TIMEOUT))
    } catch (e) {
      console.warn('[api] neighborhood unavailable:', e.message)
      return { __error: e.status === 404 ? 'not_found' : 'temporarily_unavailable' }
    }
  })
}

export async function apiNeighborhoodForecast(id, city) {
  const key = `nestiq:snapshot:forecast:${city}:${id}`
  const cached = sessionValue(key)
  if (cached) return cached
  const path = `/api/neighborhood/${id}/air-quality-forecast?city=${encodeURIComponent(city)}`
  return singleFlight(snapshotRequests, key, async () => {
    try {
      const result = await timedJson(BASE, path, FORECAST_TIMEOUT)
      // Cache only real forecast rows. Provider failures must remain retryable.
      if (result?.status === 'available' && result.forecast?.length) {
        return rememberSession(key, result)
      }
      return result || { status: 'temporarily_unavailable', forecast: [] }
    } catch (e) {
      console.warn('[api] AQI forecast unavailable:', e.message)
      return {
        status: 'temporarily_unavailable', forecast: [],
        limitation: 'The live AQI forecast did not respond in time. No values were estimated or substituted.',
      }
    }
  })
}

export async function apiReviews(id, city, refresh = false) {
  const key = `${city}:${id}`
  if (!refresh && reviewRequests.has(key)) return reviewRequests.get(key)
  const request = (async () => {
    try {
      const path = `/api/neighborhood/${id}/reviews?city=${encodeURIComponent(city)}${refresh ? '&refresh=true' : ''}`
      return await timedJson(REVIEWS_BASE, path)
    } catch (e) {
      reviewRequests.delete(key)
      if (e.name === 'TimeoutError') return {
        status: 'pending', summary: '', citations: [], refreshStatus: 'refreshing',
        limitation: 'Verified community sources are still being checked. You can keep browsing.',
      }
      console.warn('[api] reviews fallback:', e.message)
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
  const path = `/api/neighborhood/${id}/pulse?city=${encodeURIComponent(city)}${refresh ? '&refresh=true' : ''}`
  try {
    return await evidenceJson(REVIEWS_BASE, path, signal)
  } catch (e) {
    if (e.name === 'TimeoutError') return {
      status: 'pending', items: [], citations: [], refreshStatus: 'refreshing',
      limitation: 'Verified civic sources are still being checked. You can keep browsing.',
    }
    if (e.name === 'AbortError') return { status: 'pending', items: [], citations: [] }
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
    const r = await resilientFetch(BASE + path)
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
  const path = `/api/city/${encodeURIComponent(city)}/pulse${refresh ? '?refresh=true' : ''}`
  try {
    return await evidenceJson(REVIEWS_BASE, path, signal)
  } catch (e) {
    if (e.name === 'TimeoutError') return {
      status: 'pending', items: [], citations: [], refreshStatus: 'refreshing',
      limitation: 'Verified city sources are still being checked. You can keep browsing.',
    }
    if (e.name === 'AbortError') return { status: 'pending', items: [], citations: [] }
    console.warn('[api] city pulse unavailable:', e.message)
    return { status: 'temporarily_unavailable', items: [], citations: [] }
  }
}

export async function apiCivicKnowledge(id, city, question) {
  try {
    const path = `/api/neighborhood/${id}/civic-knowledge?city=${encodeURIComponent(city)}&q=${encodeURIComponent(question)}`
    const r = await resilientFetch(BASE + path)
    if (!r.ok) throw new Error(`GET ${path} ${r.status}`)
    return await r.json()
  } catch (e) {
    console.warn('[api] civic knowledge unavailable:', e.message)
    return { status: 'temporarily_unavailable', answer: '', citations: [], retrievedCount: 0 }
  }
}

export async function apiRentVerification(id, city, refresh = false, persist = true, signal) {
  const cacheKey = `nestiq:rent-verification:${city}:${id}`
  const path = `/api/neighborhood/${id}/rent-verification?city=${encodeURIComponent(city)}${refresh ? '&refresh=true' : ''}`
  try {
    const result = await evidenceJson(REVIEWS_BASE, path, signal)
    const freshAvailable = result.status === 'available' && !result.refreshStatus
    if (persist && freshAvailable && typeof localStorage !== 'undefined') remember(localStorage, cacheKey, result)
    return result
  } catch (e) {
    if (e.status === 404) return {
      status: 'deployment_required',
      limitation: 'The Rent Verification Agent is ready locally but is not available on the deployed backend yet.',
    }
    if (e.name === 'TimeoutError') return {
      status: 'pending',
      pollable: true,
      refreshStatus: 'refreshing',
      limitation: 'Grounded rent sources are still being checked. You can keep browsing.',
    }
    if (e.name === 'AbortError') return {
      status: 'pending',
      pollable: false,
      limitation: 'The source check is continuing. You can keep browsing and check again shortly.',
    }
    console.warn('[api] rent verification fallback:', e.message)
    return {
      status: 'temporarily_unavailable',
      limitation: 'The verification service could not be reached. The previous evidence remains available.',
    }
  }
}

// A locality click is strong user intent. Start the ordinary detail request,
// fast AQI chart, genuine locality Pulse, and the grounded rent job together.
// Affordability deliberately keeps the rent result hidden until the user
// selects "Verify current rent"; this preload improves speed, not disclosure.
export function prefetchNeighborhood(id, city) {
  return Promise.allSettled([
    apiRentVerification(id, city, false, false),
    apiNeighborhoodForecast(id, city),
    apiLocalityPulse(id, city),
    apiNeighborhood(id, city),
  ])
}

export function getCachedRentVerification(id, city) {
  return typeof localStorage === 'undefined' ? null : stored(localStorage, `nestiq:rent-verification:${city}:${id}`, RENT_TTL)
}


export async function apiAsk(question, neighborhoodId, city, history = []) {
  try {
    return await jpost('/api/ask', { question, neighborhoodId, city, history: history.slice(-6) })
  } catch (e) {
    if (e.name === 'TimeoutError') return {
      answer: 'NestIQ Copilot took too long to answer. Nothing was guessed or substituted. Please try again.',
      mode: 'temporarily_unavailable',
      evidenceStatus: 'temporarily_unavailable',
      tools: [], sources: [], followUps: [], actions: [],
    }
    console.warn('[api] ask fallback:', e.message)
    return null
  }
}

export async function apiTranscribe(audioBlob, durationMs, languageCode = 'en-IN') {
  try {
    const path = `/api/copilot/transcribe?durationMs=${encodeURIComponent(Math.round(durationMs))}&languageCode=${encodeURIComponent(languageCode)}`
    const response = await resilientFetch(BASE + path, {
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
    const response = await resilientFetch(BASE + path, {
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
