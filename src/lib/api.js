// Thin client for the NestIQ backend. Every call returns null on failure so
// callers can fall back to mock data — the UI never hard-breaks.
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

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
  try {
    return (await jget(`/api/neighborhoods?city=${city}`)).results
  } catch (e) {
    console.warn('[api] neighborhoods fallback:', e.message)
    return null
  }
}

export async function apiSearch(query, city) {
  try {
    return await jpost('/api/search', { query, city })
  } catch (e) {
    console.warn('[api] search fallback:', e.message)
    return null
  }
}

// SSE stream of the agent fan-out for a search. Returns the EventSource so the
// caller can close it. Falls back silently — callers handle onError.
export function streamSearch(query, city, { onAgent, onFinal, onError } = {}) {
  try {
    const url = `${BASE}/api/search/stream?q=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}`
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
  try {
    return await jget(`/api/neighborhood/${id}?city=${city}`)
  } catch (e) {
    console.warn('[api] neighborhood fallback:', e.message)
    return null
  }
}

export async function apiAsk(question, neighborhoodId, city) {
  try {
    return await jpost('/api/ask', { question, neighborhoodId, city })
  } catch (e) {
    console.warn('[api] ask fallback:', e.message)
    return null
  }
}
