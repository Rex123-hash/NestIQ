// Loads the Google Maps JS SDK once (with the key fetched from the backend).
import { useEffect, useState } from 'react'
import { apiConfig } from './api.js'

let loaderPromise = null
let _mapsKey = null

// Returns the Google Maps API key (cached), for building Static/Street View URLs.
export function useMapsKey() {
  const [key, setKey] = useState(_mapsKey)
  useEffect(() => {
    if (_mapsKey) return
    let alive = true
    apiConfig().then((cfg) => {
      if (alive && cfg?.mapsKey) {
        _mapsKey = cfg.mapsKey
        setKey(cfg.mapsKey)
      }
    })
    return () => {
      alive = false
    }
  }, [])
  return key
}

// Build a Google Places photo URL from a photo resource name (empty if not ready).
export function placesPhotoUrl(photoName, key, width = 400) {
  if (!key || !photoName) return ''
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${width}&key=${key}`
}

export function loadGoogleMaps() {
  if (typeof window !== 'undefined' && window.google?.maps) return Promise.resolve(window.google.maps)
  if (loaderPromise) return loaderPromise

  loaderPromise = (async () => {
    const cfg = await apiConfig()
    const key = cfg?.mapsKey
    if (!key) throw new Error('no maps key')
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      window.__gmapsCallback = () => {
        delete window.__gmapsCallback
        resolve(window.google.maps)
      }
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async&callback=__gmapsCallback`
      script.async = true
      script.defer = true
      script.onerror = () => {
        delete window.__gmapsCallback
        script.remove()
        reject(new Error('failed to load gmaps SDK'))
      }
      document.head.appendChild(script)
    })
  })().catch((error) => {
    loaderPromise = null
    throw error
  })
  return loaderPromise
}
