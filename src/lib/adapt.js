// Adapts a live API neighborhood/locality into the shape the components use.
// Works for any city — map pins are computed relative to the current list.

function bboxOf(list) {
  const lats = list.map((n) => n.lat)
  const lngs = list.map((n) => n.lng)
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) }
}

function pin(lat, lng, b) {
  const dLat = b.maxLat - b.minLat || 1
  const dLng = b.maxLng - b.minLng || 1
  const top = ((b.maxLat - lat) / dLat) * 64 + 16
  const left = ((lng - b.minLng) / dLng) * 64 + 16
  return { top: `${top}%`, left: `${left}%` }
}

function inr(n) {
  return '₹' + Number(n).toLocaleString('en-IN')
}

function deriveTags(sub) {
  const t = []
  if (sub.air_quality >= 75) t.push('Clean Air')
  else if (sub.air_quality >= 55) t.push('Moderate Air')
  if (sub.safety >= 72) t.push('Safe')
  if (sub.affordability >= 68) t.push('Affordable')
  if (sub.commute >= 72) t.push('Easy Commute')
  if (sub.lifestyle >= 70) t.push('Vibrant')
  return t.length ? t : ['Balanced', 'Diverse']
}

export function adaptNeighborhood(n, bbox) {
  const sub = n.subscores || {}
  const tags = deriveTags(sub)
  const b = bbox || bboxOf([n])
  return {
    ...n,
    rent: n.median_rent,
    rentDisplay: inr(n.median_rent),
    commuteMin: n.commute_min,
    aqi: n.aqi,
    aqiCategory: n.aqi_category,
    crimeLabel: n.aqi_category || 'Moderate',
    descriptors: tags.slice(0, 3).join(' • '),
    tags,
    amenityTags: tags.slice(0, 3),
    extraTags: 2,
    pin: pin(n.lat, n.lng, b),
    blurb: n.blurb || '',
  }
}

export function adaptList(list) {
  const items = list || []
  if (!items.length) return []
  const b = bboxOf(items)
  return items.map((n) => adaptNeighborhood(n, b))
}
