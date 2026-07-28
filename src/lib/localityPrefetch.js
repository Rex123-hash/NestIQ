import { prefetchNeighborhood } from './api.js'
import { loadGoogleMaps } from './gmaps.js'

// A locality click is the earliest reliable signal that its detail experience
// is about to be opened. Start the Maps SDK and the existing evidence prefetch
// together, but never delay navigation if either background request fails.
export function beginLocalityNavigation(id, city) {
  void loadGoogleMaps().catch((error) => {
    console.warn('[map-prefetch]', error.message)
  })

  if (!id || !city) return Promise.resolve([])
  return prefetchNeighborhood(id, city)
}
