export const ESSENTIAL_ORDER = ['hospital', 'doctor', 'pharmacy', 'school', 'university']

export const ESSENTIAL_LABELS = {
  hospital: 'Hospitals',
  doctor: 'Doctors',
  pharmacy: 'Pharmacies',
  school: 'Schools',
  university: 'Universities',
}

// Convert the backend evidence envelopes into display-safe cards. An unavailable
// category deliberately remains null; it must never become a plausible-looking 0.
export function essentialCards(profile) {
  const categories = profile?.categories || {}
  const labels = profile?.labels || {}
  return ESSENTIAL_ORDER.map((key) => {
    const evidence = categories[key]
    const available = evidence?.status === 'live' && Number.isFinite(evidence?.value)
    return {
      key,
      label: labels[key] || ESSENTIAL_LABELS[key],
      value: available ? evidence.value : null,
      status: evidence?.status || 'temporarily_unavailable',
      confidence: evidence?.confidence || 'unavailable',
    }
  })
}

export function essentialsSummary(profile) {
  if (!profile) return { status: 'loading', note: 'Loading live essential-service evidence…' }
  if (profile.status === 'temporarily_unavailable') {
    return { status: profile.status, note: 'Essential-service counts are temporarily unavailable.' }
  }
  if (profile.status === 'partial') {
    return { status: profile.status, note: 'Some categories are temporarily unavailable; available counts remain visible.' }
  }
  return { status: 'live', note: 'Live category counts within 1.5 km.' }
}
