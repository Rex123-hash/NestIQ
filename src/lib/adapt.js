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

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Where this locality stands among all localities in its city, per metric
// (rank 1 = best), plus the peer set for comparison bars. Lets the detail
// tabs show "2nd-cheapest of 8" instead of echoing the same numbers.
export function cityInsights(peers, id) {
  const set = (peers || []).map((p) => ({
    id: p.id,
    name: p.name,
    short: p.short || p.name,
    rent: p.median_rent,
    aqi: p.aqi,
    commute: p.commute_min,
    amenity: p.amenity_count,
    safety: p.subscores?.safety,
  }))
  const me = set.find((p) => p.id === id)
  const rank = (key, lowerBetter) => {
    const vals = set.map((p) => p[key]).filter(Number.isFinite)
    if (!me || !Number.isFinite(me[key]) || !vals.length) return null
    const ahead = lowerBetter ? vals.filter((v) => v < me[key]).length : vals.filter((v) => v > me[key]).length
    return { rank: ahead + 1, total: vals.length }
  }
  return {
    peers: set,
    rent: rank('rent', true),
    aqi: rank('aqi', true),
    commute: rank('commute', true),
    amenity: rank('amenity', false),
    safety: rank('safety', false),
  }
}

// A pillar whose subscore barely varies across the city can't tell localities
// apart, so it shouldn't produce tags (e.g. lifestyle when the amenities
// signal saturates). adaptList computes this; single adapts skip the check.
const NO_FLAT = new Set()

function flatPillars(list) {
  const flat = new Set()
  const keys = ['affordability', 'safety', 'commute', 'lifestyle', 'air_quality']
  for (const k of keys) {
    const vals = list.map((n) => n.subscores?.[k]).filter(Number.isFinite)
    if (vals.length > 1 && Math.max(...vals) - Math.min(...vals) < 5) flat.add(k)
  }
  return flat
}

// Vibe words: what living there feels like. Shown on the card's gray line,
// deliberately a different vocabulary from the feature chips below it.
function deriveVibe(sub, flat) {
  const v = []
  if (!flat.has('lifestyle')) {
    if (sub.lifestyle >= 70) v.push('Lively')
    else if (sub.lifestyle < 45) v.push('Quiet')
  }
  if (!flat.has('affordability')) {
    if (sub.affordability >= 68) v.push('Value Pick')
    else if (sub.affordability < 45) v.push('Premium')
  }
  if (!flat.has('air_quality') && sub.air_quality >= 70) v.push('Green')
  if (!flat.has('safety') && sub.safety >= 75) v.push('Family-friendly')
  return v.length ? v.slice(0, 3) : ['Balanced']
}

// Feature tags: concrete, data-backed chips. Every tag traces to a live signal.
function deriveTags(sub, flat) {
  const t = []
  if (!flat.has('air_quality')) {
    if (sub.air_quality >= 75) t.push('Clean Air')
    else if (sub.air_quality >= 55) t.push('Moderate Air')
  }
  if (!flat.has('safety') && sub.safety >= 72) t.push('Safe')
  if (!flat.has('affordability') && sub.affordability >= 68) t.push('Affordable')
  if (!flat.has('commute') && sub.commute >= 72) t.push('Quick Commute')
  return t.length ? t : ['All-rounder']
}

export function adaptNeighborhood(n, bbox, flat = NO_FLAT) {
  const sub = n.subscores || {}
  const vibe = deriveVibe(sub, flat)
  const features = deriveTags(sub, flat)
  const b = bbox || bboxOf([n])
  return {
    ...n,
    rent: n.median_rent,
    rentDisplay: inr(n.median_rent),
    commuteMin: n.commute_min,
    aqi: n.aqi,
    aqiCategory: n.aqi_category,
    descriptors: vibe.join(' • '),
    tags: [...features, ...vibe],
    amenityTags: features.slice(0, 3),
    extraTags: Math.max(0, features.length - 3),
    pin: pin(n.lat, n.lng, b),
    blurb: n.blurb || '',
  }
}

export function adaptList(list) {
  const items = list || []
  if (!items.length) return []
  const b = bboxOf(items)
  const flat = flatPillars(items)
  return items.map((n) => adaptNeighborhood(n, b, flat))
}
