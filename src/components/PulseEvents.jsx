import { useState } from 'react'
import { MapPin, Clock3, ExternalLink } from 'lucide-react'

// Shared renderer for grounded civic Pulse events. Used by the Community
// Locality Pulse, the Alerts City Pulse view, and saved-locality warnings so
// there is one presentation for one backend pipeline. Every state is honest:
// pending, temporarily-unavailable (a source failure, NOT "nothing happening"),
// and a genuine no-evidence empty state are all distinct.

export const severityStyle = {
  low: 'bg-emerald-50 text-emerald-700',
  informational: 'bg-blue-50 text-blue-700',
  moderate: 'bg-amber-50 text-amber-700',
  high: 'bg-red-50 text-red-700',
}
const SEV_ORDER = { high: 0, moderate: 1, informational: 2, low: 3 }

function PulseRow({ item, localityLabel }) {
  return (
    <article className="grid gap-3 border-b border-line p-3 last:border-b-0 lg:grid-cols-[185px_minmax(0,1fr)_150px_105px_180px] lg:items-center">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-xs font-semibold capitalize text-ink-soft">{item.category}</span>
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${severityStyle[item.severity] || severityStyle.informational}`}>
          {item.severity}
        </span>
      </div>
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-ink">{item.headline}</h4>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.summary}</p>
      </div>
      <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
        <MapPin size={12} className="shrink-0" />
        <span className="truncate">{localityLabel || item.affectedArea}</span>
      </span>
      <span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted">
        <Clock3 size={12} /> {item.freshness}
      </span>
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
      >
        <span className="truncate">{item.source}</span>
        <ExternalLink size={12} className="shrink-0" />
      </a>
    </article>
  )
}

// Sort by severity (most serious first). Items may carry an optional `_locality`
// tag when aggregated across several saved localities.
function bySeverity(a, b) {
  return (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)
}

export default function PulseEvents({
  pulse,
  onRetry,
  categories = false,
  showLocality = false,
  emptyLabel = 'No verified civic updates from the last 30 days were found. This is different from a source failure.',
}) {
  const [cat, setCat] = useState('all')

  if (!pulse || pulse.status === 'pending') {
    return <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
  }
  if (pulse.status === 'temporarily_unavailable') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm text-amber-800">Recent civic evidence is temporarily unavailable. This does not mean nothing is happening.</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800">
            Try again
          </button>
        )}
      </div>
    )
  }

  const items = [...(pulse.items || [])].sort(bySeverity)
  if (!items.length) {
    return <p className="rounded-xl border border-line bg-[#F7F8FB] p-3 text-sm text-muted">{emptyLabel}</p>
  }

  const cats = [...new Set(items.map((i) => i.category))]
  const shown = cat === 'all' ? items : items.filter((i) => i.category === cat)

  return (
    <div>
      {categories && cats.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {['all', ...cats].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                cat === c ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-line">
        {shown.map((item, i) => (
          <PulseRow key={`${item.headline}-${i}`} item={item} localityLabel={showLocality ? item._locality : undefined} />
        ))}
      </div>
    </div>
  )
}
