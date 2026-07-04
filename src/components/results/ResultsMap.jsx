import { Clock } from 'lucide-react'
import LocalityMap from '../LocalityMap.jsx'

// Real Google map of the ranked localities (markers labelled with FitScore).
export default function ResultsMap({ items, loading }) {
  const list = items && items.length ? items : []

  // While the search is running (or if it failed) don't render stale/unrelated
  // pins — show a neutral placeholder that matches the map's footprint.
  if (loading || !list.length) {
    return (
      <div className="relative flex h-full min-h-[560px] items-center justify-center rounded-2xl border border-line bg-band">
        <div className="text-center text-sm text-muted">
          {loading ? (
            <>
              <span className="mx-auto mb-2 block h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
              Loading locality map…
            </>
          ) : (
            'Map unavailable — no results to plot.'
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[560px]">
      <LocalityMap items={list} className="h-full min-h-[560px]" />
      <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card">
        <Clock size={16} className="text-brand-600" />
        <div className="text-xs">
          <p className="font-semibold text-ink">Live locality map</p>
          <p className="text-muted">Markers show FitScore</p>
        </div>
      </div>
    </div>
  )
}
