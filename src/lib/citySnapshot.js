// Averages for the results-page City Snapshot.
//
// Absence must stay absent. The previous inline helper returned 0 for an empty list, so a
// city where every locality omits rent rendered "₹0/mo" — a fabricated price shown as
// fact. Returning null instead forces the caller to render an honest "Not available",
// which is the same rule the rest of the app already follows for missing signals.

function averageOrNull(values) {
  const present = values.filter(Number.isFinite)
  if (!present.length) return null
  return Math.round(present.reduce((a, b) => a + b, 0) / present.length)
}

export function citySnapshot(items) {
  const list = items || []
  return {
    rent: averageOrNull(list.map((n) => n.rent)),
    aqi: averageOrNull(list.map((n) => n.aqi)),
    commute: averageOrNull(list.map((n) => n.commuteMin)),
  }
}
