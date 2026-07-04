import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../lib/gmaps.js'

// Real Google Map with a FitScore/AQI marker per locality.
// `items` = adapted neighborhoods (need lat/lng). `single` centers on one.
export default function LocalityMap({ items = [], className = '', zoom }) {
  const ref = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const pts = (items || []).filter((n) => n.lat != null && n.lng != null)
    if (!pts.length) return

    loadGoogleMaps()
      .then((gmaps) => {
        if (!alive || !ref.current) return
        if (!mapRef.current) {
          mapRef.current = new gmaps.Map(ref.current, {
            zoom: zoom || 11,
            center: { lat: pts[0].lat, lng: pts[0].lng },
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
          })
        }
        markersRef.current.forEach((m) => m.setMap(null))
        markersRef.current = []
        const bounds = new gmaps.LatLngBounds()
        pts.forEach((n) => {
          const pos = { lat: n.lat, lng: n.lng }
          bounds.extend(pos)
          const marker = new gmaps.Marker({
            position: pos,
            map: mapRef.current,
            title: `${n.name} · FitScore ${n.fitScore ?? ''}`,
            label: n.fitScore != null ? { text: String(n.fitScore), color: '#fff', fontSize: '11px', fontWeight: '700' } : undefined,
            icon: {
              path: gmaps.SymbolPath.CIRCLE,
              scale: 16,
              fillColor: n.accent || '#6D5EF6',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 2,
            },
          })
          markersRef.current.push(marker)
        })
        if (pts.length > 1) mapRef.current.fitBounds(bounds, 60)
        else mapRef.current.setCenter(pts[0])
      })
      .catch((e) => {
        console.warn('[map]', e.message)
        if (alive) setFailed(true)
      })

    return () => {
      alive = false
    }
  }, [items, zoom])

  if (failed) {
    return (
      <div className={`grid place-items-center rounded-2xl border border-line bg-[#EAF0F4] text-sm text-muted ${className}`}>
        Map unavailable
      </div>
    )
  }
  return <div ref={ref} className={`rounded-2xl border border-line ${className}`} />
}
